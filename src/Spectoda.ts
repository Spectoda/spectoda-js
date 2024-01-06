import { TnglCodeParser } from "./SpectodaParser";
import { TimeTrack } from "./TimeTrack";
import "./TnglReader";
import { TnglReader } from "./TnglReader";
import "./TnglWriter";
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
import { logging, setLoggingLevel } from "./logging";
import { COMMAND_FLAGS } from "./webassembly/Spectoda_JS";

import { io } from "socket.io-client";
import customParser from "socket.io-msgpack-parser";
import { SpectodaRuntime, allEventsEmitter } from "./SpectodaRuntime";
import { BROADCAST_ID } from "./constants";
import { WEBSOCKET_URL } from "./remote-control";

// should not create more than one object!
// the destruction of the Spectoda is not well implemented

// TODO - kdyz zavolam spectoda.connect(), kdyz jsem pripojeny, tak nechci aby se do interfacu poslal select
// TODO - kdyz zavolam funkci connect a uz jsem pripojeny, tak vyslu event connected, pokud si myslim ze nejsem pripojeny.
// TODO - "watchdog timer" pro resolve/reject z TC

export type ConnectorType = "default" | "bluetooth" | "serial" | "websockets" | "simulated" | "dummy";
export type ConnectionState = "connected" | "connecting" | "disconnected" | "disconnecting";

type SpectodaId = number;
type SpectodaIds = SpectodaId | SpectodaId[];

// Event label has maximally 5 chars
// Example: evt1
type EventLabel = string;

export const DEFAULT_SIGNATURE = "00000000000000000000000000000000";
export const DEFAULT_KEY = DEFAULT_SIGNATURE;
const USE_ALL_CONNECTIONS = ["*/ff:ff:ff:ff:ff:ff"];

type Tngl = { code: string | undefined; bytecode: Uint8Array | undefined };

export class Spectoda {
  #parser;

  #uuidCounter;
  #ownerSignature;
  #ownerKey;
  #updating;

  #connectionState: ConnectionState;
  #websocketConnectionState;

  #criteria;
  #reconnecting;
  #autonomousConnection;
  #proxyEventsEmitterRefUnsub;

  #adopting;
  #wakeLock;
  #isPrioritizedWakelock;
  #saveStateTimeoutHandle;
  #reconnectRC;

  runtime: SpectodaRuntime;

  constructor(connectorType: ConnectorType = "default", reconnecting = true) {
    this.#parser = new TnglCodeParser();

    this.#uuidCounter = Math.floor(Math.random() * 0xffffffff);

    this.#ownerSignature = DEFAULT_SIGNATURE;
    this.#ownerKey = DEFAULT_KEY;

    this.runtime = new SpectodaRuntime(this);

    if (connectorType) {
      this.runtime.assignConnector(connectorType);
    }

    this.#adopting = false;
    this.#updating = false;

    this.#reconnecting = reconnecting ? true : false;
    this.#connectionState = "disconnected";
    this.#websocketConnectionState = "disconnected";

    this.#proxyEventsEmitterRefUnsub = null;

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

    // auto clock sync loop
    setInterval(() => {
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
              //   return this.syncEventHistory(); //! this might slow down stuff for Bukanyr
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
    }, 60000);
  }

  setDebugLevel(level: number) {
    setLoggingLevel(level);
  }

  #setWebSocketConnectionState(websocketConnectionState: ConnectionState) {
    switch (websocketConnectionState) {
      case "connecting":
        if (websocketConnectionState !== this.#websocketConnectionState) {
          logging.warn("> Spectoda connecting");
          this.#websocketConnectionState = websocketConnectionState;
          this.runtime.emit("connecting-websockets");
        }
        break;
      case "connected":
        if (websocketConnectionState !== this.#websocketConnectionState) {
          logging.warn("> Spectoda connected");
          this.#websocketConnectionState = websocketConnectionState;
          this.runtime.emit("connected-websockets");
        }
        break;
      case "disconnecting":
        if (websocketConnectionState !== this.#websocketConnectionState) {
          logging.warn("> Spectoda disconnecting");
          this.#connectionState = connectionState;
          this.runtime.emit("disconnecting-websockets");
        }
        break;
      case "disconnected":
        if (websocketConnectionState !== this.#websocketConnectionState) {
          logging.warn("> Spectoda disconnected");
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

  #setOwnerSignature(ownerSignature: string) {
    const reg = ownerSignature.match(/([\dabcdefABCDEF]{32})/g);

    if (!reg[0]) {
      throw "InvalidSignature";
    }

    this.#ownerSignature = reg[0];
    return true;
  }

  #setOwnerKey(ownerKey: string) {
    const reg = ownerKey.match(/([\dabcdefABCDEF]{32})/g);

    if (!reg[0]) {
      throw "InvalidKey";
    }

    this.#ownerKey = reg[0];
    return true;
  }

  //! please move this function elsewhere
  fetchClients() {
    if (this.socket) return this.socket.emitWithAck("list-all-clients");
  }

