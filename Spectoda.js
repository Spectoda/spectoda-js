import { TnglCodeParser } from "./SpectodaParser.js";
import { TimeTrack } from "./TimeTrack.js";
import "./TnglReader.js";
import { TnglReader } from "./TnglReader.js";
import "./TnglWriter.js";
import { colorToBytes, cssColorToHex, detectNode, detectSpectodaConnect, hexStringToUint8Array, labelToBytes, numberToBytes, sleep, strMacToBytes, stringToBytes, uint8ArrayToHexString } from "./functions";

import { logging } from "./logging";
import { SpectodaWasm } from "./src/SpectodaWasm";
import { COMMAND_FLAGS } from "./src/Spectoda_JS";

import { io } from "socket.io-client";
import customParser from "socket.io-msgpack-parser";
import { WEBSOCKET_URL } from "./SpectodaWebSocketsConnector";
import "./TnglReader";
import "./TnglWriter";
import { VALUE_LIMITS } from "./constants";
import { SpectodaRuntime, allEventsEmitter } from "./src/SpectodaRuntime";

// from 0.10-dev-berry created this 0.11-dev branch

/**
 * ----- INTRODUCTION ------
 * Controllers are physical devices that you can connect with an Spectoda.js instance. They always belong in a network, which is identified with a `signature` (deprecated terminology "ownerSignature") and `key` (deprecated terminology "ownerKey") - with the key being a secret value.
 * Each controller has a unique MAC address, which is used to identify it in the network.
 * Everyone in the network is called a node - whether it is a physical controller or a virtual controller.

 * ----- CONTROLLER SYNCHRONIZATION ------
 * If more contorllers have the same signature + key = they are in the same network.
 * If more contorller have the same FW version + are in the same network, they will synchronize with each other:
 * - TNGL code
 * - Event history
 * - Timeline

 * ----- NO NETWORK ------
 * When controller is not in a network, it is in a mode that anyone can connect to it and move it to his own network. Think of this as a "pairing mode" of Bluetooth mode. Althought in Spectoda THIS IS NOT CALLED PAIRING.
 
* ----- LABELS ------
 * "label" is a specific type, that can have at max 5 characters [a-zA-Z0-9_]. It is always prefixed with "$" (e.g. $label)
 */

