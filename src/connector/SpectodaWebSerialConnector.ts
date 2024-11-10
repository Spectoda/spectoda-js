// eslint-disable-next-line @typescript-eslint/ban-ts-comment

// npm install --save @types/w3c-web-serial

import { TimeTrack } from "../../TimeTrack";
import { TnglReader } from "../../TnglReader";
import { TnglWriter } from "../../TnglWriter";
import { crc32, numberToBytes, sleep, toBytes } from "../../functions";
import { logging } from "../../logging";
import { SpectodaRuntime } from "../SpectodaRuntime";
import { Connection, SpectodaWasm, Synchronization } from "../SpectodaWasm";
import { COMMAND_FLAGS, DEFAULT_TIMEOUT, SpectodaTypes } from "../Spectoda_JS";

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

const HEADER_BYTES_SIZE = 20;

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

export class SpectodaWebSerialConnector {
  #runtimeReference;

  #serialPort: SerialPort | undefined;
  #criteria: SpectodaTypes.Criterium[] | undefined;

  #interfaceConnected: boolean;
  #disconnecting: boolean;
  #disconnectingResolve: ((value: unknown) => void) | undefined;

  #timeoutMultiplier: number;

  #beginCallback: ((result: boolean) => void) | undefined;
  #feedbackCallback: ((success: boolean) => void) | undefined;
  #dataCallback: ((data: Uint8Array) => void) | undefined;

  #writing: boolean;

  #writer: WritableStreamDefaultWriter<Uint8Array> | undefined;
  #reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

  type: string;

