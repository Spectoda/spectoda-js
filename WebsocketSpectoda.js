import { COMMAND_FLAGS, SpectodaInterfaceLegacy } from "./SpectodaInterfaceLegacy.js";
import { WEBSOCKET_URL } from "./SpectodaWebSocketsConnector.js";
import { hexStringToUint8Array, labelToBytes, numberToBytes, strMacToBytes, stringToBytes } from "./functions";
import { changeLanguage, t } from "./i18n.js";
import { logging, setLoggingLevel } from "./logging";
// import { Interface } from "./src/SpectodaInterface.js";
import { io } from "socket.io-client";
import { TimeTrack } from "./TimeTrack.js";
import "./TnglReader.js";
import { TnglReader } from "./TnglReader.js";
import "./TnglWriter.js";

let lastEvents = {};

// should not create more than one object!
// the destruction of the Spectoda is not well implemented

// TODO - kdyz zavolam spectoda.connect(), kdyz jsem pripojeny, tak nechci aby se do interfacu poslal select
// TODO - kdyz zavolam funkci connect a uz jsem pripojeny, tak vyslu event connected, pokud si myslim ze nejsem pripojeny.
// TODO - "watchdog timer" pro resolve/reject z TC

export class WebsocketSpectoda {
  #uuidCounter;
  #ownerSignature;
  #ownerKey;
  #connecting;
  // #adoptingFlag;
  #adopting;
  #updating;
  #selected;
  #saveStateTimeoutHandle;

  #reconnectRC;

  #reconnectionInterval;
  #connectionState;

  constructor(connectorType = "default", reconnectionInterval = 1000) {
    // nextjs
    if (typeof window === "undefined") {
      return;
    }

    this.socket = io(WEBSOCKET_URL);

    this.timeline = new TimeTrack(0, true);

    this.#uuidCounter = Math.floor(Math.random() * 0xffffffff);

    this.#ownerSignature = null;
    this.#ownerKey = null;

    this.interface = new SpectodaInterfaceLegacy(this);

    if (connectorType) {
      this.interface.assignConnector(connectorType);
    }

    this.#connecting = false;
    // this.#adoptingFlag = false;
    this.#adopting = false;
    this.#updating = false;
    // this.#saveStateTimeoutHandle = null;

    this.#reconnectRC = false;

    this.#reconnectionInterval = reconnectionInterval;
    this.#connectionState = "disconnected";

    this.interface.onConnected = event => {
      logging.info("> Interface connected");
    };

    this.interface.onDisconnected = event => {
      logging.info("> Interface disconnected");

      const TIME = 2000;

      if (this.#connectionState === "connected" && this.#reconnectionInterval) {
        logging.info(`Reconnecting in ${TIME}ms`);
        this.#setConnectionState("connecting");

        setTimeout(() => {
          logging.debug("Reconnecting device");
          return this.interface
            .connect(this.#reconnectionInterval)
            .then(() => {
              logging.info("Reconnection successful.");
              this.#setConnectionState("connected");
            })
            .catch(() => {
              logging.warn("Reconnection failed.");
              this.#setConnectionState("disconnected");
            });
        }, TIME);
      } else {
        this.#setConnectionState("disconnected");
      }
    };

    // auto clock sync loop
    setInterval(() => {
      if (!this.#updating && this.interface.connector) {
        this.connected().then(connected => {
          if (connected) {
            this.syncClock()
              .then(() => {
                return this.syncTimeline();
              })
              .catch(error => {
                logging.warn("Catched error:", error);
              });
          }
        });
      }
    }, 30000);
  }

  #setConnectionState(connectionState) {
    switch (connectionState) {
      case "connecting":
        if (connectionState !== this.#connectionState) {
          // if (connectionState == "disconnecting") {
          //   throw "DisconnectingInProgress";
          // }

          console.warn("> Spectoda connecting");
          this.#connectionState = connectionState;
          this.interface.emit("connecting", { target: this });
        }
        break;
      case "connected":
        if (connectionState !== this.#connectionState) {
          // if (connectionState != "connecting") {
          //   throw "ConnectionFailed";
          // }

          console.warn("> Spectoda connected");
          this.#connectionState = connectionState;
          this.interface.emit("connected", { target: this });
        }
        break;
      case "disconnecting":
        if (connectionState !== this.#connectionState) {
          // if (connectionState == "connecting") {
          //   throw "ConnectingInProgress";
          // }

          console.warn("> Spectoda disconnecting");
          this.#connectionState = connectionState;
          this.interface.emit("disconnecting", { target: this });
        }
        break;
      case "disconnected":
        if (connectionState !== this.#connectionState) {
          // if (connectionState != "disconnecting") {
          //   throw "DisconnectFailed";
          // }

          console.warn("> Spectoda disconnected");
          this.#connectionState = connectionState;
          this.interface.emit("disconnected", { target: this });
        }
        break;
      default:
        throw "InvalidState";
    }
  }

