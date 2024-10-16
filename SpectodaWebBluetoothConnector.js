// npm install --save-dev @types/web-bluetooth
/// <reference types="web-bluetooth" />

import { COMMAND_FLAGS, NULL_VALUE } from "./SpectodaRuntime";
import { TimeTrack } from "./TimeTrack";
import { TnglReader } from "./TnglReader";
import { detectAndroid, hexStringToUint8Array, numberToBytes, sleep, toBytes } from "./functions";
import { logging } from "./logging";

// od 0.8.0 maji vsechny spectoda enabled BLE zarizeni jednotne SPECTODA_DEVICE_UUID.
// kazdy typ (produkt) Spectoda Zarizeni ma svuj kod v manufacturer data
// verze FW lze získat také z manufacturer data

// xxConnection.js udržuje komunikaci vždy pouze s
// jedním zařízením v jednu chvíli

//////////////////////////////////////////////////////////////////////////

/*
    is renamed Transmitter. Helper class for WebBluetoothConnector.js
*/
export class WebBLEConnection {
  #interfaceReference;
  // private fields
  #service;
  #networkChar;
  #clockChar;
  #deviceChar;
  #writing;
  #uuidCounter;

  constructor(interfaceReference) {
    this.#interfaceReference = interfaceReference;

    /*
      BLE Spectoda Service
    */
    this.#service = /** @type {BluetoothRemoteGATTService} */ (null);

    /*
      Network Characteristics governs the communication with the Spectoda Netwok.
      That means tngl uploads, timeline manipulation, event emitting...
      You can access it only if you are authenticated via the Device Characteristics
    */
    this.#networkChar = /** @type {BluetoothRemoteGATTCharacteristic} */ (null); // ? only accesable when connected to the mesh network

    /*
      The whole purpuse of clock characteristics is to synchronize clock time
      of the application with the Spectoda network
    */
    this.#clockChar = /** @type {BluetoothRemoteGATTCharacteristic} */ (null); // ? always accesable

    /*
      Device Characteristics is renamed Update Characteristics
      Device Characteristics handles ALL CONCEPTS WITH THE
      PHYSICAL CONNECTED DEVICE. On the other hand Network Characteristics
      handles concepts connected with the whole spectoda network - all devices
      With Device Charactristics you can upload FW to the single device,
      access and manipulate json config of the device, adopt device,
      and authenticate the application client with the spectoda network
    */
    this.#deviceChar = /** @type {BluetoothRemoteGATTCharacteristic} */ (null);

    /*
      simple mutex indicating that communication over BLE is in progress
    */
    this.#writing = false;

    this.#uuidCounter = Math.floor(Math.random() * 4294967295);
  }

  #getUUID() {
    // valid UUIDs are in range [1..4294967295] (32 bit number)
    if (this.#uuidCounter >= 4294967295) {
      this.#uuidCounter = 0;
    }

