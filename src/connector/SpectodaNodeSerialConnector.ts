// // @ts-nocheck

import { logging } from "../../logging";
import { sleep, toBytes, numberToBytes, crc8, crc32, hexStringToArray, rgbToHex, stringToBytes, convertToByteArray } from "../../functions";
import { TimeTrack } from "../../TimeTrack.js";
import { COMMAND_FLAGS } from "../Spectoda_JS.js";
import { TnglWriter } from "../../TnglWriter.js";
import { TnglReader } from "../../TnglReader.js";

let { SerialPort, ReadlineParser }: { SerialPort: any; ReadlineParser: any } = { SerialPort: null, ReadlineParser: null };

if (typeof window === "undefined" && !process.env.NEXT_PUBLIC_VERSION) {
  const serialport = require("serialport");
  SerialPort = serialport.SerialPort;
  ReadlineParser = serialport.ReadlineParser;
}

///////////////////////////////////////////////////////////////////////////////////

// Connector connects the application with one Spectoda Device, that is then in a
// position of a controller for other Spectoda Devices
export class SpectodaNodeSerialConnector {
  #runtimeReference;

  #serialPort;
  #writing;

  #connected;
  #opened;
  #disconnecting;

  #divisor;

  #beginCallback;
  #feedbackCallback;
  #dataCallback;

