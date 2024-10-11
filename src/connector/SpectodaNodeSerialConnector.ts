// TODO fix TSC in spectoda-js
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck

// npm install @types/serialport --save-dev

// ls /dev/cu.*

// add overlays=uart3 to /boot/orangepiEnv.txt
// add overlays=uart0 to /boot/orangepiEnv.txt
// sudo stty -F /dev/ttyS3 1500000
// screen /dev/ttyS3 1500000

/*
echo 'overlays=uart3' | sudo tee -a /boot/orangepiEnv.txt
cat /boot/orangepiEnv.txt
*/

import { TimeTrack } from "../../TimeTrack";
import { TnglReader } from "../../TnglReader";
import { TnglWriter } from "../../TnglWriter";
import { crc32, detectProductionBuild, numberToBytes, sleep, toBytes } from "../../functions";
import { logging } from "../../logging";
import { SpectodaRuntime } from "../SpectodaRuntime";
import { Connection, SpectodaWasm, Synchronization } from "../SpectodaWasm";
import { COMMAND_FLAGS } from "../Spectoda_JS";

let { SerialPort, ReadlineParser }: { SerialPort: any; ReadlineParser: any } = { SerialPort: null, ReadlineParser: null };

if (typeof window === "undefined" && !detectProductionBuild()) {
  const serialport = require("serialport");
  SerialPort = serialport.SerialPort;
  ReadlineParser = serialport.ReadlineParser;
}

const tngl_sync_counter = 0;
const history_sync_counter = 0;

// import SerialPort from "serialport"
// import ReadlineParser from "serialport"

///////////////////////////////////////////////////////////////////////////////////

const PORT_OPTIONS = { path: "/dev/ttyS3", baudRate: 1500000, dataBits: 8, stopBits: 1, parity: "none", autoOpen: false, bufferSize: 65535, flowControl: "none" };

const CODE_WRITE = 100;
const CODE_READ = 200;
const CHANNEL_NETWORK = 1;
const CHANNEL_DEVICE = 2;
const CHANNEL_CLOCK = 3;
const COMMAND = 0;
const DATA = 10;

const UNKNOWN_PACKET = 0;

const NETWORK_WRITE = CODE_WRITE + CHANNEL_NETWORK + COMMAND;
const DEVICE_WRITE = CODE_WRITE + CHANNEL_DEVICE + COMMAND;
const CLOCK_WRITE = CODE_WRITE + CHANNEL_CLOCK + COMMAND;
const NETWORK_READ = CODE_READ + CHANNEL_NETWORK + COMMAND;
const DEVICE_READ = CODE_READ + CHANNEL_DEVICE + COMMAND;
const CLOCK_READ = CODE_READ + CHANNEL_CLOCK + COMMAND;
const NETWORK_READ_DATA = CODE_READ + CHANNEL_NETWORK + DATA;
const DEVICE_READ_DATA = CODE_READ + CHANNEL_DEVICE + DATA;
const CLOCK_READ_DATA = CODE_READ + CHANNEL_CLOCK + DATA;

const starts_with = function (buffer: number[], string: string, start_offset = 0) {
  for (let index = 0; index < string.length; index++) {
    if (buffer[index + start_offset] !== string.charCodeAt(index)) {
      return false;
    }
  }

  return true;
};

const ends_with = function (buffer: number[], string: string, start_offset = 0) {
  for (let index = 0; index < string.length; index++) {
    if (buffer[buffer.length - start_offset - string.length + index] !== string.charCodeAt(index)) {
      return false;
    }
  }

  return true;
};

///////////////////////////////////////////////////////////////////////////////////

// Connector connects the application with one Spectoda Device, that is then in a
// position of a controller for other Spectoda Devices
export class SpectodaNodeSerialConnector {
  #runtimeReference;

  #serialPort: NodeSerialPort | undefined;
  #criteria: { baudrate: number | undefined; baudRate: number | undefined; uart: string | undefined; port: string | undefined; path: string | undefined }[] | undefined;

  #interfaceConnected: boolean;
  #disconnecting: boolean;
  #disconnectingResolve: ((value: unknown) => void) | undefined;

  #timeoutMultiplier: number;

  #beginCallback: ((result: boolean) => void) | undefined;
  #feedbackCallback: ((success: boolean) => void) | undefined;
  #dataCallback: ((data: Uint8Array) => void) | undefined;

  #writing: boolean;

  type: string;

  constructor(runtimeReference: SpectodaRuntime) {
    this.type = "nodeserial";

    this.#runtimeReference = runtimeReference;

    this.#serialPort = undefined;
    this.#criteria = undefined;

    this.#interfaceConnected = false;
    this.#disconnecting = false;
    this.#disconnectingResolve = undefined;

    this.#timeoutMultiplier = 1.2;

    this.#beginCallback = undefined;
    this.#feedbackCallback = undefined;
    this.#dataCallback = undefined;

    this.#writing = false;
  }

