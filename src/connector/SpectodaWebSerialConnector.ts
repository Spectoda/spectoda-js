// npm install --save @types/w3c-web-serial
/// <reference types="w3c-web-serial" />

import { logging } from "../logging";
import { sleep, toBytes, numberToBytes, crc8, crc32, hexStringToArray, rgbToHex, stringToBytes, convertToByteArray } from "../functions";
import { TimeTrack } from "../TimeTrack.js";
import { COMMAND_FLAGS } from "../webassembly/Spectoda_JS.js";
import { TnglWriter } from "../TnglWriter.js";
import { TnglReader } from "../TnglReader.js";
import { SpectodaRuntime } from "../SpectodaRuntime";

let { SerialPort, ReadlineParser }: { SerialPort: any; ReadlineParser: any } = { SerialPort: null, ReadlineParser: null };

if (typeof window === "undefined" && !process.env.NEXT_PUBLIC_VERSION) {
    const serialport = require("serialport");
    SerialPort = serialport.SerialPort;
    ReadlineParser = serialport.ReadlineParser;
}

///////////////////////////////////////////////////////////////////////////////////

const PORT_OPTIONS: SerialOptions = { baudRate: 115200, dataBits: 8, stopBits: 1, parity: "none", bufferSize: 65535, flowControl: "none" };

const CODE_WRITE = 100;
const CODE_READ = 200;

const CHANNEL_NETWORK = 1;
const CHANNEL_DEVICE = 2;
const CHANNEL_CLOCK = 3;

const starts_with = function (buffer: number[], string: string, start_offset: number = 0) {
    for (let index = 0; index < string.length; index++) {
        if (buffer[index + start_offset] !== string.charCodeAt(index)) {
            return false;
        }
    }

    return true;
}

const ends_with = function (buffer: number[], string: string, start_offset: number = 0) {
    for (let index = 0; index < string.length; index++) {
        if (buffer[buffer.length - start_offset - string.length + index] !== string.charCodeAt(index)) {
            return false;
        }
    }

    return true;
}

// Connector connects the application with one Spectoda Device, that is then in a
// position of a controller for other Spectoda Devices
export class SpectodaWebSerialConnector {
    #runtimeReference;

    #serialPort: SerialPort | undefined;
    #criteria: { baudrate: number | undefined, baudRate: number | undefined }[] | undefined;

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
    userSelect(criteria: { baudrate: number | undefined, baudRate: number | undefined }[]): Promise<{ connector: string }> {
        logging.verbose("userSelect()");

        if (this.#connected) {
            return this.disconnect().then(() => {
                return this.userSelect(criteria);
            });
        }

        if (this.#serialPort) {
            return this.unselect().then(() => {
                return this.userSelect(criteria);
            });
        }

        return navigator.serial.requestPort().then(port => {
            this.#serialPort = port;
            this.#criteria = criteria;
            return Promise.resolve({ connector: this.type, criteria: this.#criteria });
        });
    }

    // takes the criteria, scans for scan_period and asudutomatically selects the device,
    // you can then connect to. This works only for BLE devices that are bond with the phone/PC/tablet
    // the app is running on OR doesnt need to be bonded in a special way.
    // if more devices are found matching the criteria, then the strongest signal wins
    // if no device is found within the timeout period, then it returns an error

    // if no criteria are provided, all Spectoda enabled devices (with all different FWs and Owners and such)
    // are eligible.

    autoSelect(criteria: { baudrate: number | undefined, baudRate: number | undefined }[], scan_period: number, timeout: number): Promise<{ connector: string }> {
        logging.verbose("autoSelect()");

        // step 1. for the scan_period scan the surroundings for BLE devices.
        // step 2. if some devices matching the criteria are found, then select the one with
        //         the greatest signal strength. If no device is found until the timeout,
        //         then return error

        return this.userSelect(criteria);
    }

    selected(): Promise<{ connector: string } | null> {
        logging.verbose("selected()");

        return Promise.resolve(this.#serialPort ? { connector: this.type, criteria: this.#criteria } : null);
    }

    unselect(): Promise<void> {
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

        return Promise.resolve();
    }

    scan(criteria: { baudrate: number | undefined, baudRate: number | undefined }[], scan_period: number) {
        logging.verbose("scan(criteria=" + JSON.stringify(criteria) + ", scan_period=" + scan_period + ")");

        // TODO implement this
        throw "NotSupported";
    }


    async #readLoop() {

        let command_bytes: number[] = [];

        let header_bytes: number[] = [];
        let data_header: { data_type: number, data_size: number, data_receive_timeout: number, data_crc32: number, header_crc32: number } | undefined = undefined;
        let data_bytes: number[] = [];

        let notify_header: object | undefined = undefined;
        let notify_bytes: number[] = [];

        let line_bytes: number[] = [];

        const MODE_UTF8_RECEIVE = 0;
        const MODE_DATA_RECEIVE = 1;

        let mode = MODE_UTF8_RECEIVE;

        const NEWLINE_ASCII_CODE = 10;

        const decoder = new TextDecoder();

        while (this.connected) {
            try {

                const { value, done } = !this.#reader ? { value: null, done: true } : await this.#reader.read().catch(e => {
                    logging.error("this.#reader.read()", e);

                    if (e.toString().includes("break condition")) {
                        logging.warn("> Break Condition Detected");
                        return { value: null, done: false };
                    }

                    this.disconnect().catch(() => { });
                    return { value: null, done: true };
                });

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
                                        console.log(line);
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

                                    data_header = { data_type: 0, data_size: 0, data_receive_timeout: 0, data_crc32: 0, header_crc32: 0 };
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
                logging.error('Read error:', error);
                break;
            }
        }
    }