  #getConnectionState() {
    return this.#connectionState;
  }

  requestWakeLock() {
    return this.interface.requestWakeLock();
  }

  releaseWakeLock() {
    return this.interface.releaseWakeLock();
  }

  setConnector(connector_type) {
    return this.interface.assignConnector(connector_type);
  }

  /**
   * @alias this.setConnector
   */
  assignConnector(connector_type) {
    return this.setConnector(connector_type);
  }

  // todo remove, deprecated
  assignOwnerSignature() {}

  // todo remove, deprecated
  assignOwnerKey() {}

  connect(devices = null, autoConnect = true, ownerSignature = null, ownerKey = null, connectAny = false, fwVersion = "") {
    this.#reconnectRC = true;

    logging.debug("> Connecting to Remote Control");

    // TODO - scopovani dle apky
    // TODO - authentifikace
    this.socket = io(WEBSOCKET_URL);

    this.socket.on("connect", async () => {
      logging.debug("> Connected to remote control");
      // window.alert(t("Connected to remote control"));

      console.log("ownerSignature", ownerSignature, ownerKey);
      const result = await this.socket.emitWithAck("join", { signature: ownerSignature || this.#ownerSignature, key: ownerKey || this.#ownerKey });

      // todo mark myself as a Client

      console.log("TADAAA", result);
    });

    this.socket.on("disconnect", () => {
      logging.debug("> Disconnected from remote control");
      window.alert(t("Disconnected from remote control"));
    });

    this.socket.on("connect_error", error => {
      logging.debug("connect_error", error);
      setTimeout(() => {
        this.socket.connect();
      }, 1000);
    });

    // this.socket.on("setClock", payload => {
    //   logging.warn("setClock", payload);
    // });

    // // ============= CLOCK HACK ==============

    // const hackClock = () => {
    //   logging.warn("overriding clock with UTC clock");
    //   this.interface.clock.setMillis(getClockTimestamp());
    //   this.syncClock();
    // };

    // hackClock();

    // this.interface.on("connected", () => {
    //   hackClock();
    // });
  }

  // valid UUIDs are in range [1..4294967295] (32-bit unsigned number)
  #getUUID() {
    if (this.#uuidCounter >= 4294967295) {
      this.#uuidCounter = 0;
    }

    return ++this.#uuidCounter;
  }

  /**
   * @name addEventListener
   * @param {string} event
   * @param {Function} callback
   *
   * events: "disconnected", "connected"
   *
   * all events: event.target === the sender object (SpectodaWebBluetoothConnector)
   * event "disconnected": event.reason has a string with a disconnect reason
   *
   * @returns {Function} unbind function
   */

  addEventListener(event, callback) {
    return this.socket.on(`event`, ({ type, data }) => {
      if (type === event) callback(data);
    });
  }
  /**
   * @alias this.addEventListener
   */
  on(event, callback) {
    return this.socket.on(`event`, ({ type, data }) => {
      if (type === event) callback(data);
    }); //this.interface.on(event, callback);
  }

  // každé spectoda zařízení může být spárováno pouze s jedním účtem. (jednim user_key)
  // jakmile je sparovana, pak ji nelze prepsat novým učtem.
  // filtr pro pripojovani k zarizeni je pak účet.

  // adopt != pair
  // adopt reprezentuje proces, kdy si webovka osvoji nove zarizeni. Tohle zarizeni, ale uz
  // muze byt spárováno s telefonem / SpectodaConnectem

  // pri adoptovani MUSI byt vsechny zarizeni ze skupiny zapnuty.
  // vsechny zarizeni totiz MUSI vedet o vsech.
  // adopt() {
  // const BLE_OPTIONS = {
  //   //acceptAllDevices: true,
  //   filters: [
  //     { services: [this.TRANSMITTER_SERVICE_UUID] },
  //     // {services: ['c48e6067-5295-48d3-8d5c-0395f61792b1']},
  //     // {name: 'ExampleName'},
  //   ],
  //   //optionalServices: [this.TRANSMITTER_SERVICE_UUID],
  // };
  // //
  // return this.connector
  //   .adopt(BLE_OPTIONS).then((device)=> {
  //     // ulozit device do local storage jako json
  //   })
  //   .catch((error) => {
  //     logging.warn(error);
  //   });
  // }

  scan(scan_period = 5000) {
    logging.info(`scan(scan_period=${scan_period})`);

    return this.interface.scan([{}], scan_period);
  }

  adopt(newDeviceName = null, newDeviceId = null, tnglCode = null, ownerSignature = null, ownerKey = null, autoSelect = false) {
    logging.info(`adopt(newDeviceName=${newDeviceName}, newDeviceId=${newDeviceId}, tnglCode=${tnglCode}, ownerSignature=${ownerSignature}, ownerKey=${ownerKey}, autoSelect=${autoSelect})`);
  }

  connected() {
    if (this.#connecting || this.#adopting) {
      return Promise.resolve(null); // resolve nothing === not connected
    }

    return this.interface.connected();
  }

  //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

  // writes Tngl only if fingerprints does not match
  syncTngl(tngl_code, tngl_bytes = null, tngl_bank = 0) {
    logging.verbose("syncTngl()");

    return this.socket.emitWithAck("syncTngl", { tngl_code, tngl_bytes, tngl_bank });
  }

  writeTngl(tngl_code, tngl_bytes = null, memory_bank = 0) {
    logging.verbose("writeTngl()");

    return this.socket.emitWithAck("writeTngl", { tngl_code, tngl_bytes, memory_bank });
  }

  // event_label example: "evt1"
  // event_value example: 1000
  /**
   *
   * @param {*} event_label
   * @param {number|number[]} device_ids
   * @param {*} force_delivery

   * @returns
   */
  /**
   *
   * @param {*} event_label
   * @param {number|number[]} device_ids
   * @param {*} force_delivery

   * @returns
   */
  emitEvent(event_label, device_ids = [0xff], force_delivery = true) {
    logging.verbose(`emitEvent(label=${event_label},id=${device_ids},force=${force_delivery})`);
    lastEvents[event_label] = { value: null, type: "none" };

    // clearTimeout(this.#saveStateTimeoutHandle);
    // this.#saveStateTimeoutHandle = setTimeout(() => {
    //   this.saveState();
    // }, 5000);

    return this.socket.emitWithAck("emitEvent", { label: event_label, id: device_ids, force: force_delivery });
  }

  resendAll() {
    Object.keys(lastEvents).forEach(key => {
      switch (lastEvents[key].type) {
        case "percentage":
          this.emitPercentageEvent(key, lastEvents[key].value);
          break;
        case "timestamp":
          this.emitTimestampEvent(key, lastEvents[key].value);
          break;
        case "color":
          this.emitColorEvent(key, lastEvents[key].value);
          break;
        case "label":
          this.emitLabelEvent(key, lastEvents[key].value);
          break;
        case "none":
          this.emitEvent(key);
          break;
      }
    });
  }

  // event_label example: "evt1"
  // event_value example: 1000
  /**
   *
   * @param {*} event_label
   * @param {number|number[]} device_ids
   * @param {*} force_delivery

   * @returns
   */
  emitTimestampEvent(event_label, event_value, device_ids = [0xff], force_delivery = false) {
    logging.verbose(`emitTimestampEvent(label=${event_label},value=${event_value},id=${device_ids},force=${force_delivery})`);
    lastEvents[event_label] = { value: event_value, type: "timestamp" };

    return this.socket.emitWithAck("emitTimestampEvent", { label: event_label, value: event_value, id: device_ids, force: force_delivery });
  }

  // event_label example: "evt1"
  // event_value example: "#00aaff"
  /**
   *
   * @param {*} event_label
   * @param {*} event_value
   * @param {number|number[]} device_ids
   * @param {*} force_delivery
   * @returns
   */
  emitColorEvent(event_label, event_value, device_ids = [0xff], force_delivery = false) {
    logging.verbose(`emitColorEvent(label=${event_label},value=${event_value},id=${device_ids},force=${force_delivery})`);
    lastEvents[event_label] = { value: event_value, type: "color" };

    return this.socket.emitWithAck("emitColorEvent", { label: event_label, value: event_value, id: device_ids, force: force_delivery });
  }

  // event_label example: "evt1"
  // event_value example: 100.0
  /**
   *
   * @param {*} event_label
   * @param {*} event_value
   * @param {number|number[]} device_ids
   * @param {*} force_delivery
   * @returns
   */
  emitPercentageEvent(event_label, event_value, device_ids = [0xff], force_delivery = false) {
    logging.info(`emitPercentageEvent(label=${event_label},value=${event_value},id=${device_ids},force=${force_delivery})`);
    lastEvents[event_label] = { value: event_value, type: "percentage" };

    return this.socket.emitWithAck("emitPercentageEvent", { label: event_label, value: event_value, id: device_ids, force: force_delivery });

    // clearTimeout(this.#saveStateTimeoutHandle);
    // this.#saveStateTimeoutHandle = setTimeout(() => {
    //   this.saveState();
    // }, 5000);

    // if (event_value > 100.0) {
    //   logging.error("Invalid event value");
    //   event_value = 100.0;
    // }

    // if (event_value < -100.0) {
    //   logging.error("Invalid event value");
    //   event_value = -100.0;
    // }

    // const func = device_id => {
    //   const payload = [COMMAND_FLAGS.FLAG_EMIT_PERCENTAGE_EVENT, ...percentageToBytes(event_value), ...labelToBytes(event_label), ...numberToBytes(this.interface.clock.millis() + 10, 6), numberToBytes(device_id, 1)];
    //   return this.interface.execute(payload, force_delivery ? null : "E" + event_label + device_id);
    // };

    // if (typeof device_ids === "object") {
    //   let promises = device_ids.map(func);
    //   return Promise.all(promises);
    // } else {
    //   return func(device_ids);
    // }
  }

  // event_label example: "evt1"
  // event_value example: "label"
  // !!! PARAMETER CHANGE !!!
  /**
   *
   * @param {*} event_label
   * @param {*} event_value
   * @param {number|number[]} device_ids
   * @param {*} force_delivery
   * @returns
   */
  emitLabelEvent(event_label, event_value, device_ids = [0xff], force_delivery = false) {
    logging.verbose(`emitLabelEvent(label=${event_label},value=${event_value},id=${device_ids},force=${force_delivery})`);
    lastEvents[event_label] = { value: event_value, type: "label" };

    // clearTimeout(this.#saveStateTimeoutHandle);
    // this.#saveStateTimeoutHandle = setTimeout(() => {
    //   this.saveState();
    // }, 5000);

    if (typeof event_value !== "string") {
      logging.error("Invalid event value");
      event_value = "";
    }

    if (event_value.length > 5) {
      logging.error("Invalid event value");
      event_value = event_value.slice(0, 5);
    }

    const func = device_id => {
      const payload = [COMMAND_FLAGS.FLAG_EMIT_LABEL_EVENT, ...labelToBytes(event_value), ...labelToBytes(event_label), ...numberToBytes(this.interface.clock.millis() + 10, 6), numberToBytes(device_id, 1)];
      return this.interface.execute(payload, force_delivery ? null : "E" + event_label + device_id);
    };

    if (typeof device_ids === "object") {
      let promises = device_ids.map(func);
      return Promise.all(promises);
    } else {
      return func(device_ids);
    }
  }

  syncTimeline() {
    logging.verbose("syncTimeline()");
    const flags = this.timeline.paused() ? 0b00010000 : 0b00000000; // flags: [reserved,reserved,reserved,timeline_paused,reserved,reserved,reserved,reserved]
    const payload = [COMMAND_FLAGS.FLAG_SET_TIMELINE, ...numberToBytes(this.interface.clock.millis(), 6), ...numberToBytes(this.timeline.millis(), 4), flags];
    return this.interface.execute(payload, "TMLN");
  }

  syncClock() {
    logging.debug("> Syncing clock from device");
    return this.interface.syncClock().then(() => {
      logging.debug("> App clock synchronized");
    });
  }

  // TODO add
  syncState(deviceId) {
    logging.debug("> Synchronizing state...");

    const request_uuid = this.#getUUID();
    const device_request = [COMMAND_FLAGS.FLAG_SYNC_STATE_REQUEST, ...numberToBytes(request_uuid, 4), deviceId];
    return this.interface.request(device_request, false);
  }

  updateDeviceFirmware(firmware) {
    logging.verbose(`updateDeviceFirmware(firmware.length=${firmware?.length})`);

    return this.interface.updateDeviceFirmware(firmware);
  }

  updateNetworkFirmware(firmware) {
    logging.verbose(`updateNetworkFirmware(firmware.length=${firmware?.length})`);

    return this.interface.updateNetworkFirmware(firmware);
  }

  async updatePeerFirmware(peer) {
    logging.debug(`updatePeerFirmware(peer=${peer})`);

    if (peer === null || peer === undefined) {
      // Prompt the user to enter a MAC address
      peer = await prompt("Please enter a valid MAC address:", "00:00:00:00:00:00");
    }

    // Validate the input to ensure it is a valid MAC address
    if (!/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/.test(peer)) {
      // If the input is invalid, display an error message and return null
      throw "InvalidMacAdress";
    }

    const request_uuid = this.#getUUID();
    const bytes = [COMMAND_FLAGS.FLAG_FW_UPDATE_PEER_REQUEST, ...numberToBytes(request_uuid, 4), ...strMacToBytes(peer)];

    return this.interface.request(bytes, true).then(response => {
      let reader = new TnglReader(response);

      logging.verbose(`response.byteLength=${response.byteLength}`);

      if (reader.readFlag() !== COMMAND_FLAGS.FLAG_FW_UPDATE_PEER_RESPONSE) {
        throw "InvalidResponseFlag";
      }

      const response_uuid = reader.readUint32();

      if (response_uuid != request_uuid) {
        throw "InvalidResponseUuid";
      }

      const error_code = reader.readUint8();

      logging.verbose(`error_code=${error_code}`);

      if (error_code === 0) {
        logging.info(`Update sucessful`);
      } else {
        throw "Fail";
      }
    });
  }

  /**
   * @returns {Promise} config;
   *
   *
   *
   *
   */

  readDeviceConfig(mac = "ee:33:fa:89:08:08") {
    logging.debug("> Reading device config...");

    return this.interface.readDeviceConfig(mac);
  }

  /**
   * @param {string} config;
   *
   *
   *
   *
   */

  updateDeviceConfig(config_raw) {
    logging.debug("> Updating config...");

    return this.interface.updateDeviceConfig(config_raw);
  }

  /**
   * @param {string} config;
   *
   *
   *
   *
   */

  updateNetworkConfig(config) {
    logging.debug("> Updating config of whole network...");

    const encoder = new TextEncoder();
    const config_bytes = encoder.encode(config);
    const config_bytes_size = config.length;

    // make config update request
    const request_uuid = this.#getUUID();
    const request_bytes = [COMMAND_FLAGS.FLAG_CONFIG_UPDATE_REQUEST, ...numberToBytes(request_uuid, 4), ...numberToBytes(config_bytes_size, 4), ...config_bytes];

    return this.interface.execute(request_bytes, "CONF").then(() => {
      logging.debug("> Rebooting network...");
      const command_bytecode = [COMMAND_FLAGS.FLAG_DEVICE_REBOOT_REQUEST];
      return this.interface.execute(command_bytecode, null);
    });
  }

  requestTimeline() {
    logging.debug("> Requesting timeline...");

    const request_uuid = this.#getUUID();
    const bytes = [COMMAND_FLAGS.FLAG_TIMELINE_REQUEST, ...numberToBytes(request_uuid, 4)];

    return this.interface.request(bytes, true).then(response => {
      logging.verbose(`response.byteLength=${response.byteLength}`);

      let reader = new TnglReader(response);

      if (reader.readFlag() !== COMMAND_FLAGS.FLAG_TIMELINE_RESPONSE) {
        throw "InvalidResponseFlag";
      }

      const response_uuid = reader.readUint32();

      if (response_uuid != request_uuid) {
        throw "InvalidResponseUuid";
      }

      const error_code = reader.readUint8();

      const clock_timestamp = reader.readUint48();
      const timeline_timestamp = reader.readInt32();
      const timeline_paused = reader.readUint8();

      logging.verbose(`clock_timestamp=${clock_timestamp}, timeline_timestamp=${timeline_timestamp}, timeline_paused=${timeline_paused}`);

      if (timeline_paused) {
        this.timeline.setState(timeline_timestamp, true);
      } else {
        this.timeline.setState(timeline_timestamp + (this.interface.clock.millis() - clock_timestamp), false);
      }
    });
  }

  // Code.device.interface.execute([240,1,0,0,0,5],null)
  rebootNetwork() {
    logging.debug("> Rebooting network...");

    return this.socket.emitWithAck("rebootNetwork");
  }

  rebootDevice() {
    logging.debug("> Rebooting device...");

    return this.socket.emitWithAck("rebootDevice");
  }

  rebootAndDisconnectDevice() {
    logging.debug("> Rebooting and disconnecting device...");

    // this.interface.reconnection(false);

    const payload = [COMMAND_FLAGS.FLAG_DEVICE_REBOOT_REQUEST];
    return this.interface.request(payload, false).then(() => {
      return this.disconnect();
    });
  }

  removeOwner() {
    logging.debug("> Removing owner...");

    const request_uuid = this.#getUUID();
    const bytes = [COMMAND_FLAGS.FLAG_ERASE_OWNER_REQUEST, ...numberToBytes(request_uuid, 4)];

    return this.interface.request(bytes, true).then(response => {
      let reader = new TnglReader(response);

      logging.verbose(`response.byteLength=${response.byteLength}`);

      if (reader.readFlag() !== COMMAND_FLAGS.FLAG_ERASE_OWNER_RESPONSE) {
        throw "InvalidResponseFlag";
      }

      const response_uuid = reader.readUint32();

      if (response_uuid != request_uuid) {
        throw "InvalidResponseUuid";
      }

      const error_code = reader.readUint8();

      logging.verbose(`error_code=${error_code}`);

      if (error_code !== 0) {
        throw "OwnerEraseFailed";
      }

      const removed_device_mac_bytes = reader.readBytes(6);

      return this.rebootDevice()
        .catch(() => {})
        .then(() => {
          let removed_device_mac = "00:00:00:00:00:00";
          if (removed_device_mac_bytes.length >= 6) {
            removed_device_mac = Array.from(removed_device_mac_bytes, function (byte) {
              return ("0" + (byte & 0xff).toString(16)).slice(-2);
            }).join(":");
          }
          return {
            mac: removed_device_mac !== "00:00:00:00:00:00" ? removed_device_mac : null,
          };
        });
    });
  }

  removeNetworkOwner() {
    logging.debug("> Removing network owner...");

    const request_uuid = this.#getUUID();
    const bytes = [COMMAND_FLAGS.FLAG_ERASE_OWNER_REQUEST, ...numberToBytes(request_uuid, 4)];

    return this.interface.execute(bytes, true);
  }

  getFwVersion() {
    logging.debug("> Requesting fw version...");

    const request_uuid = this.#getUUID();
    const bytes = [COMMAND_FLAGS.FLAG_FW_VERSION_REQUEST, ...numberToBytes(request_uuid, 4)];

    logging.info("getFwVersion", { bytes });

    return this.interface.request(bytes, true).then(response => {
      let reader = new TnglReader(response);

      logging.verbose(`response.byteLength=${response.byteLength}`);

      if (reader.readFlag() !== COMMAND_FLAGS.FLAG_FW_VERSION_RESPONSE) {
        throw "InvalidResponseFlag";
      }

      const response_uuid = reader.readUint32();

      if (response_uuid != request_uuid) {
        throw "InvalidResponseUuid";
      }

      const error_code = reader.readUint8();

      logging.verbose(`error_code=${error_code}`);

      let version = null;

      if (error_code === 0) {
        version = reader.readString(32);
      } else {
        throw "Fail";
      }
      logging.verbose(`version=${version}`);

      logging.debug(`> FW Version: ${version}`);

      return version.trim();
    });
  }

  getTnglFingerprint(tngl_bank = 0) {
    logging.debug("> Getting TNGL fingerprint...");

    if (tngl_bank === null || tngl_bank === undefined) {
      tngl_bank = 0;
    }

    const request_uuid = this.#getUUID();
    const bytes = [COMMAND_FLAGS.FLAG_TNGL_FINGERPRINT_REQUEST, ...numberToBytes(request_uuid, 4), tngl_bank];

    return this.interface.request(bytes, true).then(response => {
      let reader = new TnglReader(response);

      logging.debug("> Got response:", response);

      if (reader.readFlag() !== COMMAND_FLAGS.FLAG_TNGL_FINGERPRINT_RESPONSE) {
        throw "InvalidResponseFlag";
      }

      const response_uuid = reader.readUint32();

      if (response_uuid != request_uuid) {
        throw "InvalidResponseUuid";
      }

      const error_code = reader.readUint8();

      logging.verbose(`error_code=${error_code}`);

      let fingerprint = null;

      if (error_code === 0) {
        fingerprint = reader.readBytes(32);
      } else {
        throw "Fail";
      }

      logging.verbose(`fingerprint=${fingerprint}`);
      logging.verbose(
        `fingerprint=${Array.from(fingerprint)
          .map(byte => ("0" + (byte & 0xff).toString(16)).slice(-2))
          .join(",")}`,
      );

      return new Uint8Array(fingerprint);
    });
  }

  // setDeviceId(id) {
  //   logging.debug("> Rebooting network...");

  //   const payload = [COMMAND_FLAGS.FLAG_DEVICE_ID, id];
  //   return this.connector.request(payload);
  // }

  // datarate in bits per second
  setNetworkDatarate(datarate) {
    logging.debug(`> Setting network datarate to ${datarate} bsp...`);

    const request_uuid = this.#getUUID();
    const payload = [COMMAND_FLAGS.FLAG_CHANGE_DATARATE_REQUEST, ...numberToBytes(request_uuid, 4), ...numberToBytes(datarate, 4)];

    return this.interface.execute(payload, null);
  }

  readRomPhyVdd33() {
    logging.debug("> Requesting rom_phy_vdd33 ...");

    const request_uuid = this.#getUUID();
    const bytes = [COMMAND_FLAGS.FLAG_ROM_PHY_VDD33_REQUEST, ...numberToBytes(request_uuid, 4)];

    return this.interface.request(bytes, true).then(response => {
      let reader = new TnglReader(response);

      logging.verbose(`response.byteLength=${response.byteLength}`);

      if (reader.readFlag() !== COMMAND_FLAGS.FLAG_ROM_PHY_VDD33_RESPONSE) {
        throw "InvalidResponseFlag";
      }

      const response_uuid = reader.readUint32();

      if (response_uuid != request_uuid) {
        throw "InvalidResponseUuid";
      }

      const error_code = reader.readUint8();

      logging.verbose(`error_code=${error_code}`);

      let vdd_reading = null;

      if (error_code === 0) {
        vdd_reading = reader.readInt32();
      } else {
        throw "Fail";
      }
      logging.info(`vdd_reading=${vdd_reading}`);

      return vdd_reading;
    });
  }

  readPinVoltage(pin) {
    logging.debug(`> Requesting pin ${pin} voltage ...`);

    const request_uuid = this.#getUUID();
    const bytes = [COMMAND_FLAGS.FLAG_VOLTAGE_ON_PIN_REQUEST, ...numberToBytes(request_uuid, 4), pin];

    return this.interface.request(bytes, true).then(response => {
      let reader = new TnglReader(response);

      logging.verbose(`response.byteLength=${response.byteLength}`);

      if (reader.readFlag() !== COMMAND_FLAGS.FLAG_VOLTAGE_ON_PIN_RESPONSE) {
        throw "InvalidResponseFlag";
      }

      const response_uuid = reader.readUint32();

      if (response_uuid != request_uuid) {
        throw "InvalidResponseUuid";
      }

      const error_code = reader.readUint8();

      logging.verbose(`error_code=${error_code}`);

      let pin_reading = null;

      if (error_code === 0) {
        pin_reading = reader.readUint32();
      } else {
        throw "Fail";
      }
      logging.info(`pin_reading=${pin_reading}`);

      return pin_reading;
    });
  }

  /**
   * Change language for modals
   * @param {"en"|"cs"} lng
   */
  setLanguage(lng) {
    changeLanguage(lng);
  }

  setDebugLevel(level) {
    setLoggingLevel(level);
  }

  getConnectedPeersInfo() {
    logging.debug("> Requesting connected peers info...");

    const request_uuid = this.#getUUID();
    const bytes = [COMMAND_FLAGS.FLAG_CONNECTED_PEERS_INFO_REQUEST, ...numberToBytes(request_uuid, 4)];

    return this.interface.request(bytes, true).then(response => {
      let reader = new TnglReader(response);

      logging.verbose(`response.byteLength=${response.byteLength}`);

      if (reader.readFlag() !== COMMAND_FLAGS.FLAG_CONNECTED_PEERS_INFO_RESPONSE) {
        throw "InvalidResponseFlag";
      }

      const response_uuid = reader.readUint32();

      if (response_uuid != request_uuid) {
        throw "InvalidResponseUuid";
      }

      const error_code = reader.readUint8();

      logging.verbose(`error_code=${error_code}`);

      let peers = [];

      if (error_code === 0) {
        let count = reader.readUint16();

        for (let index = 0; index < count; index++) {
          const mac = reader
            .readBytes(6)
            .map(v => v.toString(16).padStart(2, "0"))
            .join(":");
          const rssi = reader.readUint16() / (65535.0 / 512.0) - 256.0;
          peers.push({
            mac: mac,
            rssi: rssi,
          });
        }

        // logging.info(`count=${count}, peers=`, peers);
        logging.info(`count=${count}, peers=\n${peers.map(x => `mac:${x.mac},rssi:${x.rssi}`).join("\n")}`);
        this.interface.eraseConnectedPeers();
        this.interface.setConnectedPeers(peers.map(x => x.mac));
        return peers;
      } else {
        throw "Fail";
      }
    });
  }

  readEventHistory() {
    logging.debug("> Requesting event history bytecode...");

    const request_uuid = this.#getUUID();
    const bytes = [COMMAND_FLAGS.FLAG_EVENT_HISTORY_BC_REQUEST, ...numberToBytes(request_uuid, 4)];

    return this.interface.request(bytes, true).then(response => {
      let reader = new TnglReader(response);

      logging.verbose(`response.byteLength=${response.byteLength}`);

      if (reader.readFlag() !== COMMAND_FLAGS.FLAG_EVENT_HISTORY_BC_RESPONSE) {
        logging.error("InvalidResponseFlag");
        throw "InvalidResponseFlag";
      }

      const response_uuid = reader.readUint32();

      if (response_uuid != request_uuid) {
        logging.error("InvalidResponseUuid");
        throw "InvalidResponseUuid";
      }

      const error_code = reader.readUint8();

      logging.verbose(`error_code=${error_code}`);

      if (error_code === 0) {
        const historic_events_bytecode_size = reader.readUint16();
        logging.verbose(`historic_events_bytecode_size=${historic_events_bytecode_size}`);

        const historic_events_bytecode = reader.readBytes(historic_events_bytecode_size);
        logging.verbose(`historic_events_bytecode=[${historic_events_bytecode}]`);

        this.interface.process(new DataView(new Uint8Array(historic_events_bytecode).buffer));
      } else {
        throw "Fail";
      }
    });
  }

  eraseEventHistory() {
    logging.debug("> Erasing event history...");

    const request_uuid = this.#getUUID();
    const bytes = [COMMAND_FLAGS.FLAG_ERASE_EVENT_HISTORY_REQUEST, ...numberToBytes(request_uuid, 4)];

    return this.interface.execute(bytes, true);
  }

  deviceSleep() {
    logging.debug("> Sleep device...");

    const request_uuid = this.#getUUID();
    const payload = [COMMAND_FLAGS.FLAG_SLEEP_REQUEST, ...numberToBytes(request_uuid, 4)];
    return this.interface.request(payload, false);
  }

  networkSleep() {
    logging.debug("> Sleep device...");

    const request_uuid = this.#getUUID();
    const payload = [COMMAND_FLAGS.FLAG_SLEEP_REQUEST, ...numberToBytes(request_uuid, 4)];
    return this.interface.execute(payload, null);
  }

  saveState() {
    throw "WorkInProgress";

    logging.debug("> Saving state...");

    const request_uuid = this.#getUUID();
    const payload = [COMMAND_FLAGS.FLAG_SAVE_STATE_REQUEST, ...numberToBytes(request_uuid, 4)];
    return this.interface.execute(payload, null);
  }

  getControllerInfo() {
    logging.debug("> Requesting controller info ...");

    const request_uuid = this.#getUUID();
    const bytes = [DEVICE_FLAGS.FLAG_CONTROLLER_INFO_REQUEST, ...numberToBytes(request_uuid, 4)];

    return this.interface.request(bytes, true).then(response => {
      let reader = new TnglReader(response);

      logging.verbose("response=", response);

      if (reader.readFlag() !== DEVICE_FLAGS.FLAG_CONTROLLER_INFO_RESPONSE) {
        throw "InvalidResponseFlag";
      }

      const response_uuid = reader.readUint32();

      if (response_uuid != request_uuid) {
        throw "InvalidResponseUuid";
      }

      const error_code = reader.readUint8();

      logging.verbose(`error_code=${error_code}`);

      let pcb_code = null;
      let product_code = null;

      if (error_code === 0) {
        pcb_code = reader.readUint16();
        product_code = reader.readUint16();
      } else {
        throw "Fail";
      }

      logging.info(`pcb_code=${pcb_code}`);
      logging.info(`product_code=${product_code}`);

      return { pcb_code: pcb_code, product_code: product_code };
    });
  }

  writeOwner(ownerSignature = "00000000000000000000000000000000", ownerKey = "00000000000000000000000000000000") {
    logging.debug("> Writing owner to device...", ownerSignature, ownerKey);

    const owner_signature_bytes = hexStringToUint8Array(ownerSignature, 16);
    const owner_key_bytes = hexStringToUint8Array(ownerKey, 16);

    logging.info("owner_signature_bytes", owner_signature_bytes);
    logging.info("owner_key_bytes", owner_key_bytes);

    const request_uuid = this.#getUUID();
    const bytes = [COMMAND_FLAGS.FLAG_ADOPT_REQUEST, ...numberToBytes(request_uuid, 4), ...owner_signature_bytes, ...owner_key_bytes];

    logging.verbose(bytes);

    return this.interface
      .request(bytes, true)
      .then(response => {
        let reader = new TnglReader(response);

        logging.debug("> Got response:", response);

        if (reader.readFlag() !== COMMAND_FLAGS.FLAG_ADOPT_RESPONSE) {
          throw "InvalidResponse";
        }

        const response_uuid = reader.readUint32();

        if (response_uuid != request_uuid) {
          throw "InvalidResponse";
        }

        let device_mac = "null";

        const error_code = reader.readUint8();

        // error_code 0 is success
        if (error_code === 0) {
          const device_mac_bytes = reader.readBytes(6);

          device_mac = Array.from(device_mac_bytes, function (byte) {
            return ("0" + (byte & 0xff).toString(16)).slice(-2);
          }).join(":");
        }

        logging.verbose(`error_code=${error_code}, device_mac=${device_mac}`);

        if (error_code === 0) {
          logging.info(`Adopted ${device_mac} successfully`);
          return {
            mac: device_mac,
            ownerSignature: this.#ownerSignature,
            ownerKey: this.#ownerKey,
            // name: newDeviceName,
            // id: newDeviceId,
          };
        } else {
          logging.warn("Adoption refused by device.");
          throw "AdoptionRefused";
        }
      })
      .catch(e => {
        logging.error("Error during writeOwner():", e);
        throw "AdoptionFailed";
      });
  }

  writeNetworkOwner(ownerSignature = "00000000000000000000000000000000", ownerKey = "00000000000000000000000000000000") {
    logging.debug("> Writing owner to network...");

    const owner_signature_bytes = hexStringToUint8Array(ownerSignature, 16);
    const owner_key_bytes = hexStringToUint8Array(ownerKey, 16);

    logging.info("owner_signature_bytes", owner_signature_bytes);
    logging.info("owner_key_bytes", owner_key_bytes);

    const request_uuid = this.#getUUID();
    const bytes = [COMMAND_FLAGS.FLAG_ADOPT_REQUEST, ...numberToBytes(request_uuid, 4), ...owner_signature_bytes, ...owner_key_bytes];

    logging.verbose(bytes);

    return this.interface.execute(bytes, true);
  }

  // name as string
  writeControllerName(name) {
    logging.debug("> Writing Controller Name...");

    const request_uuid = this.#getUUID();
    const payload = [COMMAND_FLAGS.FLAG_WRITE_CONTROLLER_NAME_REQUEST, ...numberToBytes(request_uuid, 4), ...stringToBytes(name, 16)];
    return this.interface.request(payload, false);
  }

  readControllerName() {
    logging.debug("> Reading Controller Name...");

    const request_uuid = this.#getUUID();
    const bytes = [COMMAND_FLAGS.FLAG_READ_CONTROLLER_NAME_REQUEST, ...numberToBytes(request_uuid, 4)];

    return this.interface.request(bytes, true).then(response => {
      let reader = new TnglReader(response);

      logging.verbose(`response.byteLength=${response.byteLength}`);

      if (reader.readFlag() !== COMMAND_FLAGS.FLAG_READ_CONTROLLER_NAME_RESPONSE) {
        throw "InvalidResponseFlag";
      }

      const response_uuid = reader.readUint32();

      if (response_uuid != request_uuid) {
        throw "InvalidResponseUuid";
      }

      const error_code = reader.readUint8();

      logging.verbose(`error_code=${error_code}`);

      let name = null;

      if (error_code === 0) {
        name = reader.readString(16);
      } else {
        throw "Fail";
      }

      logging.verbose(`name=${name}`);
      logging.debug(`> Controller Name: ${name}`);

      return name;
    });
  }
}