  /*
  
  criteria: pole objektu, kde plati: [{ tohle and tamto and toto } or { tohle and tamto }]
  
  možnosti:
    name: string
    namePrefix: string
    fwVersion: string
    ownerSignature: string
    productCode: number
    adoptionFlag: bool
  
  criteria example:
  [
    // all Devices that are named "NARA Aplha", are on 0.7.2 fw and are
    // adopted by the owner with "baf2398ff5e6a7b8c9d097d54a9f865f" signature.
    // Product code is 1 what means NARA Alpha
    {
      name:"NARA Alpha" 
      fwVersion:"0.7.2"
      ownerSignature:"baf2398ff5e6a7b8c9d097d54a9f865f"
      productCode:1
    },
    // all the devices with the name starting with "NARA", without the 0.7.3 FW and 
    // that are not adopted by anyone
    // Product code is 2 what means NARA Beta 
    {
      namePrefix:"NARA"
      fwVersion:"!0.7.3"
      productCode:2
      adoptionFlag:true
    }
  ]
  
  */
  // choose one Spectoda device (user chooses which device to connect to via a popup)
  // if no criteria are set, then show all Spectoda devices visible.
  // first bonds the BLE device with the PC/Phone/Tablet if it is needed.
  // Then selects the device
  userSelect(criteria: { baudrate: number | undefined; baudRate: number | undefined; uart: string | undefined; port: string | undefined; path: string | undefined }[]): Promise<{ connector: string }> {
    logging.verbose("userSelect(criteria=" + JSON.stringify(criteria) + ")");

    return this.autoSelect(criteria, 1000, 10000);
  }

  // takes the criteria, scans for scan_period and automatically selects the device,
  // you can then connect to. This works only for BLE devices that are bond with the phone/PC/tablet
  // the app is running on OR doesnt need to be bonded in a special way.
  // if more devices are found matching the criteria, then the strongest signal wins
  // if no device is found within the timeout period, then it returns an error

  // if no criteria are provided, all Spectoda enabled devices (with all different FWs and Owners and such)
  // are eligible.

