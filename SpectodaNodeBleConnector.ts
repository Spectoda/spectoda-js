//// @ts-nocheck
import NodeBle, { createBluetooth } from "node-ble";

import { logging } from "./Logging.js";
import { numberToBytes, sleep, toBytes } from "./functions.js";
import { COMMAND_FLAGS, SpectodaInterfaceLegacy } from "./SpectodaInterfaceLegacy.js";
import { TimeTrack } from "./TimeTrack.js";
import { TnglReader } from "./TnglReader.js";

// od 0.8.0 maji vsechny spectoda enabled BLE zarizeni jednotne SPECTODA_DEVICE_UUID.
// kazdy typ (produkt) Spectoda Zarizeni ma svuj kod v manufacturer data
// verze FW lze získat také z manufacturer data

// xxConnection.js udržuje komunikaci vždy pouze s
// jedním zařízením v jednu chvíli

//////////////////////////////////////////////////////////////////////////

/*
    is renamed Transmitter. Helper class for WebBluetoothConnector.js
*/
export class NodeBLEConnection {
  #interfaceReference: SpectodaInterfaceLegacy;
  // private fields
  #service: NodeBle.GattService | undefined;
  #networkChar: NodeBle.GattCharacteristic | undefined;
  #clockChar: NodeBle.GattCharacteristic | undefined;
  #deviceChar: NodeBle.GattCharacteristic | undefined;
  #writing;
  #uuidCounter;

  constructor(interfaceReference: SpectodaInterfaceLegacy) {
    this.#interfaceReference = interfaceReference;

    /*
      BLE Spectoda Service
    */
    this.#service = undefined;

    /*  
      Network Characteristics governs the communication with the Spectoda Netwok.
      That means tngl uploads, timeline manipulation, event emitting...
      You can access it only if you are authenticated via the Device Characteristics
    */
    this.#networkChar = undefined; // ? only accesable when connected to the mesh network

    /*  
      The whole purpuse of clock characteristics is to synchronize clock time
      of the application with the Spectoda network
    */
    this.#clockChar = undefined; // ? always accesable

    /*  
      Device Characteristics is renamed Update Characteristics
      Device Characteristics handles ALL CONCEPTS WITH THE 
      PHYSICAL CONNECTED DEVICE. On the other hand Network Characteristics 
      handles concepts connected with the whole spectoda network - all devices 
      With Device Charactristics you can upload FW to the single device, 
      access and manipulate json config of the device, adopt device, 
      and authenticate the application client with the spectoda network
    */
    this.#deviceChar = undefined;

    /*
      simple mutex indicating that communication over BLE is in progress
    */
    this.#writing = false;

    this.#uuidCounter = Math.floor(Math.random() * 4294967295);
  }

  #getUUID() {
    logging.verbose("#getUUID()");

    // valid UUIDs are in range [1..4294967295] (32 bit number)
    if (this.#uuidCounter >= 4294967295) {
      this.#uuidCounter = 0;
    }