    return ++this.#uuidCounter;
  }

  #writeBytes(characteristic, bytes, response) {
    const write_uuid = this.#getUUID(); // two messages near to each other must not have the same UUID!
    const packet_header_size = 12; // 3x 4byte integers: write_uuid, index_from, payload.length
    const packet_size = detectAndroid() ? 212 : 512; // min size packet_header_size + 1 !!!! ANDROID NEEDS PACKET SIZE <= 212!!!!
    const bytes_size = packet_size - packet_header_size;

    if (response) {
      return new Promise(async (resolve, reject) => {
        let index_from = 0;
        let index_to = bytes_size;

        while (index_from < bytes.length) {
          if (index_to > bytes.length) {
            index_to = bytes.length;
          }

          const payload = [...numberToBytes(write_uuid, 4), ...numberToBytes(index_from, 4), ...numberToBytes(bytes.length, 4), ...bytes.slice(index_from, index_to)];

          try {
            await characteristic.writeValueWithResponse(new Uint8Array(payload));
          } catch (e) {
            logging.warn("characteristic.writeValueWithResponse() exception:", e);
            reject(e);
            return;
          }

          index_from += bytes_size;
          index_to = index_from + bytes_size;
        }
        resolve();
        return;
      });
    } else {
      if (bytes.length > bytes_size) {
        logging.error("The maximum bytes that can be written without response is " + bytes_size);
        return Promise.reject("WriteError");
      }
      const payload = [...numberToBytes(write_uuid, 4), ...numberToBytes(0, 4), ...numberToBytes(bytes.length, 4), ...bytes.slice(0, bytes.length)];
      return characteristic.writeValueWithoutResponse(new Uint8Array(payload));
    }
  }

  #readBytes(characteristic) {
    // read the requested value

    // TODO write this function effectivelly
    return new Promise(async (resolve, reject) => {
      try {
        let bytes = new Uint8Array((await characteristic.readValue()).buffer);

        // console.log(bytes);

        let total_bytes = [...bytes];

        while (bytes.length == 512) {
          bytes = new Uint8Array((await characteristic.readValue()).buffer);
          total_bytes = [...total_bytes, ...bytes];
        }

        // console.log(total_bytes);

        resolve(new DataView(new Uint8Array(total_bytes).buffer));
      } catch (e) {
        logging.error(e);
        reject("ReadError");
      }
    });
  }

  // WIP, event handling from spectoda network to application
  // timeline changes from spectoda network to application ...
  #onNetworkNotification(event) {
    logging.verbose("#onNetworkNotification", event);

    // let value = event.target.value;
    // let a = [];
    // for (let i = 0; i < value.byteLength; i++) {
    //   a.push("0x" + ("00" + value.getUint8(i).toString(16)).slice(-2));
    // }
    // logging.debug("> " + a.join(" "));

    this.#interfaceReference.process(event.target.value);
  }

  // WIP
  #onDeviceNotification(event) {
    logging.verbose("#onDeviceNotification", event);

    // let value = event.target.value;
    // let a = [];
    // for (let i = 0; i < value.byteLength; i++) {
    //   a.push("0x" + ("00" + value.getUint8(i).toString(16)).slice(-2));
    // }
    // logging.debug("> " + a.join(" "));
    // this.#interfaceReference.process(event.target.value);

    // TODO process request
  }

  // WIP
  #onClockNotification(event) {
    logging.verbose("#onClockNotification", event);

    // let value = event.target.value;
    // let a = [];
    // for (let i = 0; i < value.byteLength; i++) {
    //   a.push("0x" + ("00" + value.getUint8(i).toString(16)).slice(-2));
    // }
    // logging.debug("> " + a.join(" "));
    // this.#interfaceReference.process(event.target.value);

    // TODO process synchronize
  }

  attach(service, networkUUID, clockUUID, deviceUUID) {
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
            this.#networkChar.oncharacteristicvaluechanged = event => {
              this.#onNetworkNotification(event);
            };
          })
          .catch(e => {
            logging.warn("this.#networkChar.startNotifications() exception:", e);
          });
      })
      .catch(e => {
        logging.warn(e);
        throw "ConnectionFailed";
      })
      .then(() => {
        logging.debug("> Getting Clock Characteristics...");
        return this.#service.getCharacteristic(clockUUID);
      })
      .then(characteristic => {
        this.#clockChar = characteristic;

        return this.#clockChar
          .startNotifications()
          .then(() => {
            logging.debug("> Clock notifications started");
            this.#clockChar.oncharacteristicvaluechanged = event => {
              this.#onClockNotification(event);
            };
          })
          .catch(e => {
            logging.warn("this.#clockChar.startNotifications() exception:", e);
          });
      })
      .catch(e => {
        logging.warn(e);
        throw "ConnectionFailed";
      })
      .then(() => {
        logging.debug("> Getting Device Characteristics...");
        return this.#service.getCharacteristic(deviceUUID);
      })
      .then(characteristic => {
        this.#deviceChar = characteristic;

        return this.#deviceChar
          .startNotifications()
          .then(() => {
            logging.debug("> Device notifications started");
            this.#deviceChar.oncharacteristicvaluechanged = event => {
              this.#onDeviceNotification(event);
            };
          })
          .catch(e => {
            logging.warn("this.#deviceChar.startNotifications() exception:", e);
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
  deliver(payload) {
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

  // transmit() tries to transmit data NOW. ASAP. It will fail,
  // if deliver or another transmit is being executed at the moment
  // returns promise that will be resolved when message is physically send (only transmittion, not receive)
  transmit(payload) {
    if (!this.#networkChar) {
      logging.warn("Network characteristics is null");
      Promise.reject("TransmitFailed");
    }

    if (this.#writing) {
      logging.warn("Communication in proccess");
      throw "TransmitFailed";
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
  request(payload, read_response) {
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
        if (read_response) {
          return this.#readBytes(this.#deviceChar);
        } else {
          return Promise.resolve([]);
        }
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
  writeClock(timestamp) {
    if (!this.#clockChar) {
      logging.warn("Sync characteristics is null");
      return Promise.reject("ClockWriteFailed");
    }

    if (this.#writing) {
      logging.warn("Communication in proccess");
      return Promise.reject("ClockWriteFailed");
    }

    this.#writing = true;

    const bytes = toBytes(timestamp, 8);
    return this.#clockChar
      .writeValueWithoutResponse(new Uint8Array(bytes))
      .then(() => {
        logging.debug("Clock characteristics written");
      })
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
  readClock() {
    // return Promise.reject("SimulatedFail");

    if (!this.#clockChar) {
      logging.warn("Sync characteristics is null");
      return Promise.reject("ClockReadFailed");
    }

    if (this.#writing) {
      logging.warn("Communication in proccess");
      return Promise.reject("ClockReadFailed");
    }

    this.#writing = true;

    return this.#clockChar
      .readValue()
      .then(dataView => {
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

  updateFirmware(firmware) {
    if (!this.#deviceChar) {
      logging.warn("Device characteristics is null");
      return Promise.reject("UpdateFailed");
    }

    if (this.#writing) {
      logging.warn("Communication in proccess");
      return Promise.reject("UpdateFailed");
    }

    this.#writing = true;

    return new Promise(async (resolve, reject) => {
      const chunk_size = detectAndroid() ? 1008 : 4992; // must be modulo 16

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

          const bytes = [COMMAND_FLAGS.FLAG_OTA_RESET, 0x00, ...numberToBytes(0x00000000, 4)];
          await this.#writeBytes(this.#deviceChar, bytes, true);
        }

        await sleep(100);

        {
          //===========// BEGIN //===========//
          logging.debug("OTA BEGIN");

          const bytes = [COMMAND_FLAGS.FLAG_OTA_BEGIN, 0x00, ...numberToBytes(firmware.length, 4)];
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

            const bytes = [COMMAND_FLAGS.FLAG_OTA_WRITE, 0x00, ...numberToBytes(written, 4), ...firmware.slice(index_from, index_to)];

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

          const bytes = [COMMAND_FLAGS.FLAG_OTA_END, 0x00, ...numberToBytes(written, 4)];
          await this.#writeBytes(this.#deviceChar, bytes, true);
        }

        await sleep(2000);

        logging.info("Firmware written in " + (new Date().getTime() - start_timestamp) / 1000 + " seconds");

        this.#interfaceReference.emit("ota_status", "success");
        resolve();
      } catch (e) {
        logging.error(e);
        this.#interfaceReference.emit("ota_status", "fail");
        reject("UpdateFailed");
      }
    }).finally(() => {
      this.#writing = false;
    });
  }

  // resets the Communations, discarding command queue
  reset() {
    if (this.#networkChar) {
      this.#networkChar.oncharacteristicvaluechanged = null;
      this.#networkChar = null;
    }

    if (this.#clockChar) {
      this.#clockChar.oncharacteristicvaluechanged = null;
      this.#clockChar = null;
    }

    if (this.#deviceChar) {
      this.#deviceChar.oncharacteristicvaluechanged = null;
      this.#deviceChar = null;
    }

    if (this.#service) {
      this.#service = null;
    }

    this.#writing = false;
  }

  destroy() {
    this.reset();
    this.#interfaceReference = null;
  }
}

/////////////////////////////////////////////////////////////////////////////////////

// Connector connects the application with one Spectoda Device, that is then in a
// position of a controller for other Spectoda Devices
export class SpectodaWebBluetoothConnector {
  #interfaceReference;

  #webBTDevice;
  #connection;
  #reconection;
  #criteria;
  #connectedGuard;

  constructor(interfaceReference) {
    this.type = "webbluetooth";

    this.#interfaceReference = interfaceReference;

    this.FW_PRE_0_7_SERVICE_UUID = "0000ffe0-0000-1000-8000-00805f9b34fb";
    this.FW_0_7_0_SERVICE_UUID = "60cb125a-0000-0007-0000-5ad20c574c10";
    this.FW_0_7_1_SERVICE_UUID = "60cb125a-0000-0007-0001-5ad20c574c10";
    this.FW_0_7_2_SERVICE_UUID = "60cb125a-0000-0007-0002-5ad20c574c10";
    this.FW_0_7_3_SERVICE_UUID = "60cb125a-0000-0007-0003-5ad20c574c10";
    this.FW_0_7_4_SERVICE_UUID = "60cb125a-0000-0007-0004-5ad20c574c10";
    this.SPECTODA_SERVICE_UUID = "cc540e31-80be-44af-b64a-5d2def886bf5";
    this.SPECTODA_ADOPTING_SERVICE_UUID = "723247e6-3e2d-4279-ad8e-85a13b74d4a5";

    this.TERMINAL_CHAR_UUID = "33a0937e-0c61-41ea-b770-007ade2c79fa";
    this.CLOCK_CHAR_UUID = "7a1e0e3a-6b9b-49ef-b9b7-65c81b714a19";
    this.DEVICE_CHAR_UUID = "9ebe2e4b-10c7-4a81-ac83-49540d1135a5";

    this.#webBTDevice = null;
    this.#connection = new WebBLEConnection(interfaceReference);
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
  userSelect(criteria, timeout) {
    logging.verbose(`userSelect(criteria=${JSON.stringify(criteria)}, timeout=${timeout})`);

    if (this.#connected()) {
      return this.disconnect()
        .then(() => {
          return sleep(100);
        })
        .then(() => {
          return this.userSelect(criteria, timeout);
        });
    }

    if (this.#selected()) {
      return this.unselect().then(() => {
        return this.userSelect(criteria, timeout);
      });
    }

    // logging.debug(criteria);

    // store new criteria as a array
    if (criteria) {
      if (Array.isArray(criteria)) {
        this.#criteria = criteria;
      } else {
        this.#criteria = [criteria];
      }
    } else {
      this.#criteria = [];
    }

    /** @type {RequestDeviceOptions} */
    let web_ble_options = { filters: /** @type {BluetoothLEScanFilter[]} */ ([]), optionalServices: [this.SPECTODA_SERVICE_UUID] };

    //
    if (this.#criteria.length == 0) {
      web_ble_options.filters.push({ services: [this.SPECTODA_SERVICE_UUID] });
      // web_ble_options.filters.push({ services: [this.SPECTODA_ADOPTING_SERVICE_UUID] });
    }

    //
    else {
      let legacy_filters_applied = false;

      for (let i = 0; i < this.#criteria.length; i++) {
        const criterium = this.#criteria[i];

        // if legacy criterium is set, then fill the services of legacy FW versions
        if (criterium.legacy) {
          if (!legacy_filters_applied) {
            legacy_filters_applied = true;

            web_ble_options.filters.push({ namePrefix: "Nara Al" });
            web_ble_options.filters.push({ services: [this.FW_PRE_0_7_SERVICE_UUID] });
            web_ble_options.filters.push({ services: [this.FW_0_7_0_SERVICE_UUID] });
            web_ble_options.filters.push({ services: [this.FW_0_7_1_SERVICE_UUID] });
            web_ble_options.filters.push({ services: [this.FW_0_7_2_SERVICE_UUID] });
            web_ble_options.filters.push({ services: [this.FW_0_7_3_SERVICE_UUID] });
            web_ble_options.filters.push({ services: [this.FW_0_7_4_SERVICE_UUID] });
          }

          continue;
        }

        let filter = { services: [this.SPECTODA_SERVICE_UUID] };

        if (criterium.name) {
          filter.name = criterium.name;
        } else if (criterium.namePrefix) {
          filter.namePrefix = criterium.namePrefix;
        }

        // if any of these criteria are required, then we need to build a manufacturer data filter.
        if (criterium.fwVersion || criterium.ownerSignature || criterium.productCode || criterium.adoptionFlag) {
          const company_identifier = 0x02e5; // Bluetooth SIG company identifier of Espressif

          delete filter.services;

          let prefix = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
          let mask = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

          if (criterium.productCode) {
            if (criterium.productCode < 0 || criterium.productCode > 0xffff) {
              throw "InvalidProductCode";
            }

            const product_code_byte_offset = 2;
            const product_code_bytes = [criterium.productCode & 0xff, (criterium.productCode >> 8) & 0xff];

            for (let i = 0; i < 2; i++) {
              prefix[product_code_byte_offset + i] = product_code_bytes[i];
              mask[product_code_byte_offset + i] = 0xff;
            }
          }

          if (criterium.ownerSignature) {
            if (criterium.ownerSignature.length != 32) {
              throw "InvalidOwnerSignature";
            }

            const owner_signature_byte_offset = 4;
            const owner_signature_code_bytes = hexStringToUint8Array(criterium.ownerSignature);

            for (let i = 0; i < 16; i++) {
              prefix[owner_signature_byte_offset + i] = owner_signature_code_bytes[i];
              mask[owner_signature_byte_offset + i] = 0xff;
            }
          }

          if (criterium.adoptionFlag) {
            const other_flags_offset = 20;

            let flags_prefix = 0b00000000;
            const flags_mask = 0b11111111;

            if (criterium.adoptionFlag === true) {
              const adoption_flag_bit_pos = 0;

              flags_prefix |= 1 << adoption_flag_bit_pos;
            }

            prefix[other_flags_offset] = flags_prefix;
            mask[other_flags_offset] = flags_mask;
          }

          if (criterium.fwVersion) {
            const fw_version_byte_offset = 0;
            const reg = criterium.fwVersion.match(/(!?)([\d]+).([\d]+).([\d]+)/);
            const version_code = reg[2] * 10000 + reg[3] * 100 + reg[4] * 1;
            const version_bytes = [version_code & 0xff, (version_code >> 8) & 0xff];

            if (reg[1] === "!") {
              // workaround for web bluetooth not having a filter for "if the manufacturer data are not this, then show me the device"
              // we will generate 16 filters, each filtering one of the 16 bits that is different from my version.
              // if the one bit is different, then the version of the found device is different than mine.
              // and thats what we need.

              filter.manufacturerData = [];

              for (let i = 0; i < 2; i++) {
                // version is defined as 2 bytes
                for (let j = 0; j < 8; j++) {
                  // each byte 8 bits

                  for (let k = 0; k < 2; k++) {
                    prefix[fw_version_byte_offset + k] = 0;
                    mask[fw_version_byte_offset + k] = 0;
                  }

                  prefix[fw_version_byte_offset + i] = ~(version_bytes[i] & (1 << j));
                  mask[fw_version_byte_offset + i] = 1 << j;

                  let filter_clone = JSON.parse(JSON.stringify(filter));
                  filter_clone.manufacturerData = [{ companyIdentifier: company_identifier, dataPrefix: new Uint8Array(prefix), mask: new Uint8Array(mask) }];
                  web_ble_options.filters.push(filter_clone);
                }
              }
            } else {
              for (let i = 0; i < 2; i++) {
                prefix[fw_version_byte_offset + i] = version_bytes[i];
                mask[fw_version_byte_offset + i] = 0xff;
              }
              filter.manufacturerData = [{ companyIdentifier: company_identifier, dataPrefix: new Uint8Array(prefix), mask: new Uint8Array(mask) }];
              web_ble_options.filters.push(filter);
            }
          } else {
            filter.manufacturerData = [{ companyIdentifier: company_identifier, dataPrefix: new Uint8Array(prefix), mask: new Uint8Array(mask) }];
            web_ble_options.filters.push(filter);
          }
        } else {
          web_ble_options.filters.push(filter);
        }
      }
    }

    if (web_ble_options.filters.length == 0) {
      web_ble_options = { acceptAllDevices: true, optionalServices: [this.SPECTODA_SERVICE_UUID] };
    }

    logging.verbose(`navigator.bluetooth.requestDevice(${JSON.stringify(web_ble_options)})`);

    return navigator.bluetooth
      .requestDevice(web_ble_options)
      .catch(e => {
        // TODO! Throw UserGestureRequired if e.message.includes("user gesture"). ad DEV-3298

        logging.error(e);
        throw "UserCanceledSelection";
      })
      .then(device => {
        this.#webBTDevice = device;

        this.#webBTDevice.ongattserverdisconnected = () => {
          sleep(1000).then(() => {
            this.#onDisconnected();
          });
        };

        return { connector: this.type };
      });
  }

  // takes the criteria, scans for scan_duration and automatically selects the device,
  // you can then connect to. This works only for BLE devices that are bond with the phone/PC/tablet
  // the app is running on OR doesnt need to be bonded in a special way.
  // if more devices are found matching the criteria, then the strongest signal wins
  // if no device is found within the timeout period, then it returns an error

  // if no criteria are provided, all Spectoda enabled devices (with all different FWs and Owners and such)
  // are eligible.

  autoSelect(criteria, scan_duration, timeout) {
    logging.verbose(`autoSelect(criteria=${JSON.stringify(criteria)}, scan_duration=${scan_duration}, timeout=${timeout})`);
    // step 1. for the scan_duration scan the surroundings for BLE devices.
    // step 2. if some devices matching the criteria are found, then select the one with
    //         the greatest signal strength. If no device is found until the timeout,
    //         then return error

    // Web Bluetooth nepodporuje možnost automatické volby zařízení.
    // Proto je to tady implementováno totožně jako userSelect.

    return this.userSelect(criteria, timeout);
  }

  // if device is conneced, then disconnect it
  unselect() {
    logging.verbose("unselect()");

    return (this.#connected() ? this.disconnect() : Promise.resolve()).then(() => {
      this.#webBTDevice = null;
      this.#connection.reset();
      return Promise.resolve();
    });
  }

  // #selected returns boolean if a device is selected
  #selected() {
    return this.#webBTDevice ? true : false;
  }

  selected() {
    logging.verbose("selected()");

    return Promise.resolve(this.#selected() ? { connector: this.type } : null);
  }

  scan(criteria, scan_duration) {
    logging.verbose(`scan(criteria=${JSON.stringify(criteria)}, scan_duration=${scan_duration})`);

    // returns devices like autoSelect scan() function
    return Promise.resolve("{}");
  }

  // connect Connector to the selected Spectoda Device. Also can be used to reconnect.
  // Fails if no device is selected
  connect(timeout = NULL_VALUE) {
    if (timeout === NULL_VALUE) {
      timeout = 10000;
    }
    logging.verbose(`connect(timeout=${timeout})`);

    if (timeout <= 0) {
      logging.debug("> Connect timeout has expired");
      return Promise.reject("ConnectionTimeout");
    }

    const start = new Date().getTime();
    this.#reconection = true;

    if (!this.#selected()) {
      return Promise.reject("DeviceNotSelected");
    }

    let timeoutHandle = null;

    const MINIMUM_CONNECT_TIMEOUT = 5000;
    let timeoutPromise = new Promise((resolve, reject) => {
      timeoutHandle = setTimeout(
        () => {
          logging.warn("Timeout triggered");
          this.#webBTDevice.gatt.disconnect();
          const LET_BLUETOOTH_RESET_SAFELY_TIMEOUT = 1000;
          setTimeout(() => {
            reject("ConnectionTimeout");
          }, LET_BLUETOOTH_RESET_SAFELY_TIMEOUT);
        },
        Math.max(timeout, MINIMUM_CONNECT_TIMEOUT),
      );
    });

    logging.debug("> Connecting to Bluetooth device...");
    return Promise.race([this.#webBTDevice.gatt.connect(), timeoutPromise])
      .then(server => {
        this.#connection.reset();
        logging.debug("> Getting the Bluetooth Service...");
        return server.getPrimaryService(this.SPECTODA_SERVICE_UUID);
      })
      .then(service => {
        logging.debug("> Getting the Service Characteristic...");

        clearTimeout(timeoutHandle);

        return this.#connection.attach(service, this.TERMINAL_CHAR_UUID, this.CLOCK_CHAR_UUID, this.DEVICE_CHAR_UUID);
      })
      .then(() => {
        logging.debug("> Bluetooth Device Connected");
        if (!this.#connectedGuard) {
          this.#interfaceReference.emit("#connected");
        }
        return { connector: "webbluetooth" };
      })
      .catch(error => {
        if (error.name) {
          logging.warn(error.name);
        }

        clearTimeout(timeoutHandle);

        // If the device is far away, sometimes this "NetworkError" happends
        if (error.name == "NetworkError") {
          return sleep(1000).then(() => {
            if (this.#reconection) {
              const passed = new Date().getTime() - start;
              return this.connect(timeout - passed);
            } else {
              return Promise.reject("ConnectionFailed");
            }
          });
        } else {
          throw error;
        }
      });
  }

  // there #connected returns boolean true if connected, false if not connected
  #connected() {
    return this.#webBTDevice && this.#webBTDevice.gatt.connected;
  }

  // connected() is an interface function that needs to return a Promise
  connected() {
    logging.verbose("connected()");

    return Promise.resolve(this.#connected() ? { connector: this.type } : null);
  }

  // disconnect Connector from the connected Spectoda Device. But keep it selected
  disconnect() {
    logging.verbose("disconnect()");

    this.#reconection = false;

    logging.debug("> Disconnecting from Bluetooth Device...");

    this.#connection.reset();

    try {
      if (this.#webBTDevice && this.#webBTDevice.gatt) {
        this.#webBTDevice.gatt.disconnect();
      }
    } catch (e) {
      logging.warn(e);
    }

    return Promise.resolve();
  }

  // when the device is disconnected, the javascript Connector.js layer decides
  // if it should be revonnected. Here is implemented that it should be
  // reconnected only if the this.#reconection is true. The event handlers are fired
  // synchronously. So that only after all event handlers (one after the other) are done,
  // only then start this.connect() to reconnect to the bluetooth device
  #onDisconnected = event => {
    logging.debug("> Bluetooth Device disconnected");
    this.#connection.reset();

    if (this.#connectedGuard) {
      logging.verbose("emitting #disconnected");
      this.#interfaceReference.emit("#disconnected");
    }
  };

  // deliver handles the communication with the Spectoda network in a way
  // that the command is guaranteed to arrive
  deliver(payload, timeout) {
    logging.verbose(`deliver(payload=${payload})`);

    if (!this.#connected()) {
      return Promise.reject("DeviceDisconnected");
    }

    return this.#connection.deliver(payload);
  }

  // transmit handles the communication with the Spectoda network in a way
  // that the command is NOT guaranteed to arrive
  transmit(payload, timeout) {
    logging.verbose(`transmit(payload=${payload})`);

    if (!this.#connected()) {
      return Promise.reject("DeviceDisconnected");
    }

    return this.#connection.transmit(payload);
  }

  // request handles the requests on the Spectoda network. The command request
  // is guaranteed to get a response
  request(payload, read_response, timeout) {
    logging.verbose(`request(payload=${payload}, read_response=${read_response})`);

    if (!this.#connected()) {
      return Promise.reject("DeviceDisconnected");
    }

    return this.#connection.request(payload, read_response);
  }

  // synchronizes the device internal clock with the provided TimeTrack clock
  // of the application as precisely as possible
  setClock(clock) {
    logging.verbose(`setClock(clock.millis=${clock.millis()})`);

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
          await sleep(100);
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

    if (!this.#connected()) {
      return Promise.reject("DeviceDisconnected");
    }

    return new Promise(async (resolve, reject) => {
      for (let index = 0; index < 3; index++) {
        // await sleep(1000); // ! I commented this out, because I think it is not needed, but I am not sure
        try {
          const timestamp = await this.#connection.readClock();
          logging.debug("Clock read success:", timestamp);
          resolve(new TimeTrack(timestamp));
          return;
        } catch (e) {
          logging.warn("Clock read failed:", e);
          await sleep(100);
        }
      }

      reject("ClockReadFailed");
      return;
    });
  }

  // handles the firmware updating. Sends "ota" events
  // to all handlers
  updateFW(firmware) {
    logging.verbose(`updateFW(firmware=${firmware})`);

    if (!this.#connected()) {
      return Promise.reject("DeviceDisconnected");
    }

    return this.#connection.updateFirmware(firmware).finally(() => {
      return this.disconnect();
    });
  }

  destroy() {
    logging.verbose(`destroy()`);

    //this.#interfaceReference = null; // dont know if I need to destroy this reference.. But I guess I dont need to?
    return this.disconnect()
      .catch(() => {})
      .then(() => {
        return this.unselect();
      })
      .catch(() => {});
  }
}