    connect(timeout: number = 15000) {
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

        let port_options = PORT_OPTIONS;

        if (this.#criteria && Array.isArray(this.#criteria) && this.#criteria.length && (this.#criteria[0].baudrate || this.#criteria[0].baudRate)) {
            port_options.baudRate = this.#criteria[0].baudrate || this.#criteria[0].baudRate;
        }

        logging.info("> Opening serial port on 'baudRate':", port_options.baudRate);

        return this.#serialPort.open(port_options)
            .then(() => {
                this.#opened = true;

                this.#writer = this.#serialPort?.writable?.getWriter();
                this.#reader = this.#serialPort?.readable?.getReader();

                this.#readLoop();

                return new Promise((resolve, reject) => {

                    const timeout_handle = setTimeout(() => {
                        logging.warn("Connection begin timeouted");
                        this.#beginCallback = undefined;

                        this.disconnect().finally(() => {
                            reject("ConnectTimeout");
                        });

                    }, timeout);

                    this.#beginCallback = result => {
                        clearTimeout(timeout_handle);
                        this.#beginCallback = undefined;

                        if (result) {
                            logging.debug("> Serial Connector Connected");
                            this.#connected = true;

                            this.#runtimeReference.emit("#connected");
                            resolve({ connector: this.type, criteria: this.#criteria });
                        } else {
                            logging.warn("Trying to connect again")
                            const passed = new Date().getTime() - start;
                            resolve(this.connect(timeout - passed));
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

    connected() {
        logging.verbose("connected()");

        return Promise.resolve(this.#connected ? { connector: this.type, criteria: this.#criteria } : null);
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

        if (this.#reader) {
            await this.#reader.cancel().catch(() => { });
            this.#reader = undefined;
        }

        if (this.#writer) {
            await this.#writer.close().catch(() => { });
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

    #initiate(initiate_code: number, payload: number[], tries: number, timeout: number) {
        logging.verbose(`initiate(initiate_code=${initiate_code}, payload=${payload}, tries=${tries}, timeout=${timeout})`);

        if (!tries) {
            logging.warn("No #initiate tryes left");
            throw "WriteFailed";
        }

        if (!payload) {
            payload = [];
        }

        if (timeout < 0) {
            throw "TimeoutExpired";
        }

        const packet_timeout_min = 10;
        let packet_timeout = (payload.length * 8 * 1000 * this.#timeoutMultiplier) / 115200 + packet_timeout_min;

        if (!packet_timeout || packet_timeout < packet_timeout_min) {
            logging.warn("Packet Timeout is too small:", packet_timeout);
            packet_timeout = packet_timeout_min;
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

            const timeout_handle = setTimeout(() => {
                logging.warn("Response timeouted");
                this.#feedbackCallback = undefined;

                this.disconnect().finally(() => {
                    reject("ResponseTimeout");
                });
            }, timeout + 250); // +250ms for the controller to response timeout if reveive timeoutes

            this.#feedbackCallback = (success: boolean) => {
                this.#feedbackCallback = undefined;
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
                            resolve(this.#initiate(initiate_code, payload, tries - 1, timeout - packet_timeout));
                        } catch (e) {
                            reject(e);
                        }
                    }, 250); // 100ms to be safe
                }

            };

            try {
                await this.#writer?.write(new Uint8Array(header_writer.bytes.buffer));
                await this.#writer?.write(new Uint8Array(payload));

            } catch (e) {
                logging.error(e);
                reject(e);
            }

        });
    }

    #write(channel_type: number, payload: number[], timeout: number) {
        return this.#initiate(CODE_WRITE + channel_type, payload, 10, timeout);
    }

    #read(channel_type: number, timeout: number) {
        let response = new DataView(new ArrayBuffer(0));

        this.#dataCallback = data => {
            response = new DataView(data.buffer);
            this.#dataCallback = undefined;
        };

        return this.#initiate(CODE_READ + channel_type, [], 10, timeout).then(() => {
            return response;
        });
    }

    #request(channel_type: number, payload: number[], read_response: boolean, timeout: number) {
        return this.#write(channel_type, payload, timeout).then(() => {
            if (read_response) {
                return this.#read(channel_type, timeout);
            } else {
                return Promise.resolve(new DataView(new ArrayBuffer(0)));
            }
        });
    }

    // deliver handles the communication with the Spectoda network in a way
    // that the command is guaranteed to arrive
    deliver(payload: number[], timeout: number) {
        logging.verbose(`deliver(payload=${payload})`);

        if (!this.#connected) {
            throw "DeviceDisconnected";
        }

        if (!payload) {
            return Promise.resolve();
        }

        return this.#write(CHANNEL_NETWORK, payload, timeout);
    }

    // transmit handles the communication with the Spectoda network in a way
    // that the command is NOT guaranteed to arrive
    transmit(payload: number[], timeout: number) {
        logging.verbose(`transmit(payload=${payload})`);

        if (!this.#connected) {
            throw "DeviceDisconnected";
        }

        if (!payload) {
            return Promise.resolve();
        }

        return this.#write(CHANNEL_NETWORK, payload, timeout);
    }

    // request handles the requests on the Spectoda network. The command request
    // is guaranteed to get a response
    request(payload: number[], read_response: boolean, timeout: number) {
        logging.verbose(`request(payload=${payload})`);

        if (!this.#connected) {
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

        if (!this.#connected) {
            throw "DeviceDisconnected";
        }

        return new Promise(async (resolve, reject) => {
            for (let index = 0; index < 3; index++) {
                try {
                    await this.#write(CHANNEL_CLOCK, [...toBytes(clock.millis(), 8)], 1000);
                    logging.debug("Clock write success");
                    resolve(null);
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

            logging.info("OTA UPDATE");
            logging.verbose(firmware);

            const start_timestamp = new Date().getTime();

            try {
                this.#runtimeReference.emit("ota_status", "begin");

                {
                    //===========// RESET //===========//
                    logging.info("OTA RESET");

                    const bytes = [COMMAND_FLAGS.FLAG_OTA_RESET, 0x00, ...numberToBytes(0x00000000, 4)];
                    await this.#write(CHANNEL_DEVICE, bytes, 10000);
                }

                await sleep(100);

                {
                    //===========// BEGIN //===========//
                    logging.info("OTA BEGIN");

                    const bytes = [COMMAND_FLAGS.FLAG_OTA_BEGIN, 0x00, ...numberToBytes(firmware.length, 4)];
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

                        const bytes = [COMMAND_FLAGS.FLAG_OTA_WRITE, 0x00, ...numberToBytes(written, 4), ...firmware.slice(index_from, index_to)];

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

                    const bytes = [COMMAND_FLAGS.FLAG_OTA_END, 0x00, ...numberToBytes(written, 4)];
                    await this.#write(CHANNEL_DEVICE, bytes, 10000);
                }

                logging.info("Firmware written in " + (new Date().getTime() - start_timestamp) / 1000 + " seconds");

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
