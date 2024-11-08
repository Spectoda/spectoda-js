// eslint-disable-next-line @typescript-eslint/ban-ts-comment

// npm install --save @types/w3c-web-serial

import { crc32, numberToBytes, sleep, stringToBytes, toBytes } from "../../functions";
import { logging } from "../../logging";
import { TimeTrack } from "../../TimeTrack.js";
import { TnglReader } from "../../TnglReader";
import { TnglWriter } from "../../TnglWriter";
import { COMMAND_FLAGS, DEFAULT_TIMEOUT, SpectodaTypes } from "../Spectoda_JS";
import { SpectodaRuntime } from "../SpectodaRuntime";
import { Connection, SpectodaWasm, Synchronization } from "../SpectodaWasm";

// ! ======= from "@types/w3c-web-serial" =======

/*~ https://wicg.github.io/serial/#dom-paritytype */
type ParityType = "none" | "even" | "odd";

/*~ https://wicg.github.io/serial/#dom-flowcontroltype */
type FlowControlType = "none" | "hardware";

/*~ https://wicg.github.io/serial/#dom-serialoptions */
interface SerialOptions {
  baudRate: number;
  dataBits?: number | undefined;
  stopBits?: number | undefined;
  parity?: ParityType | undefined;
  bufferSize?: number | undefined;
  flowControl?: FlowControlType | undefined;
}

/*~ https://wicg.github.io/serial/#dom-serialoutputsignals */
interface SerialOutputSignals {
  dataTerminalReady?: boolean | undefined;
  requestToSend?: boolean | undefined;
  break?: boolean | undefined;
}

/*~ https://wicg.github.io/serial/#dom-serialinputsignals */
interface SerialInputSignals {
  dataCarrierDetect: boolean;
  clearToSend: boolean;
  ringIndicator: boolean;
  dataSetReady: boolean;
}

/*~ https://wicg.github.io/serial/#serialportinfo-dictionary */
interface SerialPortInfo {
  usbVendorId?: number | undefined;
  usbProductId?: number | undefined;
  /** If the port is a service on a Bluetooth device this member will be a BluetoothServiceUUID
   * containing the service class UUID. Otherwise it will be undefined. */
  bluetoothServiceClassId?: number | string | undefined;
}

/*~ https://wicg.github.io/serial/#dom-serialport */
declare class SerialPort extends EventTarget {
  onconnect: ((this: this, ev: Event) => any) | null;
  ondisconnect: ((this: this, ev: Event) => any) | null;
  /** A flag indicating the logical connection state of serial port */
  readonly connected: boolean;
  readonly readable: ReadableStream<Uint8Array> | null;
  readonly writable: WritableStream<Uint8Array> | null;

  open(options: SerialOptions): Promise<void>;
  setSignals(signals: SerialOutputSignals): Promise<void>;
  getSignals(): Promise<SerialInputSignals>;
  getInfo(): SerialPortInfo;
  close(): Promise<void>;
  forget(): Promise<void>;

  addEventListener(type: "connect" | "disconnect", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
  addEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions): void;
  removeEventListener(type: "connect" | "disconnect", callback: (this: this, ev: Event) => any, useCapture?: boolean): void;
  removeEventListener(type: string, callback: EventListenerOrEventListenerObject | null, options?: EventListenerOptions | boolean): void;
}

/*~ https://wicg.github.io/serial/#dom-serialportfilter */
interface SerialPortFilter {
  usbVendorId?: number | undefined;
  usbProductId?: number | undefined;
  bluetoothServiceClassId?: number | string | undefined;
}

/*~ https://wicg.github.io/serial/#dom-serialportrequestoptions */
interface SerialPortRequestOptions {
  filters?: SerialPortFilter[] | undefined;
  /** A list of BluetoothServiceUUID values representing Bluetooth service class IDs.
   * Bluetooth ports with custom service class IDs are excluded from the list of ports
   * presented to the user unless the service class ID is included in this list.
   *
   * {@link https://wicg.github.io/serial/#serialportrequestoptions-dictionary} */
  allowedBluetoothServiceClassIds?: Array<number | string> | undefined;
}