  constructor(runtimeReference) {
    this.type = "nodeserial";

    this.#runtimeReference = runtimeReference;

    this.PORT_OPTIONS = { baudRate: 115200, dataBits: 8, stopBits: 1, parity: "none", bufferSize: 65535, flowControl: "none" };

    this.#serialPort = null;
    this.#writing = false;

    this.#connected = false;
    this.#opened = false;
    this.#disconnecting = false;

    this.#divisor = 4;

    this.#beginCallback = null;
    this.#feedbackCallback = null;
    this.#dataCallback = null;

    this.CODE_WRITE = 100;
    this.CODE_READ = 200;

    this.CHANNEL_NETWORK = 1;
    this.CHANNEL_DEVICE = 2;
    this.CHANNEL_CLOCK = 3;

    this.INITIATE_NETWORK_WRITE = this.CODE_WRITE + this.CHANNEL_NETWORK;
    this.INITIATE_DEVICE_WRITE = this.CODE_WRITE + this.CHANNEL_DEVICE;
    this.INITIATE_CLOCK_WRITE = this.CODE_WRITE + this.CHANNEL_CLOCK;

    this.INITIATE_NETWORK_READ = this.CODE_READ + this.CHANNEL_NETWORK;
    this.INITIATE_DEVICE_READ = this.CODE_READ + this.CHANNEL_DEVICE;
    this.INITIATE_CLOCK_READ = this.CODE_READ + this.CHANNEL_CLOCK;
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
  userSelect(criteria) {
    logging.verbose("userSelect(criteria=" + JSON.stringify(criteria) + ")");

    if (this.#connected) {
      return this.disconnect().then(() => {
        return this.userSelect();
      });
    }

    if (this.#serialPort) {
      this.#serialPort.removeAllListeners();
      this.#serialPort = null;
    }


    // ls /dev/cu.*
    this.#serialPort = new SerialPort({ path: "/dev/cu.usbserial-0278D9D7", baudRate: 115200, dataBits: 8, parity: "none", stopBits: 1, autoOpen: false });
    logging.verbose("this.#serialPort=", this.#serialPort);

    return Promise.resolve({ connector: this.type });

  }

  // takes the criteria, scans for scan_period and automatically selects the device,
  // you can then connect to. This works only for BLE devices that are bond with the phone/PC/tablet
  // the app is running on OR doesnt need to be bonded in a special way.
  // if more devices are found matching the criteria, then the strongest signal wins
  // if no device is found within the timeout period, then it returns an error

  // if no criteria are provided, all Spectoda enabled devices (with all different FWs and Owners and such)
  // are eligible.

  autoSelect(criteria, scan_period, timeout) {
    logging.debug("autoSelect(criteria=" + JSON.stringify(criteria) + ", scan_period=" + scan_period + ", timeout=" + timeout + ")");

    if (this.#connected) {
      return this.disconnect().then(() => {
        return this.autoSelect(criteria, scan_period, timeout);
      });
    }

    if (this.#serialPort) {
      this.#serialPort.removeAllListeners();
      this.#serialPort = null;
    }

    // step 1. for the scan_period scan the surroundings for BLE devices.
    // step 2. if some devices matching the criteria are found, then select the one with
    //         the greatest signal strength. If no device is found until the timeout,
    //         then return error

    // criteria.uart == "/dev/ttyS0"

    if (!(criteria && criteria.length && criteria[0].uart)) {

      return this.scan(criteria, scan_period).then(ports => {
        logging.verbose("ports=", ports);

        if (ports.length === 0) {
          throw "NoDeviceFound";
        }

        const port_path = ports[ports.length - 2].path;
        logging.verbose("port_path=", port_path);

        this.#serialPort = new SerialPort({ path: port_path, baudRate: 115200, dataBits: 8, parity: "none", stopBits: 1, autoOpen: false });
        logging.verbose("this.#serialPort=", this.#serialPort);

        return Promise.resolve({ connector: this.type });
      });

    }

    else {

      this.#serialPort = new SerialPort({ path: criteria[0].uart, baudRate: 115200, dataBits: 8, parity: "none", stopBits: 1, autoOpen: false });
      logging.verbose("this.#serialPort=", this.#serialPort);

      return Promise.resolve({ connector: this.type });
    }


  }

  selected() {
    logging.verbose("selected()");

    return Promise.resolve(this.#serialPort ? { connector: this.type } : null);
  }

  unselect() {
    logging.verbose("unselect()");

    if (this.#connected) {
      return this.disconnect().then(() => {
        return this.unselect();
      });
    }

    this.#serialPort.removeAllListeners();
    this.#serialPort = null;

    return Promise.resolve();
  }

  scan(criteria: object, scan_period: number) {
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

    const start = new Date().getTime();

    if (!this.#serialPort) {
      throw "NotSelected";
    }

    if (this.#connected) {
      logging.warn("Serial device already connected");
      return Promise.resolve();
    }

    const openSerialPromise = new Promise((resolve, reject) => {
      this.#serialPort.open(error => {
        if (error) {
          logging.error(error);
          reject("OpenSerialError");
        } else {
          logging.info("Serial port opened");
          resolve(null);
        }
      });
    });

    const starts_with = (buffer: number[], string: string, start_offset: number = 0) => {
      for (let index = 0; index < string.length; index++) {
        if (buffer[index + start_offset] !== string.charCodeAt(index)) {
          return false;
        }
      }

      return true;
    }

    const ends_with = (buffer: number[], string: string, start_offset: number = 0) => {
      for (let index = 0; index < string.length; index++) {
        if (buffer[buffer.length - start_offset - string.length + index] !== string.charCodeAt(index)) {
          return false;
        }
      }

      return true;
    }

    return openSerialPromise
      .then(() => {
        this.#opened = true;

        const parser = new ReadlineParser();
        this.#serialPort.pipe(parser);

        let command_bytes: number[] = [];

        let header_bytes: number[] = [];
        let data_header: undefined | object = undefined;
        let data_bytes: number[] = [];

        let notify_header: undefined | object = undefined;
        let notify_bytes: number[] = [];

        let line_bytes: number[] = [];

        const MODE_UTF8_RECEIVE = 0;
        const MODE_DATA_RECEIVE = 1;

        let mode = MODE_UTF8_RECEIVE;

        const NEWLINE_ASCII_CODE = 10;

        const decoder = new TextDecoder();

        this.#serialPort.on('data', async (chunk: Buffer) => {
          // logging.verbose("[data]", decoder.decode(chunk));

          for (const byte of chunk) {

            if (mode === MODE_UTF8_RECEIVE) {

              const command_bytes_length = command_bytes.push(byte);
              if (command_bytes_length >= 3) {

                if (starts_with(command_bytes, ">>>")) {

                  if (ends_with(command_bytes, "<<<\n")) {

                    if (starts_with(command_bytes, "BEGIN", 3)) {
                      this.#beginCallback && this.#beginCallback(true);
                      command_bytes.length = 0;
                    }

                    else if (starts_with(command_bytes, "END", 3)) {
                      await this.disconnect();
                      this.#beginCallback && this.#beginCallback(false);
                      this.#feedbackCallback && this.#feedbackCallback(false);
                      command_bytes.length = 0;
                    }

                    else if (starts_with(command_bytes, "READY", 3)) {
                      await this.disconnect();
                      this.#beginCallback && this.#beginCallback(false);
                      this.#feedbackCallback && this.#feedbackCallback(false);
                      command_bytes.length = 0;
                    }

                    else if (starts_with(command_bytes, "SUCCESS", 3)) {
                      this.#feedbackCallback && this.#feedbackCallback(true);
                      command_bytes.length = 0;
                    }

                    else if (starts_with(command_bytes, "FAIL", 3)) {
                      this.#feedbackCallback && this.#feedbackCallback(false);
                      command_bytes.length = 0;
                    }

                    else if (starts_with(command_bytes, "DATA", 3)) {
                      this.#dataCallback && this.#dataCallback(new Uint8Array(data_bytes));
                      command_bytes.length = 0;
                    }

                  }

                  else if (ends_with(command_bytes, "DATA=")) {
                    mode = MODE_DATA_RECEIVE;
                  }

                  else if (command_bytes.length > 20) {
                    logging.error("Unknown command_bytes", command_bytes);
                    command_bytes.length = 0;
                  }
                }

                ////
                else /* if(!starts_with(command_bytes, ">>>")) */ {
                  const character = command_bytes.shift() as number;

                  if (character === NEWLINE_ASCII_CODE) {
                    const line = decoder.decode(new Uint8Array(line_bytes));
                    // TODO! process line
                    logging.verbose("line=", line);
                    line_bytes.length = 0;
                  }

                  else /* if(character !== NEWLINE_ASCII_CODE) */ {
                    line_bytes.push(character);
                  }
                }
              }
            }

            else if (mode == MODE_DATA_RECEIVE) {

              if (!data_header) {

                header_bytes.push(byte);

                if (header_bytes.length >= 20) {

                  let tnglReader = new TnglReader(new DataView(new Uint8Array(header_bytes).buffer));

                  data_header = {};
                  data_header.data_type = tnglReader.readUint32();
                  data_header.data_size = tnglReader.readUint32();
                  data_header.data_receive_timeout = tnglReader.readUint32();
                  data_header.data_crc32 = tnglReader.readUint32();
                  data_header.header_crc32 = tnglReader.readUint32();

                  logging.verbose("data_header=", data_header);
                }

              } else /* if (data_header) */ {

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

              }
            }

          }

        });

        return new Promise((resolve, reject) => {

          const timeout_handle = setTimeout(() => {
            logging.warn("Connection begin timeouted");
            this.#beginCallback = null;

            this.disconnect().finally(() => {
              reject("ConnectTimeout");
            });

          }, timeout);

          this.#beginCallback = result => {
            clearTimeout(timeout_handle);
            this.#beginCallback = null;

            if (result) {
              logging.info("Serial connection connected");
              this.#connected = true;

              this.#runtimeReference.emit("#connected");
              resolve({ connector: this.type });
            } else {
              logging.warn("Trying to connect again")
              const passed = new Date().getTime() - start;
              resolve(this.connect(timeout - passed));
            }

          };

          this.#serialPort.write(">>>ENABLE_SERIAL<<<\n");
        });

      })
      .catch(error => {
        logging.error("SerialConnector connect() failed with error:", error);
        throw error;
      });
  }

