import { TnglCodeParser } from "./SpectodaParser.js";
import { TimeTrack } from "./TimeTrack.js";
import "./TnglReader.js";
import { TnglReader } from "./TnglReader.js";
import "./TnglWriter.js";
import {
  colorToBytes,
  computeTnglFingerprint,
  cssColorToHex,
  detectNode,
  detectSpectodaConnect,
  hexStringToUint8Array,
  labelToBytes,
  numberToBytes,
  percentageToBytes,
  sleep,
  strMacToBytes,
  stringToBytes,
  uint8ArrayToHexString,
} from "./functions";
import { changeLanguage, t } from "./i18n.js";
import { logging } from "./logging";
import { COMMAND_FLAGS } from "./src/Spectoda_JS.js";

import { io } from "socket.io-client";
import customParser from "socket.io-msgpack-parser";
import { WEBSOCKET_URL } from "./SpectodaWebSocketsConnector";
import "./TnglReader";
import "./TnglWriter";
import { SpectodaRuntime, allEventsEmitter } from "./src/SpectodaRuntime";

export class Spectoda {
  #parser;

  #uuidCounter;
  #ownerSignature;
  #ownerKey;
  #adopting;
  #updating;

  #saveStateTimeoutHandle;

  #connectionState;
  #websocketConnectionState;

  #criteria;
  #reconnecting;
  #autonomousConnection;
  #wakeLock;
  #isPrioritizedWakelock;

  #reconnectRC;

  #clockSyncIntervalHandle;

  constructor(connectorType = "default", reconnecting = true) {
    this.#parser = new TnglCodeParser();

    this.timeline = new TimeTrack(0, true);

    this.#uuidCounter = Math.floor(Math.random() * 0xffffffff);

    this.#ownerSignature = "00000000000000000000000000000000";
    this.#ownerKey = "00000000000000000000000000000000";

    this.runtime = new SpectodaRuntime(this);

    if (connectorType) {
      try {
        this.runtime.assignConnector(connectorType);
      } catch (e) {
        logging.error(e);
      }
    }

    this.#adopting = false;
    this.#updating = false;

    this.#reconnecting = reconnecting ? true : false;
    this.#connectionState = "disconnected";
    this.#websocketConnectionState = "disconnected";

    this.runtime.onConnected = event => {
      logging.debug("> Runtime connected");
    };

    this.runtime.onDisconnected = event => {
      logging.debug("> Runtime disconnected");

      const TIME = 2500;

      if (this.#getConnectionState() === "connected" && this.#reconnecting) {
        logging.debug(`Reconnecting in ${TIME}ms..`);
        this.#setConnectionState("connecting");

        return sleep(TIME)
          .then(() => {
            return this.#connect(true);
          })
          .then(() => {
            logging.info("Reconnection successful.");
            this.#setConnectionState("connected");
          })
          .catch(error => {
            logging.warn("Reconnection failed:", error);
            this.#setConnectionState("disconnected");
          });
      } else {
        this.#setConnectionState("disconnected");
      }
    };

    this.#clockSyncIntervalHandle = undefined;
    this.#resetClockSyncInterval();
  }