/*~ https://wicg.github.io/serial/#dom-serial */
declare class Serial extends EventTarget {
  onconnect: ((this: this, ev: Event) => any) | null;
  ondisconnect: ((this: this, ev: Event) => any) | null;

  getPorts(): Promise<SerialPort[]>;
  requestPort(options?: SerialPortRequestOptions): Promise<SerialPort>;
  addEventListener(type: "connect" | "disconnect", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
  addEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions): void;
  removeEventListener(type: "connect" | "disconnect", callback: (this: this, ev: Event) => any, useCapture?: boolean): void;
  removeEventListener(type: string, callback: EventListenerOrEventListenerObject | null, options?: EventListenerOptions | boolean): void;
}

/*~ https://wicg.github.io/serial/#extensions-to-the-navigator-interface */
interface Navigator {
  readonly serial: Serial;
}

/*~ https://wicg.github.io/serial/#extensions-to-workernavigator-interface */
interface WorkerNavigator {
  readonly serial: Serial;
}

// ! ======= from "@types/w3c-web-serial" =======

type WebSerialPort = SerialPort;

///////////////////////////////////////////////////////////////////////////////////

const PORT_OPTIONS: SerialOptions = { baudRate: 1500000, dataBits: 8, stopBits: 1, parity: "none", bufferSize: 65535, flowControl: "none" };

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

// Connector connects the application with one Spectoda Device, that is then in a
// position of a controller for other Spectoda Devices
export class SpectodaWebSerialConnector {
  #runtimeReference;

  #serialPort: WebSerialPort | undefined;
  #criteria: SpectodaTypes.Criteria | undefined;

  #writer: WritableStreamDefaultWriter<Uint8Array> | undefined;
  #reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

  #connected;
  #opened;
  #disconnecting;

  #timeoutMultiplier;

  #beginCallback: ((result: boolean) => void) | undefined;
  #feedbackCallback: ((success: boolean) => void) | undefined;
  #dataCallback: ((data: Uint8Array) => void) | undefined;

  type: string;

  constructor(runtimeReference: SpectodaRuntime) {
    this.type = "nodeserial";

    this.#runtimeReference = runtimeReference;

    this.#serialPort = undefined;
    this.#criteria = undefined;

    this.#writer = undefined;
    this.#reader = undefined;

    this.#connected = false;
    this.#opened = false;
    this.#disconnecting = false;

    this.#timeoutMultiplier = 1.2;

    this.#beginCallback = undefined;
    this.#feedbackCallback = undefined;
    this.#dataCallback = undefined;
  }

  // choose one Spectoda device (user chooses which device to connect to via a popup)
  // if no criteria are set, then show all Spectoda devices visible.
  // first bonds the BLE device with the PC/Phone/Tablet if it is needed.
  // Then selects the device
  userSelect(criterium_array: SpectodaTypes.Criterium[], timeout_number: number | typeof DEFAULT_TIMEOUT = DEFAULT_TIMEOUT): Promise<SpectodaTypes.Criterium | null> {
    if (timeout_number === DEFAULT_TIMEOUT) {
      timeout_number = 60000;
    }
    logging.verbose("userSelect()");

    if (this.#connected) {
      return this.disconnect().then(() => {
        return this.userSelect(criterium_array);
      });
    }

    if (this.#serialPort) {
      return this.unselect().then(() => {
        return this.userSelect(criterium_array);
      });
    }

    return navigator.serial.requestPort().then(port => {
      this.#serialPort = port;
      this.#criteria = criterium_array;
      return { connector: this.type };
    });
  }

  // takes the criteria, scans for scan_period and asudutomatically selects the device,
  // you can then connect to. This works only for BLE devices that are bond with the phone/PC/tablet
  // the app is running on OR doesnt need to be bonded in a special way.
  // if more devices are found matching the criteria, then the strongest signal wins
  // if no device is found within the timeout period, then it returns an error

  // if no criteria are provided, all Spectoda enabled devices (with all different FWs and Owners and such)
  // are eligible.