  connected() {
    logging.verbose("connected()");

    return Promise.resolve(this.#connected ? { connector: this.type } : null);
  }

  // disconnect Connector from the connected Spectoda Device. But keep it selected
  async disconnect() {
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

    try {
      await this.#serialPort.close();
      this.#opened = false;
    }
    catch (error) {
      logging.error("Failed to close serial port. Error: " + error);
    }
    finally {
      this.#disconnecting = false;
      if (this.#connected) {
        this.#connected = false;
        this.#runtimeReference.emit("#disconnected");
      }
    }

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

  #initiate(initiate_code, payload, tries, timeout) {
    logging.verbose(`initiate(initiate_code=${initiate_code}, payload=${payload}, tries=${tries}, timeout=${timeout})`);

    if (!tries) {
      logging.warn("No #initiate tryes left");
      throw "WriteFailed";
    }

    if (!payload) {
      payload = [];
    }

    const header_writer = new TnglWriter(32);
    const timeout_min = 50;

    if (!timeout || timeout < timeout_min) {
      timeout = timeout_min;
    }

    logging.verbose(`initiate_code=${initiate_code}`);
    logging.verbose(`payload.length=${payload.length}`);
    logging.verbose(`timeout=${timeout}`);

    header_writer.writeUint32(initiate_code);
    header_writer.writeUint32(payload.length);
    header_writer.writeUint32(timeout);
    header_writer.writeUint32(crc32(payload));
    header_writer.writeUint32(crc32(new Uint8Array(header_writer.bytes.buffer)));

    return new Promise(async (resolve, reject) => {

      const timeout_handle = setTimeout(() => {
        logging.warn("Response timeouted");
        this.#feedbackCallback = null;

        this.disconnect().finally(() => {
          reject("ResponseTimeout");
        });
      }, timeout + 1000); // +1000 for the controller to response timeout if reveive timeoutes

      this.#feedbackCallback = (success: boolean) => {
        this.#feedbackCallback = null;
        clearInterval(timeout_handle);

        if (success) {
          logging.verbose("this.#feedbackCallback SUCESS");
          resolve(null);
        }

        else {
          //try to write it once more
          logging.verbose("this.#feedbackCallback FAIL");
          setTimeout(() => {
            try {
              resolve(this.#initiate(initiate_code, payload, tries - 1, 0));
            } catch (e) {
              reject(e);
            }
          }, 250); // 100ms to be safe
        }

      };

      try {
        await this.#serialPort.write(new Uint8Array(header_writer.bytes.buffer));
        await this.#serialPort.write(new Uint8Array(payload));

      } catch (e) {
        logging.error(e);
        reject(e);
      }

    });
  }

  #write(channel_type, payload, timeout) {
    return this.#initiate(this.CODE_WRITE + channel_type, payload, 10, timeout);
  }