  /**
   * @param {Object} options
   * @param {string?} options.signature - The network signature.
   * @param {string?} options.key - The network key.
   * @param {boolean?} [options.sessionOnly] - Whether to enable remote control for the current session only.
   * @param {{
   *   user?: {
   *     name?: string,
   *     email?: string,
   *     image?: string
   *   },
   *   app?: {
   *     name?: string,
   *     version?: string,
   *     commitHash?: string,
   *     url?: string
   *   },
   *   [key: string]: any
   * }} [options.meta] - Optional metadata about the user and the app.
   */
  // TODO
  async enableRemoteControl({ signature, key, sessionOnly, meta }) {
    logging.debug("> Connecting to Remote Control", { signature, key, sessionOnly });

    this.#proxyEventsEmitterRefUnsub && this.#proxyEventsEmitterRefUnsub();

    // Disconnect and clean up the previous socket if it exists
    if (this.socket) {
      this.socket.removeAllListeners(); // Removes all listeners attached to the socket
      this.socket.disconnect();
    }

    // Initialize a new socket connection
    this.socket = io(WEBSOCKET_URL, {
      parser: customParser,
    });

    this.socket.connect();
    this.requestWakeLock(true);

    const setConnectionSocketData = async () => {
      const peers = await this.getConnectedPeersInfo().catch(() => {
        return [];
      });
      logging.debug("peers", peers);
      this.socket.emit("set-connectedMacs-data", peers);
    };

    // Reset event listeners for 'connected' and 'disconnected'
    this.on("connected", async () => {
      setConnectionSocketData();
    });

    this.on("disconnected", () => {
      this.socket.emit("set-connectedMacs-data", null);
    });

    return await new Promise((resolve, reject) => {
      this.socket.on("disconnect", () => {
        this.#setWebSocketConnectionState("disconnected");
      });

      this.socket.on("connect", async () => {
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
            });
        }

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

        logging.info("> Connected and joined network remotely");

        let deviceType = "browser";

        if (detectNode()) {
          deviceType = "gateway";
        } else if (detectSpectodaConnect()) {
          deviceType = "spectoda-connect";
        }

        this.socket.emit("set-device-info", { deviceType });

        this.socket.emit("set-meta-data", meta);

        resolve({ status: "success" });

        logging.info("> Listening for events", allEventsEmitter);
        globalThis.allEventsEmitter = allEventsEmitter;

        allEventsEmitter.on("on", ({ name, args }) => {
          logging.verbose("on", name, args);
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
      });
    });
  }

  // TODO
  disableRemoteControl() {
    logging.debug("> Disonnecting from the Remote Control");

    this.releaseWakeLock(true);
    this.socket?.disconnect();
  }

  /**
   *
   */
  requestWakeLock(prioritized = false) {
    logging.error("requestWakeLock() is yet to be reimplemented");
    // TODO call requestWakeLock() from wake-lock/index.ts
  }

  /**
   *
   */
  releaseWakeLock(prioritized = false) {
    logging.error("releaseWakeLock() is yet to be reimplemented");
    // TODO call releaseWakeLock() from wake-lock/index.ts
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
  // TODO
  addEventListener(event, callback) {
    return this.runtime.addEventListener(event, callback);
  }

  /**
   * @alias this.addEventListener
   */
  // TODO
  on(event, callback) {
    return this.runtime.on(event, callback);
  }

  /**
   * @name scan
   * @param {string[]} connection
   * @param {string} connector
   * @param {Criteria | Criteria[]} criteria
   * @param {ScanOptions} options
   *
   * TODO define Criteria and ScanOptions type
   * @returns {Criteria[]}
   */
  scan(connection: string[], connector: string, criteria = {}, options = {}) {
    logging.verbose(`scan(connector=${connector}, criteria=${criteria}, options=${options})`);
    // TODO

    logging.debug("> Scanning Spectoda Controllers...");
    return this.runtime.scan(scan_criteria, scan_period);
  }

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

  /**
   * @name connect
   * @param {string[]} connection
   * @param {string} connector
   * @param {Criteria | Criteria[]} criteria
   * @param {ConnectOptions} options
   *
   * TODO define Criteria and ConnectOptions type
   * @returns {Criteria[]}
   */
  //! FUNCTION ROLE CHANGED
  //! PARAMETERS CHANGED
  connect(connection: string[], connector: string, criteria = {}, options = {}) {
    logging.verbose(`connect(connector=${connector}, criteria=${criteria}, options=${options})`);

    // TODO
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
   *
   * @param connection Connection to disconnect
   */
  disconnect(connection: string[]) {
    // TODO
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

  /**
   *
   * @param connection is this connection connected?
   * @returns {boolean} true if connected, false if not connected
   */
  isConnected(connection: string[]) {
    // TODO
  }

  //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

  /**
   * Function role changed!
   * Writes controller's stored TNGL to another controller/s
   */
  //! FUNCTION ROLE CHANGED
  //! PARAMETERS CHANGED
  syncTngl(connection: string[], connectionToSyncWith: string[] = USE_ALL_CONNECTIONS): Promise<void> {
    logging.verbose(`syncTngl(connection=${connection}, connectionToSyncWith=${connectionToSyncWith})`);

    // TODO
    if (typeof connection !== "string") {
      logging.error("syncTngl() changed! Did you mean to call writeTngl()?");
    }

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

  /**
   * ! Parameters changed!
   * Writes TNGL to the network from the currently used controller.
   * Pass TNGL code by string or object: { code: string or bytecode: uint8Array }
   * @param connection
   * @param tngl
   * @param tngl.code string or undefined. choose code or bytecode
   * @param tngl.bytecode uint8Array or undefined
   */
  //! PARAMETERS CHANGED
  writeTngl(connection: string[], tngl: Tngl): Promise<void> {
    logging.verbose(`writeTngl(connection=${connection}, tngl=${tngl})`);

    // TODO
    logging.debug(`> Writing Tngl code...`);

    if (tngl.code === null && tngl.bytecode === null) {
      return Promise.reject("InvalidParameters");
    }

    if (tngl.bytecode === null) {
      tngl.bytecode = this.#parser.parseTnglCode(tngl.code);
    }

    const timeline_flags = this.runtime.timeline.paused() ? 0b00010000 : 0b00000000; // flags: [reserved,reserved,reserved,timeline_paused,reserved,reserved,reserved,reserved]
    const timeline_bytecode = [COMMAND_FLAGS.FLAG_SET_TIMELINE, ...numberToBytes(this.runtime.clock.millis(), 6), ...numberToBytes(this.runtime.timeline.millis(), 4), timeline_flags];

    const reinterpret_bytecode = [COMMAND_FLAGS.FLAG_REINTERPRET_TNGL, ...numberToBytes(this.runtime.clock.millis(), 6), 0, ...numberToBytes(tngl.bytecode.length, 4), ...tngl.bytecode];

    const payload = [...timeline_bytecode, ...reinterpret_bytecode];
    return this.runtime.execute(payload, "TNGL").then(() => {
      // logging.debug("Written");
    });
  }

  emitEmptyEvent(connection: string[], eventLabel: EventLabel, eventIds: SpectodaIds = BROADCAST_ID, options = { forceDelivery: false }): Promise<void> {
    logging.verbose(`emitEmptyEvent(connection=${connection}, eventLabel=${eventLabel}, eventIds=${eventIds}, options=${options})`);

    // TODO

    // clearTimeout(this.#saveStateTimeoutHandle);
    // this.#saveStateTimeoutHandle = setTimeout(() => {
    //   this.saveState();
    // }, 5000);

    const func = device_id => {
      const payload = [COMMAND_FLAGS.FLAG_EMIT_EVENT, ...labelToBytes(eventLabel), ...numberToBytes(this.runtime.clock.millis() + 10, 6), numberToBytes(device_id, 1)];
      return this.runtime.execute(payload, force_delivery ? null : "E" + eventLabel + device_id);
    };

    if (typeof device_ids === "object") {
      let promises = device_ids.map(func);
      return Promise.all(promises);
    } else {
      return func(device_ids);
    }
  }

  emitTimestampEvent(connection: string[], eventLabel: EventLabel, eventTimestampValue: number, eventIds: SpectodaIds = BROADCAST_ID, options = { forceDelivery: false }): Promise<void> {
    logging.verbose(`emitTimestampEvent(connection=${connection}, eventLabel=${eventLabel}, eventTimestampValue=${eventTimestampValue}, eventIds=${eventIds}, options=${options})`);

    // TODO
    // clearTimeout(this.#saveStateTimeoutHandle);
    // this.#saveStateTimeoutHandle = setTimeout(() => {
    //   this.saveState();
    // }, 5000);

    if (eventValue > 2147483647) {
      logging.error("Invalid event value");
      eventValue = 2147483647;
    }

    if (eventValue < -2147483648) {
      logging.error("Invalid event value");
      eventValue = -2147483648;
    }

    const func = device_id => {
      const payload = [COMMAND_FLAGS.FLAG_EMIT_TIMESTAMP_EVENT, ...numberToBytes(eventValue, 4), ...labelToBytes(eventLabel), ...numberToBytes(this.runtime.clock.millis() + 10, 6), numberToBytes(device_id, 1)];
      return this.runtime.execute(payload, force_delivery ? null : "E" + eventLabel + device_id);
    };

    if (typeof device_ids === "object") {
      let promises = device_ids.map(func);
      return Promise.all(promises);
    } else {
      return func(device_ids);
    }
  }

  emitColorEvent(connection: string[], eventLabel: EventLabel, eventColorValue: string, eventIds: SpectodaIds = BROADCAST_ID, options = { forceDelivery: false }): Promise<void> {
    logging.verbose(`emitColorEvent(connection=${connection}, eventLabel=${eventLabel}, eventColorValue=${eventColorValue}, eventIds=${eventIds}, options=${options})`);

    // TODO

    // clearTimeout(this.#saveStateTimeoutHandle);
    // this.#saveStateTimeoutHandle = setTimeout(() => {
    //   this.saveState();
    // }, 5000);

    eventValue = cssColorToHex(eventValue);

    if (!eventValue || !eventValue.match(/#[\dabcdefABCDEF]{6}/g)) {
      logging.error("Invalid event value. eventValue=", eventValue);
      eventValue = "#000000";
    }

    const func = device_id => {
      const payload = [COMMAND_FLAGS.FLAG_EMIT_COLOR_EVENT, ...colorToBytes(eventValue), ...labelToBytes(eventLabel), ...numberToBytes(this.runtime.clock.millis() + 10, 6), numberToBytes(device_id, 1)];
      return this.runtime.execute(payload, force_delivery ? null : "E" + eventLabel + device_id);
    };

    if (typeof device_ids === "object") {
      let promises = device_ids.map(func);
      return Promise.all(promises);
    } else {
      return func(device_ids);
    }
  }

  emitPercentageEvent(connection: string[], eventLabel: EventLabel, eventPercentageValue: number, eventIds: SpectodaIds = BROADCAST_ID, options = { forceDelivery: false }): Promise<void> {
    logging.info(`emitPercentageEvent(connection=${connection}, eventLabel=${eventLabel}, eventPercentageValue=${eventPercentageValue}, eventIds=${eventIds}, options=${options})`);

    // TODO

    // clearTimeout(this.#saveStateTimeoutHandle);
    // this.#saveStateTimeoutHandle = setTimeout(() => {
    //   this.saveState();
    // }, 5000);

    if (eventValue > 100.0) {
      logging.error("Invalid event value");
      eventValue = 100.0;
    }

    if (eventValue < -100.0) {
      logging.error("Invalid event value");
      eventValue = -100.0;
    }

    const func = device_id => {
      const payload = [COMMAND_FLAGS.FLAG_EMIT_PERCENTAGE_EVENT, ...percentageToBytes(eventValue), ...labelToBytes(eventLabel), ...numberToBytes(this.runtime.clock.millis() + 10, 6), numberToBytes(device_id, 1)];
      return this.runtime.execute(payload, force_delivery ? null : "E" + eventLabel + device_id);
    };

    if (typeof device_ids === "object") {
      let promises = device_ids.map(func);
      return Promise.all(promises);
    } else {
      return func(device_ids);
    }
  }

  // eventValue example: "label"
  emitLabelEvent(connection: string[], eventLabel: EventLabel, eventLabelValue: string, eventIds: SpectodaIds = BROADCAST_ID, options = { forceDelivery: false }): Promise<void> {
    logging.verbose(`emitLabelEvent(connection=${connection}, eventLabel=${eventLabel}, eventLabelValue=${eventLabelValue}, eventIds=${eventIds}, options=${options})`);

    // TODO
    // clearTimeout(this.#saveStateTimeoutHandle);
    // this.#saveStateTimeoutHandle = setTimeout(() => {
    //   this.saveState();
    // }, 5000);

    if (typeof eventValue !== "string") {
      logging.error("Invalid event value");
      eventValue = "";
    }

    if (eventValue.length > 5) {
      logging.error("Invalid event value");
      eventValue = eventValue.slice(0, 5);
    }

    const func = device_id => {
      const payload = [COMMAND_FLAGS.FLAG_EMIT_LABEL_EVENT, ...labelToBytes(eventValue), ...labelToBytes(eventLabel), ...numberToBytes(this.runtime.clock.millis() + 10, 6), numberToBytes(device_id, 1)];
      return this.runtime.execute(payload, force_delivery ? null : "E" + eventLabel + device_id);
    };

    if (typeof device_ids === "object") {
      let promises = device_ids.map(func);
      return Promise.all(promises);
    } else {
      return func(device_ids);
    }
  }

  /**
   * Forces timeline synchronization of the used controller to the network
   */
  //! PARAMETERS UPDATED
  syncTimeline(connection: string[], connectionToSyncWith: string[] = ["*/ff:ff:ff:ff:ff:ff"]): Promise<void> {
    logging.verbose(`syncTimeline(connection=${connection}, connectionToSyncWith=${connectionToSyncWith})`);

    // TODO
    logging.debug(`> Synchronizing timeline to device`);

    const flags = this.runtime.timeline.paused() ? 0b00010000 : 0b00000000; // flags: [reserved,reserved,reserved,timeline_paused,reserved,reserved,reserved,reserved]
    const payload = [COMMAND_FLAGS.FLAG_SET_TIMELINE, ...numberToBytes(this.runtime.clock.millis(), 6), ...numberToBytes(this.runtime.timeline.millis(), 4), flags];
    return this.runtime.execute(payload, "TMLN");
  }

  /**
   * Forces clock timestamp of the used controller to the network
   */
  //! PARAMETERS UPDATED
  syncClock(connection: string[], connectionToSyncWith: string[] = ["*/ff:ff:ff:ff:ff:ff"]): Promise<void> {
    logging.verbose(`syncClock(connection=${connection}, connectionToSyncWith=${connectionToSyncWith})`);

    // TODO
    logging.debug("> Syncing clock from device");

    return this.runtime.syncClock().then(() => {
      logging.debug("> App clock synchronized");
    });
  }

  /**
   * Forces a state of some source ID to target IDs on the whole network
   */
  //! PARAMETERS UPDATED
  syncState(connection: string[], sourceId: SpectodaId, targetIds: SpectodaIds = BROADCAST_ID, connectionToSyncWith: string[] = ["*/ff:ff:ff:ff:ff:ff"]): Promise<void> {
    logging.error("syncState() is deprecated use applyState() instead");

    // TODO
    logging.debug("> Synchronizing state...");

    const request_uuid = this.#getUUID();
    const device_request = [COMMAND_FLAGS.FLAG_SYNC_STATE_REQUEST, ...numberToBytes(request_uuid, 4), deviceId];
    return this.runtime.request(device_request, false);
  }

  /**
   *
   */
  writeFirmware(connection: string[], firmware: { path: string; url: string; bytes: Uint8Array }): Promise<void> {
    logging.verbose(`writeFirmware(connection=${connection}, firmware=${firmware})`);

    // TODO
    logging.debug(`> Updating Network FW...`);

    // const fw = fetchFirmware(url);
    // return this.updateDeviceFirmware(fw);

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

      setLoggingLevel(logging.level - 1);

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
        await sleep(10000);

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

        setLoggingLevel(logging.level + 1);
      });
  }

  /**
   * Synchonizes firmware of the used controller to given connection
   * @todo should return an information about the firmware update result
   */
  async syncFirmware(connection: string[], connectionToSyncWith: string[]): Promise<void> {
    logging.verbose(`syncFirmware(connection=${connection}, connectionToSyncWith=${connectionToSyncWith})`);

    // TODO
    logging.error("updatePeerFirmware() is deprecated. Use syncFirmware() instead");

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
   * Reads config of currently used controller.
   */
  readConfig(connection: string[]): Promise<string> {
    logging.verbose(`readConfig(connection=${connection})`);

    // TODO
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
   * Writes spectoda config to the controller
   */
  writeConfig(connection: string[], config: JSON | string): Promise<void> {
    logging.verbose(`writeConfig(connection=${connection}, config=${config})`);

    // TODO
    logging.debug("> Updating config...");

    const condif_object = JSON.parse(config_raw);
    config = JSON.stringify(condif_object);

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
   * Reads timeline
   */
  readTimeline(connection: string[]): Promise<TimeTrack> {
    logging.verbose(`readTimeline(connection=${connection})`);

    // TODO
    logging.error("requestTimeline() is deprecated. Use readTimeline() instead");

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

      let timeline = new TimeTrack();

      if (timeline_paused) {
        timeline.setState(timeline_timestamp, true);
      } else {
        timeline.setState(timeline_timestamp + (this.runtime.clock.millis() - clock_timestamp), false);
      }

      return timeline;
    });
  }

  /**
   * This restarts the webassembly spectodas or reboots physical spectoda controllers
   */
  requestRestart(connection: string[]) {
    logging.verbose(`requestRestart(connection=${connection})`);

    // TODO
    logging.debug("> Rebooting device...");

    const payload = [COMMAND_FLAGS.FLAG_DEVICE_REBOOT_REQUEST];
    return this.runtime.request(payload, false);
  }

  /**
   * Removes spectoda network of the given controller
   */
  eraseNetwork(connection: string[]) {
    logging.verbose(`eraseNetwork(connection=${connection})`);

    // TODO
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

  /**
   * Gets a spectoda version of given controller
   */
  //! PARAMETERS UPDATED - now it returns an object with version info
  readVersion(connection: string[]): Promise<{ version: string; prefix: string; major: number; minor: number; patch: number; year: number; month: number; day: number }> {
    logging.verbose(`getFwVersion(connection=${connection})`);

    // TODO
    logging.error("getFwVersion() is deprecated. Use readVersion() instead");

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
   * Reads TNGL fingerprint from given connection
   * @param connection
   */

  readTnglFingerprint(connection: string[]): Promise<Uint8Array> {
    logging.verbose(`readTnglFingerprint(connection=${connection})`);

    // TODO
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

      return new Uint8Array(fingerprint);
    });
  }

  /**
   *
   */
  readConnections(connection: string[]): Promise<string[][]> {
    logging.verbose(`readConnections=${connection}`);

    // TODO
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
   * Synchronizes event history of the used controller to the connection
   * @returns
   */
  //! PARAMETERS UPDATED
  syncEventHistory(connection: string[], connectionToSyncWith: string[] = ["*/ff:ff:ff:ff:ff:ff"]): Promise<void> {
    logging.verbose(`syncEventHistory(connection=${connection}, connectionToSyncWith=${connectionToSyncWith})`);

    // TODO
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

        this.runtime.evaluate(new Uint8Array(historic_events_bytecode), 0x01);
      } else {
        throw "Fail";
      }
    });
  }

  /**
   * Erases event history on given controller
   * @returns
   */
  eraseEventHistory(connection: string[]): Promise<void> {
    logging.verbose(`eraseEventHistory(connection=${connection})`);

    // TODO
    logging.debug("> Erasing event history...");

    const request_uuid = this.#getUUID();
    const bytes = [COMMAND_FLAGS.FLAG_ERASE_EVENT_HISTORY_REQUEST, ...numberToBytes(request_uuid, 4)];

    return this.runtime.execute(bytes, true);
  }

  /**
   * Sleeps the used controller
   */
  requestSleep(connection: string[]): Promise<void> {
    logging.verbose(`requestSleep(connection=${connection})`);

    // TODO
    logging.error("deviceSleep() is deprecated. Use requestSleep() instead");

    logging.debug("> Sleep device...");

    const request_uuid = this.#getUUID();
    const payload = [COMMAND_FLAGS.FLAG_SLEEP_REQUEST, ...numberToBytes(request_uuid, 4)];
    return this.runtime.request(payload, false);
  }

  requestSaveState(connection: string[]): Promise<void> {
    logging.verbose(`requestSaveState(connection=${connection})`);

    // TODO
    logging.debug("> Saving state...");

    const request_uuid = this.#getUUID();
    const payload = [COMMAND_FLAGS.FLAG_SAVE_STATE_REQUEST, ...numberToBytes(request_uuid, 4)];
    return this.runtime.execute(payload, null);
  }

  /**
   *
   */
  writeNetwork(connection: string[], network: { key: number[]; signature: number[] }): Promise<void> {
    logging.verbose(`writeNetwork(connection=${connection}, network=${network})`);

    // TODO
    logging.error("writeOwner() is deprecated. Use writeNetwork() instead");

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
   * Reads the spectoda network
   */
  readNetwork(connection: string[], options = { readSignature: true, readKey: false }): Promise<{ signature: number[] | null; key: number[] | null }> {
    logging.verbose(`readNetwork(connection=${connection}, options=${options})`);

    // TODO
    const network = {
      signature: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      key: null,
    };

    return Promise.resolve(network);
  }

  /**
   * Writes spectoda name
   */
  whiteName(connection: string[], name: string): Promise<void> {
    logging.verbose(`whiteName(connection=${connection}, name=${name})`);

    // TODO
    logging.debug("> Writing Controller Name...");

    const request_uuid = this.#getUUID();
    const payload = [COMMAND_FLAGS.FLAG_WRITE_CONTROLLER_NAME_REQUEST, ...numberToBytes(request_uuid, 4), ...stringToBytes(name, 16)];
    return this.runtime.request(payload, false);
  }

  /**
   * Reads spectoda name
   */
  readName(connection: string[]): Promise<string> {
    logging.verbose(`readName(connection=${connection})`);

    // TODO
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
   * @todo specify returned variable value
   */
  readVariable(connection: string[], variableName: string, id: number): Promise<{ debug: string }> {
    logging.verbose(`readVariable(connection=${connection}, variableName=${variableName}, id=${id})`);

    // TODO
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
   *
   */
  readVariableAddress(connection: string[], variableAddress: number, id: number): Promise<{ debug: string }> {
    logging.verbose(`readVariableAddress(connection=${connection}, variableAddress=${variableAddress}, id=${id})`);

    // TODO
    logging.debug("> Reading variable address...");

    if (this.#getConnectionState() !== "connected") {
      throw "DeviceDisconnected";
    }

    return this.runtime.readVariableAddress(variable_address, device_id);
  }

  // 0.9.4

  writeProperties(connection: string[], properties: { pcbCode: number; productCode: number }): Promise<void> {
    logging.verbose(`writeProperties(connection=${connection}, properties=${properties})`);

    // TODO
    logging.verbose(`writeControllerCodes(pcb_code=${pcb_code}, product_code=${product_code})`);

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

  readProperties(connection: string[]): Promise<{ pcbCode: number; productCode: number }> {
    logging.verbose(`readProperties(connection=${connection})`);

    // TODO
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

  // ======================================================================================================================

  /**
   * @deprecated choose connector in the connect() function
   */
  //! DEPRECATED setConnector() -> connect(connectorType, ...)
  setConnector(connector_type: any) {
    logging.error("setConnector() is deprecated. Use connect(connectorType, ...) instead");
    throw "Deprecated";
  }

  /**
   * @alias this.setConnector
   * @deprecated choose connector in the connect() function
   */
  //! DEPRECATED assignConnector() -> connect(connectorType, ...)
  assignConnector(connector_type: any) {
    logging.error("assignConnector() is deprecated. Use connect(connectorType, ...) instead");
    throw "Deprecated";
  }

  /**
   * @deprecated use setNetwork() instead
   */
  //! DEPRECATED assignOwnerSignature() -> writeNetwork()
  assignOwnerSignature(ownerSignature: any) {
    logging.error("assignOwnerSignature() is deprecated. Use writeNetwork() instead");
    throw "Deprecated";
  }

  /**
   * @deprecated use setNetwork() instead
   */
  //! DEPRECATED setOwnerSignature() -> writeNetwork()
  setOwnerSignature(ownerSignature: any) {
    logging.error("setOwnerSignature() is deprecated. Use writeNetwork() instead");
    throw "Deprecated";
  }

  /**
   * @deprecated use getNetwork() instead
   */
  //! DEPRECATED getOwnerSignature() -> readNetwork()
  getOwnerSignature() {
    logging.error("getOwnerSignature() is deprecated. Use readNetwork() instead");
    throw "Deprecated";
  }

  /**
   * @deprecated use setNetwork() instead
   */
  //! DEPRECATED assignOwnerKey() -> writeNetwork()
  assignOwnerKey(ownerKey: any) {
    logging.error("assignOwnerKey() is deprecated. Use writeNetwork() instead");
    throw "Deprecated";
  }

  /**
   * @deprecated use setNetwork() instead
   */
  //! DEPRECATED assignOwnerKey() -> writeNetwork()
  setOwnerKey(ownerKey: any) {
    logging.error("setOwnerKey() is deprecated. Use writeNetwork() instead");
    throw "Deprecated";
  }

  /**
   * @deprecated use getNetwork() instead
   */
  //! DEPRECATED getOwnerKey() -> readNetwork()
  getOwnerKey() {
    logging.error("getOwnerKey() is deprecated. Use readNetwork() instead");
    throw "Deprecated";
  }

  /**
   * @deprecated use scan() followed by connect() followed by setNetwork()
   */
  //! DEPRECATED - use scan() followed by connect() followed by setNetwork()
  adopt(newDeviceName = null, newDeviceId = null, tnglCode = null, ownerSignature = null, ownerKey = null, autoSelect = false) {
    logging.error("adopt() is deprecated. Use scan() followed by connect() followed by setNetwork()");
    throw "Deprecated";
  }

  /**
   * @deprecated use isConnected()
   */
  //! DEPRECATED - use isConnected()
  connected() {
    logging.error("connected() is deprecated. Use isConnected()");
    throw "Deprecated";
  }

  /**
     *
     * @param {*} eventLabel
     * @param {number|number[]} device_ids
     * @param {*} force_delivery
  
     * @returns
     * @deprecated use emitEmptyEvent() instead
     */
  //! DEPRECATED emitEvent() -> emitEmptyEvent()
  emitEvent(eventLabel: EventLabel, device_ids = [0xff], force_delivery = true) {
    logging.error("emitEvent() is deprecated. Use emitEmptyEvent() instead");
    throw "Deprecated";
  }

  /**
   * @deprecated - is replaced by history merging and scenes
   */
  //! DEPRECATED - no equivalent. Replaced by history merging and scenes
  resendAll() {
    logging.error("resendAll() is deprecated");
    throw "Deprecated";
  }

  /**
   * Downloads firmware and calls updateDeviceFirmware()
   * @param {string} url - whole URL of the firmware file
   * @deprecated Use writeFirmware() instead
   */
  //! DEPRECATED fetchAndUpdateDeviceFirmware() -> writeFirmware()
  async fetchAndUpdateDeviceFirmware(url: any) {
    logging.error("fetchAndUpdateDeviceFirmware() is deprecated. Use writeFirmware() instead");
    throw "Deprecated";
  }

  /**
   * Downloads firmware and calls updateNetworkFirmware()
   * @param {string} url - whole URL of the firmware file
   * @deprecated Use writeFirmware() instead
   */
  //! DEPRECATED fetchAndUpdateNetworkFirmware() -> writeFirmware()
  async fetchAndUpdateNetworkFirmware(url: any) {
    logging.error("fetchAndUpdateNetworkFirmware() is deprecated. Use writeFirmware() instead");
    throw "Deprecated";
  }

  /**
   * @param {Uint8Array} firmware
   * @returns {Promise<void>}
   * @deprecated Use writeFirmware() instead
   */
  //! DEPRECATED updateDeviceFirmware() -> writeFirmware()
  updateDeviceFirmware(firmware: any) {
    logging.error("updateDeviceFirmware() is deprecated. Use writeFirmware() instead");
    throw "Deprecated";
  }

  /**
   *
   * @param {Uint8Array} firmware
   * @returns
   * @deprecated Use spectoda.useBroadcast().writeFirmware() instead
   */
  //! DEPRECATED updateNetworkFirmware() -> writeFirmware()
  updateNetworkFirmware(firmware: any) {
    logging.error("updateNetworkFirmware() is deprecated. Use writeFirmware() instead");
    throw "Deprecated";
  }

  /**
   *
   * @param {string} peer
   * @returns {Promise<void>}
   * @deprecated Use syncFirmware() instead
   */
  //! DEPRECATED updatePeerFirmware() -> syncFirmware()
  async updatePeerFirmware(peer: any) {
    logging.error("updatePeerFirmware() is deprecated. Use syncFirmware() instead");
    throw "Deprecated";
  }

  /**
   * @returns {Promise} config;
   * @deprecated use readConfig() instead
   */
  //! DEPRECATED readNetworkConfig() -> readConfig()
  readDeviceConfig(mac = "ee:33:fa:89:08:08") {
    logging.error("readDeviceConfig() is deprecated. Use readConfig() instead");
    throw "Deprecated";
  }

  /**
   * @param {string} config;
   * @deprecated use writeConfig() instead
   */
  //! DEPRECATED updateDeviceConfig() -> writeConfig()
  updateDeviceConfig(config_raw: any) {
    logging.error("updateDeviceConfig() is deprecated. Use writeConfig() instead");
    throw "Deprecated";
  }

  /**
   * @param {string} config;
   * @deprecated use spectoda.use(connection).useAllConnections().writeConfig() instead
   */
  //! DEPRECATED updateNetworkConfig() -> writeConfig()
  updateNetworkConfig(config: any) {
    logging.error("updateNetworkConfig() is deprecated. Use writeConfig() instead");
    throw "Deprecated";
  }

  /**
   * @returns {Promise<TimeTrack>}
   * @deprecated use readTimeline() instead
   */
  //! DEPRECATED requestTimeline() -> readTimeline()
  requestTimeline() {
    logging.error("requestTimeline() is deprecated. Use readTimeline() instead");
    throw "Deprecated";
  }

  /**
   * @returns {Promise<void>}
   * @deprecated use spectoda.use(connection).useAllConnections().restart() instead
   */
  //! DEPRECATED rebootNetwork() -> requestRestart()
  rebootNetwork() {
    logging.error("rebootNetwork() is deprecated. Use requestRestart() instead");
    throw "Deprecated";
  }

  /**
   * @returns {Promise<void>}
   * @deprecated use spectoda.use(connection).requestRestart() instead
   */
  //! DEPRECATED rebootDevice() -> requestRestart()
  rebootDevice() {
    logging.error("rebootDevice() is deprecated. Use requestRestart() instead");
    throw "Deprecated";
  }

  /**
   * @returns {Promise<void>}
   * @deprecated use spectoda.use(connection).requestRestart() instead
   */
  //! DEPRECATED rebootAndDisconnectDevice() -> requestRestart() then disconnect()
  rebootAndDisconnectDevice() {
    logging.error("rebootAndDisconnectDevice() is deprecated. Use requestRestart() then disconnect() instead");
    throw "Deprecated";
  }

  /**
   * @returns {Promise<string>}
   * @deprecated Use spectoda.use(connection).readVersion() instead
   */
  //! DEPRECATED getFwVersion() -> readVersion()
  getFwVersion() {
    logging.error("getFwVersion() is deprecated. Use readVersion() instead");
    throw "Deprecated";
  }

  /**
   *
   * @deprecated Use readTnglFingerprint() instead
   */
  //! DEPRECATED getTnglFingerprint() -> readTnglFingerprint()
  getTnglFingerprint() {
    logging.error("getTnglFingerprint() is deprecated. Use readTnglFingerprint() instead");
    throw "Deprecated";
  }

  /**
   *
   * @deprecated
   */
  //! DEPRECATED - no equivalent
  setNetworkDatarate(datarate: any) {
    logging.error("setNetworkDatarate() is deprecated");
    throw "Deprecated";
  }

  /**
   *
   * @deprecated
   */
  //! DEPRECATED - no equivalent
  readRomPhyVdd33() {
    logging.error("readRomPhyVdd33() is deprecated");
    throw "Deprecated";
  }

  /**
   *
   * @deprecated
   */
  //! DEPRECATED - no equivalent
  readPinVoltage(pin: any) {
    logging.error("readPinVoltage() is deprecated");
    throw "Deprecated";
  }

  /**
   *
   * @deprecated Use readConnectedPeers() instead
   */
  //! DEPRECATED - getConnectedPeersInfo() -> readConnections()
  getConnectedPeersInfo() {
    logging.error("getConnectedPeersInfo() is deprecated. Use readConnections() instead");
    throw "Deprecated";
  }

  /**
   * @deprecated use requestSleep() instead
   */
  //! DEPRECATED networkSleep() -> requestSleep()
  deviceSleep() {
    logging.error("deviceSleep() is deprecated. Use requestSleep() instead");
    throw "Deprecated";
  }

  /**
   * @deprecated use requestSleep() instead
   */
  //! DEPRECATED networkSleep() -> requestSleep()
  networkSleep() {
    logging.error("networkSleep() is deprecated. Use requestSleep() instead");
    throw "Deprecated";
  }

  /**
   *
   */
  //! DEPRECATED saveState() -> requestSaveState()
  saveState() {
    logging.error("saveState() is deprecated. Use requestSaveState() instead");
    throw "Deprecated";
  }

  /**
   * @deprecated use readProperties() instead
   */
  //! DEPRECATED getControllerInfo() -> readProperties()
  getControllerInfo() {
    logging.error("getControllerInfo() is deprecated. Use readProperties() instead");
    throw "Deprecated";
  }

  /**
   * @deprecated use writeNetwork() instead
   */
  //! DEPRECATED writeOwner() -> writeNetwork()
  writeOwner(ownerSignature = "00000000000000000000000000000000", ownerKey = "00000000000000000000000000000000") {
    logging.error("writeOwner() is deprecated. Use writeNetwork() instead");
    throw "Deprecated";
  }

  /**
   * @deprecated use writeNetwork() instead
   */
  //! DEPRECATED writeNetworkOwner() -> writeNetwork()
  writeNetworkOwner(ownerSignature = "00000000000000000000000000000000", ownerKey = "00000000000000000000000000000000") {
    logging.error("writeNetworkOwner() is deprecated. Use writeNetwork() instead");
    throw "Deprecated";
  }

  /**
   *
   * @param {*} name
   * @returns
   * @deprecated use writeName() instead
   */
  //! DEPRECATED writeControllerName() -> writeName()
  writeControllerName(name: any) {
    logging.error("writeControllerName() is deprecated. Use writeName() instead");
    throw "Deprecated";
  }

  /**
   *
   * @returns
   * @deprecated use readName() instead
   */
  //! DEPRECATED readControllerName() -> readName()
  readControllerName() {
    logging.error("readControllerName() is deprecated. Use readName() instead");
    throw "Deprecated";
  }

  /**
   *
   * @returns
   * @deprecated use readNetwork(options: { readSignature: true, readKey: false }) instead
   */
  //! DEPRECATED readNetworkSignature() -> readNetwork()
  readNetworkSignature() {
    logging.error("readNetworkSignature() is deprecated. Use readNetwork() instead");
    throw "Deprecated";
  }

  /**
   *
   * @param {*} pcb_code
   * @param {*} product_code
   * @returns
   * @deprecated use writeProperties() instead
   */
  //! DEPRECATED writeControllerCodes() -> writeProperties()
  writeControllerCodes(pcb_code: any, product_code: any) {
    logging.error("writeControllerCodes() is deprecated. Use writeProperties() instead");
    throw "Deprecated";
  }

  /**
   *
   * @returns
   * @deprecated use readProperties() instead
   */
  //! DEPRECATED readControllerCodes() -> readProperties()
  readControllerCodes() {
    logging.error("readControllerCodes() is deprecated. Use readProperties() instead");
    throw "Deprecated";
  }
}