    return ++this.#uuidCounter;
  }

  #writeBytes(characteristic: NodeBle.GattCharacteristic, bytes: Uint8Array, response: boolean): Promise<void> {
    logging.verbose("#writeBytes()", characteristic, bytes, response);

    const write_uuid = this.#getUUID(); // two messages near to each other must not have the same UUID!
    const packet_header_size = 12; // 3x 4byte integers: write_uuid, index_from, payload.length
    const packet_size = 512; // min size packet_header_size + 1 !!!! ANDROID NEEDS PACKET SIZE <= 212!!!!
    const bytes_size = packet_size - packet_header_size;

    if (!response) {

      if (bytes.length > bytes_size) {
        logging.error("The maximum bytes that can be written without response is " + bytes_size);
        return Promise.reject("WriteError");
      }

      const payload = [...numberToBytes(write_uuid, 4), ...numberToBytes(0, 4), ...numberToBytes(bytes.length, 4), ...bytes.slice(0, bytes.length)];
      return characteristic.writeValue(Buffer.from(payload), { offset: 0, type: "command" });

    }

    return new Promise(async (resolve, reject) => {
      let index_from = 0;
      let index_to = bytes_size;

      while (index_from < bytes.length) {
        if (index_to > bytes.length) {
          index_to = bytes.length;
        }

        const payload = [...numberToBytes(write_uuid, 4), ...numberToBytes(index_from, 4), ...numberToBytes(bytes.length, 4), ...bytes.slice(index_from, index_to)];

        try {
          await characteristic.writeValue(Buffer.from(payload), { offset: 0, type: "request" });
        } catch (e) {
          logging.warn(e);
          reject(e);
          return;
        }

        index_from += bytes_size;
        index_to = index_from + bytes_size;
      }
      resolve();
      return;
    });
  }

  #readBytes(characteristic: NodeBle.GattCharacteristic): Promise<DataView> {
    logging.verbose("#readBytes()", characteristic);

    // read the requested value

    // TODO write this function effectivelly
    return new Promise(async (resolve, reject) => {
      const data = await characteristic.readValue();
      const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength)

      logging.debug("bytes:", bytes);

      let total_bytes = [...bytes];

      while (bytes.length == 512) {
        const data = await characteristic.readValue();
        const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength)

        total_bytes = [...total_bytes, ...bytes];
      }

      logging.debug("total_bytes:", total_bytes);

      resolve(new DataView(new Uint8Array(total_bytes).buffer));
    });
  }

  // WIP, event handling from spectoda network to application
  // timeline changes from spectoda network to application ...
  #onNetworkNotification(data: Buffer) {
    logging.verbose("onNetworkNotification()", data);

    // logging.warn(event);

    // const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

    // logging.verbose("bytes", bytes);
    logging.verbose("view", view);

    this.#interfaceReference.process(view);
  }

  // WIP
  #onDeviceNotification(data: Buffer) {
    logging.verbose("onDeviceNotification()", data);

    // logging.warn(event);

  }

  // WIP
  #onClockNotification(data: Buffer) {
    logging.verbose("onClockNotification()", data);

    const array = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);

    // logging.warn(event);

  }

  attach(service: NodeBle.GattService, networkUUID: string, clockUUID: string, deviceUUID: string) {
    logging.verbose("attach()", service, networkUUID, clockUUID, deviceUUID);

    this.#service = service;

    logging.debug("> Getting Network Characteristics...");
    return this.#service
      .getCharacteristic(networkUUID)
      .then(characteristic => {
        this.#networkChar = characteristic;

        return this.#networkChar
          .startNotifications()
          .then(() => {
            logging.debug("> Network notifications started");
            this.#networkChar?.on("valuechanged", event => {
              this.#onNetworkNotification(event);
            });
          })
          .catch(e => {
            logging.warn(e);
          });
      })
      .catch(e => {
        logging.warn(e);
        throw "ConnectionFailed";
      })
      .then(() => {
        logging.debug("> Getting Clock Characteristics...");
        return this.#service?.getCharacteristic(clockUUID);
      })
      .then(characteristic => {
        this.#clockChar = characteristic;
      })
      .catch(e => {
        logging.warn(e);
        throw "ConnectionFailed";
      })
      .then(() => {
        logging.debug("> Getting Device Characteristics...");
        return this.#service?.getCharacteristic(deviceUUID);
      })
      .then(characteristic => {
        this.#deviceChar = characteristic;

        return this.#deviceChar?.startNotifications()
          .then(() => {
            logging.debug("> Device notifications started");
            this.#deviceChar?.on("valuechanged", event => {
              this.#onDeviceNotification(event);
            });
          })
          .catch(e => {
            logging.warn(e);
          });
      })
      .catch(e => {
        logging.warn(e);
        throw "ConnectionFailed";
      });
  }

  // deliver() thansfers data reliably to the Bluetooth Device. It might not be instant.
  // It may even take ages to get to the device, but it will! (in theory)
  // returns promise that resolves when message is physically send, but you
  // dont need to wait for it to resolve, and spam deliver() as you please.
  // transmering queue will handle it
  deliver(payload: Uint8Array, timeout: number): Promise<void> {
    logging.verbose("deliver()", payload, timeout);

    if (!this.#networkChar) {
      logging.warn("Network characteristics is null");
      return Promise.reject("DeliverFailed");
    }

    if (this.#writing) {
      logging.warn("Communication in proccess");
      return Promise.reject("DeliverFailed");
    }

    this.#writing = true;

    return this.#writeBytes(this.#networkChar, payload, true)
      .catch(e => {
        logging.error(e);
        throw "DeliverFailed";
      })
      .finally(() => {
        this.#writing = false;
      });
  }

  // transmit() tryes to transmit data NOW. ASAP. It will fail,
  // if deliver or another transmit is being executed at the moment
  // returns promise that will be resolved when message is physically send (only transmittion, not receive)
  transmit(payload: Uint8Array, timeout: number): Promise<void> {
    logging.verbose("transmit()", payload, timeout);

    if (!this.#networkChar) {
      logging.warn("Network characteristics is null");
      return Promise.reject("TransmitFailed");
    }

    if (this.#writing) {
      logging.warn("Communication in proccess");
      return Promise.reject("TransmitFailed");
    }

    this.#writing = true;

    return this.#writeBytes(this.#networkChar, payload, false)
      .catch(e => {
        logging.error(e);
        throw "TransmitFailed";
      })
      .finally(() => {
        this.#writing = false;
      });
  }

  // request first writes the request to the Device Characteristics
  // and then reads the response also from the Device Characteristics
  request(payload: Uint8Array, read_response: boolean, timeout: number): Promise<DataView | undefined> {
    logging.verbose("request()", payload, read_response, timeout);

    if (!this.#deviceChar) {
      logging.warn("Device characteristics is null");
      return Promise.reject("RequestFailed");
    }

    if (this.#writing) {
      logging.warn("Communication in proccess");
      return Promise.reject("RequestFailed");
    }

    this.#writing = true;

    return this.#writeBytes(this.#deviceChar, payload, true)
      .then(() => {
        if (!read_response) {
          return;
        }
        if (!this.#deviceChar) {
          return;
        }
        return this.#readBytes(this.#deviceChar);
      })
      .catch(e => {
        logging.error(e);
        throw "RequestFailed";
      })
      .finally(() => {
        this.#writing = false;
      });
  }

  // write timestamp to clock characteristics as fast as possible
  writeClock(timestamp: number): Promise<void> {
    logging.verbose("writeClock()", timestamp);

    if (!this.#clockChar) {
      logging.warn("Sync characteristics is null");
      return Promise.reject("ClockWriteFailed");
    }

    if (this.#writing) {
      logging.warn("Communication in proccess");
      return Promise.reject("ClockWriteFailed");
    }

    this.#writing = true;

    const bytes = Buffer.from(toBytes(timestamp, 8));

    return this.#clockChar
      .writeValue(bytes, { offset: 0, type: "reliable" })
      .catch(e => {
        logging.error(e);
        throw "ClockWriteFailed";
      })
      .finally(() => {
        this.#writing = false;
      });
  }

  // reads the current clock characteristics timestamp from the device
  // as fast as possible
  readClock(): Promise<number | undefined> {
    logging.verbose("readClock()");

    if (!this.#clockChar) {
      logging.warn("Sync characteristics is null");
      return Promise.reject("ClockReadFailed");
    }

    if (this.#writing) {
      logging.warn("Communication in proccess");
      return Promise.reject("ClockReadFailed");
    }

    this.#writing = true;

    return this.#readBytes(this.#clockChar)
      .then(dataView => {
        logging.debug(dataView)
        let reader = new TnglReader(dataView);
        return reader.readUint64();
      })
      .catch(e => {
        logging.error(e);
        throw "ClockReadFailed";
      })
      .finally(() => {
        this.#writing = false;
      });
  }

  async updateFirmware(firmware: number[]): Promise<unknown> {
    logging.verbose("updateFirmware()", firmware);

    if (!this.#deviceChar) {
      logging.warn("Device characteristics is null");
      return Promise.reject("UpdateFailed");
    }

    if (this.#writing) {
      logging.warn("Communication in proccess");
      return Promise.reject("UpdateFailed");
    }

    this.#writing = true;

    const chunk_size = 4992; // must be modulo 16

    let index_from = 0;
    let index_to = chunk_size;

    let written = 0;

    logging.debug("OTA UPDATE");
    logging.debug(firmware);

    const start_timestamp = new Date().getTime();

    try {
      this.#interfaceReference.emit("ota_status", "begin");

      {
        //===========// RESET //===========//
        logging.debug("OTA RESET");

        const bytes = new Uint8Array([COMMAND_FLAGS.FLAG_OTA_RESET, 0x00, ...numberToBytes(0x00000000, 4)]);
        await this.#writeBytes(this.#deviceChar, bytes, true);
      }

      await sleep(100);

      {
        //===========// BEGIN //===========//
        logging.debug("OTA BEGIN");

        const bytes = new Uint8Array([COMMAND_FLAGS.FLAG_OTA_BEGIN, 0x00, ...numberToBytes(firmware.length, 4)]);
        await this.#writeBytes(this.#deviceChar, bytes, true);
      }

      await sleep(8000); // need to wait 10 seconds to let the ESP erase the flash.

      {
        //===========// WRITE //===========//
        logging.debug("OTA WRITE");

        while (written < firmware.length) {
          if (index_to > firmware.length) {
            index_to = firmware.length;
          }

          const bytes = new Uint8Array([COMMAND_FLAGS.FLAG_OTA_WRITE, 0x00, ...numberToBytes(written, 4), ...firmware.slice(index_from, index_to)]);

          await this.#writeBytes(this.#deviceChar, bytes, true);
          written += index_to - index_from;

          const percentage = Math.floor((written * 10000) / firmware.length) / 100;
          logging.debug(percentage + "%");

          this.#interfaceReference.emit("ota_progress", percentage);

          index_from += chunk_size;
          index_to = index_from + chunk_size;
        }
      }

      await sleep(100);

      {
        //===========// END //===========//
        logging.debug("OTA END");

        const bytes = new Uint8Array([COMMAND_FLAGS.FLAG_OTA_END, 0x00, ...numberToBytes(written, 4)]);
        await this.#writeBytes(this.#deviceChar, bytes, true);
      }

      await sleep(2000);

      logging.info("Firmware written in " + (new Date().getTime() - start_timestamp) / 1000 + " seconds");

      this.#interfaceReference.emit("ota_status", "success");
      return;

    }
    catch (e) {
      logging.error(e);
      this.#interfaceReference.emit("ota_status", "fail");
      throw "UpdateFailed";
    }
    finally {
      this.#writing = false;
    }

  }

  // resets the Communations, discarding command queue
  reset() {
    logging.verbose("reset()");


    this.#service = undefined;
    this.#networkChar = undefined;
    this.#clockChar = undefined;
    this.#deviceChar = undefined;
    this.#writing = false;
  }

  destroy() {
    logging.verbose("destroy()");

    this.reset();
  }
}