/**
 * ----- Refactoring suggestions by @mchlkucera: ------
 * All reading, getting, fetching, should be just called `getResource`
 * All writing, setting, sending, should be just called `setResource`
 * Spectoda.js should be just for firmware communication
 * - Flutter-specific functions should be separated (e.g. hideHomeButton)
 * - Client-specific functions should be separated (e.g. reload)
 * - More refactoring suggestions are ready in the `0.13-dev` branch
 */

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
          return;
          // this.syncClock()
          //   // .then(() => {
          //   //   return this.syncTimeline();
          //   // })
          //   // .then(() => {
          //   //   return this.syncEventHistory(); // ! this might slow down stuff for Bukanyr
          //   // })
          //   .catch(error => {
          //     logging.warn(error);
          //   });
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

    if (!reg || !reg.length || !reg[0]) {
      throw "InvalidSignature";
    }

    this.#ownerSignature = reg[0];
    return true;
  }

  #setOwnerKey(ownerKey) {
    const reg = ownerKey.match(/([\dabcdefABCDEF]{32})/g);

    if (!reg || !reg.length || !reg[0]) {
      throw "InvalidKey";
    }

    this.#ownerKey = reg[0];
    return true;
  }

  /**
   * Calls WakeLock API to prevent the screen from turning off.
   * TODO: Move to different file. Not a spectoda.js concern.
   */
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

  /**
   * Calls WakeLock API to release the screen from being prevented from turning off.
   * TODO: Move to different file. Not a spectoda.js concern.
   */
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

  /**
   * Alias for assignConnector
   * Assigns with which "connector" you want to `connect`. E.g. "webbluetooth", "serial", "websockets", "simulated".
   * The name `connector` legacy term, but we don't have a better name for it yer.
   */
  setConnector(connector_type, connector_param = undefined) {
    return this.runtime.assignConnector(connector_type, connector_param);
  }

  /**
   * ! Useful
   * @alias this.setConnector
   */
  assignConnector(connector_type, connector_param = undefined) {
    return this.setConnector(connector_type, connector_param);
  }

  /**
   * @alias this.setConnector
   */
  assignOwnerSignature(ownerSignature) {
    return this.#setOwnerSignature(ownerSignature);
  }

  /**
   * @deprecated
   * Set the network `signature` (deprecated terminology "ownerSignature").
   */
  setOwnerSignature(ownerSignature) {
    return this.#setOwnerSignature(ownerSignature);
  }

  /**
   * @deprecated
   * Get the network `signature` (deprecated terminology "ownerSignature").
   */
  getOwnerSignature() {
    return this.#ownerSignature;
  }

  /**
   * @alias this.setOwnerKey
   */
  assignOwnerKey(ownerKey) {
    return this.#setOwnerKey(ownerKey);
  }

  /**
   * Sets the network `key` (deprecated terminology "ownerKey").
   */
  setOwnerKey(ownerKey) {
    return this.#setOwnerKey(ownerKey);
  }

  /**
   * Get the network `key` (deprecated terminology "ownerKey").
   */
  getOwnerKey() {
    return this.#ownerKey;
  }

  /**
   * ! Useful
   * Initializes Remote control (RC) receiving.
   * ! Remote control needs a complete refactor and needs to be moved from Spectoda.js to a different file. Remote control should not connect based on network signature and key.
   *
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

  /**
   * ! Useful
   * Disconnects Remote Control receiving. More info about remote control in `enableRemoteControl`.
   */
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
   * ! Useful
   * @name addEventListener
   * @param {string} event
   * @param {Function} callback
   *
   * events: "disconnected", "connected"
   *
   * all events: event.target === the sender object (SpectodaWebBluetoothConnector)
   * event "disconnected": event.reason has a string with a disconnect reason
   *
   * TODO I think this should expose an "off" method to remove the listener
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

  /**
   * ! Useful
   * Scans for controllers that match the given criteria around the user.
   */
  scan(scan_criteria = [{}], scan_period = 5000) {
    logging.verbose(`scan(scan_criteria=${scan_criteria}, scan_period=${scan_period})`);

    logging.debug("> Scanning Spectoda Controllers...");
    return this.runtime.scan(scan_criteria, scan_period);
  }

  /**
   * @deprecated
   */
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
              window.alert("Zkuste to, prosím, znovu.", "Přidání se nezdařilo", { confirm: "OK" });

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

        // ? eraseTngl to discard TNGL from the previous session
        this.runtime.spectoda_js.eraseTngl();
        // ? eraseHistory to discard Event History from the previous session
        this.runtime.spectoda_js.eraseHistory();
        // ? eraseTimeline to discard Timeline from the previous session
        this.runtime.spectoda_js.eraseTimeline();

        return this.runtime.connect();
      })
      .then(connectedDeviceInfo => {
        this.#resetClockSyncInterval();

        logging.debug("> Synchronizing Network State...");
        return this.requestTimeline()
          .catch(e => {
            logging.error("Timeline sync after reconnection failed:", e);
          })
          .then(() => {
            return this.syncTngl();
          })
          .catch(e => {
            logging.error("Tngl sync after reconnection failed:", e);
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

  /**
   * ! Useful
   * Connects to a controller that matches the given criteria.
   * In web environment, this launches the "Select Device" dialog.
   *
   * To connect to ANY controller, use `spectoda.connect({}, true, null, null, true)`
   * The option to connect to ANY controller will be deprecated in Spectoda FW V1, you should only be able to connect to a controller whose `signature` and `key` you enter.
   *
   * TODO REFACTOR to use only one criteria object instead of this param madness
   */
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

  /**
   * ! Useful
   * Disconnects from the connected controller.
   */
  disconnect() {
    this.#autonomousConnection = false;

    logging.debug(`> Disconnecting controller...`);

    if (this.#getConnectionState() === "disconnected") {
      logging.warn("> Controller already disconnected");
      return Promise.resolve();
    }

    this.#setConnectionState("disconnecting");

    return this.runtime.disconnect().finally(() => {
      this.#setConnectionState("disconnected");
    });
  }

  /**
   * @deprecated Use states in spectoda-core instead
   */
  connected() {
    return this.#getConnectionState() === "connected" ? this.runtime.connected() : Promise.resolve(null);
  }

  //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

  /**
   * ! Useful
   * Preprocesses TNGL code by handling API injections, removing comments, minifying BERRY code, replacing specific patterns within BERRY code, and handling #define statements.
   * Happens
   *
   * @param {string} tngl_code - The TNGL code as a string.
   * @returns {string} - The preprocessed TNGL code.
   */
  async preprocessTngl(tngl_code) {
    logging.verbose(`preprocessTngl(tngl_code=${tngl_code})`);

    /**
     * Helper function to parse timestamp strings and convert them to total milliseconds/tics.
     *
     * @param {string} value - The timestamp string (e.g., "1.2d+9h2m7.2s-123t").
     * @returns {number} - The total time in milliseconds/tics.
     */
    function computeTimestamp(value) {
      if (!value) {
        return 0; // Equivalent to CONST_TIMESTAMP_0
      }

      value = value.trim();

      const timestampRegex = /([+-]?(\d+\.\d+|\d+|\.\d+))\s*(d|h|m(?!s)|s|ms|t)/gi;
      let match;
      let total = 0;

      while ((match = timestampRegex.exec(value)) !== null) {
        const number = parseFloat(match[1]);
        const unit = match[3].toLowerCase();

        switch (unit) {
          case "d":
            total += number * 86400000; // 24*60*60*1000
            break;
          case "h":
            total += number * 3600000; // 60*60*1000
            break;
          case "m":
            total += number * 60000; // 60*1000
            break;
          case "s":
            total += number * 1000; // 1000
            break;
          case "ms":
          case "t":
            total += number;
            break;
          default:
            logging.error("Error while parsing timestamp: Unknown unit", unit);
            break;
        }
      }

      if (total >= VALUE_LIMITS.TIMESTAMP_MAX) {
        return VALUE_LIMITS.TIMESTAMP_MAX; // Equivalent to CONST_TIMESTAMP_INFINITY
      } else if (total <= VALUE_LIMITS.TIMESTAMP_MIN) {
        return VALUE_LIMITS.TIMESTAMP_MIN; // Equivalent to CONST_TIMESTAMP_MINUS_INFINITY
      } else if (total === 0) {
        return 0; // Equivalent to CONST_TIMESTAMP_0
      } else {
        return Math.round(total); // Ensure it's an integer (int32_t)
      }
    }

    /**
     * Helper function to minify BERRY code by removing # comments, specific patterns, and unnecessary whitespace.
     *
     * @param {string} berryCode - The BERRY code to minify.
     * @returns {string} - The minified BERRY code.
     */
    function minifyBerryCode(berryCode) {
      // Step 1: Remove all BERRY-specific comments (lines starting with #)
      const berryCommentRegex = /^\s*#.*$/gm;
      let minified = berryCode.replace(berryCommentRegex, "");

      // Step 2: Replace specific patterns A, B, C, D

      // Pattern A: Hex Color Codes - /#[0-9a-f]{6}/i
      const colorRegex = /#([0-9a-f]{6})/gi;
      minified = minified.replace(colorRegex, (match, p1) => {
        return `Value.Color("${p1}")`;
      });

      // Pattern B: Timestamps - /([+-]?(\d+\.\d+|\d+|\.\d+))(d|h|m(?!s)|s|ms|t)\b/gi
      const timestampRegex = /([+-]?(\d+\.\d+|\d+|\.\d+))(d|h|m(?!s)|s|ms|t)\b/gi;
      minified = minified.replace(timestampRegex, (match, p1, p2, unit) => {
        const miliseconds = computeTimestamp(match);
        return `Value.Timestamp(${miliseconds})`;
      });

      // Pattern C: Labels - /\$[\w]+/
      const labelRegex = /\$([\w]+)/g;
      minified = minified.replace(labelRegex, (match, p1) => {
        return `Value.Label("${p1}")`;
      });

      // Pattern D: Percentages - /[+-]?\d+(\.\d+)?%/
      const percentageRegex = /([+-]?\d+(\.\d+)?)%/g;
      minified = minified.replace(percentageRegex, (match, p1) => {
        return `Value.Percentage(${parseFloat(p1)})`;
      });

      // Step 3: Remove leading and trailing whitespace from each line
      minified = minified
        .split("\n")
        .map(line => line.trim())
        .filter(line => line.length > 0) // Remove empty lines
        .join("\n"); // Preserve line breaks

      // Step 5: Replace multiple spaces with a single space within each line
      minified = minified.replace(/\s+/g, " ");

      // Step 6: Remove spaces before and after specific characters
      const charsToRemoveSpaceAround = [";", ",", "{", "}", "(", ")", "=", "<", ">", "+", "-", "*", "/", "%", "&", "|", "!", ":", "?"];
      charsToRemoveSpaceAround.forEach(char => {
        // Remove space before the character
        const beforeRegex = new RegExp(`\\s+\\${char}`, "g");
        minified = minified.replace(beforeRegex, char);

        // Remove space after the character
        const afterRegex = new RegExp(`\\${char}\\s+`, "g");
        minified = minified.replace(afterRegex, char);
      });

      // Step 6: Optionally, remove unnecessary semicolons (if BerryLang allows)
      minified = minified.replace(/;+/g, " ");

      return minified;
    }

    /**
     * Helper function to remove single-line (// ...) and multi-line () comments
     * from non-BERRY code segments.
     *
     * @param {string} code - The code segment to clean.
     * @returns {string} - The code without // and  comments.
     */
    function removeNonBerryComments(code) {
      const commentRegex = /\/\/.*|\/\*[\s\S]*?\*\//g;
      return code.replace(commentRegex, "");
    }

    // Regular expressions for API handling
    const regexPUBLISH_TNGL_TO_API = /PUBLISH_TNGL_TO_API\s*\(\s*"([^"]*)"\s*,\s*`([^`]*)`\s*\);?/ms;
    const regexINJECT_TNGL_FROM_API = /INJECT_TNGL_FROM_API\s*\(\s*"([^"]*)"\s*\);?/ms;

    // Handle PUBLISH_TNGL_TO_API
    for (let requests = 0; requests < 64; requests++) {
      const match = regexPUBLISH_TNGL_TO_API.exec(tngl_code);
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
        tngl_code = tngl_code.replace(match[0], "");
      } catch (e) {
        logging.error(`Failed to send "${name}" to TNGL API`);
        throw "SendTnglToApiFailed";
      }
    }

    // Handle INJECT_TNGL_FROM_API
    for (let requests = 0; requests < 64; requests++) {
      const match = regexINJECT_TNGL_FROM_API.exec(tngl_code);
      if (!match) {
        break;
      }

      logging.verbose(match);

      const name = match[1];
      const id = encodeURIComponent(name);

      try {
        logging.verbose(`fetchTnglFromApiById({ id=${id} })`);
        const response = await fetchTnglFromApiById(id);
        tngl_code = tngl_code.replace(match[0], response.tngl);
      } catch (e) {
        logging.error(`Failed to fetch "${name}" from TNGL API`, e);
        throw "FetchTnglFromApiFailed";
      }
    }

    // Handle #define replacing
    {
      const regexDEFINE = /#define\s+(\w+)(?:\s+(.*))?/g;

      // List all defines [{name: "NAME", value: "VALUE"}, ...]
      let match;
      let defines = [];
      while ((match = regexDEFINE.exec(tngl_code)) !== null) {
        defines.push({ name: match[1], value: match[2] });
      }

      // Remove all #define statements from the code
      tngl_code = tngl_code.replace(regexDEFINE, "");

      // Replace all defined names with their corresponding values
      for (let define of defines) {
        if (define.value === undefined) continue; // Skip if no value is provided
        // Use word boundaries to avoid partial replacements
        const defineRegex = new RegExp(`\\b${define.name}\\b`, "g");
        tngl_code = tngl_code.replace(defineRegex, define.value);
      }
    }

    // Handle BERRY code minification and syntax sugar
    {
      // Regular expression to find all BERRY(``) segments
      const regexBERRY = /BERRY\(`([\s\S]*?)`\)/g;
      let match;

      // Initialize variables to reconstruct the processed code
      let processedCode = "";
      let lastIndex = 0;

      while ((match = regexBERRY.exec(tngl_code)) !== null) {
        const fullMatch = match[0]; // e.g., BERRY(`...`)
        const berryCode = match[1]; // The code inside the backticks

        const start = match.index;
        const end = regexBERRY.lastIndex;

        // Process the non-BERRY segment before the current BERRY segment
        const nonBerrySegment = tngl_code.slice(lastIndex, start);
        const cleanedNonBerry = removeNonBerryComments(nonBerrySegment);
        processedCode += cleanedNonBerry;

        // Process the BERRY segment
        const minifiedBerry = minifyBerryCode(berryCode);
        processedCode += `BERRY(\`${minifiedBerry}\`)`;

        // Update lastIndex to the end of the current BERRY segment
        lastIndex = end;
      }

      // Process any remaining non-BERRY segment after the last BERRY segment
      const remainingNonBerry = tngl_code.slice(lastIndex);
      const cleanedRemainingNonBerry = removeNonBerryComments(remainingNonBerry);
      processedCode += cleanedRemainingNonBerry;

      tngl_code = processedCode;
    }

    logging.debug(tngl_code);

    return tngl_code;
  }

  /**
   * Gets the TNGL code from the controller to the WASM runtime.
   */
  syncTngl() {
    logging.verbose(`syncTngl()`);

    logging.info("> Requesting TNGL bytecode...");

    const request_uuid = this.#getUUID();
    const command_bytes = [COMMAND_FLAGS.FLAG_READ_TNGL_BYTECODE_REQUEST, ...numberToBytes(request_uuid, 4)];

    return this.runtime.request(command_bytes, true).then(response => {
      let reader = new TnglReader(response);

      logging.verbose(`response.byteLength=${response.byteLength}`);

      const flag = reader.readFlag();
      logging.verbose(`flag=${flag}`);
      if (flag !== COMMAND_FLAGS.FLAG_READ_TNGL_BYTECODE_RESPONSE) {
        logging.error("ERROR ds9a8f07");
        throw "InvalidResponseFlag";
      }

      const response_uuid = reader.readUint32();
      logging.verbose(`response_uuid=${response_uuid}`);
      if (response_uuid !== request_uuid) {
        logging.error("ERROR fd0s987");
        throw "InvalidResponseUuid";
      }

      const error_code = reader.readUint8();
      logging.verbose(`error_code=${error_code}`);

      if (error_code === 0) {
        const tngl_bytecode_size = reader.readUint16();
        logging.info(`tngl_bytecode_size=${tngl_bytecode_size}`);

        const tngl_bytecode = reader.readBytes(tngl_bytecode_size);
        logging.info(`tngl_bytecode=[${tngl_bytecode}]`);

        const DUMMY_CONNECTION = new SpectodaWasm.Connection("00:00:00:00:00:00", SpectodaWasm.connector_type_t.CONNECTOR_UNDEFINED, SpectodaWasm.connection_rssi_t.RSSI_MAX);
        this.runtime.spectoda_js.request(new Uint8Array(tngl_bytecode), DUMMY_CONNECTION);
      } else {
        // maybe no TNGL in the controller
        logging.error("ERROR asdf8079: Failed to synchronize TNGL");
        throw "FailedToSynchronizeTngl";
      }
    });
  }

  /**
   * ! Useful
   * Writes the given TNGL code to the controller.
   * Controller synchronize their TNGL. Which means the TNLG you upload to one controller will be synchronized to all controllers (within a few minutes, based on the TNGL file size)
   * @immakermatty refactor suggestion to `loadTngl` (???)
   */
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

    const reinterpret_bytecode = [COMMAND_FLAGS.FLAG_LOAD_TNGL, ...numberToBytes(this.runtime.clock.millis(), 6), 0, ...numberToBytes(tngl_bytes.length, 4), ...tngl_bytes];

    return this.runtime.execute(reinterpret_bytecode, "TNGL").then(() => {
      // logging.debug("Written");
    });
  }

  /**
   * ! Useful
   * Emit a null event
   *
    * @param {string} event_label
    * @param {number[] | number} device_ids
    * @param {boolean} force_delivery

   */
  emitEvent(event_label, device_ids = [0xff], force_delivery = true) {
    logging.verbose(`emitEvent(label=${event_label},id=${device_ids},force=${force_delivery})`);

    this.#resetClockSyncInterval();

    // clearTimeout(this.#saveStateTimeoutHandle);
    // this.#saveStateTimeoutHandle = setTimeout(() => {
    //   this.saveState();
    // }, 5000);

    const func = device_id => {
      const payload = [COMMAND_FLAGS.FLAG_EMIT_NULL_EVENT, ...labelToBytes(event_label), ...numberToBytes(this.runtime.clock.millis() + 10, 6), numberToBytes(device_id, 1)];
      return this.runtime.execute(payload, force_delivery ? null : "E" + event_label + device_id);
    };

    if (typeof device_ids === "object") {
      let promises = device_ids.map(func);
      return Promise.all(promises);
    } else {
      return func(device_ids);
    }
  }

  /**
   * ! Useful
   * E.g. event "time" to 1000
   * value range is (-2^31,2^31-1)
   *
   * @param {string} event_label
   * @param {number} event_value
   * @param {number[] | number} device_ids
   * @param {boolean} force_delivery
   */
  emitTimestampEvent(event_label, event_value, device_ids = [0xff], force_delivery = false) {
    logging.verbose(`emitTimestampEvent(label=${event_label},value=${event_value},id=${device_ids},force=${force_delivery})`);

    this.#resetClockSyncInterval();

    // clearTimeout(this.#saveStateTimeoutHandle);
    // this.#saveStateTimeoutHandle = setTimeout(() => {
    //   this.saveState();
    // }, 5000);

    if (event_value > 86400000) {
      logging.error("Invalid event value");
      event_value = 86400000;
    }

    if (event_value < -86400000) {
      logging.error("Invalid event value");
      event_value = -86400000;
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

  /**
   * E.g. event "color" to value "#00aaff"
   *
   * @param {string} event_label
   * @param {string} event_value
   * @param {number[] | number} device_ids
   * @param {boolean} force_delivery
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

  /**
   * E.g. event "brigh" to value 100.
   * value range is (-100,100)
   *
   * @param {string} event_label
   * @param {number} event_value
   * @param {number[] | number} device_ids
   * @param {boolean} force_delivery
   */
  emitPercentageEvent(event_label, event_value, device_ids = [0xff], force_delivery = false) {
    logging.verbose(`emitPercentageEvent(label=${event_label},value=${event_value},id=${device_ids},force=${force_delivery})`);

    this.#resetClockSyncInterval();

    if (event_value > 100.0) {
      logging.error("Invalid event value");
      event_value = 100.0;
    }

    if (event_value < -100.0) {
      logging.error("Invalid event value");
      event_value = -100.0;
    }

    // const func = device_id => {
    //   const payload = [COMMAND_FLAGS.FLAG_EMIT_PERCENTAGE_EVENT, ...percentageToBytes(event_value), ...labelToBytes(event_label), ...numberToBytes(this.runtime.clock.millis() + 10, 6), numberToBytes(device_id, 1)];
    //   return this.runtime.execute(payload, force_delivery ? null : "E" + event_label + device_id);
    // };

    // if (typeof device_ids === "object") {
    //   let promises = device_ids.map(func);
    //   return Promise.all(promises);
    // } else {
    //   return func(device_ids);
    // }

    const func = device_id => {
      this.runtime.spectoda_js.emitPercentageEvent(event_label, event_value, device_id, true);
      return Promise.resolve();
    };

    if (typeof device_ids === "object") {
      let promises = device_ids.map(func);
      return Promise.all(promises);
    } else {
      return func(device_ids);
    }
  }

  // !!! PARAMETER CHANGE !!!
  /**
   * E.g. event "anima" to value "a_001"
   *
   * @param {string} event_label
   * @param {string} event_value
   * @param {number[] | number} device_ids
   * @param {boolean} force_delivery
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

  /**
   * Sets the timeline to the current time of the day and unpauses it.
   */
  syncTimelineToDayTime() {
    logging.verbose(`syncTimelineToDayTime()`);

    const now = new Date();

    const hours = now.getHours();
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();
    const miliseconds = now.getMilliseconds();

    const time = hours * 60 * 60 * 1000 + minutes * 60 * 1000 + seconds * 1000 + miliseconds;

    const day = String(now.getDate()).padStart(2, "0");
    const month = String(now.getMonth() + 1).padStart(2, "0"); // getMonth() returns 0-based index
    const year = now.getFullYear();

    this.timeline.unpause();
    this.timeline.setMillis(time);
    this.timeline.setDate(`${day}-${month}-${year}`);

    return this.syncTimeline();
  }

  /**
   * Synchronizes timeline of the connected controller with the current time of the runtime.
   */
  syncTimeline(timestamp = undefined, paused = undefined, date = undefined) {
    logging.verbose(`syncTimeline(timestamp=${timestamp}, paused=${paused})`);

    if (timestamp === undefined) {
      timestamp = this.timeline.millis();
    }

    if (paused === undefined) {
      paused = this.timeline.paused();
    }

    if (date === undefined) {
      date = this.timeline.date();
    }

    logging.debug(`> Setting timeline to timestamp=${timestamp}, paused=${paused}, date=${date}`);

    // from "DD-MM-YYYY" date erase "-" and convert to number MMDDYYYY:
    const date_number = Number(date.replace(/(\d{2})-(\d{2})-(\d{4})/, "$2$1$3"));

    const flags = paused ? 0b00010000 : 0b00000000; // flags: [reserved,reserved,reserved,timeline_paused,reserved,reserved,reserved,reserved]
    const payload = [COMMAND_FLAGS.FLAG_TIMELINE_WRITE, ...numberToBytes(this.runtime.clock.millis(), 6), ...numberToBytes(timestamp, 4), flags, ...numberToBytes(date_number, 4)];
    return this.runtime.execute(payload, "TMLN");
  }

  /**
   * Synchronizes TNGL variable state of given ID to all other IDs
   */
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

  /**
   * ! Useful
   * Update the firmware of the connected controller.
   * @param {Uint8Array} firmware - The firmware to update the controller with.
   */
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

  /**
   * ! Useful
   * Update the firmware of ALL CONNECTED CONTROLLERS in the network.
   * @param {Uint8Array} firmware - The firmware to update the controller with.
   */
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

      // logging.setLoggingLevel(logging.level - 1);

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

        // logging.setLoggingLevel(logging.level + 1);
      });
  }

  /**
   * Tells the connected controller to update a peer controller with its own firmware
   */
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
   * ! Useful
   * Get the JSON config of the connected controller.
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
   * ! Useful
   * Updates the JSON config of the connected controller.
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
   * Updates the JSON config of ALL CONNECTED CONTROLLERS in the network.
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

  /**
   * Gets the timeline from connected controller to the runtime.
   */
  requestTimeline() {
    logging.verbose(`requestTimeline()`);

    logging.info("> Requesting timeline...");

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
      if (error_code !== 0) {
        throw "Fail";
      }

      const clock_timestamp = reader.readUint48();
      const timeline_timestamp = reader.readInt32();
      const timeline_paused = reader.readUint8();
      const timeline_date_number = reader.available >= 4 ? reader.readUint32() : 0;
      const timeline_date = timeline_date_number.toString().replace(/(\d{2})(\d{2})(\d{4})/, "$2-$1-$3");

      logging.info(`clock_timestamp=${clock_timestamp}, timeline_timestamp=${timeline_timestamp}, timeline_paused=${timeline_paused}, timeline_date=${timeline_date}`);

      if (timeline_paused) {
        this.syncTimeline(timeline_timestamp, true, timeline_date);
      } else {
        this.syncTimeline(timeline_timestamp + (this.runtime.clock.millis() - clock_timestamp), false, timeline_date);
      }
    });
  }

  // Code.device.runtime.execute([240,1,0,0,0,5],null)
  /**
   * ! Useful
   * Reboots ALL CONNECTED CONTROLLERS in the network. This will temporarily disconnect the controller from the network. Spectoda.js will try to reconnect you back to the controller.
   */
  rebootNetwork() {
    logging.debug("> Rebooting network...");

    const payload = [COMMAND_FLAGS.FLAG_DEVICE_REBOOT_REQUEST];
    return this.runtime.execute(payload, null);
  }

  /**
   * ! Useful
   * Reboots the controller. This will temporarily disconnect the controller from the network. Spectoda.js will try to reconnect you back to the controller.
   */
  rebootDevice() {
    logging.debug("> Rebooting device...");

    const payload = [COMMAND_FLAGS.FLAG_DEVICE_REBOOT_REQUEST];
    return this.runtime.request(payload, false);
  }

  /**
   * ! Useful
   * Reboots the controller. This will temporarily disconnect the controller from the network. No automatic reconnection will be attempted.
   */
  rebootAndDisconnectDevice() {
    logging.debug("> Rebooting and disconnecting device...");

    const payload = [COMMAND_FLAGS.FLAG_DEVICE_REBOOT_REQUEST];
    return this.runtime.request(payload, false).then(() => {
      return this.disconnect();
    });
  }

  /**
   * ! Useful
   * Puts currently connected controller into the DEFAULT network. More info at the top of this file.
   */
  removeOwner() {
    logging.debug("> Removing owner...");

    const request_uuid = this.#getUUID();
    const bytes = [COMMAND_FLAGS.FLAG_ERASE_NETWORK_REQUEST, ...numberToBytes(request_uuid, 4)];

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

  /**
   * ! Useful
   * Removes ALL CONTROLLERS from their current network. More info at the top of this file.
   */
  removeNetworkOwner() {
    logging.debug("> Removing network owner...");

    const request_uuid = this.#getUUID();
    const bytes = [COMMAND_FLAGS.FLAG_ERASE_NETWORK_REQUEST, ...numberToBytes(request_uuid, 4)];

    return this.runtime.execute(bytes, true).then(() => {
      return this.rebootNetwork();
    });
  }

  /**
   * ! Useful
   * Get the firmware version of the controller in string format
   */
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

  /**
   * ! Useful
   * Get the fingerprint of a currently uploaded Tngl (via `writeTngl()`)
   * Tngl fingerprint is an identifier of the Tngl code that is currently running on the controller. It is used for checking if the controller has the correct Tngl code.
   */
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

  /**
   * For FW nerds
   */
  // datarate in bits per second
  setNetworkDatarate(datarate) {
    logging.debug(`> Setting network datarate to ${datarate} bsp...`);

    const request_uuid = this.#getUUID();
    const payload = [COMMAND_FLAGS.FLAG_CHANGE_DATARATE_REQUEST, ...numberToBytes(request_uuid, 4), ...numberToBytes(datarate, 4)];

    return this.runtime.execute(payload, null);
  }

  /**
   * @deprecated
   */
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

  /**
   * @deprecated Will be replaced in 0.12 by IO operations
   */
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
   * @deprecated This is app-level functionality
   */
  setLanguage(lng) {
    logging.info("setLanguage is deprecated");
  }

  /**
   * Set the debug level of the Spectoda.js library
   */
  setDebugLevel(level) {
    logging.setLoggingLevel(level);
  }

  /**
   * ! Useful
   * Returns the MAC addresses of all nodes connected in the current network in real-time
   */
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

  /**
   * Gets the EventHistory from the connected controller and loads it into the runtime.
   */
  syncEventHistory() {
    logging.info("> Requesting event history bytecode...");

    const request_uuid = this.#getUUID();
    const bytes = [COMMAND_FLAGS.FLAG_EVENT_HISTORY_BC_REQUEST, ...numberToBytes(request_uuid, 4)];

    return this.runtime.request(bytes, true).then(response => {
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
        logging.info(`historic_events_bytecode_size=${historic_events_bytecode_size}`);

        const historic_events_bytecode = reader.readBytes(historic_events_bytecode_size);
        logging.info(`historic_events_bytecode=[${historic_events_bytecode}]`);

        this.runtime.spectoda_js.eraseHistory();

        const DUMMY_CONNECTION = new SpectodaWasm.Connection("00:00:00:00:00:00", SpectodaWasm.connector_type_t.CONNECTOR_UNDEFINED, SpectodaWasm.connection_rssi_t.RSSI_MAX);
        this.runtime.spectoda_js.request(new Uint8Array(historic_events_bytecode), DUMMY_CONNECTION);
      } else {
        logging.error("ERROR cxzv982io");
        throw "FailedToSynchronizeEventHistory";
      }
    });
  }

  /**
   * ! Useful
   * Erases the event state history of ALL CONTROLLERS in the network Spectoda.js is `connect`ed to.
   * TODO This should be called `eraseEventStates`
   */
  eraseEventHistory() {
    logging.debug("> Erasing event history...");

    const request_uuid = this.#getUUID();
    const bytes = [COMMAND_FLAGS.FLAG_ERASE_EVENT_HISTORY_REQUEST, ...numberToBytes(request_uuid, 4)];

    return this.runtime.execute(bytes, true);
  }

  /**
   * ! Useful
   * Puts CONTROLLER Spectoda.js is `connect`ed to to sleep. To wake him up, power must be cycled by removing and reapplying it.
   */
  deviceSleep() {
    logging.debug("> Sleep device...");

    const request_uuid = this.#getUUID();
    const payload = [COMMAND_FLAGS.FLAG_SLEEP_REQUEST, ...numberToBytes(request_uuid, 4)];
    return this.runtime.request(payload, false);
  }

  /**
   * ! Useful
   * Puts ALL CONTROLLERS in the network Spectoda.js is `connect`ed to to sleep. To wake them up, power must be cycled by removing and reapplying it.
   */
  networkSleep() {
    logging.debug("> Sleep network...");

    const request_uuid = this.#getUUID();
    const payload = [COMMAND_FLAGS.FLAG_SLEEP_REQUEST, ...numberToBytes(request_uuid, 4)];
    return this.runtime.execute(payload, null);
  }

  /**
   * Forces a TNGL variable state save on the connected controller. TNGL variable state is by default saved every 8 seconds atfer no event is emitted.
   */
  saveState() {
    logging.debug("> Saving state...");

    const request_uuid = this.#getUUID();
    const payload = [COMMAND_FLAGS.FLAG_SAVE_STATE_REQUEST, ...numberToBytes(request_uuid, 4)];
    return this.runtime.execute(payload, null);
  }

  /**
   * A duplicate of `readControllerCodes`
   */
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

  /**
   * ! Useful
   * Changes the network of the controller Spectoda.js is `connect`ed to.
   */
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

  /**
   * ! Useful
   * Changes the network of ALL controllers in the network Spectoda.js is `connect`ed to.
   */
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

  /**
   * ! Useful
   */
  writeControllerName(name) {
    logging.debug("> Writing Controller Name...");

    const request_uuid = this.#getUUID();
    const payload = [COMMAND_FLAGS.FLAG_WRITE_CONTROLLER_NAME_REQUEST, ...numberToBytes(request_uuid, 4), ...stringToBytes(name, 16)];
    return this.runtime.request(payload, false);
  }

  /**
   * ! Useful
   */
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

  /**
   * Reads the TNGL variable on given ID from App's WASM
   */
  readVariable(variable_name, device_id = 255) {
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

  /**
   * For FW nerds
   */
  readVariableAddress(variable_address, device_id = 255) {
    logging.debug("> Reading variable address...");

    if (this.#getConnectionState() !== "connected") {
      throw "DeviceDisconnected";
    }

    return this.runtime.readVariableAddress(variable_address, device_id);
  }

  /**
   * Hides the home button on the Flutter Spectoda Connect:
   * TODO: This is not really a "FW communication feature", should be moved to another file ("FlutterBridge?""). Spectoda.JS should take care only of the communication with the device.
   */
  hideHomeButton() {
    logging.debug("> Hiding home button...");

    if (!detectSpectodaConnect()) {
      return Promise.reject("PlatformNotSupported");
    }

    return window.flutter_inappwebview.callHandler("hideHomeButton");
  }

  /**
   * Sets orientation of the Flutter Spectoda Connect:
   * 0 = no restriction, 1 = portrait, 2 = landscape
   * TODO: This is not really a "FW communication feature", should be moved to another file ("FlutterBridge?""). Spectoda.JS should take care only of the communication with the device.
   */
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

  /**
   * ! Useful
   * Reads the network signature of the controller Spectoda.js is `connect`ed to.
   */
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

  /**
   * Write PCB Code and Product Code. Used when manufacturing a controller
   *
   * PCB Code is a code of a specific PCB. A printed circuit of a special type. You can connect many inputs and many outputs to it. E.g. Spectoda Industry A6 controller.
   *
   * Product Code is a code of a specific product. A product is a defined, specific configuration of inputs and outputs that make up a whole product. E.g. NARA Lamp (two LED outputs of certain length and a touch button), Sunflow Lamp (three LED outputs, push button)
   */
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

  /**
   * ! Useful
   * Get PCB Code and Product Code. For more information see `writeControllerCodes`
   */
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

  /**
   * For FW nerds
   */
  execute(bytecode) {
    return this.runtime.execute(bytecode, null, 60000);
  }

  // emits JS event
  /**
   * Emits JS events like "connected" or "eventstateupdates"
   */
  emit(event, value) {
    this.runtime.emit(event, value);
  }

  /**
   * Reloads the window or restarts node process. Useful when connected to the device via Remote control.
   * TODO: This is not really a "FW communication feature", should be moved to another function. Spectoda.JS should take care only of the communication with the device.
   */
  reload() {
    this.disconnect();

    setTimeout(() => {
      if (detectNode()) {
        process.exit(1);
      } else {
        if (window && window.location) {
          window.location.reload();
        }
      }
    }, 1000);

    return Promise.resolve();
  }

  /**
   * @deprecated
   */
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

  /**
   * Erase current TNGL
   */
  eraseTngl() {
    logging.debug("> Erasing TNGL...");

    const request_uuid = this.#getUUID();
    const command_bytes = [COMMAND_FLAGS.FLAG_ERASE_TNGL_BYTECODE_REQUEST, ...numberToBytes(request_uuid, 4)];

    return this.runtime.execute(command_bytes, null);
  }

  /**
   * TNGL BANKS: A concept in which you can save Tngl to different memory banks, and then load them when you need. Used to speed up tngl synchronization in installations where all animations don't fit to one Tngl file
   */

  /**
   * Save the current uploaded Tngl (via `writeTngl) to the bank in parameter
   */
  saveTnglBank(tngl_bank) {
    logging.debug(`> Saving TNGL to bank ${tngl_bank}...`);

    const request_uuid = this.#getUUID();
    const command_bytes = [COMMAND_FLAGS.FLAG_SAVE_TNGL_MEMORY_BANK_REQUEST, ...numberToBytes(request_uuid, 4), tngl_bank];

    return this.runtime.execute(command_bytes, null);
  }

  /**
   * Load the Tngl from the bank in parameter
   */
  loadTnglBank(tngl_bank) {
    logging.debug(`> Loading TNGL from bank ${tngl_bank}...`);

    const request_uuid = this.#getUUID();
    const command_bytes = [COMMAND_FLAGS.FLAG_LOAD_TNGL_MEMORY_BANK_REQUEST, ...numberToBytes(request_uuid, 4), tngl_bank, ...numberToBytes(this.runtime.clock.millis(), 6)];

    return this.runtime.execute(command_bytes, null);
  }

  /**
   * Erase the Tngl from the bank in parameter
   */
  eraseTnglBank(tngl_bank) {
    logging.debug(`> Erasing TNGL bank ${tngl_bank}...`);

    const request_uuid = this.#getUUID();
    const command_bytes = [COMMAND_FLAGS.FLAG_ERASE_TNGL_MEMORY_BANK_REQUEST, ...numberToBytes(request_uuid, 4), tngl_bank];

    return this.runtime.execute(command_bytes, null);
  }

  getEventState(event_state_name, event_state_id) {
    return this.runtime.getEventState(event_state_name, event_state_id);
  }

  registerDeviceContext(device_id) {
    return this.runtime.registerDeviceContext(device_id);
  }
}
// ====== NEW PARADIAGM FUNCTIONS ====== //

if (typeof window !== "undefined") {
  window.Spectoda = Spectoda;
}
