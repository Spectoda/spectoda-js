import { COMMAND_FLAGS, SpectodaInterfaceLegacy, allEventsEmitter } from "./SpectodaInterfaceLegacy.js";
import { TnglCodeParser } from "./SpectodaParser.js";
import { WEBSOCKET_URL } from "./SpectodaWebSocketsConnector.js";
import { colorToBytes, computeTnglFingerprint, detectSpectodaConnect, hexStringToUint8Array, labelToBytes, numberToBytes, percentageToBytes, sleep, strMacToBytes, stringToBytes, uint8ArrayToHexString } from "./functions";
import { changeLanguage, t } from "./i18n.js";
import { logging, setLoggingLevel } from "./logging";
// import { Interface } from "./src/SpectodaInterface.js";
import { io } from "socket.io-client";
import customParser from "socket.io-msgpack-parser";
import { TimeTrack } from "./TimeTrack.js";
import "./TnglReader.js";
import { TnglReader } from "./TnglReader.js";
import "./TnglWriter.js";

// should not create more than one object!
// the destruction of the Spectoda is not well implemented

// TODO - kdyz zavolam spectoda.connect(), kdyz jsem pripojeny, tak nechci aby se do interfacu poslal select
// TODO - kdyz zavolam funkci connect a uz jsem pripojeny, tak vyslu event connected, pokud si myslim ze nejsem pripojeny.
// TODO - "watchdog timer" pro resolve/reject z TC

export class Spectoda {
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
  #websocketConnectionState;

  // mechanism for event ordering
  #lastEmitClockTimestamp;

  #eventHistory;

  constructor(connectorType = "default", reconnectionInterval = 1000) {
    // nextjs
    if (typeof window === "undefined") {
      return;
    }

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
    this.#websocketConnectionState = "disconnected";

    this.#lastEmitClockTimestamp = 0;

    this.#eventHistory = {};
    for (let id = 0; id < 256; id++) {
      this.#eventHistory[id] = {};
    }

    // this.#eventHistory = [];

    this.interface.on("emitted_events", events => {

      // interface Event {
      //   type: number;
      //   value: any;
      //   id: number;
      //   label: string;
      //   identifier: number;
      //   timestamp: number;
      //   meta: EventMeta;
      // }

      for (const event of events) {

        if (event.id === 255) {

          for (let id = 0; id < 255; id++) {

            if (!this.#eventHistory[id][event.label]) {
              this.#eventHistory[id][event.label] = {};
            }

            if (!this.#eventHistory[id][event.label] || !this.#eventHistory[id][event.label].timestamp || event.timestamp >= this.#eventHistory[id][event.label].timestamp) {
              this.#eventHistory[id][event.label].type = event.type;
              this.#eventHistory[id][event.label].value = event.value;
              this.#eventHistory[id][event.label].id = id;
              this.#eventHistory[id][event.label].label = event.label;
              this.#eventHistory[id][event.label].timestamp = event.timestamp;
            }
          }

          continue;
        }

        if (!this.#eventHistory[event.id][event.label]) {
          this.#eventHistory[event.id][event.label] = {};
        }

        if (!this.#eventHistory[event.id][event.label] || !this.#eventHistory[event.id][event.label].timestamp || event.timestamp >= this.#eventHistory[event.id][event.label].timestamp) {
          this.#eventHistory[event.id][event.label].type = event.type;
          this.#eventHistory[event.id][event.label].value = event.value;
          this.#eventHistory[event.id][event.label].id = event.id;
          this.#eventHistory[event.id][event.label].label = event.label;
          this.#eventHistory[event.id][event.label].timestamp = event.timestamp;
        }
      }

      // for (const event of events) {
      //   // Find if an event with the same id and identifier already exists
      //   const existingEventIndex = this.#eventHistory.findIndex(e => e.id === event.id && e.label === event.label);

      //   if (existingEventIndex !== -1) {
      //     // Check if the new event has a larger timestamp
      //     if (event.timestamp > this.#eventHistory[existingEventIndex].timestamp) {
      //       // Replace the existing event
      //       this.#eventHistory[existingEventIndex] = event;
      //       // Re-sort the array since the updated event might change the order
      //       this.#eventHistory.sort((a, b) => a.timestamp - b.timestamp);
      //     }
      //   } else {
      //     // Insert the new event in a sorted manner
      //     const insertIndex = this.#eventHistory.findIndex(sortedEvent => sortedEvent.timestamp > event.timestamp);
      //     if (insertIndex === -1) {
      //       this.#eventHistory.push(event);
      //     } else {
      //       this.#eventHistory.splice(insertIndex, 0, event);
      //     }
      //   }
      // }

      logging.verbose("#eventHistory", this.#eventHistory);

    });

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

  #setWebSocketConnectionState(websocketConnectionState) {
    switch (websocketConnectionState) {
      case "connecting":
        if (websocketConnectionState !== this.#websocketConnectionState) {
          logging.warn("> Spectoda connecting");
          this.#websocketConnectionState = websocketConnectionState;
          this.interface.emit("connecting-websockets");
        }
        break;
      case "connected":
        if (websocketConnectionState !== this.#websocketConnectionState) {
          logging.warn("> Spectoda connected");
          this.#websocketConnectionState = websocketConnectionState;
          this.interface.emit("connected-websockets");
        }
        break;
      case "disconnecting":
        if (websocketConnectionState !== this.#websocketConnectionState) {
          logging.warn("> Spectoda disconnecting");
          this.#connectionState = connectionState;
          this.interface.emit("disconnecting-websockets");
        }
        break;
      default:
        throw "InvalidState";
    }
  }

  #setConnectionState(connectionState) {
    switch (connectionState) {
      case "connecting":
        if (connectionState !== this.#connectionState) {
          // if (connectionState == "disconnecting") {
          //   throw "DisconnectingInProgress";
          // }

          logging.warn("> Spectoda connecting");
          this.#connectionState = connectionState;
          this.interface.emit("connecting");
        }
        break;
      case "connected":
        if (connectionState !== this.#connectionState) {
          // if (connectionState != "connecting") {
          //   throw "ConnectionFailed";
          // }

          logging.warn("> Spectoda connected");
          this.#connectionState = connectionState;
          this.interface.emit("connected");
        }
        break;
      case "disconnecting":
        if (connectionState !== this.#connectionState) {
          // if (connectionState == "connecting") {
          //   throw "ConnectingInProgress";
          // }

          logging.warn("> Spectoda disconnecting");
          this.#connectionState = connectionState;
          this.interface.emit("disconnecting");
        }
        break;
      case "disconnected":
        if (connectionState !== this.#connectionState) {
          // if (connectionState != "disconnecting") {
          //   throw "DisconnectFailed";
          // }

          logging.warn("> Spectoda disconnected");
          this.#connectionState = connectionState;
          this.interface.emit("disconnected");
        }
        break;
      default:
        throw "InvalidState";
    }
  }