  autoSelect(criteria: { baudrate: number | undefined; baudRate: number | undefined; uart: string | undefined; port: string | undefined; path: string | undefined }[], scan_period: number, timeout: number): Promise<{ connector: string }> {
    logging.debug("autoSelect(criteria=" + JSON.stringify(criteria) + ", scan_period=" + scan_period + ", timeout=" + timeout + ")");

    if (this.#serialPort && this.#serialPort.isOpen) {
      logging.debug("disconnecting from autoSelect()");
      return this.disconnect().then(() => {
        return this.autoSelect(criteria, scan_period, timeout);
      });
    }

    // ! to overcome [Error: Error Resource temporarily unavailable Cannot lock port] bug when trying to create new SerialPort object on the same path
    // // if (criteria && Array.isArray(criteria) && criteria.length && this.#criteria && Array.isArray(this.#criteria) && this.#criteria.length) {

    // //   let uart1 = undefined;
    // //   let uart2 = undefined;

    // //   if (criteria[0].uart || criteria[0].port || criteria[0].path) {
    // //     uart1 = criteria[0].uart || criteria[0].port || criteria[0].path || undefined;
    // //   }

    // //   if (this.#criteria[0].uart || this.#criteria[0].port || this.#criteria[0].path) {
    // //     uart2 = this.#criteria[0].uart || this.#criteria[0].port || this.#criteria[0].path || undefined;
    // //   }

    // //   if (uart1 != undefined && uart2 != undefined && uart1 == uart2) {
    // //     logging.debug("criteria is matching, keepin the last serial port object");
    // //     return Promise.resolve({ connector: this.type, criteria: this.#criteria });
    // //   }
    // // }

    if (this.#serialPort) {
      logging.debug("unselecting from autoSelect()");
      return this.unselect().then(() => {
        return this.autoSelect(criteria, scan_period, timeout);
      });
    }

    // step 1. for the scan_period scan the surroundings for BLE devices.
    // step 2. if some devices matching the criteria are found, then select the one with
    //         the greatest signal strength. If no device is found until the timeout,
    //         then return error

    // criteria.uart == "/dev/ttyS0"

    if (criteria && Array.isArray(criteria) && criteria.length > 0) {
      const port_options = PORT_OPTIONS;

      if (criteria[0].baudrate || criteria[0].baudRate) {
        port_options.baudRate = criteria[0].baudrate || criteria[0].baudRate || 115200;
      }

      if (criteria[0].uart || criteria[0].port || criteria[0].path) {
        port_options.path = criteria[0].uart || criteria[0].port || criteria[0].path || "undefined";
      }

      this.#serialPort = new SerialPort(port_options);
      this.#criteria = criteria;
      logging.verbose("this.#serialPort=", this.#serialPort);
      logging.verbose("this.#criteria=", this.#criteria);

      logging.debug("serial port selected");

      return Promise.resolve({ connector: this.type, criteria: this.#criteria });
    } else {
      return this.scan(criteria, scan_period).then(ports => {
        logging.verbose("ports=", ports);

        if (ports.length === 0) {
          throw "NoDeviceFound";
        }

        const port_options = PORT_OPTIONS;

        port_options.path = ports.at(-1).path;
        logging.verbose("port_options=", port_options);

        this.#serialPort = new SerialPort(port_options);
        this.#criteria = criteria;
        logging.verbose("this.#serialPort=", this.#serialPort);
        logging.verbose("this.#criteria=", this.#criteria);

        return { connector: this.type, criteria: this.#criteria };
      });
    }
  }

  selected(): Promise<{ connector: string } | null> {
    logging.verbose("selected()");

    return Promise.resolve(this.#serialPort ? { connector: this.type, criteria: this.#criteria } : null);
  }

  unselect(): Promise<void> {
    logging.verbose("unselect()");

    if (!this.#serialPort) {
      logging.debug("already unselected");
      return Promise.resolve();
    }

    if (this.#serialPort && this.#serialPort.isOpen) {
      logging.debug("disconnecting from unselect()");
      return this.disconnect().then(() => {
        return this.unselect();
      });
    }

    this.#serialPort.removeAllListeners();
    this.#serialPort = undefined;
    this.#criteria = undefined;

    return Promise.resolve();
  }

  scan(criteria: { baudrate: number | undefined; baudRate: number | undefined; uart: string | undefined; port: string | undefined; path: string | undefined }[], scan_period: number): Promise<{ path: string }[]> {
    logging.verbose("scan(criteria=" + JSON.stringify(criteria) + ", scan_period=" + scan_period + ")");

    // returns devices like autoSelect scan() function
    return new Promise(async (resolve, reject) => {
      try {
        const ports = await SerialPort.list();
        logging.verbose("ports=", ports);
        resolve(ports);
      } catch (error) {
        logging.error(error);
        reject(error);
      }
    });
  }

  connect(timeout = 15000) {
    logging.verbose("connect(timeout=" + timeout + ")");

    if (timeout <= 0) {
      logging.warn("Connect timeout have expired");
      throw "ConnectionFailed";
    }

    const start = Date.now();

    if (!this.#serialPort) {
      throw "NotSelected";
    }

    if (this.#interfaceConnected) {
      logging.warn("Serial device already connected");
      return Promise.resolve();
    }

    const openSerialPromise = new Promise((resolve, reject) => {
      this.#serialPort?.open(error => {
        if (error) {
          logging.error(error);
          reject("OpenSerialError");
        } else {
          logging.info("Serial port opened");
          resolve(null);
        }
      });
    });

    return openSerialPromise
      .then(() => {
        this.#disconnecting = false;

        const parser = new ReadlineParser();
        this.#serialPort?.pipe(parser);

        const command_bytes: number[] = [];

        const header_bytes: number[] = [];
        let data_header: { data_type: number; data_size: number; data_receive_timeout: number; data_crc32: number; header_crc32: number } = { data_type: 0, data_size: 0, data_receive_timeout: 0, data_crc32: 0, header_crc32: 0 };
        const data_bytes: number[] = [];

        const notify_header: undefined | object = undefined;
        const notify_bytes: number[] = [];

        const line_bytes: number[] = [];

        const MODE_UTF8_RECEIVE = 0;
        const MODE_DATA_RECEIVE = 1;

        let mode = MODE_UTF8_RECEIVE;

        const NEWLINE_ASCII_CODE = 10;

        const decoder = new TextDecoder();

        this.#serialPort?.removeAllListeners();

        this.#serialPort?.on("open", () => {
          logging.info("Port Opened");
        });

        this.#serialPort?.on("close", () => {
          logging.info("Port Closed");

          if (this.#interfaceConnected) {
            this.#interfaceConnected = false;
            this.#runtimeReference.emit("#disconnected");
          }
        });

        this.#serialPort?.on("error", err => {
          logging.info("Port Error: ", err.message);
        });

        this.#serialPort?.on("data", (chunk: Buffer) => {
          // logging.info("[data]", decoder.decode(chunk));

          for (const byte of chunk) {
            if (mode === MODE_UTF8_RECEIVE) {
              const command_bytes_length = command_bytes.push(byte);
              if (command_bytes_length >= 3) {
                if (starts_with(command_bytes, ">>>")) {
                  if (ends_with(command_bytes, "<<<\n")) {
                    if (starts_with(command_bytes, "BEGIN", 3)) {
                      logging.warn("SERIAL >>>BEGIN<<<");
                      this.#beginCallback && this.#beginCallback(true);
                      command_bytes.length = 0;
                    } else if (starts_with(command_bytes, "END", 3)) {
                      logging.warn("SERIAL >>>END<<<");
                      this.#beginCallback && this.#beginCallback(false);
                      this.#feedbackCallback && this.#feedbackCallback(false);
                      command_bytes.length = 0;
                      this.#disconnect();
                    } else if (starts_with(command_bytes, "READY", 3)) {
                      logging.warn("SERIAL >>>READY<<<");
                      this.#beginCallback && this.#beginCallback(false);
                      this.#feedbackCallback && this.#feedbackCallback(false);
                      command_bytes.length = 0;
                      this.#disconnect();
                    } else if (starts_with(command_bytes, "SUCCESS", 3)) {
                      logging.verbose("SERIAL >>>SUCCESS<<<");
                      this.#feedbackCallback && this.#feedbackCallback(true);
                      command_bytes.length = 0;
                    } else if (starts_with(command_bytes, "FAIL", 3)) {
                      logging.info("SERIAL >>>FAIL<<<");
                      this.#feedbackCallback && this.#feedbackCallback(false);
                      command_bytes.length = 0;
                    } else if (starts_with(command_bytes, "ERROR", 3)) {
                      logging.error("SERIAL >>>ERROR<<<");
                      this.#feedbackCallback && this.#feedbackCallback(false);
                      command_bytes.length = 0;
                    } else if (starts_with(command_bytes, "DATA", 3)) {
                      logging.verbose("SERIAL >>>DATA<<<");
                      this.#dataCallback && this.#dataCallback(new Uint8Array(data_bytes));

                      switch (data_header.data_type) {
                      case NETWORK_WRITE: {
                        logging.info("SERIAL >>>NETWORK_WRITE<<<");

                        const DUMMY_NODESERIAL_CONNECTION = new SpectodaWasm.Connection("11:11:11:11:11:11", SpectodaWasm.connector_type_t.CONNECTOR_SERIAL, SpectodaWasm.connection_rssi_t.RSSI_MAX);
                        this.#runtimeReference.spectoda.execute(new Uint8Array(data_bytes), DUMMY_NODESERIAL_CONNECTION);
                      
                      break;
                      }
                      case CLOCK_WRITE: {
                        logging.info("SERIAL >>>CLOCK_WRITE<<<");

                        const synchronization: Synchronization = SpectodaWasm.Synchronization.fromUint8Array(new Uint8Array(data_bytes));
                        const DUMMY_NODESERIAL_CONNECTION = new SpectodaWasm.Connection("11:11:11:11:11:11", SpectodaWasm.connector_type_t.CONNECTOR_SERIAL, SpectodaWasm.connection_rssi_t.RSSI_MAX);
                        this.#runtimeReference.spectoda.synchronize(synchronization, DUMMY_NODESERIAL_CONNECTION);
                      
                      break;
                      }
                      case DEVICE_WRITE: {
                        logging.info("SERIAL >>>DEVICE_WRITE<<<");

                        const DUMMY_NODESERIAL_CONNECTION = new SpectodaWasm.Connection("11:11:11:11:11:11", SpectodaWasm.connector_type_t.CONNECTOR_SERIAL, SpectodaWasm.connection_rssi_t.RSSI_MAX);
                        this.#runtimeReference.spectoda.request(new Uint8Array(data_bytes), DUMMY_NODESERIAL_CONNECTION);
                      
                      break;
                      }
                      // No default
                      }

                      command_bytes.length = 0;
                    }
                  } else if (ends_with(command_bytes, "DATA=")) {
                    mode = MODE_DATA_RECEIVE;

                    header_bytes.length = 0;
                    data_bytes.length = 0;
                  } else if (command_bytes.length > 20) {
                    logging.error("Unknown command_bytes", command_bytes);
                    command_bytes.length = 0;
                  }
                }

                ////
                /* if(!starts_with(command_bytes, ">>>")) */
                else {
                  const character = command_bytes.shift() as number;

                  if (character === NEWLINE_ASCII_CODE) {
                    const line = decoder.decode(new Uint8Array(line_bytes));
                    // TODO! process line
                    logging.info(line);
                    this.#runtimeReference.emit("controller-log", line);
                    line_bytes.length = 0;
                  } /* if(character !== NEWLINE_ASCII_CODE) */ else {
                    line_bytes.push(character);
                  }
                }
              }
            } else if (mode == MODE_DATA_RECEIVE) {
              if (header_bytes.length < 20) {
                header_bytes.push(byte);

                if (header_bytes.length >= 20) {
                  const tnglReader = new TnglReader(new DataView(new Uint8Array(header_bytes).buffer));

                  data_header = { data_type: 0, data_size: 0, data_receive_timeout: 0, data_crc32: 0, header_crc32: 0 };
                  data_header.data_type = tnglReader.readUint32();
                  data_header.data_size = tnglReader.readUint32();
                  data_header.data_receive_timeout = tnglReader.readUint32();
                  data_header.data_crc32 = tnglReader.readUint32();
                  data_header.header_crc32 = tnglReader.readUint32();

                  logging.verbose("data_header=", data_header);
                }
              } /* if (data_header) */ else {
                data_bytes.push(byte);

                if (data_bytes.length >= data_header.data_size) {
                  mode = MODE_UTF8_RECEIVE;
                }
              }
            }
          }
        });

        return new Promise((resolve, reject) => {
          const timeout_handle = setTimeout(async () => {
            logging.warn("Connection begin timeouted");
            this.#beginCallback = undefined;

            await this.#disconnect().finally(() => {
              reject("ConnectTimeout");
            });
          }, timeout);

          this.#beginCallback = result => {
            this.#beginCallback = undefined;

            clearTimeout(timeout_handle);

            if (result) {
              logging.info("Serial connection connected");

              setTimeout(() => {
                if (!this.#interfaceConnected) {
                  this.#interfaceConnected = true;
                  this.#runtimeReference.emit("#connected");
                }
                resolve({ connector: this.type, criteria: this.#criteria });
              }, 100);
            } else {
              // logging.warn("Trying to connect again")
              // const passed = new Date().getTime() - start;
              // resolve(this.connect(timeout - passed));

              logging.info("Serial connection failed");

              setTimeout(() => {
                this.#disconnect().finally(() => {
                  reject("ConnectFailed");
                });
              }, 100);
            }
          };

