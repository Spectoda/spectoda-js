import { NULL_VALUE, COMMAND_FLAGS, SpectodaRuntime, allEventsEmitter } from "./SpectodaRuntime";
import { TnglCodeParser } from "./SpectodaParser";
import { WEBSOCKET_URL } from "./SpectodaWebSocketsConnector";
import { colorToBytes, computeTnglFingerprint, detectSpectodaConnect, hexStringToUint8Array, labelToBytes, numberToBytes, percentageToBytes, sleep, strMacToBytes, stringToBytes, uint8ArrayToHexString } from "./functions";
import { logging, setLoggingLevel } from "./logging";
import { io } from "socket.io-client";
import customParser from "socket.io-msgpack-parser";
import { TimeTrack } from "./TimeTrack";
import "./TnglReader";
import { TnglReader } from "./TnglReader";
import "./TnglWriter";

const DEFAULT_TNGL_BANK = 0;
export class Spectoda {
  #uuidCounter;
  #ownerSignature;
  #ownerKey;
  #connecting;
  #disconnecting;
  #updating;

  #connectionState;
  #websocketConnectionState;
  #reconnectTheSameController;
  #connectCriteria;

  // mechanism for event ordering
  #lastEmitClockTimestamp;

  #eventHistory;

  constructor(connectorType = "default") {
    // nextjs
    if (typeof window === "undefined") {
      return;
    }

    this.timeline = new TimeTrack(0, true);

    this.#uuidCounter = Math.floor(Math.random() * 0xffffffff);

    this.#ownerSignature = null;
    this.#ownerKey = null;

    this.runtime = new SpectodaRuntime(this);

    if (connectorType) {
      this.runtime.assignConnector(connectorType);
    }

    this.#connecting = false;
    this.#disconnecting = false;

    this.#updating = false;

    this.#connectionState = "disconnected";
    this.#websocketConnectionState = "disconnected";
    this.#reconnectTheSameController = false;
    this.#connectCriteria = null;

    this.#lastEmitClockTimestamp = 0;

    this.#eventHistory = {};
    for (let id = 0; id < 256; id++) {
      this.#eventHistory[id] = {};
    }

    this.runtime.on("emitted_events", events => {
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

      logging.verbose("#eventHistory", this.#eventHistory);
    });

    this.runtime.onConnected = event => {
      logging.info("> Interface connected");

      this.#reconnectTheSameController = false;
    };

    this.runtime.onDisconnected = event => {
      logging.info("> Interface disconnected");

      // clear out the local event history
      this.#eventHistory = {};
      for (let id = 0; id < 256; id++) {
        this.#eventHistory[id] = {};
      }

      if (this.#connecting || this.#disconnecting) {
        // if we are in the middle of connecting or disconnecting, we should reconnect or set the state to disconnected
        return;
      }

      if (this.#connectionState === "connected") {
        logging.info("> Reconnecting controller...");
        this.#setConnectionState("connecting");

        const RECONNECT_TO_SAME_THE_CONTROLLER_TIMEOUT = 2000;
        return (this.#reconnectTheSameController ? this.runtime.connect(RECONNECT_TO_SAME_THE_CONTROLLER_TIMEOUT) : this.connect(this.#connectCriteria, true, this.#ownerSignature, this.#ownerKey))
          .then(() => {
            logging.info("> Reconnection successful");
            this.#setConnectionState("connected");
          })
          .catch((e) => {
            logging.warn("> Reconnection failed:", e);
            this.#setConnectionState("disconnected");
          })
          .finally(() => {
            this.#reconnectTheSameController = false;
          })

      } else {
        logging.info("> Controller disconnected");
        this.#setConnectionState("disconnected");
      }

      this.#reconnectTheSameController = false;
    };

    // auto clock sync loop
    setInterval(() => {
      if (!this.#updating && this.runtime.connector) {
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

  #setNextReconnectToTheSameController() {
    this.#reconnectTheSameController = true;
  }

  #setWebSocketConnectionState(websocketConnectionState) {
    switch (websocketConnectionState) {
      case "connecting":
        if (websocketConnectionState !== this.#websocketConnectionState) {
          logging.warn("> WS connecting");
          this.#websocketConnectionState = websocketConnectionState;
          this.runtime.emit("connecting-websockets");
        }
        break;
      case "connected":
        if (websocketConnectionState !== this.#websocketConnectionState) {
          logging.warn("> WS connected");
          this.#websocketConnectionState = websocketConnectionState;
          this.runtime.emit("connected-websockets");
        }
        break;
      case "disconnecting":
        if (websocketConnectionState !== this.#websocketConnectionState) {
          logging.warn("> WS disconnecting");
          this.#connectionState = websocketConnectionState;
          this.runtime.emit("disconnecting-websockets");
        }
        break;
      case "disconnected":
        if (websocketConnectionState !== this.#websocketConnectionState) {
          logging.warn("> WS disconnected");
          this.#connectionState = websocketConnectionState;
          this.runtime.emit("disconnected-websockets");
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
          logging.warn("> Spectoda connecting");
          this.#connectionState = connectionState;
          this.runtime.emit("connecting");
        }
        break;
      case "connected":
        if (connectionState !== this.#connectionState) {
          logging.warn("> Spectoda connected");
          this.#connectionState = connectionState;
          this.runtime.emit("connected");
        }
        break;
      case "disconnecting":
        if (connectionState !== this.#connectionState) {
          logging.warn("> Spectoda disconnecting");
          this.#connectionState = connectionState;
          this.runtime.emit("disconnecting");
        }
        break;
      case "disconnected":
        if (connectionState !== this.#connectionState) {
          logging.warn("> Spectoda disconnected");
          this.#connectionState = connectionState;
          this.runtime.emit("disconnected");
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
    return this.runtime.requestWakeLock(prioritized);
  }

  releaseWakeLock(prioritized = false) {
    return this.runtime.releaseWakeLock(prioritized);
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
  async enableRemoteControl({ signature, key, sessionOnly, meta }) {
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
      this.socket.emit("set-meta-data", meta);
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
    return this.runtime.addEventListener(event, callback);
  }
  /**
   * @alias this.addEventListener
   */
  on(event, callback) {
    return this.runtime.on(event, callback);
  }

  scan() {
    logging.info(`scan()`);

    return this.runtime.scan([{}], NULL_VALUE);
  }

  connect(criteria = null, autoConnect = true, ownerSignature = null, ownerKey = null, connectAny = false, fwVersion = "") {
    logging.info(`connect(criteria=${criteria}, autoConnect=${autoConnect}, ownerSignature=${ownerSignature}, ownerKey=${ownerKey}, connectAny=${connectAny}, fwVersion=${fwVersion})`);

    if (this.#connecting) {
      return Promise.reject("ConnectingInProgress");
    }

    if (this.#disconnecting) {
      return Promise.reject("DisconnectingInProgress");
    }

    if (ownerSignature) {
      this.#setOwnerSignature(ownerSignature);
    }

    if (ownerKey) {
      this.#setOwnerKey(ownerKey);
    }

    if (!connectAny) {
      if (!this.#ownerSignature) {
        return Promise.reject("OwnerSignatureNotAssigned");
      }

      if (!this.#ownerKey) {
        return Promise.reject("OwnerKeyNotAssigned");
      }
    }

    this.#setConnectionState("connecting");
    this.#connecting = true;

    if (!criteria) {
      criteria = [{}];
    }
    else if (!Array.isArray(criteria)) {
      criteria = [criteria];
    }

    if (!connectAny) {
      for (let i = 0; i < criteria.length; i++) {
        criteria[i].ownerSignature = this.#ownerSignature;
      }
    }

    if (typeof fwVersion === "string" && fwVersion.match(/(!?)([\d]+).([\d]+).([\d]+)/)) {
      for (let i = 0; i < criteria.length; i++) {
        criteria[i].fwVersion = fwVersion;
      }
    }

    this.#connectCriteria = criteria;

    return (autoConnect ? this.runtime.autoSelect(this.#connectCriteria, NULL_VALUE, NULL_VALUE) : this.runtime.userSelect(this.#connectCriteria, NULL_VALUE))
      .then(() => {
        return this.runtime.connect(NULL_VALUE);
      })
      .then(connectedDeviceInfo => {
        logging.info("> Synchronizing Network State...");
        return (this.timeline.paused() ? this.requestTimeline() : this.syncTimeline())
          .catch(e => {
            logging.error("Timeline sync after reconnection failed:", e);
          })
          .then(() => {
            return this.runtime.connected();
          })
          .then(connected => {
            if (!connected) {
              return Promise.reject("ConnectionFailed");
            }

            setTimeout(() => {
              this.readEventHistory().catch(e => {
                logging.error("readEventHistory() failed:", e);
              });
            }, 250);

            this.#setConnectionState("connected");
            return connectedDeviceInfo;
          })
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

    if (this.#connecting) {
      Promise.reject("ConnectingInProgress");
    }

    if (this.#disconnecting) {
      Promise.reject("DisconnectingInProgress");
    }

    this.#disconnecting = true;

    if (this.#connectionState === "disconnected") {
      Promise.reject("DeviceAlreadyDisconnected");
    }

    this.#setConnectionState("disconnecting");
    return this.runtime.disconnect().finally(() => {
      this.#setConnectionState("disconnected");
      this.#disconnecting = false;
    });
  }

  connected() {
    if (this.#connecting || this.#disconnecting) {
      return Promise.resolve(null); // resolve nothing === not connected
    }

    return this.runtime.connected();
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

    logging.debug(processed_tngl_code);

    return processed_tngl_code;
  }

  async checkTnglMatch(newTnglFingerprintHex) {
    const MISSING_TNGL_FINGERPRINT = "0000000000000000000000000000000000000000000000000000000000000000";

    const EMPTY_TNGL_FINGERPRINT = "ba5a56fbe0fc8c3e2b545130e43499a6d2e8debb11bf09a280dce1623a0a7039";

    const currentTnglFingerprint = await this.getTnglFingerprint(DEFAULT_TNGL_BANK);
    const currentTnglFingerprintHex = uint8ArrayToHexString(currentTnglFingerprint);

    return {
      isMatch: newTnglFingerprintHex === currentTnglFingerprintHex,
      isEmpty: EMPTY_TNGL_FINGERPRINT === currentTnglFingerprintHex,
      isMissing: MISSING_TNGL_FINGERPRINT === currentTnglFingerprintHex,
    };
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

  writeTngl(tnglCode, tnglBytes = null, memoryBank = 0) {
    logging.verbose("writeTngl()");

    if (memoryBank === null || memoryBank === undefined) {
      memoryBank = 0;
    }

    if (tnglCode === null && tnglBytes === null) {
      return Promise.reject("InvalidParameters");
    }

    if (tnglBytes === null) {
      const parser = new TnglCodeParser();

      tnglBytes = parser.parseTnglCode(tnglCode);
    }

    const timeline_flags = this.timeline.paused() ? 0b00010000 : 0b00000000;

    const timeline_bytecode = [COMMAND_FLAGS.FLAG_SET_TIMELINE, ...numberToBytes(this.runtime.clock.millis(), 6), ...numberToBytes(this.timeline.millis(), 4), timeline_flags];

    const reinterpret_bytecode = [COMMAND_FLAGS.FLAG_REINTERPRET_TNGL, ...numberToBytes(this.runtime.clock.millis(), 6), memoryBank, ...numberToBytes(tnglBytes.length, 4), ...tnglBytes];

    const payload = [...timeline_bytecode, ...reinterpret_bytecode];
    return this.runtime.execute(payload, "TNGL");
  }

  #getEmitEventClockTimestamp() {
    // this mechanizm is used to ensure that events are emitted in the correct order
    let emit_timestamp = this.runtime.clock.millis();
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
    logging.verbose(`emitPercentageEvent(label=${event_label},value=${event_value},id=${device_ids},force=${force_delivery})`);

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
      return this.runtime.execute(payload, force_delivery ? null : "E" + event_label + device_id);
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
    const payload = [COMMAND_FLAGS.FLAG_SET_TIMELINE, ...numberToBytes(this.runtime.clock.millis(), 6), ...numberToBytes(this.timeline.millis(), 4), flags];
    return this.runtime.execute(payload, "TMLN");
  }

  syncClock() {
    logging.debug("> Syncing clock from device");
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

  updateDeviceFirmware(firmware) {
    logging.verbose(`updateDeviceFirmware(firmware.length=${firmware?.length})`);
    logging.debug({ firmware });

    if (!firmware || firmware.length < 10000) {
      logging.error("Invalid firmware");
      return Promise.reject("InvalidFirmware");
    }

    return this.runtime.updateFW(firmware).then(() => {
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

    this.runtime.requestWakeLock();

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
        this.runtime.emit("ota_status", "begin");

        {
          //===========// RESET //===========//
          logging.info("OTA RESET");

          const command_bytes = [COMMAND_FLAGS.FLAG_OTA_RESET, 0x00, ...numberToBytes(0x00000000, 4)];
          await this.runtime.execute(command_bytes, null, 30000);
        }

        await sleep(100);

        {
          //===========// BEGIN //===========//
          logging.info("OTA BEGIN");

          const command_bytes = [COMMAND_FLAGS.FLAG_OTA_BEGIN, 0x00, ...numberToBytes(firmware.length, 4)];
          await this.runtime.execute(command_bytes, null, 30000);
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
            await this.runtime.execute(command_bytes, null, 30000);

            written += index_to - index_from;

            const percentage = Math.floor((written * 10000) / firmware.length) / 100;
            logging.info(percentage + "%");
            this.runtime.emit("ota_progress", percentage);

            index_from += chunk_size;
            index_to = index_from + chunk_size;
          }
        }

        await sleep(100);

        {
          //===========// END //===========//
          logging.info("OTA END");

          const command_bytes = [COMMAND_FLAGS.FLAG_OTA_END, 0x00, ...numberToBytes(written, 4)];
          await this.runtime.execute(command_bytes, null, 30000);
        }

        await sleep(3000);

        await this.rebootNetwork();

        logging.debug("Firmware written in " + (new Date().getTime() - start_timestamp) / 1000 + " seconds");

        this.runtime.emit("ota_status", "success");

        resolve(null);
        return;
      } catch (e) {
        this.runtime.emit("ota_status", "fail");
        reject(e);
        return;
      }
    })

      .finally(() => {
        this.runtime.releaseWakeLock();
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

  updateDeviceConfig(config_raw, shouldReboot = true) {
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
    const request_bytes = [COMMAND_FLAGS.FLAG_CONFIG_UPDATE_REQUEST, ...numberToBytes(request_uuid, 4), ...numberToBytes(config_bytes_size, 4), ...config_bytes];
    return this.runtime.request(request_bytes, true).then(response => {
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
      } else {
        throw "Fail";
      }

      if (shouldReboot) {
        return this.rebootDevice();
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

  updateNetworkConfig(config, shouldReboot = true) {
    logging.debug("> Updating config of whole network...");

    const encoder = new TextEncoder();
    const config_bytes = encoder.encode(config);
    const config_bytes_size = config.length;

    // make config update request
    const request_uuid = this.#getUUID();
    const request_bytes = [COMMAND_FLAGS.FLAG_CONFIG_UPDATE_REQUEST, ...numberToBytes(request_uuid, 4), ...numberToBytes(config_bytes_size, 4), ...config_bytes];

    return this.runtime.execute(request_bytes, "CONF").then(() => {
      if (shouldReboot) {
        return this.rebootNetwork();
      }
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

  // Code.device.interface.execute([240,1,0,0,0,5],null)
  rebootNetwork() {
    logging.debug("> Rebooting network...");
    this.#setNextReconnectToTheSameController();
    const payload = [COMMAND_FLAGS.FLAG_DEVICE_REBOOT_REQUEST];
    return this.runtime.execute(payload, null);
  }

  rebootDevice() {
    logging.debug("> Rebooting device...");
    this.#setNextReconnectToTheSameController();
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

  removeOwner(shouldReboot = true) {
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

      return (shouldReboot ? this.rebootDevice().catch(() => { }) : Promise.resolve(null))
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

  removeNetworkOwner(shouldReboot = true) {
    logging.debug("> Removing network owner...");

    const request_uuid = this.#getUUID();
    const bytes = [COMMAND_FLAGS.FLAG_ERASE_OWNER_REQUEST, ...numberToBytes(request_uuid, 4)];

    return this.runtime.execute(bytes, true).then(() => {
      if (shouldReboot) {
        return this.rebootNetwork();
      }
    });
  }

  getFwVersion() {
    logging.debug("> Requesting fw version...");

    const request_uuid = this.#getUUID();
    const bytes = [COMMAND_FLAGS.FLAG_FW_VERSION_REQUEST, ...numberToBytes(request_uuid, 4)];

    logging.info("getFwVersion", { bytes });

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

    return this.runtime.request(bytes, true).then(response => {
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

  // datarate in bits per second
  setNetworkDatarate(datarate) {
    logging.debug(`> Setting network datarate to ${datarate} bsp...`);

    const request_uuid = this.#getUUID();
    const payload = [COMMAND_FLAGS.FLAG_CHANGE_DATARATE_REQUEST, ...numberToBytes(request_uuid, 4), ...numberToBytes(datarate, 4)];

    return this.runtime.execute(payload, null);
  }

  setDebugLevel(level) {
    setLoggingLevel(level);
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
        this.runtime.eraseConnectedPeers();
        this.runtime.setConnectedPeers(peers.map(x => x.mac));
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
        logging.verbose(`historic_events_bytecode_size=${historic_events_bytecode_size}`);

        const historic_events_bytecode = reader.readBytes(historic_events_bytecode_size);
        logging.verbose(`historic_events_bytecode=[${historic_events_bytecode}]`);

        this.runtime.process(new DataView(new Uint8Array(historic_events_bytecode).buffer));
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
    logging.debug("> Sleep device...");

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

  writeOwner(ownerSignature = "00000000000000000000000000000000", ownerKey = "00000000000000000000000000000000") {
    logging.debug("> Writing owner to device...", ownerSignature, ownerKey);

    const owner_signature_bytes = hexStringToUint8Array(ownerSignature, 16);
    const owner_key_bytes = hexStringToUint8Array(ownerKey, 16);

    logging.info("owner_signature_bytes", owner_signature_bytes);
    logging.info("owner_key_bytes", owner_key_bytes);

    const request_uuid = this.#getUUID();
    const bytes = [COMMAND_FLAGS.FLAG_ADOPT_REQUEST, ...numberToBytes(request_uuid, 4), ...owner_signature_bytes, ...owner_key_bytes];

    logging.verbose(bytes);

    return this.runtime
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

  writeNetworkCodes(pcb_code, product_code) {
    logging.debug("> Writing network codes...");

    const request_uuid = this.#getUUID();
    const bytes = [COMMAND_FLAGS.FLAG_WRITE_CONTROLLER_CODES_REQUEST, ...numberToBytes(request_uuid, 4), ...numberToBytes(pcb_code, 2), ...numberToBytes(product_code, 2)];

    return this.runtime.execute(bytes, true);
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

  getEmittedEvents(ids) {
    // Check if ids is not an array and make it an array if necessary
    if (!Array.isArray(ids)) {
      ids = [ids];
    }

    return this.readEventHistory()
      .catch(() => {
        logging.warn("Failed to read event history");
      })
      .then(() => {
        const events = [];

        for (const id of ids) {
          for (const event in this.#eventHistory[id]) {
            events.push(this.#eventHistory[id][event]);
          }
        }

        // Step 2: Sort the events by timestamp
        events.sort((a, b) => a.timestamp - b.timestamp);

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

  // 0.9.9

  WIP_requestFunctionCall(function_code, arg1, arg2, arg3, arg4) {
    logging.debug(`> Requesting function call: function_code=${function_code}, arg1=${arg1}, arg2=${arg2}, arg3=${arg3}, arg4=${arg4}`);

    if (typeof function_code !== "number") {
      throw "InvalidFunctionCode";
    }

    if (arg1 === undefined) arg1 = 0;
    if (arg2 === undefined) arg2 = 0;
    if (arg3 === undefined) arg3 = 0;
    if (arg4 === undefined) arg4 = 0;

    const request_uuid = this.#getUUID();
    const bytes = [
      COMMAND_FLAGS.FLAG_INLINE_FUNCTION_CALL_REQUEST,
      ...numberToBytes(request_uuid, 4),
      ...numberToBytes(function_code, 4),
      ...numberToBytes(arg1, 4),
      ...numberToBytes(arg2, 4),
      ...numberToBytes(arg3, 4),
      ...numberToBytes(arg4, 4),
    ];

    return this.runtime.request(bytes, true).then(response => {
      let reader = new TnglReader(response);

      logging.verbose("response=", response);

      if (reader.readFlag() !== COMMAND_FLAGS.FLAG_INLINE_FUNCTION_CALL_RESPONSE) {
        throw "InvalidResponseFlag";
      }

      const response_uuid = reader.readUint32();

      if (response_uuid != request_uuid) {
        logging.error("InvalidResponseUuid");
        throw "InvalidResponseUuid";
      }

      const error_code = reader.readUint8();

      logging.verbose(`error_code=${error_code}`);

      if (error_code !== 0) {
        throw "Fail";
      }

      const result = reader.readUint32();
      logging.debug(`result=${result}`);
      const bytes = reader.readBytes(reader.available);
      logging.debug(`bytes=${bytes}`);

      return { result, bytes };
    });
  }
}