  constructor(runtimeReference: SpectodaRuntime) {
    this.type = "webserial";

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

  userSelect(criterium_array: SpectodaTypes.Criterium[], timeout_number: number | typeof DEFAULT_TIMEOUT = DEFAULT_TIMEOUT): Promise<SpectodaTypes.Criterium | null> {
    if (timeout_number === DEFAULT_TIMEOUT) {
      timeout_number = 60000;
    }

    const criteria_json = JSON.stringify(criterium_array);
    logging.verbose("userSelect(criteria=" + criteria_json + ")");

    return new Promise(async (resolve, reject) => {
      try {
        const port = await navigator.serial.requestPort({ filters: [] });
        this.#serialPort = port;
        this.#criteria = criterium_array;
        resolve({ connector: this.type });
      } catch (error) {
        logging.error("userSelect failed:", error);
        reject(error);
      }
    });
  }

  autoSelect(criterium_array: SpectodaTypes.Criterium[], scan_duration_number: number | typeof DEFAULT_TIMEOUT = DEFAULT_TIMEOUT, timeout_number: number | typeof DEFAULT_TIMEOUT = DEFAULT_TIMEOUT): Promise<SpectodaTypes.Criterium | null> {
    if (scan_duration_number === DEFAULT_TIMEOUT) {
      scan_duration_number = 1500;
    }
    if (timeout_number === DEFAULT_TIMEOUT) {
      timeout_number = 5000;
    }

    logging.verbose("autoSelect(criteria=" + JSON.stringify(criterium_array) + ", scan_duration=" + scan_duration_number + ", timeout=" + timeout_number + ")");

    return new Promise(async (resolve, reject) => {
      try {
        const ports = await navigator.serial.getPorts();
        logging.verbose("Available ports:", ports);

        if (ports.length === 0) {
          logging.warn("No previously selected ports available");
          reject("NoDeviceFound");
          return;
        }

        this.#serialPort = ports[0];
        this.#criteria = criterium_array;
        resolve({ connector: this.type });
      } catch (error) {
        logging.error("autoSelect failed:", error);
        reject(error);
      }
    });
  }

  selected(): Promise<SpectodaTypes.Criterium | null> {
    logging.verbose("selected()");
    return Promise.resolve(this.#serialPort ? { connector: this.type } : null);
  }

  unselect(): Promise<null> {
    logging.verbose("unselect()");

    if (!this.#serialPort) {
      logging.verbose("already unselected");
      return Promise.resolve(null);
    }

    if (this.#serialPort && this.#interfaceConnected) {
      logging.verbose("disconnecting from unselect()");
      return this.disconnect().then(() => {
        return this.unselect();
      });
    }

    this.#serialPort = undefined;
    this.#criteria = undefined;

    return Promise.resolve(null);
  }

  scan(criterium_array: SpectodaTypes.Criterium[], scan_duration_number: number | typeof DEFAULT_TIMEOUT = DEFAULT_TIMEOUT): Promise<SpectodaTypes.Criterium[]> {
    if (scan_duration_number === DEFAULT_TIMEOUT) {
      scan_duration_number = 7000;
    }

    logging.verbose("scan(criterium_array=" + JSON.stringify(criterium_array) + ", scan_duration_number=" + scan_duration_number + ")");

    return new Promise(async (resolve, reject) => {
      try {
        const ports = await navigator.serial.getPorts();
        logging.verbose("ports=", ports);
        resolve(ports.map(port => ({ connector: this.type, port })));
      } catch (error) {
        logging.error(error);
        reject(error);
      }
    });
  }

  connect(timeout_number: number | typeof DEFAULT_TIMEOUT = DEFAULT_TIMEOUT): Promise<SpectodaTypes.Criterium> {
    if (timeout_number === DEFAULT_TIMEOUT) {
      timeout_number = 60000;
    }
    logging.verbose(`connect(timeout_number=${timeout_number})`);

    if (timeout_number <= 0) {
      logging.warn("Connect timeout has expired");
      return Promise.reject("ConnectionFailed");
    }

    if (!this.#serialPort) {
      return Promise.reject("NotSelected");
    }

    if (this.#interfaceConnected) {
      logging.warn("Serial device already connected");
      return Promise.resolve({ connector: this.type });
    }

    return new Promise(async (resolve, reject) => {
      try {
        const port = this.#serialPort;

        if (!port) {
          reject("InternalError");
          return;
        }

        await port.open(PORT_OPTIONS);

        if (!port.readable || !port.writable) {
          logging.error("port.readable or port.writable == null");
          reject("InternalError");
          return;
        }

        // Flush the serial buffer
        try {
          const tempReader = port.readable.getReader();
          const flushTimeout = 10; // milliseconds
          const flushStartTime = Date.now();

          while (Date.now() - flushStartTime < flushTimeout) {
            const { value, done } = await tempReader.read();
            if (done) {
              break;
            }
            if (value && value.length > 0) {
              // Discard value
            } else {
              break;
            }
          }
          await tempReader.cancel();
          tempReader.releaseLock();
          logging.verbose("Serial buffer flushed.");
        } catch (error) {
          logging.error("Error flushing serial buffer:", error);
        }

        this.#disconnecting = false;

        this.#writer = port.writable.getWriter();
        this.#reader = port.readable.getReader();

        const decoder = new TextDecoder();

        const command_bytes: number[] = [];
        const header_bytes: number[] = [];
        let data_header: { data_type: number; data_size: number; data_receive_timeout: number; data_crc32: number; header_crc32: number } = {
          data_type: 0,
          data_size: 0,
          data_receive_timeout: 0,
          data_crc32: 0,
          header_crc32: 0,
        };
        const data_bytes: number[] = [];
        const line_bytes: number[] = [];

        const MODE_UTF8_RECEIVE = 0;
        const MODE_DATA_RECEIVE = 1;

        let mode = MODE_UTF8_RECEIVE;

        const NEWLINE_ASCII_CODE = 10;

        const readLoop = async () => {
          if (!this.#reader) {
            logging.error("this.#reader == null");
            reject("InternalError");
            return;
          }

          try {
            while (true) {
              const { value, done } = await this.#reader.read();
              if (done) {
                break;
              }
              if (value) {
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
                                this.#runtimeReference.spectoda_js.execute(new Uint8Array(data_bytes), DUMMY_NODESERIAL_CONNECTION);

                                break;
                              }
                              case CLOCK_WRITE: {
                                logging.info("SERIAL >>>CLOCK_WRITE<<<");

                                const synchronization: Synchronization = SpectodaWasm.Synchronization.fromUint8Array(new Uint8Array(data_bytes));
                                const DUMMY_NODESERIAL_CONNECTION = new SpectodaWasm.Connection("11:11:11:11:11:11", SpectodaWasm.connector_type_t.CONNECTOR_SERIAL, SpectodaWasm.connection_rssi_t.RSSI_MAX);
                                this.#runtimeReference.spectoda_js.synchronize(synchronization, DUMMY_NODESERIAL_CONNECTION);

                                break;
                              }
                              case DEVICE_WRITE: {
                                logging.info("SERIAL >>>DEVICE_WRITE<<<");

                                const DUMMY_NODESERIAL_CONNECTION = new SpectodaWasm.Connection("11:11:11:11:11:11", SpectodaWasm.connector_type_t.CONNECTOR_SERIAL, SpectodaWasm.connection_rssi_t.RSSI_MAX);
                                this.#runtimeReference.spectoda_js.request(new Uint8Array(data_bytes), DUMMY_NODESERIAL_CONNECTION);

                                break;
                              }
                            }

                            command_bytes.length = 0;
                            data_header = { data_type: 0, data_size: 0, data_receive_timeout: 0, data_crc32: 0, header_crc32: 0 };
                          }
                        } else if (ends_with(command_bytes, "DATA=")) {
                          mode = MODE_DATA_RECEIVE;
                          data_header = { data_type: 0, data_size: 0, data_receive_timeout: 0, data_crc32: 0, header_crc32: 0 };

                          header_bytes.length = 0;
                          data_bytes.length = 0;
                        } else if (command_bytes.length > ">>>SUCCESS<<<\n".length) {
                          logging.error("ERROR 342897cs: command_bytes", command_bytes, "data_header", data_header);
                          command_bytes.length = 0;
                        }
                      } else {
                        const character = command_bytes.shift() as number;

                        if (character === NEWLINE_ASCII_CODE) {
                          const line = decoder.decode(new Uint8Array(line_bytes));
                          logging.info(line);
                          this.#runtimeReference.emit("controller-log", line);
                          line_bytes.length = 0;
                        } else {
                          line_bytes.push(character);
                        }
                      }
                    }
                  } else if (mode == MODE_DATA_RECEIVE) {
                    if (header_bytes.length < HEADER_BYTES_SIZE) {
                      header_bytes.push(byte);

                      if (header_bytes.length >= HEADER_BYTES_SIZE) {
                        const tnglReader = new TnglReader(new Uint8Array(header_bytes));

                        data_header.data_type = tnglReader.readUint32();
                        data_header.data_size = tnglReader.readUint32();
                        data_header.data_receive_timeout = tnglReader.readUint32();
                        data_header.data_crc32 = tnglReader.readUint32();
                        data_header.header_crc32 = tnglReader.readUint32();

                        logging.verbose("data_header=", data_header);

                        if (data_header.data_size == 0) {
                          mode = MODE_UTF8_RECEIVE;
                        }
                      }
                    } else {
                      data_bytes.push(byte);

                      if (data_bytes.length >= data_header.data_size) {
                        mode = MODE_UTF8_RECEIVE;
                      }
                    }
                  }
                }
              }
            }
          } catch (error) {
            logging.error("Read loop error:", error);
          }
        };

        readLoop();

        const timeout_handle = setTimeout(async () => {
          logging.warn("Connection begin timeouted");
          this.#beginCallback = undefined;

          await this.#disconnect().finally(() => {
            reject("ConnectTimeout");
          });
        }, timeout_number);

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
              resolve({ connector: this.type });
            }, 100);
          } else {
            logging.warn("Serial connection failed");

            setTimeout(() => {
              this.#disconnect().finally(() => {
                reject("ConnectFailed");
              });
            }, 100);
          }
        };

        try {
          await this.#writeString(">>>ENABLE_SERIAL<<<\n");
        } catch (error) {
          logging.error("Error sending initial command:", error);
          reject(error);
        }
      } catch (error) {
        logging.error("Connect failed:", error);
        reject(error);
      }
    });
  }

  connected(): Promise<SpectodaTypes.Criterium | null> {
    logging.verbose(`connected()`);
    return Promise.resolve(this.#serialPort && this.#interfaceConnected ? { connector: this.type } : null);
  }

  disconnect(): Promise<unknown> {
    logging.verbose("disconnect()");

    if (!this.#serialPort) {
      logging.warn("No Serial Port selected do disconnect");
      return Promise.resolve(null);
    }

    // Check if the port is open
    if (!this.#serialPort.readable && !this.#serialPort.writable) {
      logging.warn("Serial Port is not open to disconnect");
      return Promise.resolve(null);
    }

    if (this.#disconnecting) {
      logging.warn("Serial port already disconnecting");
      return Promise.resolve(null);
    }

    this.#disconnecting = true;

    const disconnectingPromise = new Promise(async (resolve, reject) => {
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
        await this.#writeString(">>>FINISH_SERIAL<<<\n");
        await this.#writer?.close();
        this.#writer = undefined;
        await this.#reader?.cancel();
        this.#reader = undefined;
        await this.#serialPort?.close();

        this.#disconnecting = false;
        if (this.#disconnectingResolve !== undefined) {
          this.#disconnectingResolve(null);
        }
        if (this.#interfaceConnected) {
          this.#interfaceConnected = false;
          this.#runtimeReference.emit("#disconnected");
        }
      } catch (error) {
        logging.error("Error during disconnect:", error);
        reject(error);
      }
    });

    return disconnectingPromise;
  }

  #disconnect() {
    logging.verbose("#disconnect()");

    if (!this.#serialPort) {
      logging.verbose("No Serial Port selected");
      return Promise.resolve(null);
    }

    // Check if the port is open
    if (!this.#serialPort.readable && !this.#serialPort.writable) {
      logging.verbose("> Serial Port already closed");
      return Promise.resolve(null);
    }

    if (this.#disconnecting) {
      logging.warn("Serial port already disconnecting");
      return Promise.resolve(null);
    }

    this.#disconnecting = true;

    logging.verbose("> Closing serial port...");

    return new Promise(async (resolve, reject) => {
      try {
        await this.#writer?.close();
        this.#writer = undefined;
        await this.#reader?.cancel();
        this.#reader = undefined;
        await this.#serialPort?.close();
        this.#disconnecting = false;
        if (this.#disconnectingResolve !== undefined) {
          this.#disconnectingResolve(null);
        }
        if (this.#interfaceConnected) {
          this.#interfaceConnected = false;
          this.#runtimeReference.emit("#disconnected");
        }
        resolve(null);
      } catch (error) {
        logging.error(error);
        resolve(null);
      }
    });
  }

  #writeString(data: string): Promise<void> {
    const encoder = new TextEncoder();
    const encodedData = encoder.encode(data);
    return this.#writer?.write(encodedData) || Promise.resolve();
  }

  #initiate(initiate_code: number, payload: Uint8Array, tries: number, timeout: number): Promise<unknown> {
    logging.verbose(`initiate(initiate_code=${initiate_code}, payload=${payload}, tries=${tries}, timeout=${timeout})`);

    if (tries <= 0) {
      logging.error("ERROR nhkw45390");
      return Promise.reject("NoCommunicationTriesLeft");
    }

    if (timeout <= 0) {
      logging.error("ERROR sauioczx98");
      return Promise.reject("CommunicationTimeout");
    }

    if (typeof payload !== "object" || !payload) {
      logging.error("ERROR xcv90870dsa", typeof payload);
      return Promise.reject("InvalidParameter");
    }

    if (this.#writing) {
      logging.error("Someone is already writing");
    } else {
      this.#writing = true;
    }

    const packet_timeout_min = 50;
    let packet_timeout = payload.length * this.#timeoutMultiplier + packet_timeout_min;

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

    return new Promise(async (resolve, reject) => {
      let timeout_handle: NodeJS.Timeout | undefined = undefined;

      const do_write = async () => {
        timeout_handle = setTimeout(() => {
          logging.error("ERROR asvcb8976a", "Serial response timeout");

          if (this.#feedbackCallback) {
            this.#feedbackCallback(false);
          } else {
            this.#disconnect()
              .catch(() => {
                logging.error("ERROR fdsa8796", "Failed to disconnect");
              })
              .finally(() => {
                reject("ResponseTimeout");
              });
          }
        }, timeout + 1000);

        try {
          await this.#writer?.write(new Uint8Array(header_writer.bytes.buffer));
          await this.#writer?.write(payload);
        } catch (e) {
          logging.error("ERROR 0ads8F67", e);
          reject(e);
        }
      };

      this.#feedbackCallback = (success: boolean) => {
        this.#feedbackCallback = undefined;

        clearTimeout(timeout_handle);

        if (success) {
          resolve(null);
        } else {
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
          }, 100);
        }
      };

      do_write();
    }).finally(() => {
      this.#writing = false;
    });
  }

  #write(channel_type: number, payload: Uint8Array, timeout: number): Promise<unknown> {
    return this.#initiate(CODE_WRITE + channel_type, payload, 10, timeout);
  }

  #read(channel_type: number, timeout: number): Promise<Uint8Array> {
    let response = new Uint8Array();

    this.#dataCallback = data => {
      response = data;
      this.#dataCallback = undefined;
    };

    return this.#initiate(CODE_READ + channel_type, new Uint8Array(), 10, timeout).then(() => {
      return response;
    });
  }

  #request(channel_type: number, payload: Uint8Array, read_response: boolean, timeout: number): Promise<Uint8Array | null> {
    return this.#write(channel_type, payload, timeout).then(() => {
      if (read_response) {
        return this.#read(channel_type, timeout);
      } else {
        return null;
      }
    });
  }

  deliver(payload_bytes: Uint8Array, timeout_number: number | typeof DEFAULT_TIMEOUT = DEFAULT_TIMEOUT): Promise<unknown> {
    if (timeout_number === DEFAULT_TIMEOUT) {
      timeout_number = 5000;
    }
    logging.verbose(`deliver(payload=${payload_bytes})`);

    if (!this.#serialPort || !this.#interfaceConnected) {
      return Promise.reject("DeviceDisconnected");
    }

    if (!payload_bytes) {
      return Promise.resolve();
    }

    return this.#write(CHANNEL_NETWORK, payload_bytes, timeout_number);
  }

  transmit(payload_bytes: Uint8Array, timeout_number: number | typeof DEFAULT_TIMEOUT = DEFAULT_TIMEOUT): Promise<unknown> {
    if (timeout_number === DEFAULT_TIMEOUT) {
      timeout_number = 1000;
    }
    logging.verbose(`transmit(payload=${payload_bytes})`);

    if (!this.#serialPort || !this.#interfaceConnected) {
      return Promise.reject("DeviceDisconnected");
    }

    if (!payload_bytes) {
      return Promise.resolve();
    }

    return this.#write(CHANNEL_NETWORK, payload_bytes, timeout_number);
  }

  request(payload_bytes: Uint8Array, read_response: boolean, timeout_number: number | typeof DEFAULT_TIMEOUT = DEFAULT_TIMEOUT): Promise<Uint8Array | null> {
    if (timeout_number === DEFAULT_TIMEOUT) {
      timeout_number = 5000;
    }
    logging.verbose(`request(payload=${payload_bytes})`);

    if (!this.#serialPort || !this.#interfaceConnected) {
      return Promise.reject("DeviceDisconnected");
    }

    if (!payload_bytes) {
      return Promise.reject("InvalidPayload");
    }

    return this.#request(CHANNEL_DEVICE, payload_bytes, read_response, timeout_number);
  }

  setClock(clock: TimeTrack): Promise<unknown> {
    logging.verbose(`setClock(clock.millis()=${clock.millis()})`);

    if (!this.#serialPort || !this.#interfaceConnected) {
      return Promise.reject("DeviceDisconnected");
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

  getClock(): Promise<TimeTrack> {
    logging.verbose(`getClock()`);

    if (!this.#serialPort || !this.#interfaceConnected) {
      return Promise.reject("DeviceDisconnected");
    }

    return new Promise(async (resolve, reject) => {
      for (let index = 0; index < 3; index++) {
        try {
          const bytes = await this.#read(CHANNEL_CLOCK, 1000);

          const reader = new TnglReader(bytes);
          const timestamp = reader.readUint64();

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

  updateFW(firmware_bytes: Uint8Array): Promise<unknown> {
    logging.verbose("updateFW()", firmware_bytes);

    if (!this.#serialPort) {
      logging.warn("Serial Port is null");
      return Promise.reject("UpdateFailed");
    }

    return new Promise(async (resolve, reject) => {
      const chunk_size = 3984;

      this.#timeoutMultiplier = 2;

      let index_from = 0;
      let index_to = chunk_size;

      let written = 0;

      logging.setLoggingLevel(logging.level - 1);

      logging.info("OTA UPDATE");
      logging.verbose(firmware_bytes);

      const start_timestamp = Date.now();

      try {
        this.#runtimeReference.emit("ota_status", "begin");

        {
          logging.info("OTA RESET");

          const bytes = new Uint8Array([COMMAND_FLAGS.FLAG_OTA_RESET, 0x00, ...numberToBytes(0x00000000, 4)]);
          await this.#write(CHANNEL_DEVICE, bytes, 10000);
        }

        await sleep(100);

        {
          logging.info("OTA BEGIN");

          const bytes = new Uint8Array([COMMAND_FLAGS.FLAG_OTA_BEGIN, 0x00, ...numberToBytes(firmware_bytes.length, 4)]);
          await this.#write(CHANNEL_DEVICE, bytes, 10000);
        }

        await sleep(100);

        {
          logging.info("OTA WRITE");

          while (written < firmware_bytes.length) {
            if (index_to > firmware_bytes.length) {
              index_to = firmware_bytes.length;
            }

            const bytes = new Uint8Array([COMMAND_FLAGS.FLAG_OTA_WRITE, 0x00, ...numberToBytes(written, 4), ...firmware_bytes.slice(index_from, index_to)]);

            await this.#write(CHANNEL_DEVICE, bytes, 10000);
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

  cancel(): void {}

  destroy(): Promise<unknown> {
    logging.verbose("destroy()");

    return this.disconnect()
      .catch(() => {})
      .then(() => {
        return this.unselect();
      })
      .catch(() => {});
  }

  sendExecute(command_bytes: Uint8Array, source_connection: Connection) {
    logging.verbose(`SpectodaWebSerialConnector::sendExecute(command_bytes=${command_bytes}, source_connection=${source_connection})`);

    if (source_connection.connector_type == SpectodaWasm.connector_type_t.CONNECTOR_SERIAL) {
      return Promise.resolve();
    }

    if (!this.#serialPort || !this.#interfaceConnected) {
      return Promise.reject("DeviceDisconnected");
    }

    return this.#write(CHANNEL_NETWORK, command_bytes, 1000);
  }

  sendRequest(request_ticket_number: number, request_bytecode: Uint8Array, destination_connection: Connection) {
    logging.verbose(`SpectodaWebSerialConnector::sendRequest(request_ticket_number=${request_ticket_number}, request_bytecode=${request_bytecode}, destination_connection=${destination_connection})`);

    if (destination_connection.connector_type != SpectodaWasm.connector_type_t.CONNECTOR_SERIAL) {
      return Promise.resolve();
    }

    if (!this.#serialPort || !this.#interfaceConnected) {
      return Promise.reject("DeviceDisconnected");
    }

    return this.#write(CHANNEL_DEVICE, request_bytecode, 1000);
  }

  sendResponse(request_ticket_number: number, request_result: number, response_bytecode: Uint8Array, destination_connection: Connection) {
    logging.verbose(`SpectodaWebSerialConnector::sendResponse(request_ticket_number=${request_ticket_number}, request_result=${request_result}, response_bytecode=${response_bytecode}, destination_connection=${destination_connection})`);

    return Promise.reject("NotImplemented");
  }

  sendSynchronize(synchronization: Synchronization, source_connection: Connection) {
    logging.verbose(`SpectodaWebSerialConnector::sendSynchronize(synchronization=${synchronization}, source_connection=${source_connection})`);

    if (source_connection.connector_type == SpectodaWasm.connector_type_t.CONNECTOR_SERIAL) {
      return Promise.resolve();
    }

    if (!this.#serialPort || !this.#interfaceConnected) {
      return Promise.reject("DeviceDisconnected");
    }

    return this.#write(CHANNEL_CLOCK, synchronization.toUint8Array(), 1000);
  }
}