/////////////////////////////////////////////////////////////////////////////////////

// Connector connects the application with one Spectoda Device, that is then in a
// position of a controller for other Spectoda Devices

interface Criteria {
  name?: string
  namePrefix?: string
  fwVersion?: string
  ownerSignature?: string
  productCode?: number
  adoptionFlag?: boolean
  mac?: string
}
export class SpectodaNodeBluetoothConnector {

  readonly type = "nodebluetooth";

  readonly SPECTODA_SERVICE_UUID = "cc540e31-80be-44af-b64a-5d2def886bf5";
  readonly TERMINAL_CHAR_UUID = "33a0937e-0c61-41ea-b770-007ade2c79fa";
  readonly CLOCK_CHAR_UUID = "7a1e0e3a-6b9b-49ef-b9b7-65c81b714a19";
  readonly DEVICE_CHAR_UUID = "9ebe2e4b-10c7-4a81-ac83-49540d1135a5";

  #interfaceReference;

  #bluetooth: NodeBle.Bluetooth;
  #bluetoothDestroy: () => void;
  #bluetoothAdapter: NodeBle.Adapter | undefined;
  #bluetoothDevice: NodeBle.Device | undefined;

  #connection;
  #reconection;
  #criteria;
  #connectedGuard;

  constructor(interfaceReference: SpectodaInterfaceLegacy) {

    this.#interfaceReference = interfaceReference;

    const { bluetooth: bluetoothDevice, destroy: bluetoothDestroy } = createBluetooth();

    this.#bluetooth = bluetoothDevice;
    this.#bluetoothDestroy = bluetoothDestroy;
    this.#bluetoothAdapter = undefined;
    this.#bluetoothDevice = undefined;

    this.#connection = new NodeBLEConnection(interfaceReference);
    this.#reconection = false;
    this.#criteria = {};

    this.#connectedGuard = false;

    this.#interfaceReference.on("#connected", () => {
      this.#connectedGuard = true;
    });

    this.#interfaceReference.on("#disconnected", () => {
      this.#connectedGuard = false;
    });
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
  // selects also legacy devices
  {
    legacy:true
  }
  // all Devices that are named "NARA Aplha", are on 0.8.0 fw and are
  // adopted by the owner with "baf2398ff5e6a7b8c9d097d54a9f865f" signature.
  // Product code is 1 what means NARA Alpha
  {
    name:"NARA Alpha" 
    fwVersion:"0.8.0"
    ownerSignature:"baf2398ff5e6a7b8c9d097d54a9f865f"
    productCode:1
  },
  // all the devices with the name starting with "NARA", without the 0.8.0 FW and 
  // that are not adopted by anyone
  // Product code is 2 what means NARA Beta 
  {
    namePrefix:"NARA"
    fwVersion:"!0.8.0"
    productCode:2
    adoptionFlag:true
  }
]