  autoSelect(criterium_array: SpectodaTypes.Criterium[], scan_duration_number: number | typeof DEFAULT_TIMEOUT = DEFAULT_TIMEOUT, timeout_number: number | typeof DEFAULT_TIMEOUT = DEFAULT_TIMEOUT): Promise<SpectodaTypes.Criterium | null> {
    if (scan_duration_number === DEFAULT_TIMEOUT) {
      // ? 1200ms seems to be the minimum for the scan_duration if the controller is rebooted
      scan_duration_number = 1500;
    }
    if (timeout_number === DEFAULT_TIMEOUT) {
      timeout_number = 5000;
    }

    // step 1. for the scan_period scan the surroundings for BLE devices.
    // step 2. if some devices matching the criteria are found, then select the one with
    //         the greatest signal strength. If no device is found until the timeout,
    //         then return error

    return this.userSelect(criterium_array, timeout_number);
  }

  selected(): Promise<SpectodaTypes.Criterium | null> {
    logging.verbose("selected()");

    return Promise.resolve(this.#serialPort ? { connector: this.type, criteria: this.#criteria } : null);
  }

  unselect(): Promise<null> {
    logging.verbose("unselect()");

    if (this.#connected) {
      return this.disconnect().then(() => {
        return this.unselect();
      });
    }

    if (this.#serialPort) {
      // ! TODO check if the serial port is still open and close it before setting it as undefined

      // this.#serialPort.removeEventListener("connect");
      // this.#serialPort.removeEventListener("disconnect");
      this.#serialPort = undefined;
      this.#criteria = undefined;
    }

    return Promise.resolve(null);
  }

  scan(criterium_array: SpectodaTypes.Criterium[], scan_duration_number: number | typeof DEFAULT_TIMEOUT = DEFAULT_TIMEOUT): Promise<SpectodaTypes.Criterium[]> {
    if (scan_duration_number === DEFAULT_TIMEOUT) {
      scan_duration_number = 7000;
    }

    logging.verbose("scan(criterium_array=" + JSON.stringify(criterium_array) + ", scan_duration_number=" + scan_duration_number + ")");

    return Promise.resolve([]);
  }

  async #readLoop() {
    const command_bytes: number[] = [];

    const header_bytes: number[] = [];
    let data_header: { data_type: number; data_size: number; data_receive_timeout: number; data_crc32: number; header_crc32: number } | undefined = undefined;
    const data_bytes: number[] = [];

    const notify_header: object | undefined = undefined;
    const notify_bytes: number[] = [];

    const line_bytes: number[] = [];

    const MODE_UTF8_RECEIVE = 0;
    const MODE_DATA_RECEIVE = 1;

    let mode = MODE_UTF8_RECEIVE;

    const NEWLINE_ASCII_CODE = 10;

    const decoder = new TextDecoder();

    while (this.connected) {
      try {
        const { value, done } = this.#reader
          ? await this.#reader.read().catch(e => {
              logging.error("this.#reader.read()", e);

              if (e.toString().includes("break condition")) {
                logging.warn("> Break Condition Detected");
                return { value: null, done: false };
              }

              this.disconnect().catch(() => {});
              return { value: null, done: true };
            })
          : { value: null, done: true };

        if (value) {
          // // encode to utf8
          // const decoder = new TextDecoder();
          // const text = decoder.decode(value);
          // logging.warn("text:", text);

          for (const byte of value) {
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
                      await this.disconnect();
                    } else if (starts_with(command_bytes, "READY", 3)) {
                      logging.warn("SERIAL >>>READY<<<");
                      this.#beginCallback && this.#beginCallback(false);
                      this.#feedbackCallback && this.#feedbackCallback(false);
                      command_bytes.length = 0;
                      await this.disconnect();
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

                      if (data_header?.data_type === NETWORK_WRITE) {
                        logging.info("SERIAL >>>NETWORK_WRITE<<<");

                        const DUMMY_NODESERIAL_CONNECTION = new SpectodaWasm.Connection("11:11:11:11:11:11", SpectodaWasm.connector_type_t.CONNECTOR_SERIAL, SpectodaWasm.connection_rssi_t.RSSI_MAX);
                        this.#runtimeReference.spectoda_js.execute(new Uint8Array(data_bytes), DUMMY_NODESERIAL_CONNECTION);
                      } else if (data_header?.data_type === CLOCK_WRITE) {
                        logging.info("SERIAL >>>CLOCK_WRITE<<<");

                        const synchronization: Synchronization = SpectodaWasm.Synchronization.fromUint8Array(new Uint8Array(data_bytes));
                        const DUMMY_NODESERIAL_CONNECTION = new SpectodaWasm.Connection("11:11:11:11:11:11", SpectodaWasm.connector_type_t.CONNECTOR_SERIAL, SpectodaWasm.connection_rssi_t.RSSI_MAX);
                        this.#runtimeReference.spectoda_js.synchronize(synchronization, DUMMY_NODESERIAL_CONNECTION);
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
                    console.log(line);
                    this.#runtimeReference.emit("controller-log", line);
                    line_bytes.length = 0;
                  } /* if(character !== NEWLINE_ASCII_CODE) */ else {
                    line_bytes.push(character);
                  }
                }
              }
            } else if (mode == MODE_DATA_RECEIVE) {
              if (data_header) {
                data_bytes.push(byte);

                if (data_bytes.length >= data_header.data_size) {
                  const data_array = new Uint8Array(data_bytes);
                  logging.verbose("data_array=", data_array);

                  this.#dataCallback && this.#dataCallback(data_array);
                  header_bytes.length = 0;
                  data_bytes.length = 0;
                  data_header = undefined;
                  mode = MODE_UTF8_RECEIVE;
                }
              } /* if (data_header) */ else {
                header_bytes.push(byte);

                if (header_bytes.length >= 20) {
                  const tnglReader = new TnglReader(new Uint8Array(header_bytes));

                  data_header = { data_type: 0, data_size: 0, data_receive_timeout: 0, data_crc32: 0, header_crc32: 0 };
                  data_header.data_type = tnglReader.readUint32();
                  data_header.data_size = tnglReader.readUint32();
                  data_header.data_receive_timeout = tnglReader.readUint32();
                  data_header.data_crc32 = tnglReader.readUint32();
                  data_header.header_crc32 = tnglReader.readUint32();

                  logging.verbose("data_header=", data_header);
                }
              }
            }
          }
        }

        if (done) {
          // Reader has been canceled (we're disconnecting)
          this.#reader?.releaseLock();
          this.#writer?.releaseLock();
          logging.info("this.#reader DONE");
          break;
        }

        // Handle received data (value) here
      } catch (error) {
        logging.error("Read error:", error);
        break;
      }
    }
  }

  connect(timeout_number: number | typeof DEFAULT_TIMEOUT = DEFAULT_TIMEOUT): Promise<SpectodaTypes.Criterium> {
    if (timeout_number === DEFAULT_TIMEOUT) {
      timeout_number = 20000;
    }
    logging.debug(`connect(timeout=${timeout_number})`);

    if (timeout_number <= 0) {
      logging.warn("Connect timeout have expired");
      throw "ConnectionFailed";
    }

    const start = Date.now();

    if (!this.#serialPort) {
      throw "NotSelected";
    }

    if (this.#connected) {
      logging.warn("Serial device already connected");
      return Promise.resolve({ connector: "webserial" });
    }

    const port_options = PORT_OPTIONS;

    if (this.#criteria && Array.isArray(this.#criteria) && this.#criteria.length > 0 && (this.#criteria[0].baudrate || this.#criteria[0].baudRate)) {
      port_options.baudRate = this.#criteria[0].baudrate || this.#criteria[0].baudRate || 115200;
    }

    logging.info("> Opening serial port on 'baudRate':", port_options.baudRate);

    return this.#serialPort
      .open(port_options)
      .then(() => {
        this.#opened = true;

        this.#writer = this.#serialPort?.writable?.getWriter();
        this.#reader = this.#serialPort?.readable?.getReader();

        this.#readLoop();

        return new Promise((resolve: (result: SpectodaTypes.Criterium) => void, reject: (error: string) => void) => {
          const timeout_handle = setTimeout(() => {
            logging.warn("Connection begin timeouted");
            this.#beginCallback = undefined;

            this.disconnect().finally(() => {
              reject("ConnectTimeout");
            });
          }, timeout_number);

          this.#beginCallback = result => {
            clearTimeout(timeout_handle);
            this.#beginCallback = undefined;

            if (result) {
              logging.debug("> Serial Connector Connected");
              this.#connected = true;

              this.#runtimeReference.emit("#connected");
              resolve({ connector: this.type });
            } else {
              logging.warn("Trying to connect again");
              const passed = Date.now() - start;

              this.connect(timeout_number - passed)
                .then((result: SpectodaTypes.Criterium) => {
                  resolve(result);
                })
                .catch(error => {
                  reject(error);
                });
            }
          };

          this.#writer?.write(new Uint8Array(stringToBytes(">>>ENABLE_SERIAL<<<\n", 20)));
          // this.#writer?.releaseLock();
        });
      })
      .catch(error => {
        logging.error("SerialConnector connect() failed with error:", error);
        throw error;
      });
  }

  connected(): Promise<SpectodaTypes.Criterium | null> {
    logging.verbose(`connected()`);

    return Promise.resolve(this.#connected ? { connector: this.type, criteria: this.#criteria } : null);
  }

  // disconnect Connector from the connected Spectoda Device. But keep it selected
  async disconnect(): Promise<unknown> {
    logging.verbose("disconnect()");

    logging.debug("> Closing serial port...");

    if (!this.#serialPort) {
      logging.debug("No Serial Port selected");
      return Promise.resolve();
    }

    if (!this.#opened) {
      logging.debug("Serial port already closed");
      return Promise.resolve();
    }

    if (this.#disconnecting) {
      logging.debug("Serial port already disconnecting");
      return Promise.resolve();
    }

    this.#disconnecting = true;

    if (this.#reader) {
      await this.#reader.cancel().catch(() => {});
      this.#reader = undefined;
    }

    if (this.#writer) {
      await this.#writer.close().catch(() => {});
      this.#writer = undefined;
    }

    return this.#serialPort
      .close()
      .then(() => {
        this.#opened = false;
        logging.info("> Serial port closed");
      })
      .catch(error => {
        logging.error("Failed to close serial port. Error: " + error);
      })
      .finally(() => {
        this.#disconnecting = false;
        if (this.#connected) {
          this.#connected = false;
          this.#runtimeReference.emit("#disconnected");
        }
      });
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

  #initiate(initiate_code: number, payload_bytes: Uint8Array, tries: number, timeout_number: number): Promise<unknown> {
    logging.verbose(`initiate(initiate_code=${initiate_code}, payload=${payload_bytes}, tries=${tries}, timeout=${timeout_number})`);

    if (!tries) {
      logging.warn("No #initiate tryes left");
      throw "WriteFailed";
    }

    if (timeout_number < 0) {
      throw "TimeoutExpired";
    }

    const packet_timeout_min = 10;
    let packet_timeout = (payload_bytes.length * 8 * 1000 * this.#timeoutMultiplier) / 115200 + packet_timeout_min;

    if (!packet_timeout || packet_timeout < packet_timeout_min) {
      logging.warn("Packet Timeout is too small:", packet_timeout);
      packet_timeout = packet_timeout_min;
    }

    logging.verbose(`initiate_code=${initiate_code}`);
    logging.verbose(`payload_bytes.length=${payload_bytes.length}`);
    logging.verbose(`packet_timeout=${packet_timeout}`);

    const header_writer = new TnglWriter(32);
    header_writer.writeUint32(initiate_code);
    header_writer.writeUint32(payload_bytes.length);
    header_writer.writeUint32(packet_timeout);
    header_writer.writeUint32(crc32(payload_bytes));
    header_writer.writeUint32(crc32(new Uint8Array(header_writer.bytes.buffer)));

    return new Promise(async (resolve, reject) => {
      const timeout_handle = setTimeout(() => {
        logging.warn("Response timeouted");
        this.#feedbackCallback = undefined;

        this.disconnect().finally(() => {
          reject("ResponseTimeout");
        });
      }, timeout_number + 250); // +250ms for the controller to response timeout if reveive timeoutes

      this.#feedbackCallback = (success: boolean) => {
        this.#feedbackCallback = undefined;
        clearInterval(timeout_handle);

        if (success) {
          logging.verbose("this.#feedbackCallback SUCESS");
          resolve(undefined);
        } else {
          //try to write it once more
          logging.verbose("this.#feedbackCallback FAIL");
          setTimeout(() => {
            try {
              resolve(this.#initiate(initiate_code, payload_bytes, tries - 1, timeout_number - packet_timeout));
            } catch (e) {
              reject(e);
            }
          }, 250); // 100ms to be safe
        }
      };

      try {
        await this.#writer?.write(new Uint8Array(header_writer.bytes.buffer));
        await this.#writer?.write(payload_bytes);
      } catch (e) {
        logging.error(e);
        reject(e);
      }
    });
  }

  #write(channel_type: number, payload_bytes: Uint8Array, timeout_number: number): Promise<unknown> {
    logging.verbose(`write(channel_type=${channel_type}, payload=${payload_bytes}, timeout=${timeout_number})`);

    return this.#initiate(CODE_WRITE + channel_type, payload_bytes, 10, timeout_number);
  }

  #read(channel_type: number, timeout_number: number): Promise<Uint8Array> {
    let response = new Uint8Array(0);

    this.#dataCallback = data => {
      response = data;
      this.#dataCallback = undefined;
    };

    return this.#initiate(CODE_READ + channel_type, new Uint8Array(0), 10, timeout_number).then(() => {
      return response;
    });
  }

  #request(channel_type: number, payload_bytes: Uint8Array, read_response: boolean, timeout_number: number): Promise<Uint8Array | null> {
    return this.#write(channel_type, payload_bytes, timeout_number).then(() => {
      if (read_response) {
        return this.#read(channel_type, timeout_number);
      } else {
        return null;
      }
    });
  }

  // deliver handles the communication with the Spectoda network in a way
  // that the command is guaranteed to arrive
  deliver(payload_bytes: Uint8Array, timeout_number: number | typeof DEFAULT_TIMEOUT = DEFAULT_TIMEOUT): Promise<unknown> {
    if (timeout_number === DEFAULT_TIMEOUT) {
      timeout_number = 5000;
    }
    logging.verbose(`deliver(payload=${payload_bytes}, timeout=${timeout_number})`);

    if (!this.#connected) {
      throw "DeviceDisconnected";
    }

    if (!payload_bytes) {
      return Promise.resolve();
    }

    return this.#write(CHANNEL_NETWORK, payload_bytes, timeout_number);
  }

  // transmit handles the communication with the Spectoda network in a way
  // that the command is NOT guaranteed to arrive
  transmit(payload_bytes: Uint8Array, timeout_number: number | typeof DEFAULT_TIMEOUT = DEFAULT_TIMEOUT): Promise<unknown> {
    if (timeout_number === DEFAULT_TIMEOUT) {
      timeout_number = 1000;
    }
    logging.verbose(`transmit(payload=${payload_bytes}, timeout=${timeout_number})`);

    if (!this.#connected) {
      throw "DeviceDisconnected";
    }

    if (!payload_bytes) {
      return Promise.resolve();
    }

    return this.#write(CHANNEL_NETWORK, payload_bytes, timeout_number);
  }

  // request handles the requests on the Spectoda network. The command request
  // is guaranteed to get a response
  request(payload_bytes: Uint8Array, read_response: boolean, timeout_number: number | typeof DEFAULT_TIMEOUT = DEFAULT_TIMEOUT): Promise<Uint8Array | null> {
    if (timeout_number === DEFAULT_TIMEOUT) {
      timeout_number = 5000;
    }
    logging.verbose(`request(payload=${payload_bytes})`);

    if (!this.#connected) {
      return Promise.reject("DeviceDisconnected");
    }

    // TODO make this check on Interface level if its not already
    if (!payload_bytes) {
      return Promise.reject("InvalidPayload");
    }

    return this.#request(CHANNEL_DEVICE, payload_bytes, read_response, timeout_number);
  }

  // synchronizes the device internal clock with the provided TimeTrack clock
  // of the application as precisely as possible
  setClock(clock: TimeTrack): Promise<unknown> {
    logging.verbose(`setClock(clock.millis()=${clock.millis()})`);

    if (!this.#connected) {
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
  getClock(): Promise<TimeTrack> {
    logging.verbose(`getClock()`);

    if (!this.#connected) {
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
  updateFW(firmware_bytes: Uint8Array): Promise<unknown> {
    logging.debug("updateFW()", firmware_bytes);

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

      logging.info("OTA UPDATE");
      logging.verbose(firmware_bytes);

      const start_timestamp = Date.now();

      try {
        this.#runtimeReference.emit("ota_status", "begin");

        {
          //===========// RESET //===========//
          logging.info("OTA RESET");

          const bytes = [COMMAND_FLAGS.FLAG_OTA_RESET, 0x00, ...numberToBytes(0x00000000, 4)];
          await this.#write(CHANNEL_DEVICE, new Uint8Array(bytes), 10000);
        }

        await sleep(100);

        {
          //===========// BEGIN //===========//
          logging.info("OTA BEGIN");

          const bytes = [COMMAND_FLAGS.FLAG_OTA_BEGIN, 0x00, ...numberToBytes(firmware_bytes.length, 4)];
          await this.#write(CHANNEL_DEVICE, new Uint8Array(bytes), 10000);
        }

        await sleep(100);

        {
          //===========// WRITE //===========//
          logging.info("OTA WRITE");

          while (written < firmware_bytes.length) {
            if (index_to > firmware_bytes.length) {
              index_to = firmware_bytes.length;
            }

            const bytes = [COMMAND_FLAGS.FLAG_OTA_WRITE, 0x00, ...numberToBytes(written, 4), ...firmware_bytes.slice(index_from, index_to)];

            await this.#write(CHANNEL_DEVICE, new Uint8Array(bytes), 10000);
            written += index_to - index_from;

            const percentage = Math.floor((written * 10000) / firmware_bytes.length) / 100;
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

          const bytes = [COMMAND_FLAGS.FLAG_OTA_END, 0x00, ...numberToBytes(written, 4)];
          await this.#write(CHANNEL_DEVICE, new Uint8Array(bytes), 10000);
        }

        logging.info("Firmware written in " + (Date.now() - start_timestamp) / 1000 + " seconds");

        await sleep(2000);

        this.#runtimeReference.emit("ota_status", "success");
        resolve(null);
      } catch (e) {
        logging.error("Error during OTA:", e);
        this.#runtimeReference.emit("ota_status", "fail");
        reject("UpdateFailed");
      }
    }).finally(() => {
      this.#timeoutMultiplier = 1.2;
    });
  }

  cancel(): void {
    // TODO implement
  }

  destroy(): Promise<unknown> {
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
    logging.verbose(`SpectodaWebSerialConnector::sendExecute(command_bytes=${command_bytes}, source_connection=${source_connection})`);

    if (source_connection.connector_type == SpectodaWasm.connector_type_t.CONNECTOR_SERIAL) {
      return Promise.resolve();
    }

    return Promise.resolve(null);
  }

  // bool _sendRequest(const int32_t request_ticket_number, std::vector<uint8_t>& request_bytecode, const Connection& destination_connection) = 0;

  sendRequest(request_ticket_number: number, request_bytecode: Uint8Array, destination_connection: Connection) {
    logging.verbose(`SpectodaWebSerialConnector::sendRequest(request_ticket_number=${request_ticket_number}, request_bytecode=${request_bytecode}, destination_connection=${destination_connection})`);

    // TODO! take the request_bytecode and

    // if (source_connection.connector_type != SpectodaWasm.connector_type_t.CONNECTOR_SERIAL) {
    //   return;
    // }

    return Promise.reject("NotImplemented");
  }
  // bool _sendResponse(const int32_t request_ticket_number, const int32_t request_result, std::vector<uint8_t>& response_bytecode, const Connection& destination_connection) = 0;

  sendResponse(request_ticket_number: number, request_result: number, response_bytecode: Uint8Array, destination_connection: Connection) {
    logging.verbose(`SpectodaWebSerialConnector::sendResponse(request_ticket_number=${request_ticket_number}, request_result=${request_result}, response_bytecode=${response_bytecode}, destination_connection=${destination_connection})`);

    return Promise.reject("NotImplemented");
  }

  // void _sendSynchronize(const Synchronization& synchronization, const Connection& source_connection) = 0;

  sendSynchronize(synchronization: Synchronization, source_connection: Connection) {
    logging.verbose(`SpectodaWebSerialConnector::sendSynchronize(synchronization=${synchronization}, source_connection=${source_connection})`);

    if (source_connection.connector_type == SpectodaWasm.connector_type_t.CONNECTOR_SERIAL) {
      return Promise.resolve();
    }

    return Promise.resolve(null);
  }
}