  #resetClockSyncInterval() {
    clearInterval(this.#clockSyncIntervalHandle);

    // auto clock sync loop
    this.#clockSyncIntervalHandle = setInterval(() => {
      // TODO move this to runtime
      if (!this.#updating && this.runtime.connector) {
        // this.connected().then(connected => {
        //   if (connected) {
        //     this.syncClock().then(() => {
        //       return this.syncTimeline();
        //     }).catch(error => {
        //       logging.warn("Catched error:", error);
        //     });
        //   }
        // });

        if (this.#getConnectionState() === "connected") {
          return (
            this.syncClock()
              // .then(() => {
              //   return this.syncTimeline();
              // })
              // .then(() => {
              //   return this.syncEventHistory(); // ! this might slow down stuff for Bukanyr
              // })
              .catch(error => {
                logging.warn(error);
              })
          );
        } else if (this.#getConnectionState() === "disconnected" && this.#autonomousConnection) {
          return this.#connect(true).catch(error => {
            logging.warn(error);
          });
        }
      }
    }, 8000); // ! it is set to 8000ms because of the 10s timeout in the serial connector
  }

  #setWebSocketConnectionState(websocketConnectionState) {
    switch (websocketConnectionState) {
      case "connecting":
        if (websocketConnectionState !== this.#websocketConnectionState) {
          logging.warn("> Spectoda websockets connecting");
          this.#websocketConnectionState = websocketConnectionState;
          this.runtime.emit("connecting-websockets");
        }
        break;
      case "connected":
        if (websocketConnectionState !== this.#websocketConnectionState) {
          logging.warn("> Spectoda websockets connected");
          this.#websocketConnectionState = websocketConnectionState;
          this.runtime.emit("connected-websockets");
        }
        break;
      case "disconnecting":
        if (websocketConnectionState !== this.#websocketConnectionState) {
          logging.warn("> Spectoda websockets disconnecting");
          this.#connectionState = connectionState;
          this.runtime.emit("disconnecting-websockets");
        }
        break;
      case "disconnected":
        if (websocketConnectionState !== this.#websocketConnectionState) {
          logging.warn("> Spectoda websockets disconnected");
          this.#websocketConnectionState = websocketConnectionState;
          this.runtime.emit("disconnected-websockets");
        }
        break;
      default:
        throw `InvalidState: ${websocketConnectionState}`;
    }
  }

  #setConnectionState(connectionState) {
    switch (connectionState) {
      case "connecting":
        if (connectionState !== this.#connectionState) {
          logging.warn("> Spectoda connecting");
          this.#connectionState = connectionState;
          // TODO find out how to handle hacky instance return or other way so it will also work through websockets
          this.runtime.emit("connecting" /*{ target: this }*/);
        }
        break;
      case "connected":
        if (connectionState !== this.#connectionState) {
          logging.warn("> Spectoda connected");
          this.#connectionState = connectionState;
          // TODO find out how to handle hacky instance return or other way so it will also work through websockets
          this.runtime.emit("connected" /*{ target: this }*/);
        }
        break;
      case "disconnecting":
        if (connectionState !== this.#connectionState) {
          logging.warn("> Spectoda disconnecting");
          this.#connectionState = connectionState;
          // TODO find out how to handle hacky instance return or other way so it will also work through websockets
          this.runtime.emit("disconnecting" /*{ target: this }*/);
        }
        break;
      case "disconnected":
        if (connectionState !== this.#connectionState) {
          logging.warn("> Spectoda disconnected");
          this.#connectionState = connectionState;
          // TODO find out how to handle hacky instance return or other way so it will also work through websockets
          this.runtime.emit("disconnected" /*{ target: this }*/);
        }
        break;
      default:
        logging.error("#setConnectionState(): InvalidState");
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
    logging.debug("> Activating wakeLock...");

    if (prioritized) {
      this.#isPrioritizedWakelock = true;
    }

    try {
      if (detectNode()) {
        // NOP
      } else if (detectSpectodaConnect()) {
        window.flutter_inappwebview.callHandler("setWakeLock", true);
      } else {
        navigator.wakeLock
          .request("screen")
          .then(Wakelock => {
            logging.info("Web Wakelock activated.");
            this.#wakeLock = Wakelock;
          })
          .catch(() => {
            logging.warn("Web Wakelock activation failed.");
          });
      }
      return Promise.resolve();
    } catch (e) {
      return Promise.reject(e);
    }
  }

  releaseWakeLock(prioritized = false) {
    logging.debug("> Deactivating wakeLock...");

    if (prioritized) {
      this.#isPrioritizedWakelock = false;
    } else if (this.#isPrioritizedWakelock) {
      return Promise.resolve();
    }

    try {
      if (detectNode()) {
        // NOP
      } else if (detectSpectodaConnect()) {
        window.flutter_inappwebview.callHandler("setWakeLock", false);
      } else {
        this.#wakeLock
          ?.release()
          .then(() => {
            logging.info("Web Wakelock deactivated.");
            this.#wakeLock = null;
          })
          .catch(() => {
            logging.warn("Web Wakelock deactivation failed.");
          });
      }
      return Promise.resolve();
    } catch (e) {
      return Promise.reject(e);
    }
  }

  setConnector(connector_type) {
    return this.runtime.assignConnector(connector_type);
  }

  /**
   * @alias this.setConnector
   */
  assignConnector(connector_type) {
    return this.setConnector(connector_type);
  }

  assignOwnerSignature(ownerSignature) {
    return this.#setOwnerSignature(ownerSignature);
  }

  setOwnerSignature(ownerSignature) {
    return this.#setOwnerSignature(ownerSignature);
  }

  getOwnerSignature() {
    return this.#ownerSignature;
  }

  assignOwnerKey(ownerKey) {
    return this.#setOwnerKey(ownerKey);
  }

  setOwnerKey(ownerKey) {
    return this.#setOwnerKey(ownerKey);
  }

  getOwnerKey() {
    return this.#ownerKey;
  }

  /**
   * @param {Object} options
   * @param {string?} options.signature - The network signature.
   * @param {string?} options.key - The network key.
   * @param {Object} [options.meta] - info about the receiver
   * @param {boolean?} [options.sessionOnly] - Whether to enable remote control for the current session only.
   */

  async enableRemoteControl({ signature, key, sessionOnly, meta }) {
    logging.debug("> Connecting to Remote Control");

    if (this.socket) {
      this.socket.removeAllListeners(); // Removes all listeners attached to the socket
      this.socket.disconnect();

      for (let listener of this.socket?.___SpectodaListeners) {
        listener();
      }
    }

    this.socket = io(WEBSOCKET_URL, {
      parser: customParser,
      extraHeaders: {
        "Host": "cloud.host.spectoda.com"
      },
      rejectUnauthorized: false
    });

    this.socket.connect();
    this.requestWakeLock(true);

    const setConnectionSocketData = async () => {
      // TODO - find way how to do getCOnnectedPeersInfo with waiting for wasm load
      // const peers = await this.getConnectedPeersInfo();
      // logging.debug("peers", peers);
      // this.socket.emit("set-connection-data", peers);
      this.socket.emit("set-meta-data", meta);
    };

    this.socket.___SpectodaListeners = [
      this.on("connected", async () => {
        setConnectionSocketData();
      }),
      this.on("disconnected", () => {
        this.socket.emit("set-connection-data", null);
      }),
      allEventsEmitter.on("on", ({ name, args }) => {
        try {
          logging.verbose("event", name, args);
          // circular json, function ... can be issues, that's why wrapped
          this.socket.emit("event", { name, args });
        } catch (err) {
          console.error(err);
        }
      }),
    ];

    globalThis.allEventsEmitter = allEventsEmitter;

    this.socket.on("func", async (payload, callback) => {
      if (!callback) {
        logging.error("No callback provided");
        return;
      }

      let { functionName, arguments: args } = payload;

      // call internal class function await this[functionName](...args)

      // call internal class function
      try {
        if (functionName === "debug") {
          logging.debug(...args);
          return callback({ status: "success", message: "debug", payload: args });
        }
        if (functionName === "assignOwnerSignature" || functionName === "assignOwnerKey") {
          return callback({ status: "success", message: "assign key/signature is ignored on remote." });
        }

        if (functionName === "updateDeviceFirmware" || functionName === "updateNetworkFirmware") {
          if (Array.isArray(args?.[0])) {
            args[0] = new Uint8Array(args[0]);
          } else if (typeof args?.[0] === "object") {
            const arr = Object.values(args[0]);
            const uint8Array = new Uint8Array(arr);
            args[0] = uint8Array;
          }
        }
        const result = await this[functionName](...args);
        callback({ status: "success", result });
      } catch (e) {
        logging.error(e);
        callback({ status: "error", error: e });
      }
    });

    return await new Promise((resolve, reject) => {
      this.socket.on("disconnect", () => {
        this.#setWebSocketConnectionState("disconnected");
      });

      this.socket.on("connect", async () => {
        logging.setLogCallback((...e) => {
          console.log(...e);
          this.socket.emit("event", { name: "log", args: e });
        });

        logging.setWarnCallback((...e) => {
          console.warn(...e);
          this.socket.emit("event", { name: "log-warn", args: e });
        });

        logging.setErrorCallback((...e) => {
          console.error(...e);
          this.socket.emit("event", { name: "log-error", args: e });
        });

        if (sessionOnly) {
          // Handle session-only logic
          const response = await this.socket.emitWithAck("join-session", null);
          const roomNumber = response?.roomNumber;

          if (response?.status === "success") {
            this.#setWebSocketConnectionState("connected");
            setConnectionSocketData();

            logging.debug("Remote control session joined successfully", roomNumber);

            resolve({ status: "success", roomNumber });
          } else {
            this.#setWebSocketConnectionState("disconnected");
            logging.debug("Remote control session join failed, does not exist");
          }
        } else if (signature) {
          // Handle signature-based logic
          this.#setWebSocketConnectionState("connecting");
          logging.debug("Joining network remotely", signature, key);
          await this.socket
            .emitWithAck("join", { signature, key })
            .then(e => {
              this.#setWebSocketConnectionState("connected");
              setConnectionSocketData();

              logging.info("> Connected and joined network remotely");

              resolve({ status: "success" });
            })
            .catch(e => {
              this.#setWebSocketConnectionState("disconnected");
              reject(e);
            });
        }
      });
    });
  }

  disableRemoteControl() {
    logging.setLogCallback(console.log);
    logging.setWarnCallback(console.warn);
    logging.setErrorCallback(console.error);

    logging.debug("> Disconnecting from the Remote Control");

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
    return this.runtime.addEventListener(event, callback);
  }
  /**
   * @alias this.addEventListener
   */
  on(event, callback) {
    return this.runtime.on(event, callback);
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

  scan(scan_criteria = [{}], scan_period = 5000) {
    logging.verbose(`scan(scan_criteria=${scan_criteria}, scan_period=${scan_period})`);

    logging.debug("> Scanning Spectoda Controllers...");
    return this.runtime.scan(scan_criteria, scan_period);
  }

  adopt(newDeviceName = null, newDeviceId = null, tnglCode = null, ownerSignature = null, ownerKey = null, autoSelect = false) {
    logging.verbose(`adopt(newDeviceName=${newDeviceName}, newDeviceId=${newDeviceId}, tnglCode=${tnglCode}, ownerSignature=${ownerSignature}, ownerKey=${ownerKey}, autoSelect=${autoSelect})`);

    if (this.#adopting) {
      return Promise.reject("AdoptingInProgress");
    }

    this.#adopting = true;

    this.#setConnectionState("connecting");

    const criteria = /** @type {any} */ ([{ adoptionFlag: true }]);

    return (autoSelect ? this.runtime.autoSelect(criteria, 4000) : this.runtime.userSelect(criteria, 60000))
      .then(() => {
        return this.runtime.connect(10000, true);
      })
      .then(() => {
        const owner_signature_bytes = hexStringToUint8Array(this.#ownerSignature, 16);
        const owner_key_bytes = hexStringToUint8Array(this.#ownerKey, 16);

        logging.verbose("owner_signature_bytes", owner_signature_bytes);
        logging.verbose("owner_key_bytes", owner_key_bytes);

        const request_uuid = this.#getUUID();
        const bytes = [COMMAND_FLAGS.FLAG_ADOPT_REQUEST, ...numberToBytes(request_uuid, 4), ...owner_signature_bytes, ...owner_key_bytes /*, ...device_name_bytes, ...numberToBytes(device_id, 1)*/];

        logging.debug("> Adopting device...");
        logging.verbose(bytes);

        return this.runtime
          .request(bytes, true)
          .then(response => {
            let reader = new TnglReader(response);

            logging.verbose("response=", response);

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

  // devices: [ {name:"Lampa 1", mac:"12:34:56:78:9a:bc"}, {name:"Lampa 2", mac:"12:34:56:78:9a:bc"} ]

  #connect(autoConnect) {
    logging.verbose(`#connect(autoConnect=${autoConnect})`);

    logging.debug("> Connecting Spectoda Controller");

    this.#setConnectionState("connecting");

    logging.debug("> Selecting controller...");
    return (autoConnect ? this.runtime.autoSelect(this.#criteria, 1000, 10000) : this.runtime.userSelect(this.#criteria))
      .then(() => {
        logging.debug("> Connecting controller...");
        return this.runtime.connect();
      })
      .then(connectedDeviceInfo => {
        this.#resetClockSyncInterval();

        logging.debug("> Synchronizing Network State...");
        return (this.timeline.paused() ? this.requestTimeline() : this.syncTimeline())
          .catch(e => {
            logging.error("Timeline sync after reconnection failed:", e);
          })
          .then(() => {
            return this.syncEventHistory();
          })
          .catch(e => {
            logging.error("History sync after reconnection failed:", e);
          })
          .then(() => {
            return this.runtime.connected();
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

        this.#setConnectionState("disconnected");

        if (typeof error != "string") {
          throw "ConnectionFailed";
        } else {
          throw error;
        }
      });
  }

  connect(criteria = null, autoConnect = true, ownerSignature = null, ownerKey = null, connectAny = false, fwVersion = "", autonomousConnection = false, overrideConnection = false) {
    logging.verbose(
      `connect(criteria=${criteria}, autoConnect=${autoConnect}, ownerSignature=${ownerSignature}, ownerKey=${ownerKey}, connectAny=${connectAny}, fwVersion=${fwVersion}, autonomousConnection=${autonomousConnection}, overrideConnection=${overrideConnection})`,
    );

    this.#autonomousConnection = autonomousConnection;

    if (!overrideConnection && this.#getConnectionState() === "connecting") {
      return Promise.reject("ConnectingInProgress");
    }

    if (ownerSignature) {
      this.#setOwnerSignature(ownerSignature);
    }

    if (ownerKey) {
      this.#setOwnerKey(ownerKey);
    }

    if (typeof criteria === "string") {
      criteria = JSON.parse(criteria);
    }

    // if criteria is object or array of obects
    if (criteria && typeof criteria === "object") {
      // if criteria is not an array, make it an array
      if (!Array.isArray(criteria)) {
        criteria = [criteria];
      }
    }
    //
    else {
      criteria = [{}];
    }

    if (!connectAny) {
      // add ownerSignature to each criteria
      for (let i = 0; i < criteria.length; i++) {
        criteria[i].ownerSignature = this.#ownerSignature;
      }
    }

    if (typeof fwVersion == "string" && fwVersion.match(/(!?)([\d]+).([\d]+).([\d]+)/)) {
      for (let i = 0; i < criteria.length; i++) {
        criteria[i].fwVersion = fwVersion;
      }
    }

    this.#criteria = criteria;

    return this.#connect(autoConnect);
  }

  disconnect() {
    this.#autonomousConnection = false;

    if (this.#getConnectionState() === "disconnected") {
      Promise.reject("DeviceAlreadyDisconnected");
    }

    logging.debug(`> Disconnecting controller...`);
    this.#setConnectionState("disconnecting");

    return this.runtime.disconnect().finally(() => {
      this.#setConnectionState("disconnected");
    });
  }

  connected() {
    return this.#getConnectionState() === "connected" ? this.runtime.connected() : Promise.resolve(null);
  }

  //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

  async preprocessTngl(tngl_code) {
    logging.verbose(`preprocessTngl(tngl_code=${tngl_code})`);

    // 1st stage: preprocess the code

    let processed_tngl_code = tngl_code;

    const regexPUBLISH_TNGL_TO_API = /PUBLISH_TNGL_TO_API\s*\(\s*"([^"]*)"\s*,\s*`([^`]*)`\s*\);?/ms;
    const regexINJECT_TNGL_FROM_API = /INJECT_TNGL_FROM_API\s*\(\s*"([^"]*)"\s*\);?/ms;

    for (let requests = 0; requests < 64; requests++) {
      const match = regexPUBLISH_TNGL_TO_API.exec(processed_tngl_code);
      if (!match) {
        break;
      }

      logging.verbose(match);

      const name = match[1];
      const id = encodeURIComponent(name);
      const tngl = match[2];

      try {
        logging.verbose(`sendTnglToApi({ id=${id}, name=${name}, tngl=${tngl} })`);
        await sendTnglToApi({ id, name, tngl });
        processed_tngl_code = processed_tngl_code.replace(match[0], "");
      } catch (e) {
        logging.error(`Failed to send "${name}" to TNGL API`);
        throw "SendTnglToApiFailed";
      }
    }

    for (let requests = 0; requests < 64; requests++) {
      const match = regexINJECT_TNGL_FROM_API.exec(processed_tngl_code);
      if (!match) {
        break;
      }

      logging.verbose(match);

      const name = match[1];
      const id = encodeURIComponent(name);

      try {
        logging.verbose(`fetchTnglFromApiById({ id=${id} })`);
        const response = await fetchTnglFromApiById(id);
        processed_tngl_code = processed_tngl_code.replace(match[0], response.tngl);
      } catch (e) {
        logging.error(`Failed to fetch "${name}" from TNGL API`, e);
        throw "FetchTnglFromApiFailed";
      }
    }

    // var code = `// Publishing TNGL as "${text_tngl_api_name}":\n/*\n${statements_body}*/\n`;
    // var code = `// Loaded TNGL "${text_tngl_api_name}": \n ${tnglCodeToInject}\n`;

    // 2nd stage, handle enum replacing
    const enums = this.#parser.getEnums();

    let enumRegexes = [];

    // regex creation
    for (let enum_name in enums) {
      const regex = new RegExp(`${enum_name}\\.(\\w+)`, "g");
      enumRegexes.push(regex);
    }

    // regex replacing
    for (let regex of enumRegexes) {
      processed_tngl_code = processed_tngl_code.replace(regex, (match, enum_value) => {
        for (let enum_name in enums) {
          let value = enums[enum_name][enum_value];

          if (value == undefined) continue;

          return value;
        }
        return match;
      });
    }

    //3rd stage handle #define replacing
    const defineRegex = new RegExp(`#define\\s+(\\w+)\\s+(\\w+)`, "g");

    // list all defines [{name: "NAME", value: "VALUE"}, ...]
    let defines = [];
    defines = [...processed_tngl_code.matchAll(defineRegex)].map(match => {
      return { name: match[1], value: match[2] };
    });

    processed_tngl_code = processed_tngl_code.replaceAll(defineRegex, "");

    for (let define of defines) {
      processed_tngl_code = processed_tngl_code.replaceAll(define.name, define.value);
    }

    logging.debug(processed_tngl_code);

    return processed_tngl_code;
  }

  // writes Tngl only if fingerprints does not match
  syncTngl(tngl_code, tngl_bytes = null) {
    logging.verbose(`syncTngl(tngl_code=${tngl_code}, tngl_bytes=${tngl_bytes})`);

    this.#resetClockSyncInterval();

    logging.debug("> Syncing Tngl code...");

    if (tngl_code === null && tngl_bytes === null) {
      return Promise.reject("InvalidParameters");
    }

    if (tngl_bytes === null) {
      tngl_bytes = this.#parser.parseTnglCode(tngl_code);
    }

    const reinterpret_bytecode = [COMMAND_FLAGS.FLAG_REINTERPRET_TNGL, ...numberToBytes(this.runtime.clock.millis(), 6), 0, ...numberToBytes(tngl_bytes.length, 4), ...tngl_bytes];
    this.runtime.evaluate(reinterpret_bytecode);

    return this.getTnglFingerprint().then(device_fingerprint => {
      return computeTnglFingerprint(tngl_bytes, "fingerprint").then(new_fingerprint => {
        for (let i = 0; i < device_fingerprint.length; i++) {
          if (device_fingerprint[i] !== new_fingerprint[i]) {
            return this.writeTngl(null, tngl_bytes);
          }
        }
      });
    });
  }

  writeTngl(tngl_code, tngl_bytes = null) {
    logging.verbose(`writeTngl(tngl_code=${tngl_code}, tngl_bytes=${tngl_bytes})`);

    this.#resetClockSyncInterval();

    logging.debug(`> Writing Tngl code...`);

    if (tngl_code === null && tngl_bytes === null) {
      return Promise.reject("InvalidParameters");
    }

    if (tngl_bytes === null) {
      tngl_bytes = this.#parser.parseTnglCode(tngl_code);
    }

    // const timeline_flags = this.timeline.paused() ? 0b00010000 : 0b00000000; // flags: [reserved,reserved,reserved,timeline_paused,reserved,reserved,reserved,reserved]
    // const timeline_bytecode = [COMMAND_FLAGS.FLAG_SET_TIMELINE, ...numberToBytes(this.runtime.clock.millis(), 6), ...numberToBytes(this.timeline.millis(), 4), timeline_flags];

    const reinterpret_bytecode = [COMMAND_FLAGS.FLAG_REINTERPRET_TNGL, ...numberToBytes(this.runtime.clock.millis(), 6), 0, ...numberToBytes(tngl_bytes.length, 4), ...tngl_bytes];

    // const payload = [...timeline_bytecode, ...reinterpret_bytecode];
    return this.runtime.execute(reinterpret_bytecode, "TNGL").then(() => {
      // logging.debug("Written");
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
  /**
   *
   * @param {*} event_label
   * @param {number|number[]} device_ids
   * @param {*} force_delivery

   * @returns
   */
  emitEvent(event_label, device_ids = [0xff], force_delivery = true) {
    logging.verbose(`emitEvent(label=${event_label},id=${device_ids},force=${force_delivery})`);

    this.#resetClockSyncInterval();

    // clearTimeout(this.#saveStateTimeoutHandle);
    // this.#saveStateTimeoutHandle = setTimeout(() => {
    //   this.saveState();
    // }, 5000);

    const func = device_id => {
      const payload = [COMMAND_FLAGS.FLAG_EMIT_EVENT, ...labelToBytes(event_label), ...numberToBytes(this.runtime.clock.millis() + 10, 6), numberToBytes(device_id, 1)];
      return this.runtime.execute(payload, force_delivery ? null : "E" + event_label + device_id);
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

    this.#resetClockSyncInterval();

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

    const func = device_id => {
      const payload = [COMMAND_FLAGS.FLAG_EMIT_TIMESTAMP_EVENT, ...numberToBytes(event_value, 4), ...labelToBytes(event_label), ...numberToBytes(this.runtime.clock.millis() + 10, 6), numberToBytes(device_id, 1)];
      return this.runtime.execute(payload, force_delivery ? null : "E" + event_label + device_id);
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

    this.#resetClockSyncInterval();

    // clearTimeout(this.#saveStateTimeoutHandle);
    // this.#saveStateTimeoutHandle = setTimeout(() => {
    //   this.saveState();
    // }, 5000);

    event_value = cssColorToHex(event_value);

    if (!event_value || !event_value.match(/#[\dabcdefABCDEF]{6}/g)) {
      logging.error("Invalid event value. event_value=", event_value);
      event_value = "#000000";
    }

    const func = device_id => {
      const payload = [COMMAND_FLAGS.FLAG_EMIT_COLOR_EVENT, ...colorToBytes(event_value), ...labelToBytes(event_label), ...numberToBytes(this.runtime.clock.millis() + 10, 6), numberToBytes(device_id, 1)];
      return this.runtime.execute(payload, force_delivery ? null : "E" + event_label + device_id);
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

    this.#resetClockSyncInterval();

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

    const func = device_id => {
      const payload = [COMMAND_FLAGS.FLAG_EMIT_PERCENTAGE_EVENT, ...percentageToBytes(event_value), ...labelToBytes(event_label), ...numberToBytes(this.runtime.clock.millis() + 10, 6), numberToBytes(device_id, 1)];
      return this.runtime.execute(payload, force_delivery ? null : "E" + event_label + device_id);
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

    this.#resetClockSyncInterval();

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
      const payload = [COMMAND_FLAGS.FLAG_EMIT_LABEL_EVENT, ...labelToBytes(event_value), ...labelToBytes(event_label), ...numberToBytes(this.runtime.clock.millis() + 10, 6), numberToBytes(device_id, 1)];
      return this.runtime.execute(payload, force_delivery ? null : "E" + event_label + device_id);
    };

    if (typeof device_ids === "object") {
      let promises = device_ids.map(func);
      return Promise.all(promises);
    } else {
      return func(device_ids);
    }
  }

  syncTimelineToDayTime() {
    logging.verbose(`syncTimelineToDayTime()`);

    const now = new Date();

    const hours = now.getHours();
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();
    const miliseconds = now.getMilliseconds();

    const timestamp = hours * 60 * 60 * 1000 + minutes * 60 * 1000 + seconds * 1000 + miliseconds;

    this.timeline.unpause();
    this.timeline.setMillis(timestamp);

    return this.syncTimeline();
  }

  syncTimeline(timestamp = undefined, paused = undefined) {
    logging.verbose(`syncTimeline(timestamp=${timestamp}, paused=${paused})`);

    if (timestamp === undefined) {
      timestamp = this.timeline.millis();
    }

    if (paused === undefined) {
      paused = this.timeline.paused();
    }

    logging.debug(`> Synchronizing timeline to ${timestamp}...`);

    const flags = paused ? 0b00010000 : 0b00000000; // flags: [reserved,reserved,reserved,timeline_paused,reserved,reserved,reserved,reserved]
    const payload = [COMMAND_FLAGS.FLAG_SET_TIMELINE, ...numberToBytes(this.runtime.clock.millis(), 6), ...numberToBytes(timestamp, 4), flags];
    return this.runtime.execute(payload, "TMLN");
  }

  syncClock() {
    logging.debug("> Syncing clock...");

    this.#resetClockSyncInterval();

    return this.runtime.syncClock().then(() => {
      logging.debug("> App clock synchronized");
    });
  }

  syncState(deviceId) {
    logging.debug("> Synchronizing state...");

    const request_uuid = this.#getUUID();
    const device_request = [COMMAND_FLAGS.FLAG_SYNC_STATE_REQUEST, ...numberToBytes(request_uuid, 4), deviceId];
    return this.runtime.request(device_request, false);
  }

  /**
   * downloads firmware and calls updateDeviceFirmware()
   * @param {string} url - whole URL of the firmware file
   */
  async fetchAndUpdateDeviceFirmware(url) {
    const fw = fetchFirmware(url);

    return this.updateDeviceFirmware(fw);
  }

  /**
   * downloads firmware and calls updateNetworkFirmware()
   * @param {string} url - whole URL of the firmware file
   */
  async fetchAndUpdateNetworkFirmware(url) {
    const fw = fetchFirmware(url);

    return this.updateNetworkFirmware(fw);
  }

  updateDeviceFirmware(firmware) {
    logging.verbose(`updateDeviceFirmware(firmware.length=${firmware?.length})`);

    logging.debug(`> Updating Controller FW...`);

    if (!firmware || firmware.length < 10000) {
      logging.error("Invalid firmware");
      return Promise.reject("InvalidFirmware");
    }

    return Promise.resolve()
      .then(() => {
        return this.requestWakeLock().catch(e => {
          logging.error("Failed to acquire wake lock", e);
        });
      })
      .then(() => {
        return this.runtime.updateFW(firmware).finally(() => {
          return this.runtime.disconnect();
        });
      })
      .finally(() => {
        return this.releaseWakeLock().catch(e => {
          logging.error("Failed to release wake lock", e);
        });
      });
  }

  updateNetworkFirmware(firmware) {
    logging.verbose(`updateNetworkFirmware(firmware.length=${firmware?.length})`);

    logging.debug(`> Updating Network FW...`);

    if (!firmware || firmware.length < 10000) {
      logging.error("Invalid firmware");
      return Promise.reject("InvalidFirmware");
    }

    this.#updating = true;

    this.requestWakeLock().catch(e => {
      logging.error("Failed to acquire wake lock", e);
    });

    return new Promise(async (resolve, reject) => {
      // const chunk_size = detectAndroid() ? 480 : 3984; // must be modulo 16
      // const chunk_size = 992; // must be modulo 16
      const chunk_size = detectSpectodaConnect() ? 480 : 3984;

      let index_from = 0;
      let index_to = chunk_size;

      let written = 0;

      logging.setLoggingLevel(logging.level - 1);

      logging.info("OTA UPDATE");
      logging.verbose(firmware);

      const start_timestamp = new Date().getTime();

      await sleep(100);

      try {
        this.runtime.emit("ota_status", "begin");

        {
          //===========// RESET //===========//
          logging.info("OTA RESET");

          const command_bytes = [COMMAND_FLAGS.FLAG_OTA_RESET, 0x00, ...numberToBytes(0x00000000, 4)];
          await this.runtime.execute(command_bytes, null);
        }

        await sleep(100);

        {
          //===========// BEGIN //===========//
          logging.info("OTA BEGIN");

          const command_bytes = [COMMAND_FLAGS.FLAG_OTA_BEGIN, 0x00, ...numberToBytes(firmware.length, 4)];
          await this.runtime.execute(command_bytes, null, 20000);
        }

        // TODO optimalize this begin by detecting when all controllers have erased its flash
        // TODO also, right now the gateway controller sends to other controlles to erase flash after it is done.
        // TODO that slows things down
        await sleep(8000); // ! keep this below 10 seconds to avoid connection timeout

        {
          //===========// WRITE //===========//
          logging.info("OTA WRITE");

          while (written < firmware.length) {
            if (index_to > firmware.length) {
              index_to = firmware.length;
            }

            const command_bytes = [COMMAND_FLAGS.FLAG_OTA_WRITE, 0x00, ...numberToBytes(written, 4), ...firmware.slice(index_from, index_to)];
            await this.runtime.execute(command_bytes, null, 20000);

            written += index_to - index_from;

            const percentage = Math.floor((written * 10000) / firmware.length) / 100;
            logging.info(percentage + "%");
            this.runtime.emit("ota_progress", percentage);

            index_from += chunk_size;
            index_to = index_from + chunk_size;
          }
        }

        await sleep(1000);

        {
          //===========// END //===========//
          logging.info("OTA END");

          const command_bytes = [COMMAND_FLAGS.FLAG_OTA_END, 0x00, ...numberToBytes(written, 4)];
          await this.runtime.execute(command_bytes, null, 20000);
        }

        await sleep(3000);

        await this.rebootNetwork();

        logging.debug("> Firmware written in " + (new Date().getTime() - start_timestamp) / 1000 + " seconds");

        this.runtime.emit("ota_status", "success");

        resolve(null);
        return;
      } catch (e) {
        this.runtime.emit("ota_status", "fail");
        reject(e);
        return;
      }
    })
      .then(() => {
        return this.runtime.disconnect();
      })

      .finally(() => {
        this.releaseWakeLock().catch(e => {
          logging.error("Failed to release wake lock", e);
        });
        this.#updating = false;

        logging.setLoggingLevel(logging.level + 1);
      });
  }

  async updatePeerFirmware(peer) {
    logging.verbose(`updatePeerFirmware(peer=${peer})`);

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

    return this.runtime.request(bytes, true).then(response => {
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

    return this.runtime.request(bytes, true).then(response => {
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

    logging.verbose(`config_raw=${config_raw}`);

    const condif_object = JSON.parse(config_raw);
    const config = JSON.stringify(condif_object);

    logging.verbose(`config=${config}`);

    const encoder = new TextEncoder();
    const config_bytes = encoder.encode(config);
    const config_bytes_size = config.length;

    // make config update request
    const request_uuid = this.#getUUID();
    const bytes = [COMMAND_FLAGS.FLAG_CONFIG_UPDATE_REQUEST, ...numberToBytes(request_uuid, 4), ...numberToBytes(config_bytes_size, 4), ...config_bytes];
    return this.runtime.request(bytes, true).then(response => {
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
        return this.runtime.request(payload, false);
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

    return this.runtime.execute(request_bytes, "CONF").then(() => {
      logging.debug("> Rebooting network...");
      const command_bytecode = [COMMAND_FLAGS.FLAG_DEVICE_REBOOT_REQUEST];
      return this.runtime.execute(command_bytecode, null);
    });
  }

  requestTimeline() {
    logging.debug("> Requesting timeline...");

    const request_uuid = this.#getUUID();
    const bytes = [COMMAND_FLAGS.FLAG_TIMELINE_REQUEST, ...numberToBytes(request_uuid, 4)];

    return this.runtime.request(bytes, true).then(response => {
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
        this.timeline.setState(timeline_timestamp + (this.runtime.clock.millis() - clock_timestamp), false);
      }
    });
  }

  // Code.device.runtime.execute([240,1,0,0,0,5],null)
  rebootNetwork() {
    logging.debug("> Rebooting network...");

    const payload = [COMMAND_FLAGS.FLAG_DEVICE_REBOOT_REQUEST];
    return this.runtime.execute(payload, null);
  }

  rebootDevice() {
    logging.debug("> Rebooting device...");

    const payload = [COMMAND_FLAGS.FLAG_DEVICE_REBOOT_REQUEST];
    return this.runtime.request(payload, false);
  }

  rebootAndDisconnectDevice() {
    logging.debug("> Rebooting and disconnecting device...");

    const payload = [COMMAND_FLAGS.FLAG_DEVICE_REBOOT_REQUEST];
    return this.runtime.request(payload, false).then(() => {
      return this.disconnect();
    });
  }

  removeOwner() {
    logging.debug("> Removing owner...");

    const request_uuid = this.#getUUID();
    const bytes = [COMMAND_FLAGS.FLAG_ERASE_OWNER_REQUEST, ...numberToBytes(request_uuid, 4)];

    return this.runtime.request(bytes, true).then(response => {
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

    return this.runtime.execute(bytes, true).then(() => {
      return this.rebootNetwork();
    });
  }

  getFwVersion() {
    logging.debug("> Requesting fw version...");

    const request_uuid = this.#getUUID();
    const bytes = [COMMAND_FLAGS.FLAG_FW_VERSION_REQUEST, ...numberToBytes(request_uuid, 4)];

    return this.runtime.request(bytes, true).then(response => {
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

      logging.info(`FW Version: ${version}`);

      return version.trim();
    });
  }

  getTnglFingerprint() {
    logging.debug("> Getting TNGL fingerprint...");

    const request_uuid = this.#getUUID();
    const bytes = [COMMAND_FLAGS.FLAG_TNGL_FINGERPRINT_REQUEST, ...numberToBytes(request_uuid, 4), 0];

    return this.runtime.request(bytes, true).then(response => {
      let reader = new TnglReader(response);

      logging.verbose("response:", response);

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

      logging.info("Controller TNGL Fingerprint: " + uint8ArrayToHexString(fingerprint));
      console.log("fingerprinting", fingerprint);
      return new Uint8Array(fingerprint);
    });
  }

  // datarate in bits per second
  setNetworkDatarate(datarate) {
    logging.debug(`> Setting network datarate to ${datarate} bsp...`);

    const request_uuid = this.#getUUID();
    const payload = [COMMAND_FLAGS.FLAG_CHANGE_DATARATE_REQUEST, ...numberToBytes(request_uuid, 4), ...numberToBytes(datarate, 4)];

    return this.runtime.execute(payload, null);
  }

  readRomPhyVdd33() {
    logging.debug("> Requesting rom_phy_vdd33...");

    const request_uuid = this.#getUUID();
    const bytes = [COMMAND_FLAGS.FLAG_ROM_PHY_VDD33_REQUEST, ...numberToBytes(request_uuid, 4)];

    return this.runtime.request(bytes, true).then(response => {
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

    return this.runtime.request(bytes, true).then(response => {
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
    logging.setLoggingLevel(level);
  }

  getConnectedPeersInfo() {
    logging.debug("> Requesting connected peers info...");

    const request_uuid = this.#getUUID();
    const bytes = [COMMAND_FLAGS.FLAG_CONNECTED_PEERS_INFO_REQUEST, ...numberToBytes(request_uuid, 4)];

    return this.runtime.request(bytes, true).then(response => {
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
        // this.runtime.eraseConnectedPeers();
        // this.runtime.setConnectedPeers(peers.map(x => x.mac));
        return peers;
      } else {
        throw "Fail";
      }
    });
  }

  syncEventHistory() {
    logging.debug("> Requesting event history bytecode...");

    const request_uuid = this.#getUUID();
    const bytes = [COMMAND_FLAGS.FLAG_EVENT_HISTORY_BC_REQUEST, ...numberToBytes(request_uuid, 4)];

    return this.runtime.request(bytes, true).then(response => {
      let reader = new TnglReader(response);

      logging.info(`response.byteLength=${response.byteLength}`);

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

        // this.runtime.spectoda.clearHistory();
        const erase_history_command = [COMMAND_FLAGS.FLAG_ERASE_EVENT_HISTORY_REQUEST, ...numberToBytes(request_uuid, 4)];
        this.runtime.evaluate(new Uint8Array(erase_history_command), 0x01);
        this.runtime.evaluate(new Uint8Array(historic_events_bytecode), 0x01);
      } else {
        throw "Fail";
      }
    });
  }

  eraseEventHistory() {
    logging.debug("> Erasing event history...");

    const request_uuid = this.#getUUID();
    const bytes = [COMMAND_FLAGS.FLAG_ERASE_EVENT_HISTORY_REQUEST, ...numberToBytes(request_uuid, 4)];

    return this.runtime.execute(bytes, true);
  }

  deviceSleep() {
    logging.debug("> Sleep device...");

    const request_uuid = this.#getUUID();
    const payload = [COMMAND_FLAGS.FLAG_SLEEP_REQUEST, ...numberToBytes(request_uuid, 4)];
    return this.runtime.request(payload, false);
  }

  networkSleep() {
    logging.debug("> Sleep network...");

    const request_uuid = this.#getUUID();
    const payload = [COMMAND_FLAGS.FLAG_SLEEP_REQUEST, ...numberToBytes(request_uuid, 4)];
    return this.runtime.execute(payload, null);
  }

  saveState() {
    logging.debug("> Saving state...");

    const request_uuid = this.#getUUID();
    const payload = [COMMAND_FLAGS.FLAG_SAVE_STATE_REQUEST, ...numberToBytes(request_uuid, 4)];
    return this.runtime.execute(payload, null);
  }

  getControllerInfo() {
    logging.debug("> Requesting controller info...");

    const request_uuid = this.#getUUID();
    const bytes = [DEVICE_FLAGS.FLAG_CONTROLLER_INFO_REQUEST, ...numberToBytes(request_uuid, 4)];

    return this.runtime.request(bytes, true).then(response => {
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
    logging.verbose("writeOwner(ownerSignature=", ownerSignature, "ownerKey=", ownerKey, ")");

    logging.debug("> Writing owner to device...");

    const owner_signature_bytes = hexStringToUint8Array(ownerSignature, 16);
    const owner_key_bytes = hexStringToUint8Array(ownerKey, 16);

    logging.verbose("owner_signature_bytes=", owner_signature_bytes);
    logging.verbose("owner_key_bytes=", owner_key_bytes);

    const request_uuid = this.#getUUID();
    const bytes = [COMMAND_FLAGS.FLAG_ADOPT_REQUEST, ...numberToBytes(request_uuid, 4), ...owner_signature_bytes, ...owner_key_bytes];

    logging.verbose(bytes);

    return this.runtime
      .request(bytes, true)
      .then(response => {
        let reader = new TnglReader(response);

        logging.verbose("response=", response);

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
    logging.verbose("writeNetworkOwner(ownerSignature=", ownerSignature, "ownerKey=", ownerKey, ")");

    logging.debug("> Writing owner to network...");

    const owner_signature_bytes = hexStringToUint8Array(ownerSignature, 16);
    const owner_key_bytes = hexStringToUint8Array(ownerKey, 16);

    logging.verbose("owner_signature_bytes", owner_signature_bytes);
    logging.verbose("owner_key_bytes", owner_key_bytes);

    const request_uuid = this.#getUUID();
    const bytes = [COMMAND_FLAGS.FLAG_ADOPT_REQUEST, ...numberToBytes(request_uuid, 4), ...owner_signature_bytes, ...owner_key_bytes];

    logging.verbose(bytes);

    return this.runtime.execute(bytes, true);
  }

  // name as string
  writeControllerName(name) {
    logging.debug("> Writing Controller Name...");

    const request_uuid = this.#getUUID();
    const payload = [COMMAND_FLAGS.FLAG_WRITE_CONTROLLER_NAME_REQUEST, ...numberToBytes(request_uuid, 4), ...stringToBytes(name, 16)];
    return this.runtime.request(payload, false);
  }

  readControllerName() {
    logging.debug("> Reading Controller Name...");

    const request_uuid = this.#getUUID();
    const bytes = [COMMAND_FLAGS.FLAG_READ_CONTROLLER_NAME_REQUEST, ...numberToBytes(request_uuid, 4)];

    return this.runtime.request(bytes, true).then(response => {
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

  readVariable(variable_name, device_id) {
    logging.debug(`> Reading variable...`);

    const variable_declarations = this.#parser.getVariableDeclarations();
    logging.verbose(`variable_declarations=`, variable_declarations);

    let variable_address = undefined;

    // check if the variable is already declared
    // look for the latest variable address on the stack
    for (let i = 0; i < variable_declarations.length; i++) {
      const declaration = variable_declarations[i];
      if (declaration.name === variable_name) {
        variable_address = declaration.address;
        break;
      }
    }

    if (variable_address === undefined) {
      throw "VariableNotFound";
    }

    const variable_value = this.runtime.readVariableAddress(variable_address, device_id);
    logging.verbose(`variable_name=${variable_name}, device_id=${device_id}, variable_value=${variable_value.debug}`);

    return variable_value;
  }

  readVariableAddress(variable_address, device_id) {
    logging.debug("> Reading variable address...");

    if (this.#getConnectionState() !== "connected") {
      throw "DeviceDisconnected";
    }

    return this.runtime.readVariableAddress(variable_address, device_id);
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

    return this.runtime.request(bytes, true).then(response => {
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

    return this.runtime.request(bytes, true).then(response => {
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

    return this.runtime.request(bytes, true).then(response => {
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

  execute(bytecode) {
    return this.runtime.execute(bytecode, null, 60000);
  }

  reload() {
    return new Promise ((reject, resolve)=> {
      if (detectNode()) {
        process.exit(1);
      } else {
        if (window && window.location) {
          window.location.reload();
        }
      }
      resolve(null);
    });
  }

  update() {
    // if (detectNode()) {
    //   // run git pull and git submodule update
    //   const { exec } = require("child_process");
    //   exec("git pull && git submodule update --init --recursive", (error, stdout, stderr) => {
    //     if (error) {
    //       console.error(`exec error: ${error}`);
    //       return;
    //     }
    //     console.log(`stdout: ${stdout}`);
    //     console.error(`stderr: ${stderr}`);
    //   });
    //   // run npm install
    //   exec("npm install", (error, stdout, stderr) => {
    //     if (error) {
    //       console.error(`exec error: ${error}`);
    //       return;
    //     }
    //     console.log(`stdout: ${stdout}`);
    //     console.error(`stderr: ${stderr}`);
    //   });
    //   process.exit(1);
    // }
  }
}