*/
  // choose one Spectoda device (user chooses which device to connect to via a popup)
  // if no criteria are set, then show all Spectoda devices visible.
  // first bonds the BLE device with the PC/Phone/Tablet if it is needed.
  // Then selects the device
  userSelect(criteria: object, timeout: number): Promise<object> {
    logging.debug("userSelect()", criteria, timeout);


    throw "NotImplemented";
  }

  // takes the criteria, scans for scanPeriod and automatically selects the device,
  // you can then connect to. This works only for BLE devices that are bond with the phone/PC/tablet
  // the app is running on OR doesnt need to be bonded in a special way.
  // if more devices are found matching the criteria, then the strongest signal wins
  // if no device is found within the timeout period, then it returns an error

  // if no criteria are provided, all Spectoda enabled devices (with all different FWs and Owners and such)
  // are eligible.

  async autoSelect(criteria: Criteria[], scanPeriod: number, timeout: number): Promise<object> {
    logging.debug("autoSelect()", criteria, scanPeriod, timeout);

    // step 1. for the scanPeriod scan the surroundings for BLE devices.
    // step 2. if some devices matching the criteria are found, then select the one with
    //         the greatest signal strength. If no device is found until the timeout,
    //         then return error

    if (await this.#connected()) {
      logging.verbose("disconnecting device");
      await this.disconnect().then(() => sleep(1000));
    }

    if (!criteria || criteria.length != 1 || typeof criteria[0]?.mac !== "string") {
      logging.error("Criteria must be an array of 1 object with specified MAC address: [{mac:'AA:BB:CC:DD:EE:FF'}]");
      throw "NotSupported";
    }

    if (!this.#bluetoothAdapter) {
      logging.verbose("requesting default bluetooth adapter");
      this.#bluetoothAdapter = await this.#bluetooth.defaultAdapter();
    }

    this.#criteria = criteria;

    if (!await this.#bluetoothAdapter.isDiscovering()) {
      logging.verbose("starting scanner");
      await this.#bluetoothAdapter.startDiscovery();
    }

    // Device UUID === Device MAC address
    const deviceMacAddress = criteria[0].mac.toUpperCase();

    logging.verbose(`waiting for the device ${deviceMacAddress} to show up`);
    this.#bluetoothDevice = await this.#bluetoothAdapter.waitDevice(deviceMacAddress, timeout, scanPeriod);

    // await sleep(1000);

    // logging.verbose("stopping scanner");
    // await this.#bluetoothAdapter.stopDiscovery();

    this.#bluetoothDevice.on("disconnect", this.#onDisconnected);

    logging.debug("getting device address");
    const mac = await this.#bluetoothDevice.getAddress();
    logging.debug("getting device name");
    const name = await this.#bluetoothDevice.getName();

    // const mac = "";
    // const name = "";

    logging.verbose("select done");

    return {
      connector: this.type,
      mac: mac,
      name: name
    };

  }

  // if device is conneced, then disconnect it
  async unselect(): Promise<void> {
    logging.debug("unselect()");


    if (await this.#connected()) {
      await this.disconnect();
    }

    this.#bluetoothDevice = undefined;
    this.#connection.reset();
  }

  // #selected returns boolean if a device is selected
  #selected() {
    return Promise.resolve(this.#bluetoothDevice ? true : false);
  }

  async selected() {
    logging.debug("selected()");

    if (!this.#bluetoothDevice) {
      return null;
    }

    return {
      connector: this.type,
      mac: await this.#bluetoothDevice.getAddress(),
      name: await this.#bluetoothDevice.getName()
    };
  }

  scan(criteria: Criteria, scanPeriod: number) {
    logging.debug("scan()", criteria, scanPeriod);

    throw "NotImplemented";
  }

  // connect Connector to the selected Spectoda Device. Also can be used to reconnect.
  // Fails if no device is selected
  async connect(timeout: number = 10000) {
    logging.debug(`connect(timeout=${timeout}})`);

    if (timeout <= 0) {
      logging.debug("> Connect timeout have expired");
      return Promise.reject("ConnectionFailed");
    }

    const start = new Date().getTime();
    this.#reconection = true;

    if (!this.#bluetoothDevice) {
      return Promise.reject("DeviceNotSelected");
    }

    const alreadyConnected = await this.#connected();

    if (!alreadyConnected) {

   
      logging.debug("> Connecting to Bluetooth device...");

      try {

        const paired = await this.#bluetoothDevice.isPaired();

        if (paired) {
          await this.#bluetoothDevice.connect()
        } else {
          await this.#bluetoothDevice.pair()
        }

      }

      catch {
        throw "ConnectionFailed";
      }

    }

    return this.#bluetoothDevice.gatt()
      .then(server => {
        this.#connection.reset();

        logging.debug("> Getting the Bluetooth Service...");
        return server?.getPrimaryService(this.SPECTODA_SERVICE_UUID);
      })
      .then(service => {
        logging.debug("> Getting the Service Characteristic...");

        if (!service) {
          throw "Error";
        }

        return this.#connection.attach(service, this.TERMINAL_CHAR_UUID, this.CLOCK_CHAR_UUID, this.DEVICE_CHAR_UUID);
      })
      .then(() => {
        logging.debug("> Bluetooth Device Connected");
        if (!this.#connectedGuard) {
          this.#interfaceReference.emit("#connected");
        }
        return { connector: this.type };
      })
      .catch(error => {

        logging.warn(error);

        throw "ConnectionFailed";

      });
  }

  // there #connected returns boolean true if connected, false if not connected
  #connected(): Promise<boolean> {
    logging.debug("#connected()");

    if (!this.#bluetoothDevice) {
      return Promise.resolve(false);
    }

    return this.#bluetoothDevice.isConnected();
  }

  // connected() is an interface function that needs to return a Promise
  connected() {
    logging.debug("connected()");

    return this.#connected().then(connected => Promise.resolve(connected ? { connector: this.type } : null));
  }

  #disconnect() {
    logging.debug("#disconnect()");

    return this.#bluetoothDevice?.disconnect();
  }

  // disconnect Connector from the connected Spectoda Device. But keep it selected
  async disconnect() {
    logging.debug("disconnect()");

    this.#reconection = false;

    logging.debug("> Disconnecting from Bluetooth Device...");

    this.#connection.reset();

    if (await this.#connected()) {
      await this.#disconnect();
    } else {
      logging.debug("Bluetooth Device is already disconnected");
    }
  }

  // when the device is disconnected, the javascript Connector.js layer decides
  // if it should be revonnected. Here is implemented that it should be
  // reconnected only if the this.#reconection is true. The event handlers are fired
  // synchronously. So that only after all event handlers (one after the other) are done,
  // only then start this.connect() to reconnect to the bluetooth device
  #onDisconnected = () => {
    logging.debug("onDisconnected()");

    logging.debug("> Bluetooth Device disconnected");
    this.#connection.reset();
    if (this.#connectedGuard) {
      logging.verbose("emitting #disconnected");
      this.#interfaceReference.emit("#disconnected");
    }
  };

  // deliver handles the communication with the Spectoda network in a way
  // that the command is guaranteed to arrive
  deliver(payload: Uint8Array, timeout: number) {
    logging.debug("deliver()", payload, timeout);

    if (!this.#connected()) {
      return Promise.reject("DeviceDisconnected");
    }

    return this.#connection.deliver(payload, timeout);
  }

  // transmit handles the communication with the Spectoda network in a way
  // that the command is NOT guaranteed to arrive
  transmit(payload: Uint8Array, timeout: number) {
    logging.debug("transmit()", payload, timeout);


    if (!this.#connected()) {
      return Promise.reject("DeviceDisconnected");
    }

    return this.#connection.transmit(payload, timeout);
  }

  // request handles the requests on the Spectoda network. The command request
  // is guaranteed to get a response
  request(payload: Uint8Array, read_response: boolean, timeout: number) {
    logging.debug("transmit()", payload, read_response, timeout);


    if (!this.#connected()) {
      return Promise.reject("DeviceDisconnected");
    }

    return this.#connection.request(payload, read_response, timeout);
  }

  // synchronizes the device internal clock with the provided TimeTrack clock
  // of the application as precisely as possible
  setClock(clock: TimeTrack): Promise<void> {
    logging.debug("setClock()", clock);

    if (!this.#connected()) {
      return Promise.reject("DeviceDisconnected");
    }

    return new Promise(async (resolve, reject) => {
      for (let index = 0; index < 3; index++) {
        try {
          await this.#connection.writeClock(clock.millis());
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
    logging.debug("getClock()");

    if (!this.#connected()) {
      return Promise.reject("DeviceDisconnected");
    }

    return new Promise(async (resolve, reject) => {
      for (let index = 0; index < 3; index++) {
        await sleep(1000);
        try {
          const timestamp = await this.#connection.readClock();
          logging.debug("Clock read success:", timestamp);
          resolve(new TimeTrack(timestamp));
          return;
        } catch (e) {
          logging.warn("Clock read failed:", e);
        }
      }

      reject("ClockReadFailed");
      return;
    });
  }

  // handles the firmware updating. Sends "ota" events
  // to all handlers
  updateFW(firmware: number[]) {
    logging.debug("updateFW()", firmware);


    if (!this.#connected()) {
      return Promise.reject("DeviceDisconnected");
    }

    return this.#connection.updateFirmware(firmware).finally(() => {
      return this.disconnect();
    });
  }

  destroy() {
    logging.debug("destroy()");


    //this.#interfaceReference = null; // dont know if I need to destroy this reference.. But I guess I dont need to?
    return this.disconnect()
      .catch(() => { })
      .then(() => {
        return this.unselect();
      })
      .catch(() => { })
      .finally(() => {
        this.#bluetoothDestroy();
      });
  }
}