  #getConnectionState() {
    return this.#connectionState;
  }

  #setOwnerSignature(ownerSignature) {
    const reg = ownerSignature.match(/([\dabcdefABCDEF]{32})/g);

    if (!reg[0]) {
      throw "InvalidSignature";
    }

    this.#ownerSignature = reg[0];
    return true;
  }

  #setOwnerKey(ownerKey) {
    const reg = ownerKey.match(/([\dabcdefABCDEF]{32})/g);

    if (!reg[0]) {
      throw "InvalidKey";
    }

    this.#ownerKey = reg[0];
    return true;
  }

  requestWakeLock(prioritized = false) {
    return this.interface.requestWakeLock(prioritized);
  }

  releaseWakeLock(prioritized = false) {
    return this.interface.releaseWakeLock(prioritized);
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
  assignOwnerSignature() {
    logging.error("assignOwnerSignature() is deprecated. Use parameters in connect() instead.");
  }

  // todo remove, deprecated
  assignOwnerKey() {
    logging.error("assignOwnerKey() is deprecated. Use parameters in connect() instead.");
  }

  assignOwnerSignature(ownerSignature) {
    return this.#setOwnerSignature(ownerSignature);
  }

  getOwnerSignature() {
    return this.#ownerSignature;
  }

  setOwnerKey(ownerKey) {
    const reg = ownerKey.match(/([\dabcdefABCDEF]{32})/g);

    if (!reg[0]) {
      throw "InvalidKey";
    }

    this.#ownerKey = reg[0];
    return true;
  }

  assignOwnerKey(ownerKey) {
    return this.setOwnerKey(ownerKey);
  }

  getOwnerKey() {
    return this.#ownerKey;
  }

  // todo remove, deprecated
  setOwnerKey() {
    logging.error("setOwnerKey() is deprecated. Use parameters in connect() instead.");
  }

  getOwnerSignature() {
    return this.#ownerSignature;
  }

  getOwnerKey() {
    return this.#ownerKey;
  }


  /**
   * @param {Object} options
   * @param {string} options.signature - The network signature.
   * @param {string} options.key - The network key.
   * @param {boolean} [options.sessionOnly] - Whether to enable remote control for the current session only.
   */
  async enableRemoteControl({ signature, key, sessionOnly }) {
    logging.debug("> Connecting to Remote Control");

    this.socket && this.socket.disconnect();

    this.socket = io(WEBSOCKET_URL, {
      parser: customParser,
    });

    this.socket.connect();
    this.requestWakeLock(true);

    const setConnectionSocketData = async () => {
      const peers = await this.getConnectedPeersInfo();
      logging.debug("peers", peers);
      this.socket.emit("set-connection-data", peers);
    };

    this.on("connected", async () => {
      setConnectionSocketData();
    });

    this.on("disconnected", () => {
      this.socket.emit("set-connection-data", null);
    });

    return await new Promise((resolve, reject) => {
      this.socket.on("disconnect", () => {
        this.#setWebSocketConnectionState("disconnected");
      });

      this.socket.on("connect", async () => {
        if (sessionOnly) {
          // todo finish impl + UI
          const roomId = await this.socket.emitWithAck("join-session");
          logging.debug("Remote control id for this session is", { roomId });
        } else {
          this.#setWebSocketConnectionState("connecting");
          await this.socket
            .emitWithAck("join", { signature, key })
            .then(e => {
              this.#setWebSocketConnectionState("connected");
              setConnectionSocketData();
            })
            .catch(e => {
              this.#setWebSocketConnectionState("disconnected");
            });
        }

        logging.info("> Connected and joined network remotely");

        resolve({ status: "success" });

        logging.info("> Listening for events", allEventsEmitter);
        window.allEventsEmitter = allEventsEmitter;

        allEventsEmitter.on("on", ({ name, args }) => {
          logging.debug("on", name, args);
          this.socket.emit("event", { name, args });
        });

        this.socket.on("func", async (payload, callback) => {
          if (!callback) {
            logging.error("No callback provided");
            return;
          }

          let { functionName, arguments: args } = payload;

          // call internal class function await this[functionName](...args)

          // call internal class function
          try {
            if (functionName === "assignOwnerSignature" || functionName === "assignOwnerKey") {
              return callback({ status: "success", message: "assign key/signature is ignored on remote." });
            }

            if (functionName === "updateDeviceFirmware" || (functionName === "updateNetworkFirmware" && typeof args?.[0] === "object")) {
              const arr = Object.values(args[0]);
              const uint8Array = new Uint8Array(arr);
              args[0] = uint8Array;
            }
            const result = await this[functionName](...args);
            callback({ status: "success", result });
          } catch (e) {
            logging.error(e);
            callback({ status: "error", error: e });
          }
        });
      });
    });
  }

  disableRemoteControl() {
    logging.debug("> Disonnecting from the Remote Control");

    this.releaseWakeLock(true);
    this.socket?.disconnect();
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
    return this.interface.addEventListener(event, callback);
  }
  /**
   * @alias this.addEventListener
   */
  on(event, callback) {
    return this.interface.on(event, callback);
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

    if (this.#adopting) {
      return Promise.reject("AdoptingInProgress");
    }

    if (ownerSignature) {
      this.#setOwnerSignature(ownerSignature);
    }

    if (ownerKey) {
      this.#setOwnerKey(ownerKey);
    }

    if (!this.#ownerSignature) {
      throw "OwnerSignatureNotAssigned";
    }

    if (!this.#ownerKey) {
      throw "OwnerKeyNotAssigned";
    }

    this.#adopting = true;

    this.#setConnectionState("connecting");

    const criteria = /** @type {any} */ ([{ adoptionFlag: true }]);

    return (autoSelect ? this.interface.autoSelect(criteria, 4000) : this.interface.userSelect(criteria, 60000))
      .then(() => {
        // this.#adoptingFlag = true;
        return this.interface.connect(10000, true);
      })
      .then(() => {
        const owner_signature_bytes = hexStringToUint8Array(this.#ownerSignature, 16);
        const owner_key_bytes = hexStringToUint8Array(this.#ownerKey, 16);

        logging.info("owner_signature_bytes", owner_signature_bytes);
        logging.info("owner_key_bytes", owner_key_bytes);

        const request_uuid = this.#getUUID();
        const bytes = [COMMAND_FLAGS.FLAG_ADOPT_REQUEST, ...numberToBytes(request_uuid, 4), ...owner_signature_bytes, ...owner_key_bytes /*, ...device_name_bytes, ...numberToBytes(device_id, 1)*/];

        logging.debug("> Adopting device...");
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

            const error_code = reader.readUint8();

            let device_mac = "00:00:00:00:00:00";
            if (error_code === 0) {
              // error_code 0 is success
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
            }

            if (error_code !== 0) {
              logging.warn("Adoption refused.");
              window.alert(t("Zkuste to, prosím, znovu."), t("Přidání se nezdařilo"), { confirm: t("OK") });

              throw "AdoptionRefused";
            }
          })
          .catch(e => {
            logging.error("Error during adopt():", e);
            this.disconnect().finally(() => {
              // @ts-ignore
              throw "AdoptionFailed";
            });
          });
      })
      .catch(error => {
        logging.warn("Error during adopt:", error);
        if (error === "UserCanceledSelection") {
          return this.connected().then(result => {
            if (!result) throw "UserCanceledSelection";
          });
        }
      })
      .finally(() => {
        this.#adopting = false;
        this.#setConnectionState("disconnected");
      });
  }

  connect(devices = null, autoConnect = true, ownerSignature = null, ownerKey = null, connectAny = false, fwVersion = "") {
    logging.info(`connect(devices=${devices}, autoConnect=${autoConnect}, ownerSignature=${ownerSignature}, ownerKey=${ownerKey}, connectAny=${connectAny}, fwVersion=${fwVersion})`);

    if (this.#connecting) {
      return Promise.reject("ConnectingInProgress");
    }

    if (ownerSignature) {
      this.#setOwnerSignature(ownerSignature);
    }

    if (ownerKey) {
      this.#setOwnerKey(ownerKey);
    }

    if (!connectAny) {
      if (!this.#ownerSignature) {
        throw "OwnerSignatureNotAssigned";
      }

      if (!this.#ownerKey) {
        throw "OwnerKeyNotAssigned";
      }
    }

    this.#setConnectionState("connecting");

    this.#connecting = true;

    let criteria = /** @type {any} */ ([{ ownerSignature: this.#ownerSignature }]);

    if (devices && devices.length > 0) {
      let devices_criteria = /** @type {any} */ ([]);

      for (let i = 0; i < devices.length; i++) {
        let criterium = {};

        if (devices[i].name) {
          criterium.ownerSignature = this.#ownerSignature;
          criterium.name = devices[i].name.slice(0, 11);
          devices_criteria.push(criterium);
        } else if (devices[i].mac) {
          criterium.ownerSignature = this.#ownerSignature;
          criterium.mac = devices[i].mac;
          devices_criteria.push(criterium);
        }
      }

      if (devices_criteria.length != 0) {
        criteria = devices_criteria;
      }
    }

    if (connectAny) {
      if (detectSpectodaConnect()) {
        criteria = [{}];
      } else {
        criteria = [{}, { adoptionFlag: true }, { legacy: true }];
      }
    }

    if (typeof fwVersion == "string" && fwVersion.match(/(!?)([\d]+).([\d]+).([\d]+)/)) {
      for (let i = 0; i < criteria.length; i++) {
        criteria[i].fwVersion = fwVersion;
      }
    }

    return (autoConnect ? this.interface.autoSelect(criteria, 1000, 10000) : this.interface.userSelect(criteria))
      .then(() => {
        return this.interface.connect();
      })
      .then(connectedDeviceInfo => {
        logging.info("> Synchronizing Network State...");
        return (this.timeline.paused() ? this.requestTimeline() : this.syncTimeline())
          .catch(e => {
            logging.error("Timeline sync after reconnection failed:", e);
          })
          .then(() => {
            return this.readEventHistory();
          })
          .catch(e => {
            logging.error("History sync after reconnection failed:", e);
          })
          .then(() => {
            return this.interface.connected();
          })
          .then(connected => {
            if (!connected) {
              throw "ConnectionFailed";
            }
            this.#setConnectionState("connected");
            return connectedDeviceInfo;
          });
      })
      .catch(error => {
        logging.error("Error during connect():", error);

        // TODO! Initiate user gesture if (error === "UserGestureRequired") and handle connection, ad DEV-3298

        this.#setConnectionState("disconnected");

        if (typeof error != "string") {
          throw "ConnectionFailed";
        } else {
          throw error;
        }
      })
      .finally(() => {
        this.#connecting = false;
      });
  }

  disconnect() {
    if (this.#connectionState === "disconnected") {
      Promise.reject("DeviceAlreadyDisconnected");
    }

    this.#setConnectionState("disconnecting");
    return this.interface.disconnect().finally(() => {
      this.#setConnectionState("disconnected");
    });
  }

  connected() {
    if (this.#connecting || this.#adopting) {
      return Promise.resolve(null); // resolve nothing === not connected
    }

    return this.interface.connected();
  }

  //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

  async preprocessTngl(tngl_code) {
    // 1st stage: preprocess the code

    // logging.debug(tngl_code);

    let processed_tngl_code = tngl_code;

    const regexPUBLISH_TNGL_TO_API = /PUBLISH_TNGL_TO_API\s*\(\s*"([^"]*)"\s*,\s*`([^`]*)`\s*\);?/ms;
    const regexINJECT_TNGL_FROM_API = /INJECT_TNGL_FROM_API\s*\(\s*"([^"]*)"\s*\);?/ms;

    for (let requests = 0; requests < 64; requests++) {
      const match = regexPUBLISH_TNGL_TO_API.exec(processed_tngl_code);
      logging.verbose(match);

      if (!match) {
        break;
      }

      const name = match[1];
      const id = encodeURIComponent(name);
      const tngl = match[2];

      try {
        logging.debug(`sendTnglToApi({ id=${id}, name=${name}, tngl=${tngl} })`);
        await sendTnglToApi({ id, name, tngl });
        processed_tngl_code = processed_tngl_code.replace(match[0], "");
      } catch (e) {
        logging.error(`Failed to send "${name}" to TNGL API`);
        throw "SendTnglToApiFailed";
      }
    }

    for (let requests = 0; requests < 64; requests++) {
      const match = regexINJECT_TNGL_FROM_API.exec(processed_tngl_code);
      logging.verbose(match);

      if (!match) {
        break;
      }

      const name = match[1];
      const id = encodeURIComponent(name);

      try {
        logging.debug(`fetchTnglFromApiById({ id=${id} })`);
        const response = await fetchTnglFromApiById(id);
        processed_tngl_code = processed_tngl_code.replace(match[0], response.tngl);
      } catch (e) {
        logging.error(`Failed to fetch "${name}" from TNGL API`);
        throw "FetchTnglFromApiFailed";
      }
    }

    // var code = `// Publishing TNGL as "${text_tngl_api_name}":\n/*\n${statements_body}*/\n`;
    // var code = `// Loaded TNGL "${text_tngl_api_name}": \n ${tnglCodeToInject}\n`;

    logging.debug(processed_tngl_code);

    return processed_tngl_code;
  }

  // writes Tngl only if fingerprints does not match
  syncTngl(tngl_code, tngl_bytes = null, tngl_bank = 0) {
    logging.verbose("syncTngl()");

    if (tngl_code === null && tngl_bytes === null) {
      return Promise.reject("InvalidParameters");
    }

    if (tngl_bytes === null) {
      tngl_bytes = new TnglCodeParser().parseTnglCode(tngl_code);
    }

    return this.getTnglFingerprint(tngl_bank).then(device_fingerprint => {
      return computeTnglFingerprint(tngl_bytes, "fingerprint").then(new_fingerprint => {
        // logging.debug(device_fingerprint);
        // logging.debug(new_fingerprint);

        for (let i = 0; i < device_fingerprint.length; i++) {
          if (device_fingerprint[i] !== new_fingerprint[i]) {
            return this.writeTngl(null, tngl_bytes, tngl_bank);
          }
        }
      });
    });
  }

  writeTngl(tngl_code, tngl_bytes = null, memory_bank = 0) {
    logging.verbose("writeTngl()");

    if (memory_bank === null || memory_bank === undefined) {
      memory_bank = 0;
    }

    if (tngl_code === null && tngl_bytes === null) {
      return Promise.reject("InvalidParameters");
    }

    if (tngl_bytes === null) {
      const parser = new TnglCodeParser();
      tngl_bytes = parser.parseTnglCode(tngl_code);
    }

    const timeline_flags = this.timeline.paused() ? 0b00010000 : 0b00000000; // flags: [reserved,reserved,reserved,timeline_paused,reserved,reserved,reserved,reserved]
    const timeline_bytecode = [COMMAND_FLAGS.FLAG_SET_TIMELINE, ...numberToBytes(this.interface.clock.millis(), 6), ...numberToBytes(this.timeline.millis(), 4), timeline_flags];

    const reinterpret_bytecode = [COMMAND_FLAGS.FLAG_REINTERPRET_TNGL, ...numberToBytes(this.interface.clock.millis(), 6), memory_bank, ...numberToBytes(tngl_bytes.length, 4), ...tngl_bytes];

    // logging.info(reinterpret_bytecode);

    const payload = [...timeline_bytecode, ...reinterpret_bytecode];
    return this.interface.execute(payload, "TNGL").then(() => {
      // logging.debug("Written");
    });
  }

  #getEmitEventClockTimestamp() {
    // this mechanizm is used to ensure that events are emitted in the correct order
    let emit_timestamp = this.interface.clock.millis();
    if (emit_timestamp <= this.#lastEmitClockTimestamp && this.#lastEmitClockTimestamp - emit_timestamp < 100) {
      emit_timestamp = this.#lastEmitClockTimestamp + 1;
    }
    this.#lastEmitClockTimestamp = emit_timestamp;

    return emit_timestamp;
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

    // clearTimeout(this.#saveStateTimeoutHandle);
    // this.#saveStateTimeoutHandle = setTimeout(() => {
    //   this.saveState();
    // }, 5000);

    const clock_timestamp = this.#getEmitEventClockTimestamp() + 10; // +10ms in the future so that, there is no visual jump

    const func = device_id => {
      const payload = [COMMAND_FLAGS.FLAG_EMIT_EVENT, ...labelToBytes(event_label), ...numberToBytes(clock_timestamp, 6), numberToBytes(device_id, 1)];
      return this.interface.execute(payload, force_delivery ? null : "E" + event_label + device_id);
    };

    if (typeof device_ids === "object") {
      let promises = device_ids.map(func);
      return Promise.all(promises);
    } else {
      return func(device_ids);
    }
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

    // clearTimeout(this.#saveStateTimeoutHandle);
    // this.#saveStateTimeoutHandle = setTimeout(() => {
    //   this.saveState();
    // }, 5000);

    if (event_value > 2147483647) {
      logging.error("Invalid event value");
      event_value = 2147483647;
    }

    if (event_value < -2147483648) {
      logging.error("Invalid event value");
      event_value = -2147483648;
    }

    const clock_timestamp = this.#getEmitEventClockTimestamp() + 10; // +10ms in the future so that, there is no visual jump

    const func = device_id => {
      const payload = [COMMAND_FLAGS.FLAG_EMIT_TIMESTAMP_EVENT, ...numberToBytes(event_value, 4), ...labelToBytes(event_label), ...numberToBytes(clock_timestamp, 6), numberToBytes(device_id, 1)];
      return this.interface.execute(payload, force_delivery ? null : "E" + event_label + device_id);
    };

    if (typeof device_ids === "object") {
      let promises = device_ids.map(func);
      return Promise.all(promises);
    } else {
      return func(device_ids);
    }
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

    // clearTimeout(this.#saveStateTimeoutHandle);
    // this.#saveStateTimeoutHandle = setTimeout(() => {
    //   this.saveState();
    // }, 5000);

    if (!event_value || !event_value.match(/#[\dabcdefABCDEF]{6}/g)) {
      logging.error("Invalid event value. event_value=", event_value);
      event_value = "#000000";
    }

    const clock_timestamp = this.#getEmitEventClockTimestamp() + 10; // +10ms in the future so that, there is no visual jump

    const func = device_id => {
      const payload = [COMMAND_FLAGS.FLAG_EMIT_COLOR_EVENT, ...colorToBytes(event_value), ...labelToBytes(event_label), ...numberToBytes(clock_timestamp, 6), numberToBytes(device_id, 1)];
      return this.interface.execute(payload, force_delivery ? null : "E" + event_label + device_id);
    };

    if (typeof device_ids === "object") {
      let promises = device_ids.map(func);
      return Promise.all(promises);
    } else {
      return func(device_ids);
    }
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

    // clearTimeout(this.#saveStateTimeoutHandle);
    // this.#saveStateTimeoutHandle = setTimeout(() => {
    //   this.saveState();
    // }, 5000);

    if (event_value > 100.0) {
      logging.error("Invalid event value");
      event_value = 100.0;
    }

    if (event_value < -100.0) {
      logging.error("Invalid event value");
      event_value = -100.0;
    }

    const clock_timestamp = this.#getEmitEventClockTimestamp() + 10; // +10ms in the future so that, there is no visual jump

    const func = device_id => {
      const payload = [COMMAND_FLAGS.FLAG_EMIT_PERCENTAGE_EVENT, ...percentageToBytes(event_value), ...labelToBytes(event_label), ...numberToBytes(clock_timestamp, 6), numberToBytes(device_id, 1)];
      return this.interface.execute(payload, force_delivery ? null : "E" + event_label + device_id);
    };

    if (typeof device_ids === "object") {
      let promises = device_ids.map(func);
      return Promise.all(promises);
    } else {
      return func(device_ids);
    }
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

    const clock_timestamp = this.#getEmitEventClockTimestamp() + 10; // +10ms in the future so that, there is no visual jump

    const func = device_id => {
      const payload = [COMMAND_FLAGS.FLAG_EMIT_LABEL_EVENT, ...labelToBytes(event_value), ...labelToBytes(event_label), ...numberToBytes(clock_timestamp, 6), numberToBytes(device_id, 1)];
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
    logging.debug({ firmware });

    if (!firmware || firmware.length < 10000) {
      logging.error("Invalid firmware");
      return Promise.reject("InvalidFirmware");
    }

    return this.interface.updateFW(firmware).then(() => {
      this.disconnect();
    });
  }

  updateNetworkFirmware(firmware) {
    logging.verbose(`updateNetworkFirmware(firmware.length=${firmware?.length})`);

    if (!firmware || firmware.length < 10000) {
      logging.error("Invalid firmware");
      return Promise.reject("InvalidFirmware");
    }

    this.#updating = true;

    this.interface.requestWakeLock();

    return new Promise(async (resolve, reject) => {
      // const chunk_size = detectAndroid() ? 480 : 3984; // must be modulo 16
      // const chunk_size = 992; // must be modulo 16
      const chunk_size = detectSpectodaConnect() ? 480 : 3984;

      let index_from = 0;
      let index_to = chunk_size;

      let written = 0;

      logging.info("OTA UPDATE");
      logging.verbose(firmware);

      const start_timestamp = new Date().getTime();

      await sleep(100);

      try {
        this.interface.emit("ota_status", "begin");

        {
          //===========// RESET //===========//
          logging.info("OTA RESET");

          const command_bytes = [COMMAND_FLAGS.FLAG_OTA_RESET, 0x00, ...numberToBytes(0x00000000, 4)];
          await this.interface.execute(command_bytes, null);
        }

        await sleep(100);

        {
          //===========// BEGIN //===========//
          logging.info("OTA BEGIN");

          const command_bytes = [COMMAND_FLAGS.FLAG_OTA_BEGIN, 0x00, ...numberToBytes(firmware.length, 4)];
          await this.interface.execute(command_bytes, null, 20000);
        }

        // TODO optimalize this begin by detecting when all controllers have erased its flash
        // TODO also, right now the gateway controller sends to other controlles to erase flash after it is done.
        // TODO that slows things down
        await sleep(20000);

        {
          //===========// WRITE //===========//
          logging.info("OTA WRITE");

          while (written < firmware.length) {
            if (index_to > firmware.length) {
              index_to = firmware.length;
            }

            const command_bytes = [COMMAND_FLAGS.FLAG_OTA_WRITE, 0x00, ...numberToBytes(written, 4), ...firmware.slice(index_from, index_to)];
            await this.interface.execute(command_bytes, null);

            written += index_to - index_from;

            const percentage = Math.floor((written * 10000) / firmware.length) / 100;
            logging.info(percentage + "%");
            this.interface.emit("ota_progress", percentage);

            index_from += chunk_size;
            index_to = index_from + chunk_size;
          }
        }

        await sleep(100);

        {
          //===========// END //===========//
          logging.info("OTA END");

          const command_bytes = [COMMAND_FLAGS.FLAG_OTA_END, 0x00, ...numberToBytes(written, 4)];
          await this.interface.execute(command_bytes, null);
        }

        await sleep(3000);

        logging.debug("Rebooting whole network...");

        const command_bytes = [COMMAND_FLAGS.FLAG_DEVICE_REBOOT_REQUEST];
        await this.interface.execute(command_bytes, null);

        logging.debug("Firmware written in " + (new Date().getTime() - start_timestamp) / 1000 + " seconds");

        this.interface.emit("ota_status", "success");

        resolve(null);
        return;
      } catch (e) {
        this.interface.emit("ota_status", "fail");
        reject(e);
        return;
      }
    })
      .then(() => {
        return this.disconnect();
      })

      .finally(() => {
        this.interface.releaseWakeLock();
        this.#updating = false;
      });
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

    const request_uuid = this.#getUUID();
    const bytes = [COMMAND_FLAGS.FLAG_DEVICE_CONFIG_REQUEST, ...numberToBytes(request_uuid, 4)];

    return this.interface.request(bytes, true).then(response => {
      let reader = new TnglReader(response);

      logging.verbose(`response.byteLength=${response.byteLength}`);

      if (reader.readFlag() !== COMMAND_FLAGS.FLAG_DEVICE_CONFIG_RESPONSE) {
        throw "InvalidResponseFlag";
      }

      const response_uuid = reader.readUint32();

      if (response_uuid != request_uuid) {
        throw "InvalidResponseUuid";
      }

      const error_code = reader.readUint8();

      logging.verbose(`error_code=${error_code}`);

      if (error_code === 0) {
        const config_size = reader.readUint32();
        logging.verbose(`config_size=${config_size}`);

        const config_bytes = reader.readBytes(config_size);
        logging.verbose(`config_bytes=${config_bytes}`);

        const decoder = new TextDecoder();
        const config = decoder.decode(new Uint8Array(config_bytes));
        logging.verbose(`config=${config}`);

        if (config.charAt(config.length - 1) == "\0") {
          logging.warn("NULL config character detected");
          return config.slice(0, config.length - 1);
        }

        return config;
      } else {
        throw "Fail";
      }
    });
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

    logging.info(`config_raw=${config_raw}`);

    const condif_object = JSON.parse(config_raw);
    const config = JSON.stringify(condif_object);

    logging.info(`config=${config}`);

    const encoder = new TextEncoder();
    const config_bytes = encoder.encode(config);
    const config_bytes_size = config.length;

    // make config update request
    const request_uuid = this.#getUUID();
    const bytes = [COMMAND_FLAGS.FLAG_CONFIG_UPDATE_REQUEST, ...numberToBytes(request_uuid, 4), ...numberToBytes(config_bytes_size, 4), ...config_bytes];
    return this.interface.request(bytes, true).then(response => {
      let reader = new TnglReader(response);

      logging.verbose(`response.byteLength=${response.byteLength}`);

      if (reader.readFlag() !== COMMAND_FLAGS.FLAG_CONFIG_UPDATE_RESPONSE) {
        throw "InvalidResponse";
      }

      const response_uuid = reader.readUint32();

      if (response_uuid != request_uuid) {
        throw "InvalidResponse";
      }

      const error_code = reader.readUint8();

      logging.verbose(`error_code=${error_code}`);

      if (error_code === 0) {
        logging.info("Write Config Success");
        // reboot device
        const payload = [COMMAND_FLAGS.FLAG_DEVICE_REBOOT_REQUEST];
        return this.interface.request(payload, false);
      } else {
        throw "Fail";
      }
    });
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

    const payload = [COMMAND_FLAGS.FLAG_DEVICE_REBOOT_REQUEST];
    return this.interface.execute(payload, null);
  }

  rebootDevice() {
    logging.debug("> Rebooting device...");

    const payload = [COMMAND_FLAGS.FLAG_DEVICE_REBOOT_REQUEST];
    return this.interface.request(payload, false);
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
        .catch(() => { })
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
    logging.debug("> Saving state...");

    const request_uuid = this.#getUUID();
    const payload = [COMMAND_FLAGS.FLAG_SAVE_STATE_REQUEST, ...numberToBytes(request_uuid, 4)];
    return this.interface.execute(payload, null);
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

  hideHomeButton() {
    logging.debug("> Hiding home button...");

    if (!detectSpectodaConnect()) {
      return Promise.reject("PlatformNotSupported");
    }

    return window.flutter_inappwebview.callHandler("hideHomeButton");
  }

  // option:
  //  0 = no restriction, 1 = portrait, 2 = landscape
  setOrientation(option) {
    logging.debug("> Setting orientation...");

    if (!detectSpectodaConnect()) {
      return Promise.reject("PlatformNotSupported");
    }

    if (typeof option !== "number") {
      return Promise.reject("InvalidOption");
    }

    if (option < 0 || option > 2) {
      return Promise.reject("InvalidOption");
    }

    return window.flutter_inappwebview.callHandler("setOrientation", option);
  }

  // 0.9.4

  readNetworkSignature() {
    logging.debug("> Reading network signature...");

    const request_uuid = this.#getUUID();
    const bytes = [COMMAND_FLAGS.FLAG_READ_OWNER_SIGNATURE_REQUEST, ...numberToBytes(request_uuid, 4)];

    return this.interface.request(bytes, true).then(response => {
      let reader = new TnglReader(response);

      logging.verbose(`response.byteLength=${response.byteLength}`);

      if (reader.readFlag() !== COMMAND_FLAGS.FLAG_READ_OWNER_SIGNATURE_RESPONSE) {
        throw "InvalidResponseFlag";
      }

      const response_uuid = reader.readUint32();

      if (response_uuid != request_uuid) {
        throw "InvalidResponseUuid";
      }

      const error_code = reader.readUint8();
      logging.verbose(`error_code=${error_code}`);

      if (error_code !== 0) {
        throw "Fail";
      }

      const signature_bytes = reader.readBytes(16);
      logging.debug(`signature_bytes=${signature_bytes}`);

      const signature_string = uint8ArrayToHexString(signature_bytes);
      logging.debug(`signature_string=${signature_string}`);

      logging.info(`> Network Signature: ${signature_string}`);

      return signature_string;
    });
  }

  writeControllerCodes(pcb_code, product_code) {
    logging.debug("> Writing controller codes...");

    const request_uuid = this.#getUUID();
    const bytes = [COMMAND_FLAGS.FLAG_WRITE_CONTROLLER_CODES_REQUEST, ...numberToBytes(request_uuid, 4), ...numberToBytes(pcb_code, 2), ...numberToBytes(product_code, 2)];

    return this.interface.request(bytes, true).then(response => {
      let reader = new TnglReader(response);

      logging.verbose(`response.byteLength=${response.byteLength}`);

      if (reader.readFlag() !== COMMAND_FLAGS.FLAG_WRITE_CONTROLLER_CODES_RESPONSE) {
        throw "InvalidResponseFlag";
      }

      const response_uuid = reader.readUint32();

      if (response_uuid != request_uuid) {
        throw "InvalidResponseUuid";
      }

      const error_code = reader.readUint8();
      logging.verbose(`error_code=${error_code}`);

      if (error_code !== 0) {
        throw "Fail";
      }
    });
  }

  readControllerCodes() {
    logging.debug("> Requesting controller codes ...");

    const request_uuid = this.#getUUID();
    const bytes = [COMMAND_FLAGS.FLAG_READ_CONTROLLER_CODES_REQUEST, ...numberToBytes(request_uuid, 4)];

    return this.interface.request(bytes, true).then(response => {
      let reader = new TnglReader(response);

      logging.verbose("response=", response);

      if (reader.readFlag() !== COMMAND_FLAGS.FLAG_READ_CONTROLLER_CODES_RESPONSE) {
        throw "InvalidResponseFlag";
      }

      const response_uuid = reader.readUint32();

      if (response_uuid != request_uuid) {
        throw "InvalidResponseUuid";
      }

      const error_code = reader.readUint8();

      logging.verbose(`error_code=${error_code}`);

      if (error_code !== 0) {
        throw "Fail";
      }

      const pcb_code = reader.readUint16();
      const product_code = reader.readUint16();

      logging.debug(`pcb_code=${pcb_code}`);
      logging.debug(`product_code=${product_code}`);

      logging.info(`> Controller Codes: pcb_code=${pcb_code}, product_code=${product_code}`);

      return { pcb_code: pcb_code, product_code: product_code };
    });
  }

  getEmittedEvents(ids) {

    // Check if ids is not an array and make it an array if necessary
    if (!Array.isArray(ids)) {
      ids = [ids];
    }

    return this.readEventHistory()
      .catch(() => { logging.warn("Failed to read event history"); })
      .then(() => {

        const events = [];

        for (const id of ids) {
          for (const event in this.#eventHistory[id]) {
            events.push(this.#eventHistory[id][event]);
          }
        }

        // Step 2: Sort the events by timestamp
        events.sort((a, b) => b.timestamp - a.timestamp);

        return JSON.stringify(events); // need to stringify because of deleting references to objects
      });
  }

  emitEvents(events) {

    const EVENT_VALUE_TYPE = {
      TIMESTAMP: 32,
      LABEL: 31,
      PERCENTAGE: 30,
      NUMBER: 29,
      VALUE_ARRAY: 27,
      COLOR: 26,
      TRIPLE: 25,
      PIXELS: 19,
      VALUE_ADDRESS: 18,
      BOOL: 2,
      NULL: 1,
      UNDEFINED: 0,
    };


    if (typeof events === "string") {
      events = JSON.parse(events);
    }

    // Check if events is not an array and make it an array if necessary
    if (!Array.isArray(events)) {
      events = [events];
    }


    for (const event of events) {

      switch (event.type) {
        case "timestamp":
        case EVENT_VALUE_TYPE.TIMESTAMP:
          this.emitTimestampEvent(event.label, event.value, event.id);
          break;
        case "label":
        case EVENT_VALUE_TYPE.LABEL:
          this.emitLabelEvent(event.label, event.value, event.id);
          break;
        case "percentage":
        case EVENT_VALUE_TYPE.PERCENTAGE:
          this.emitPercentageEvent(event.label, event.value, event.id);
          break;
        // case EVENT_VALUE_TYPE.NUMBER:
        //   this.emitNumberEvent(event.label, event.value, event.id);
        //   break;
        // case EVENT_VALUE_TYPE.VALUE_ARRAY:
        //   this.emitValueArrayEvent(event.label, event.value, event.id);
        //   break;
        case "color":
        case EVENT_VALUE_TYPE.COLOR:
          this.emitColorEvent(event.label, event.value, event.id);
          break;
        // case EVENT_VALUE_TYPE.TRIPLE:
        //   this.emitTripleEvent(event.label, event.value, event.id);
        //   break;
        // case EVENT_VALUE_TYPE.PIXELS:
        //   this.emitPixelsEvent(event.label, event.value, event.id);
        //   break;
        // case EVENT_VALUE_TYPE.VALUE_ADDRESS:
        //   this.emitValueAddressEvent(event.label, event.value, event.id);
        //   break;
        // case EVENT_VALUE_TYPE.BOOL:
        //   this.emitBoolEvent(event.label, event.value, event.id);
        //   break;
        // case EVENT_VALUE_TYPE.NULL:
        //   this.emitNullEvent(event.label, event.value, event.id);
        //   break;
        case "none":
        case EVENT_VALUE_TYPE.UNDEFINED:
          this.emitEvent(event.label, event.id);
          break;
        default:
          logging.error(`Unknown event type: ${event.type}`);
          break;
      }
    }
  }

}