  #read(channel_type, timeout) {
    let response = [];

    this.#dataCallback = data => {
      response = new DataView(data.buffer);
      this.#dataCallback = null;
    };

    return this.#initiate(this.CODE_READ + channel_type, null, 10, timeout).then(() => {
      return response;
    });
  }

  #request(channel_type, payload, read_response, timeout) {
    return this.#write(channel_type, payload, timeout).then(() => {
      if (read_response) {
        return this.#read(channel_type, timeout);
      } else {
        return Promise.resolve([]);
      }
    });
  }

  // deliver handles the communication with the Spectoda network in a way
  // that the command is guaranteed to arrive
  deliver(payload, timeout) {
    logging.verbose(`deliver(payload=${payload})`);

    if (!this.#connected) {
      throw "DeviceDisconnected";
    }

    if (!payload) {
      return Promise.resolve();
    }

    return this.#write(this.CHANNEL_NETWORK, payload, timeout);
  }

  // transmit handles the communication with the Spectoda network in a way
  // that the command is NOT guaranteed to arrive
  transmit(payload, timeout) {
    logging.verbose(`transmit(payload=${payload})`);

    if (!this.#connected) {
      throw "DeviceDisconnected";
    }

    if (!payload) {
      return Promise.resolve();
    }

    return this.#write(this.CHANNEL_NETWORK, payload, timeout);
  }

  // request handles the requests on the Spectoda network. The command request
  // is guaranteed to get a response
  request(payload, read_response, timeout) {
    logging.verbose(`request(payload=${payload})`);

    if (!this.#connected) {
      throw "DeviceDisconnected";
    }

    // TODO make this check on Interface level if its not already
    if (!payload) {
      throw "InvalidPayload";
    }

    return this.#request(this.CHANNEL_DEVICE, payload, read_response, timeout);
  }

  // synchronizes the device internal clock with the provided TimeTrack clock
  // of the application as precisely as possible
  setClock(clock) {
    logging.verbose(`setClock(clock.millis()=${clock.millis()})`);

    if (!this.#connected) {
      throw "DeviceDisconnected";
    }

    return new Promise(async (resolve, reject) => {
      for (let index = 0; index < 3; index++) {
        try {
          await this.#write(this.CHANNEL_CLOCK, [...toBytes(clock.millis(), 8)]);
          logging.debug("Clock write success");
          resolve();
          return;
        } catch (e) {
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

    if (!this.#connected) {
      throw "DeviceDisconnected";
    }

    return new Promise(async (resolve, reject) => {
      for (let index = 0; index < 3; index++) {

        try {
          const bytes = await this.#read(this.CHANNEL_CLOCK);

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
  updateFW(firmware) {
    logging.verbose(`updateFW(firmware=${firmware})`);

    if (!this.#serialPort) {
      logging.warn("Serial Port is null");
      throw "UpdateFailed";
    }

    if (this.#writing) {
      logging.warn("Communication in proccess");
      throw "UpdateFailed";
    }

    this.#writing = true;

    return new Promise(async (resolve, reject) => {
      const chunk_size = 3984; // must be modulo 16

      this.#divisor = 24;

      let index_from = 0;
      let index_to = chunk_size;

      let written = 0;

      logging.info("OTA UPDATE");
      logging.verbose(firmware);

      const start_timestamp = new Date().getTime();

      try {
        this.#runtimeReference.emit("ota_status", "begin");

        {
          //===========// RESET //===========//
          logging.info("OTA RESET");

          const bytes = [COMMAND_FLAGS.FLAG_OTA_RESET, 0x00, ...numberToBytes(0x00000000, 4)];
          await this.#write(this.CHANNEL_DEVICE, bytes);
        }

        await sleep(100);

        {
          //===========// BEGIN //===========//
          logging.info("OTA BEGIN");

          const bytes = [COMMAND_FLAGS.FLAG_OTA_BEGIN, 0x00, ...numberToBytes(firmware.length, 4)];
          await this.#write(this.CHANNEL_DEVICE, bytes, 20000);
        }

        await sleep(8000); // need to wait 10 seconds to let the ESP erase the flash.

        {
          //===========// WRITE //===========//
          logging.info("OTA WRITE");

          while (written < firmware.length) {
            if (index_to > firmware.length) {
              index_to = firmware.length;
            }

            const bytes = [COMMAND_FLAGS.FLAG_OTA_WRITE, 0x00, ...numberToBytes(written, 4), ...firmware.slice(index_from, index_to)];

            await this.#write(this.CHANNEL_DEVICE, bytes);
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

          const bytes = [COMMAND_FLAGS.FLAG_OTA_END, 0x00, ...numberToBytes(written, 4)];
          await this.#write(this.CHANNEL_DEVICE, bytes);
        }

        await sleep(2000);

        logging.info("Firmware written in " + (new Date().getTime() - start_timestamp) / 1000 + " seconds");

        this.#runtimeReference.emit("ota_status", "success");
        resolve();
      } catch (e) {
        logging.error("Error during OTA:", e);
        this.#runtimeReference.emit("ota_status", "fail");
        reject("UpdateFailed");
      }
    }).finally(() => {
      this.#divisor = 4;
      this.#writing = false;
    });
  }

  destroy() {
    logging.verbose("destroy()");

    //this.#runtimeReference = null; // dont know if I need to destroy this reference.. But I guess I dont need to?
    return this.disconnect()
      .catch(() => { })
      .then(() => {
        return this.unselect();
      })
      .catch(() => { });
  }

}