          try {
            this.#serialPort?.write(">>>ENABLE_SERIAL<<<\n");
          } catch {
            logging.error("ERROR asd0sd9f876");
          }
        });
      })
      .catch(error => {
        logging.error("SerialConnector connect() failed with error:", error);
        throw error;
      });
  }

  connected() {
    logging.verbose("connected()");

    logging.verbose("this.#serialPort=", this.#serialPort);
    logging.verbose("this.#serialPort.isOpen=", this.#serialPort?.isOpen);

    return Promise.resolve(this.#serialPort && this.#serialPort.isOpen ? { connector: this.type, criteria: this.#criteria } : null);
  }

  // disconnect Connector from the connected Spectoda Device. But keep it selected
  #disconnect() {
    logging.verbose("#disconnect()");

    if (!this.#serialPort) {
      logging.debug("No Serial Port selected");
      return Promise.resolve(null);
    }

    logging.debug("this.#serialPort.isOpen", this.#serialPort.isOpen ? "true" : "false");

    if (this.#serialPort.isOpen) {
      logging.debug("> Closing serial port...");

      return new Promise((resolve, reject) => {
        this.#serialPort?.close(error => {
          if (error) {
            logging.error(error);
            logging.error("ERROR asd0896fsda", error);
            resolve(null);
          } else {
            logging.debug("serial port closed");
            resolve(null);
          }
        });
      }).finally(() => {
        this.#disconnecting = false;
        if (this.#disconnectingResolve !== undefined) {
          this.#disconnectingResolve(null);
        }
        if (this.#interfaceConnected) {
          this.#interfaceConnected = false;
          this.#runtimeReference.emit("#disconnected");
        }
      });
    }

    if (this.#disconnecting) {
      logging.warn("Serial port already disconnecting");
      // return Promise.reject("AlreadyDisconnecting");
      return Promise.resolve(null);
    }

    logging.debug("> Serial Port already closed");
    return Promise.resolve(null);
  }

  disconnect() {
    logging.verbose("disconnect()");

    if (!this.#serialPort) {
      logging.debug("No Serial Port selected");
      return Promise.resolve(null);
    }

    if (!this.#serialPort.isOpen) {
      logging.debug("Serial Port is not connected");
      return Promise.resolve(null);
    }

    if (this.#disconnecting) {
      logging.error("Serial port already disconnecting");
      // return Promise.reject("AlreadyDisconnecting");
      return Promise.resolve(null);
    }

    this.#disconnecting = true;

    const disconnectingPromise = new Promise((resolve, reject) => {
      const timeout_handle = setTimeout(async () => {
        logging.error("Finishing Serial TIMEOUT");

        this.#disconnectingResolve = undefined;
        await this.#disconnect().finally(() => {
          reject("DisconnectTimeout");
        });
      }, 5000);

      this.#disconnectingResolve = (value: unknown) => {
        this.#disconnectingResolve = undefined;
        clearTimeout(timeout_handle);
        resolve(value);
      };

      try {
        logging.info("> Finishing Serial...");
        this.#serialPort?.write(">>>FINISH_SERIAL<<<\n");
      } catch (error) {
        logging.error("ERROR 0a9s8d0asd8f", error);
      }
    });

    return disconnectingPromise;
  }

  // serial_connector_channel_type_t channel_type;
  // uint32_t packet_size;
  // uint32_t packet_receive_timeout;
  // uint32_t packet_crc32;
  // uint32_t header_crc32;

  // enum serial_connector_channel_type_t : uint32_t {
  //   NETWORK_WRITE = 1,
  //   DEVICE_WRITE = 2,
  //   CLOCK_WRITE = 3
  // };

  #initiate(initiate_code: number, payload: Uint8Array, tries: number, timeout: number): Promise<unknown> {
    logging.verbose(`initiate(initiate_code=${initiate_code}, payload=${payload}, tries=${tries}, timeout=${timeout})`);

    if (tries <= 0) {
      logging.error("ERROR nhkw45390");
      throw "InvalidParameter";
    }

    if (timeout <= 0) {
      logging.error("ERROR sauioczx98");
      throw "InvalidParameter";
    }

    // TODO check if the payload is a valid Uint8Array
    if (typeof payload !== "object" || !payload) {
      logging.error("ERROR xcv90870dsa", typeof payload);
      throw "InvalidParameter";
    }

    if (this.#writing) {
      logging.error("Someone is already writing");
    } else {
      this.#writing = true;
    }

    const packet_timeout_min = 50;
    let packet_timeout = (payload.length * 8 * 1000 * this.#timeoutMultiplier) / 115200 + packet_timeout_min;

    if (!packet_timeout || packet_timeout < packet_timeout_min) {
      logging.warn("Packet Timeout is too small:", packet_timeout);
      packet_timeout = packet_timeout_min;
    }

    if (timeout < packet_timeout) {
      timeout = packet_timeout;
    }

    logging.verbose(`initiate_code=${initiate_code}`);
    logging.verbose(`payload.length=${payload.length}`);
    logging.verbose(`packet_timeout=${packet_timeout}`);

    const header_writer = new TnglWriter(32);
    header_writer.writeUint32(initiate_code);
    header_writer.writeUint32(payload.length);
    header_writer.writeUint32(packet_timeout);
    header_writer.writeUint32(crc32(payload));
    header_writer.writeUint32(crc32(new Uint8Array(header_writer.bytes.buffer)));

    return new Promise((resolve, reject) => {
      let timeout_handle: NodeJS.Timeout | undefined = undefined;

      const do_write = async () => {
        timeout_handle = setTimeout(() => {
          logging.error("ERROR asvcb8976a", "Serial response timeout");
          this.#feedbackCallback = undefined;

          this.#disconnect()
            .catch(() => {
              logging.error("ERROR fdsa8796", "Failed to disconnect");
            })
            .finally(() => {
              reject("ResponseTimeout");
            });
        }, timeout + 10000); // +1000 for the controller to response timeout if reeive timeoutes

        try {
          await this.#serialPort?.write(Buffer.from(header_writer.bytes.buffer));
          await this.#serialPort?.write(Buffer.from(payload), "utf8");
        } catch (e) {
          logging.error("ERROR 0ads8F67", e);
          reject(e);
        }
      };

      this.#feedbackCallback = (success: boolean) => {
        this.#feedbackCallback = undefined;

        clearInterval(timeout_handle);

        if (success) {
          resolve(null);
        } else {
          //try to write it once more
          setTimeout(() => {
            try {
              tries -= 1;
              timeout -= packet_timeout;

              if (tries > 0 && timeout > 0) {
                do_write();
              } else {
                reject("WriteFailed");
              }
            } catch (e) {
              reject(e);
            }
          }, 100); // 100ms to be safe
        }
      };

      do_write();
    }).finally(() => {
      this.#writing = false;
    });
  }

  #write(channel_type: number, payload: Uint8Array, timeout: number) {
    return this.#initiate(CODE_WRITE + channel_type, payload, 10, timeout);
  }

  #read(channel_type: number, timeout: number) {
    let response = new DataView(new ArrayBuffer(0));

    this.#dataCallback = data => {
      response = new DataView(data.buffer);
      this.#dataCallback = undefined;
    };

    return this.#initiate(CODE_READ + channel_type, new Uint8Array(), 10, timeout).then(() => {
      return response;
    });
  }

  #request(channel_type: number, payload: Uint8Array, read_response: boolean, timeout: number) {
    return this.#write(channel_type, payload, timeout).then(() => {
      if (read_response) {
        return this.#read(channel_type, timeout);
      } else {
        return [];
      }
    });
  }

  // deliver handles the communication with the Spectoda network in a way
  // that the command is guaranteed to arrive
  deliver(payload: Uint8Array, timeout: number) {
    logging.verbose(`deliver(payload=${payload})`);

    if (!this.#serialPort || !this.#serialPort.isOpen) {
      throw "DeviceDisconnected";
    }

    if (!payload) {
      return Promise.resolve();
    }

    return this.#write(CHANNEL_NETWORK, payload, timeout);
  }

  // transmit handles the communication with the Spectoda network in a way
  // that the command is NOT guaranteed to arrive
  transmit(payload: Uint8Array, timeout: number) {
    logging.verbose(`transmit(payload=${payload})`);

    if (!this.#serialPort || !this.#serialPort.isOpen) {
      throw "DeviceDisconnected";
    }

    if (!payload) {
      return Promise.resolve();
    }

    return this.#write(CHANNEL_NETWORK, payload, timeout);
  }

  // request handles the requests on the Spectoda network. The command request
  // is guaranteed to get a response
  request(payload: Uint8Array, read_response: boolean, timeout: number) {
    logging.verbose(`request(payload=${payload})`);

    if (!this.#serialPort || !this.#serialPort.isOpen) {
      throw "DeviceDisconnected";
    }

    // TODO make this check on Interface level if its not already
    if (!payload) {
      throw "InvalidPayload";
    }

    return this.#request(CHANNEL_DEVICE, payload, read_response, timeout);
  }

  // synchronizes the device internal clock with the provided TimeTrack clock
  // of the application as precisely as possible
  setClock(clock: TimeTrack) {
    logging.verbose(`setClock(clock.millis()=${clock.millis()})`);

    if (!this.#serialPort || !this.#serialPort.isOpen) {
      throw "DeviceDisconnected";
    }

    return new Promise(async (resolve, reject) => {
      for (let index = 0; index < 3; index++) {
        try {
          await this.#write(CHANNEL_CLOCK, new Uint8Array(toBytes(clock.millis(), 8)), 1000);
          logging.debug("Clock write success");
          resolve(null);
          return;
        } catch {
          logging.warn("Clock write failed");
          await sleep(1000);
        }
      }

      reject("ClockWriteFailed");
      return;
    });
  }

  // returns a TimeTrack clock object that is synchronized with the internal clock
  // of the device as precisely as possible
  getClock() {
    logging.verbose(`getClock()`);

    if (!this.#serialPort || !this.#serialPort.isOpen) {
      throw "DeviceDisconnected";
    }

    return new Promise(async (resolve, reject) => {
      for (let index = 0; index < 3; index++) {
        try {
          const bytes = await this.#read(CHANNEL_CLOCK, 1000);

          const reader = new TnglReader(bytes);
          const timestamp = reader.readUint64();

          // const timestamp = await this.#promise;
          logging.debug("> Clock read success:", timestamp);
          resolve(new TimeTrack(timestamp));
          return;
        } catch (e) {
          logging.warn("Clock read failed:", e);

          if (e == "WriteFailed") {
            reject("ClockReadFailed");
            return;
          }
        }

        await sleep(1000);
      }

      reject("ClockReadFailed");
      return;
    });
  }

  // handles the firmware updating. Sends "ota" events
  // to all handlers
  updateFW(firmware: Uint8Array) {
    logging.verbose(`updateFW(firmware=${firmware})`);

    if (!this.#serialPort) {
      logging.warn("Serial Port is null");
      throw "UpdateFailed";
    }

    return new Promise(async (resolve, reject) => {
      const chunk_size = 3984; // must be modulo 16

      this.#timeoutMultiplier = 2;

      let index_from = 0;
      let index_to = chunk_size;

      let written = 0;

      logging.setLoggingLevel(logging.level - 1);

      logging.info("OTA UPDATE");
      logging.verbose(firmware);

      const start_timestamp = Date.now();

      try {
        this.#runtimeReference.emit("ota_status", "begin");

        {
          //===========// RESET //===========//
          logging.info("OTA RESET");

          const bytes = new Uint8Array([COMMAND_FLAGS.FLAG_OTA_RESET, 0x00, ...numberToBytes(0x00000000, 4)]);
          await this.#write(CHANNEL_DEVICE, bytes, 10000);
        }

        await sleep(100);

        {
          //===========// BEGIN //===========//
          logging.info("OTA BEGIN");

          const bytes = new Uint8Array([COMMAND_FLAGS.FLAG_OTA_BEGIN, 0x00, ...numberToBytes(firmware.length, 4)]);
          await this.#write(CHANNEL_DEVICE, bytes, 10000);
        }

        await sleep(100);

        {
          //===========// WRITE //===========//
          logging.info("OTA WRITE");

          while (written < firmware.length) {
            if (index_to > firmware.length) {
              index_to = firmware.length;
            }

            const bytes = new Uint8Array([COMMAND_FLAGS.FLAG_OTA_WRITE, 0x00, ...numberToBytes(written, 4), ...firmware.slice(index_from, index_to)]);

            await this.#write(CHANNEL_DEVICE, bytes, 10000);
            written += index_to - index_from;

            const percentage = Math.floor((written * 10000) / firmware.length) / 100;
            logging.info(percentage + "%");

            this.#runtimeReference.emit("ota_progress", percentage);

            index_from += chunk_size;
            index_to = index_from + chunk_size;
          }
        }

        await sleep(100);

        {
          //===========// END //===========//
          logging.info("OTA END");

          const bytes = new Uint8Array([COMMAND_FLAGS.FLAG_OTA_END, 0x00, ...numberToBytes(written, 4)]);
          await this.#write(CHANNEL_DEVICE, bytes, 10000);
        }

        logging.info("Firmware written in " + (Date.now() - start_timestamp) / 1000 + " seconds");

        await sleep(2000);

        const bytes = new Uint8Array([COMMAND_FLAGS.FLAG_DEVICE_REBOOT_REQUEST]);
        await this.#write(CHANNEL_DEVICE, bytes, 10000);

        this.#runtimeReference.emit("ota_status", "success");
        resolve(null);
      } catch (e) {
        logging.error("Error during OTA:", e);
        this.#runtimeReference.emit("ota_status", "fail");
        reject("UpdateFailed");
      }
    }).finally(() => {
      this.#timeoutMultiplier = 1.2;
      logging.setLoggingLevel(logging.level + 1);
    });
  }

  destroy() {
    logging.verbose("destroy()");

    //this.#runtimeReference = null; // dont know if I need to destroy this reference.. But I guess I dont need to?
    return this.disconnect()
      .catch(() => {})
      .then(() => {
        return this.unselect();
      })
      .catch(() => {});
  }

  // void _sendExecute(const std::vector<uint8_t>& command_bytes, const Connection& source_connection) = 0;

  sendExecute(command_bytes: Uint8Array, source_connection: Connection) {
    logging.verbose(`SpectodaNodeSerialConnector::sendExecute(command_bytes=${command_bytes}, source_connection=${source_connection})`);

    if (source_connection.connector_type == SpectodaWasm.connector_type_t.CONNECTOR_SERIAL) {
      return Promise.resolve();
    }

    if (!this.#serialPort || !this.#serialPort.isOpen) {
      throw "DeviceDisconnected";
    }

    return this.#write(CHANNEL_NETWORK, command_bytes, 1000);
  }

  // bool _sendRequest(const int32_t request_ticket_number, std::vector<uint8_t>& request_bytecode, const Connection& destination_connection) = 0;

  sendRequest(request_ticket_number: number, request_bytecode: Uint8Array, destination_connection: Connection) {
    logging.verbose(`SpectodaNodeSerialConnector::sendRequest(request_ticket_number=${request_ticket_number}, request_bytecode=${request_bytecode}, destination_connection=${destination_connection})`);

    // TODO if many connections can be opened, then look for the right one
    if (destination_connection.connector_type != SpectodaWasm.connector_type_t.CONNECTOR_SERIAL) {
      return Promise.resolve();
    }

    if (!this.#serialPort || !this.#serialPort.isOpen) {
      throw "DeviceDisconnected";
    }

    return this.#write(CHANNEL_DEVICE, request_bytecode, 1000);
  }
  // bool _sendResponse(const int32_t request_ticket_number, const int32_t request_result, std::vector<uint8_t>& response_bytecode, const Connection& destination_connection) = 0;

  sendResponse(request_ticket_number: number, request_result: number, response_bytecode: Uint8Array, destination_connection: Connection) {
    logging.verbose(`SpectodaNodeSerialConnector::sendResponse(request_ticket_number=${request_ticket_number}, request_result=${request_result}, response_bytecode=${response_bytecode}, destination_connection=${destination_connection})`);

    return Promise.reject("NotImplemented");
  }

  // void _sendSynchronize(const Synchronization& synchronization, const Connection& source_connection) = 0;

  sendSynchronize(synchronization: Synchronization, source_connection: Connection) {
    logging.verbose(`SpectodaNodeSerialConnector::sendSynchronize(synchronization=${synchronization}, source_connection=${source_connection})`);

    if (source_connection.connector_type == SpectodaWasm.connector_type_t.CONNECTOR_SERIAL) {
      return Promise.resolve();
    }

    if (!this.#serialPort || !this.#serialPort.isOpen) {
      throw "DeviceDisconnected";
    }

    return this.#write(CHANNEL_CLOCK, synchronization.toUint8Array(), 1000);
  }
}
