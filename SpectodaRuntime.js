import { FlutterConnector } from "./FlutterConnector";
import { SpectodaDummyConnector } from "./SpectodaDummyConnector";
import { SpectodaWebBluetoothConnector } from "./SpectodaWebBluetoothConnector";
import { SpectodaWebSerialConnector } from "./SpectodaWebSerialConnector";
import { TimeTrack } from "./TimeTrack";
import "./TnglReader";
import { TnglReader } from "./TnglReader";
import "./TnglWriter";
import {
  createNanoEvents,
  createNanoEventsWithWrappedEmit,
  detectAndroid,
  detectChrome,
  detectIPhone,
  detectLinux,
  detectMacintosh,
  detectNode,
  detectSpectodaConnect,
  detectWindows,
  mapValue,
  rgbToHex,
  sleep,
  uint8ArrayToHexString,
} from "./functions";
import { logging } from "./logging";

export const NULL_VALUE = null;

export const COMMAND_FLAGS = Object.freeze({
  FLAG_UNSUPPORTED_COMMND_RESPONSE: 255, // TODO change FLAG_OTA_BEGIN to not be 255.

  // legacy FW update flags
  FLAG_OTA_BEGIN: 255, // legacy
  FLAG_OTA_WRITE: 0, // legacy // TODO change FLAG_OTA_WRITE to not be 0.
  FLAG_OTA_END: 254, // legacy
  FLAG_OTA_RESET: 253, // legacy

  FLAG_DEVICE_REBOOT_REQUEST: 5, // legacy
  FLAG_DEVICE_DISCONNECT_REQUEST: 6,

  FLAG_CONFIG_UPDATE_REQUEST: 10,
  FLAG_CONFIG_UPDATE_RESPONSE: 11,

  // Former CommandFlag begin

  // FLAG_RSSI_DATA:  100,
  FLAG_PEER_CONNECTED: 101,
  FLAG_PEER_DISCONNECTED: 102,

  // FLAG_CONF_BYTES:  103,
  FLAG_REINTERPRET_TNGL: 104,
  FLAG_SET_TIMELINE: 105,

  FLAG_EMIT_EVENT: 111,
  FLAG_EMIT_TIMESTAMP_EVENT: 112,
  FLAG_EMIT_COLOR_EVENT: 113,
  FLAG_EMIT_PERCENTAGE_EVENT: 114,
  FLAG_EMIT_LABEL_EVENT: 115,

  // Former CommandFlag end

  FLAG_READ_CONTROLLER_CODES_REQUEST: 196,
  FLAG_READ_CONTROLLER_CODES_RESPONSE: 197,
  FLAG_WRITE_CONTROLLER_CODES_REQUEST: 198,
  FLAG_WRITE_CONTROLLER_CODES_RESPONSE: 199,
  FLAG_READ_OWNER_SIGNATURE_REQUEST: 200,
  FLAG_READ_OWNER_SIGNATURE_RESPONSE: 201,

  FLAG_WRITE_CONTROLLER_NAME_REQUEST: 202,
  FLAG_WRITE_CONTROLLER_NAME_RESPONSE: 203,
  FLAG_READ_CONTROLLER_NAME_REQUEST: 204,
  FLAG_READ_CONTROLLER_NAME_RESPONSE: 205,

  FLAG_MERGE_EVENT_HISTORY_REQUEST: 206,
  FLAG_MERGE_EVENT_HISTORY_RESPONSE: 207,
  FLAG_ERASE_EVENT_HISTORY_REQUEST: 208,
  FLAG_ERASE_EVENT_HISTORY_RESPONSE: 209,

  FLAG_REQUEST_CONNECTION_REQUEST: 210,
  FLAG_REQUEST_CONNECTION_RESPONSE: 211,

  FLAG_EVENT_HISTORY_BC_REQUEST: 212,
  FLAG_EVENT_HISTORY_BC_RESPONSE: 213,

  FLAG_VISIBLE_PEERS_REQUEST: 214,
  FLAG_VISIBLE_PEERS_RESPONSE: 215,

  FLAG_FW_UPDATE_PEER_REQUEST: 216,
  FLAG_FW_UPDATE_PEER_RESPONSE: 217,

  FLAG_SYNC_STATE_REQUEST: 218,
  FLAG_SYNC_STATE_RESPONSE: 219,

  FLAG_SAVE_STATE_REQUEST: 220,
  FLAG_SAVE_STATE_RESPONSE: 221,

  FLAG_SLEEP_REQUEST: 222,
  FLAG_SLEEP_RESPONSE: 223,
  FLAG_CONNECTED_PEERS_INFO_REQUEST: 224,
  FLAG_CONNECTED_PEERS_INFO_RESPONSE: 225,

  FLAG_DEVICE_CONFIG_REQUEST: 226,
  FLAG_DEVICE_CONFIG_RESPONSE: 227,
  FLAG_INLINE_FUNCTION_CALL_REQUEST: 228,
  FLAG_INLINE_FUNCTION_CALL_RESPONSE: 229,
  // FLAG_GPIO_OPERATION_REQUEST: 230,
  // FLAG_GPIO_OPERATION_RESPONSE: 231,

  FLAG_CHANGE_DATARATE_REQUEST: 232,
  FLAG_CHANGE_DATARATE_RESPONSE: 233,

  FLAG_FW_VERSION_REQUEST: 234,
  FLAG_FW_VERSION_RESPONSE: 235,
  FLAG_ERASE_OWNER_REQUEST: 236,
  FLAG_ERASE_OWNER_RESPONSE: 237,

  FLAG_TNGL_FINGERPRINT_REQUEST: 242,
  FLAG_TNGL_FINGERPRINT_RESPONSE: 243,
  FLAG_TIMELINE_REQUEST: 244,
  FLAG_TIMELINE_RESPONSE: 245,

  FLAG_CONNECT_REQUEST: 238,
  FLAG_CONNECT_RESPONSE: 239,
  FLAG_ADOPT_REQUEST: 240,
  FLAG_ADOPT_RESPONSE: 241,
});

// Spectoda.js -> SpectodaRuntime.js -> | SpectodaXXXConnector.js ->

// SpectodaRuntime vsude vraci Promisy a ma v sobe spolecne
// koncepty pro vsechny konektory. Tzn send queue, ktery paruje odpovedi a resolvuje
// promisy.
// SpectodaRuntime definuje
// userSelect, autoSelect, selected
// connect, disconnect, connected
// execute, request
// setClock, getClock, updateFW
// addEventListener - "connected", "disconnected", "otastatus", "tngl"

// SpectodaXXXConnector.js je jakoby blokujici API, pres ktere se da pripojovat k FW.

/////////////////////////////////////////////////////////////////////////

// TODO Interface proccesses the commands before they are handed to Runtime. It deals with the same command spaming (moving slider generates a lot of events)
// TODO Hands the execute commands to other Interfaces in "paralel" of giving it to its own Runtime.

// Interface -> Interface -> Interface
//     |            |            |
//  Runtime      Runtime      Runtime

// TODO SpectodaRuntime is the host of the FW simulation of the Spectoda Controller Runtime.
// TODO Wasm holds the event history, current TNGL banks and acts like the FW.
// TODO execute commands goes in and when processed goes back out to be handed over to Connectors to sendExecute() the commands to other connected Interfaces
// TODO request commands goes in and if needed another request command goes out to Connectors to sendRequest() to a external Interface with given mac address.

export const allEventsEmitter = createNanoEvents();

function emitHandler(event, args) {
  allEventsEmitter.emit("on", { name: event, args });
}
/////////////////////////////////////////////////////////////////////////

// Deffered object
class Query {
  static TYPE_EXECUTE = 1;
  static TYPE_DELIVER = 2;
  static TYPE_TRANSMIT = 3;
  static TYPE_USERSELECT = 4;
  static TYPE_AUTOSELECT = 5;
  static TYPE_SELECTED = 6;
  static TYPE_UNSELECT = 7;
  static TYPE_SCAN = 16;
  static TYPE_CONNECT = 8;
  static TYPE_CONNECTED = 9;
  static TYPE_DISCONNECT = 10;
  static TYPE_REQUEST = 11;
  static TYPE_SET_CLOCK = 12;
  static TYPE_GET_CLOCK = 13;
  static TYPE_FIRMWARE_UPDATE = 14;
  static TYPE_DESTROY = 15;

  constructor(type, a = null, b = null, c = null, d = null) {
    this.type = type;
    this.a = a;
    this.b = b;
    this.c = c;
    this.d = d;
    this.promise = new Promise((resolve, reject) => {
      this.reject = reject;
      this.resolve = resolve;
    });
  }
}

// filters out duplicate payloads and merges them together. Also decodes payloads received from the connector.
export class SpectodaRuntime {
  #deviceReference;

  #eventEmitter;
  #wakeLock;

  #queue;
  #processing;

  #chunkSize;

  #selecting;
  #disconnectQuery;

  #connectGuard;

  #lastUpdateTime;
  #lastUpdatePercentage;

  #connectedPeers;

  #isPrioritizedWakelock;
  #assignedConnector;

  constructor(deviceReference) {
    this.#deviceReference = deviceReference;

    this.clock = new TimeTrack(0);

    this.connector = /** @type {SpectodaDummyConnector | SpectodaWebBluetoothConnector | SpectodaWebSerialConnector | SpectodaConnectConnector | FlutterConnector  | null} */ (null);

    this.#eventEmitter = createNanoEventsWithWrappedEmit(emitHandler);
    this.#wakeLock = null;

    this.#queue = /** @type {Query[]} */ ([]);
    this.#processing = false;
    this.#chunkSize = 208; // 208 is ESPNOW chunk size

    this.#selecting = false;
    this.#disconnectQuery = null;

    this.#connectGuard = false;

    this.#lastUpdateTime = 0;
    this.#lastUpdatePercentage = 0;

    this.#connectedPeers = [];

    this.#isPrioritizedWakelock = false;
    this.#assignedConnector = "none";

    this.onConnected = e => {};
    this.onDisconnected = e => {};

    this.#eventEmitter.on("ota_status", value => {
      if (value === "begin") {
        this.#lastUpdateTime = new Date().getTime();
        this.#lastUpdatePercentage = 0;
      } else if (value === "end") {
        this.#lastUpdateTime = 0;
        this.#lastUpdatePercentage = 100;
      } else if (value === "fail") {
        this.#lastUpdateTime = 0;
        this.#lastUpdatePercentage = 0;
      } else {
        this.#lastUpdateTime = new Date().getTime();
        this.#lastUpdatePercentage = 0;
      }
    });

    this.#eventEmitter.on("ota_progress", value => {
      const now = new Date().getTime();

      const time_delta = now - this.#lastUpdateTime;
      logging.verbose("time_delta:", time_delta);
      this.#lastUpdateTime = now;

      const percentage_delta = value - this.#lastUpdatePercentage;
      logging.verbose("percentage_delta:", percentage_delta);
      this.#lastUpdatePercentage = value;

      const percentage_left = 100.0 - value;
      logging.verbose("percentage_left:", percentage_left);

      const time_left = (percentage_left / percentage_delta) * time_delta;
      logging.verbose("time_left:", time_left);

      this.emit("ota_timeleft", time_left);
    });

    this.#eventEmitter.on("#connected", e => {
      this.#onConnected(e);
    });

    this.#eventEmitter.on("#disconnected", e => {
      this.#onDisconnected(e);
    });

    // open external links in Flutter SC
    if (detectSpectodaConnect()) {
      // target="_blank" global handler
      // @ts-ignore

      /** @type {HTMLBodyElement} */ document.querySelector("body").addEventListener("click", function (e) {
        e.preventDefault();

        (function (e, d, w) {
          if (!e.composedPath) {
            e.composedPath = function () {
              if (this.path) {
                return this.path;
              }
              var target = this.target;

              this.path = [];
              while (target.parentNode !== null) {
                this.path.push(target);
                target = target.parentNode;
              }
              this.path.push(d, w);
              return this.path;
            };
          }
        })(Event.prototype, document, window);
        // @ts-ignore
        const path = e.path || (e.composedPath && e.composedPath());

        // @ts-ignore
        for (let el of path) {
          if (el.tagName === "A" && el.getAttribute("target") === "_blank") {
            e.preventDefault();
            const url = el.getAttribute("href");
            logging.verbose(url);
            // @ts-ignore
            logging.debug("Openning external url", url);
            window.flutter_inappwebview.callHandler("openExternalUrl", url);
            break;
          }
        }
      });
    }

    window.addEventListener("beforeunload", e => {
      // If I cant disconnect right now for some readon
      // return this.disconnect(false).catch(reason => {
      //   if (reason == "CurrentlyWriting") {
      //     e.preventDefault();
      //     e.cancelBubble = true;
      //     e.returnValue = "Právě probíhá update připojeného zařízení, neopouštějte tuto stránku.";
      //     window.confirm("Právě probíhá update připojeného zařízení, neopouštějte tuto stránku.");
      //   }
      // });

      this.destroyConnector();
    });
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
    return this.#eventEmitter.on(event, callback);
  }
  /**
   * @alias this.addEventListener
   */
  on(event, callback) {
    return this.#eventEmitter.on(event, callback);
  }

  emit(event, ...arg) {
    this.#eventEmitter.emit(event, ...arg);
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

  assignConnector(connector_type = "default") {
    logging.verbose(`assignConnector(connector_type=${connector_type})`);

    if (connector_type === null) {
      connector_type = "none";
    }

    if (connector_type == "") {
      connector_type = "default";
    }

    if (connector_type == "default" || connector_type == "automatic") {
      if (detectSpectodaConnect()) {
        connector_type = "spectodaconnect";
      } else if (navigator.bluetooth) {
        connector_type = "webbluetooth";
      } else {
        connector_type = "none";
      }
    }

    // leave this at info, for faster debug
    logging.info(`> Assigning ${connector_type} connector...`);
    this.#assignedConnector = connector_type;
  }

  async #updateConnector() {
    if ((!this.connector && this.#assignedConnector === "none") || (this.connector && this.connector.type === this.#assignedConnector)) {
      logging.verbose("connector is already set as requested");
      return;
    }

    if (this.connector) {
      await this.connector.disconnect();
      await this.connector.destroy();
    }

    switch (this.#assignedConnector) {
      case "none":
        this.connector = null;
        break;

      case "simulated":
        this.connector = new SpectodaDummyConnector(this, false);
        break;

      case "vdummy":
        return (
          window
            // @ts-ignore
            .prompt("Simulace FW verze dummy connecoru", "VDUMMY_0.8.1_20220301", "Zvolte FW verzi dummy connecoru", "text", {
              placeholder: "DUMMY_0.0.0_00000000",
              regex: /^[\w\d]+_\d.\d.\d_[\d]{8}/,
              invalidText: "FW verze není správná",
              maxlength: 32,
            })
            // @ts-ignore
            .then(version => {
              this.connector = new SpectodaDummyConnector(this, false, version);
            })
        );

      case "edummy":
        this.connector = new SpectodaDummyConnector(this, true);
        break;

      case "webbluetooth":
        if ((detectAndroid() && detectChrome()) || (detectMacintosh() && detectChrome()) || (detectWindows() && detectChrome()) || (detectLinux() && detectChrome())) {
          this.connector = new SpectodaWebBluetoothConnector(this);
        } else {
          //! TODO - spectoda.js should not show any alerts or confirmations
          //! refactor this to be handled by the app - but make sure that evenry app has this handled - and thats the challenge

          // iPhone outside Bluefy and SpectodaConnect
          if (detectIPhone()) {
            // @ts-ignore
            window.confirm("Prohlížeč není podporován. Prosím, stáhněte si aplikaci Spectoda Connect.").then(result => {
              if (result) {
                // redirect na Bluefy v app store
                window.location.replace("https://apps.apple.com/us/app/id1635118423");
              }
            });
          }
          // Macs outside Google Chrome
          else if (detectMacintosh()) {
            // @ts-ignore
            window.confirm("Prohlížeč není podporován. Prosím, otevřete aplikace v prohlížeči Google Chrome.").then(result => {
              if (result) {
                // redirect na Google Chrome
                window.location.replace("https://www.google.com/intl/cs_CZ/chrome/");
              }
            });
          }
          // Android outside Google Chrome
          else if (detectAndroid()) {
            // @ts-ignore
            window.confirm("Prohlížeč není podporován. Prosím, stáhněte si aplikaci Spectoda Connect.").then(result => {
              if (result) {
                // redirect na Google Chrome
                window.location.replace("https://play.google.com/store/apps/details?id=com.spectoda.spectodaconnect");
              }
            });
          }
          // Windows outside Google Chrome
          else if (detectWindows()) {
            // @ts-ignore
            window.confirm("Prohlížeč není podporován. Prosím, otevřete aplikace v prohlížeči Google Chrome.").then(result => {
              if (result) {
                // redirect na Google Chrome
                window.location.replace("https://www.google.com/intl/cs_CZ/chrome/");
              }
            });
          }
          // Linux ChromeBooks atd...
          else {
            window.confirm("Prohlížeč není podporován");
          }

          logging.error("Error: Assigning unsupported connector");
          this.connector = null;
        }

        break;

      case "webserial":
        if (detectChrome()) {
          this.connector = new SpectodaWebSerialConnector(this);
        } else {
          logging.error("Error: Assigning unsupported connector");
          this.connector = null;
        }
        break;

      case "spectodaconnect":
        if (detectSpectodaConnect() || detectWindows() || detectMacintosh()) {
          this.connector = new FlutterConnector(this);
        } else {
          logging.error("Error: Assigning unsupported connector");
          this.connector = null;
        }
        break;

      // case "websockets":
      //   this.connector = new SpectodaWebSocketsConnector(this);
      //   break;

      default:
        logging.warn("Selected unknown connector");
        throw "UnknownConnector";
    }
  }

  userSelect(criteria, timeout = NULL_VALUE) {
    logging.verbose(`userSelect(criteria=${JSON.stringify(criteria)}, timeout=${timeout})`);

    // TODO! check if criteria is valid

    if (this.#selecting) {
      return Promise.reject("SelectingInProgress");
    }

    this.#selecting = true;

    if (criteria === null) {
      criteria = [];
    } else if (!Array.isArray(criteria)) {
      criteria = [criteria];
    }

    const item = new Query(Query.TYPE_USERSELECT, criteria, timeout);
    this.#process(item);

    return item.promise.finally(() => {
      this.#selecting = false;
    });
  }

  autoSelect(criteria, scan_duration = NULL_VALUE, timeout = NULL_VALUE) {
    logging.debug(`autoSelect(criteria=${JSON.stringify(criteria)}, scan_duration=${scan_duration}, timeout=${timeout})`);

    // TODO! check if criteria is valid

    if (this.#selecting) {
      return Promise.reject("SelectingInProgress");
    }

    this.#selecting = true;

    if (criteria === null) {
      criteria = [];
    } else if (!Array.isArray(criteria)) {
      criteria = [criteria];
    }

    const item = new Query(Query.TYPE_AUTOSELECT, criteria, scan_duration, timeout);
    this.#process(item);

    return item.promise.finally(() => {
      this.#selecting = false;
    });
  }

  unselect() {
    logging.verbose("unselect()");

    const item = new Query(Query.TYPE_UNSELECT);
    this.#process(item);
    return item.promise;
  }

  selected() {
    logging.verbose("selected()");

    const item = new Query(Query.TYPE_SELECTED);
    this.#process(item);
    return item.promise;
  }

  scan(criteria, scan_duration = NULL_VALUE) {
    logging.verbose(`scan(criteria=${JSON.stringify(criteria)}, scan_duration=${scan_duration})`);

    // TODO! check if criteria is valid

    if (this.#selecting) {
      return Promise.reject("SelectingInProgress");
    }

    this.#selecting = true;

    if (!Array.isArray(criteria)) {
      criteria = [criteria];
    }

    const item = new Query(Query.TYPE_SCAN, criteria, scan_duration);
    this.#process(item);
    return item.promise.finally(() => {
      this.#selecting = false;
    });
  }

  connect(timeout = NULL_VALUE) {
    logging.verbose(`connect(timeout=${timeout}`);

    const item = new Query(Query.TYPE_CONNECT, timeout);
    this.#process(item);
    return item.promise;
  }

  #onConnected = event => {
    if (this.#connectGuard) {
      logging.warn("Ignoring the #connected event");
      return;
    }

    this.#connectGuard = true;
    this.onConnected(event);
  };

  eraseConnectedPeers() {
    this.#connectedPeers = [];
  }

  eraseConnectedPeer(mac) {
    this.#connectedPeers = this.#connectedPeers.filter(peer => peer !== mac);
  }

  setConnectedPeers(peers) {
    this.#connectedPeers = peers;
  }

  disconnect() {
    const item = new Query(Query.TYPE_DISCONNECT);
    this.#process(item);
    return item.promise;
  }

  #onDisconnected = event => {
    if (!this.#connectGuard) {
      logging.warn("Ignoring the #disconnected event");
      return;
    }

    this.#connectGuard = false;
    this.onDisconnected(event);

    if (this.#disconnectQuery) {
      this.#disconnectQuery.resolve();
    }
  };

  connected() {
    const item = new Query(Query.TYPE_CONNECTED);
    this.#process(item);
    return item.promise;
  }

  execute(bytes, bytes_label, timeout = NULL_VALUE) {
    logging.verbose("execute", { bytes, bytes_label, timeout });

    // TODO! check if bytes is valid

    const item = new Query(Query.TYPE_EXECUTE, bytes, bytes_label, timeout);

    // there must only by one item in the queue with given label
    // this is used to send only the most recent item.
    // for example events
    // so if there is a item with that label, then remove it and
    // push this item to the end of the queue
    if (item.b) {
      for (let i = 0; i < this.#queue.length; i++) {
        if (this.#queue[i].type === Query.TYPE_EXECUTE && this.#queue[i].b === item.b) {
          this.#queue[i].resolve();
          this.#queue.splice(i, 1);
          break;
        }
      }
    }

    this.#process(item);
    return item.promise;
  }

  request(bytes, read_response, timeout = NULL_VALUE) {
    logging.verbose("request", { bytes, read_response, timeout });

    // TODO! check if bytes is valid

    const item = new Query(Query.TYPE_REQUEST, bytes, read_response, timeout);
    this.#process(item);
    return item.promise;
  }

  syncClock() {
    const item = new Query(Query.TYPE_GET_CLOCK, this.clock);

    for (let i = 0; i < this.#queue.length; i++) {
      if (this.#queue[i].type === Query.TYPE_GET_CLOCK) {
        this.#queue[i].reject("MultipleClockReads");
        this.#queue.splice(i, 1);
        break;
      }
    }

    this.#process(item);
    return item.promise.then(clock => {
      logging.debug(`Clock synchronized at time=${clock.millis()}ms`);
      this.clock = clock;
    });
  }

  // getClock() {
  //   const item = new Query(Query.TYPE_GET_CLOCK);

  //   for (let i = 0; i < this.#queue.length; i++) {
  //     if (this.#queue[i].type === Query.TYPE_GET_CLOCK) {
  //       this.#queue[i].reject("MultipleClockReads");
  //       this.#queue.splice(i, 1);
  //       break;
  //     }
  //   }

  //   this.#process(item);
  //   return item.promise;
  // }

  updateFW(firmware_bytes) {
    const item = new Query(Query.TYPE_FIRMWARE_UPDATE, firmware_bytes);

    // TODO! check if firmware_bytes is valid

    for (let i = 0; i < this.#queue.length; i++) {
      if (this.#queue[i].type === Query.TYPE_FIRMWARE_UPDATE) {
        this.#queue[i].reject("Multiple FW Updates");
        this.#queue.splice(i, 1);
        break;
      }
    }

    this.#process(item);
    return item.promise;
  }

  destroyConnector() {
    const item = new Query(Query.TYPE_DESTROY);

    for (let i = 0; i < this.#queue.length; i++) {
      if (this.#queue[i].type === Query.TYPE_DESTROY) {
        this.#queue[i].reject("Multiple Connector destroy()");
        this.#queue.splice(i, 1);
        break;
      }
    }

    this.#process(item);
    return item.promise;
  }

  // starts a "thread" that is processing the commands from queue
  #process(item) {
    if (item) {
      this.#queue.push(item);
    }

    if (!this.#processing) {
      this.#processing = true;

      // spawn async function to handle the transmittion one item at the time
      (async () => {
        await sleep(0.001); // short delay to let fill up the queue to merge the execute items if possible

        let item = undefined;

        try {
          await this.#updateConnector();

          if (!this.connector) {
            item.reject("ConnectorNotAssigned");
            this.#queue = [];
            return;
          }

          while (this.#queue.length > 0) {
            item = this.#queue.shift();

            switch (item.type) {
              case Query.TYPE_USERSELECT:
                {
                  try {
                    await this.connector
                      .userSelect(item.a, item.b) // criteria, timeout
                      .then(device => {
                        item.resolve(device);
                      });
                  } catch (error) {
                    item.reject(error);
                  }
                }
                break;

              case Query.TYPE_AUTOSELECT:
                {
                  try {
                    await this.connector
                      .autoSelect(item.a, item.b, item.c) // criteria, scan_duration, timeout
                      .then(device => {
                        item.resolve(device);
                      });
                  } catch (error) {
                    item.reject(error);
                  }
                }
                break;

              case Query.TYPE_SELECTED:
                {
                  try {
                    await this.connector.selected().then(device => {
                      item.resolve(device);
                    });
                  } catch (error) {
                    item.reject(error);
                  }
                }
                break;

              case Query.TYPE_UNSELECT:
                {
                  try {
                    await this.connector.unselect().then(() => {
                      item.resolve();
                    });
                  } catch (error) {
                    item.reject(error);
                  }
                }
                break;

              case Query.TYPE_SCAN:
                {
                  try {
                    await this.connector
                      .scan(item.a, item.b) // criteria, scan_duration
                      .then(device => {
                        item.resolve(device);
                      });
                  } catch (error) {
                    //logging.warn(error);
                    item.reject(error);
                  }
                }
                break;

              case Query.TYPE_CONNECT:
                {
                  try {
                    await this.connector
                      .connect(item.a) // a = timeout
                      .then(device => {
                        if (!this.#connectGuard) {
                          logging.error("Connection logic error. #connected not called during successful connect()?");
                          logging.warn("Emitting #connected");
                          this.#eventEmitter.emit("#connected");
                        }

                        try {
                          return this.connector
                            .getClock()
                            .then(clock => {
                              this.clock = clock;
                              item.resolve(device);
                            })
                            .catch(error => {
                              this.clock = new TimeTrack(0);
                              logging.warn(error);
                              item.resolve(device);
                            });
                        } catch (error) {
                          logging.error(error);
                          this.clock = null;
                          item.resolve(device);
                        }
                      });
                  } catch (error) {
                    await this.connector.disconnect();
                    item.reject(error);
                  }
                }
                break;

              case Query.TYPE_CONNECTED:
                {
                  try {
                    await this.connector.connected().then(device => {
                      item.resolve(device);
                    });
                  } catch (error) {
                    item.reject(error);
                  }
                }
                break;

              case Query.TYPE_DISCONNECT:
                {
                  this.#disconnectQuery = new Query();

                  try {
                    await this.connector
                      .disconnect()
                      .then(this.#disconnectQuery.promise)
                      .then(() => {
                        this.#disconnectQuery = null;
                        item.resolve();
                      });
                  } catch (error) {
                    item.reject(error);
                  }
                }
                break;

              case Query.TYPE_EXECUTE:
                {
                  let payload = new Uint8Array(0xffff);
                  let index = 0;
                  const timeout = item.c;

                  payload.set(item.a, index);
                  index += item.a.length;

                  let executesInPayload = [item];

                  // while there are items in the queue, and the next item is also TYPE_EXECUTE
                  while (this.#queue.length && this.#queue[0].type == Query.TYPE_EXECUTE) {
                    const next_item = this.#queue.shift();

                    // then check if I have room to merge other payload bytes
                    if (index + next_item.a.length <= this.#chunkSize) {
                      payload.set(next_item.a, index);
                      index += next_item.a.length;
                      executesInPayload.push(next_item);
                    }

                    // if not, then return the item back into the queue
                    else {
                      this.#queue.unshift(next_item);
                      break;
                    }
                  }

                  const data = payload.slice(0, index);

                  logging.debug("EXECUTE", uint8ArrayToHexString(data));
                  this.emit("wasm_execute", data);

                  try {
                    await this.connector.deliver(data, timeout).then(() => {
                      this.process(new DataView(data.buffer), true);
                      executesInPayload.forEach(element => element.resolve());
                    });
                  } catch (error) {
                    executesInPayload.forEach(element => element.reject(error));
                  }
                }
                break;

              case Query.TYPE_REQUEST:
                {
                  // TODO process in internal Interface

                  logging.debug("REQUEST", uint8ArrayToHexString(item.a));
                  this.emit("wasm_request", item.a);

                  try {
                    await this.connector.request(item.a, item.b, item.c).then(response => {
                      item.resolve(response);
                    });
                  } catch (error) {
                    item.reject(error);
                  }
                }
                break;

              case Query.TYPE_SET_CLOCK:
                {
                  this.emit("wasm_clock", item.a.millis());

                  try {
                    await this.connector.setClock(item.a).then(response => {
                      item.resolve(response);
                    });
                  } catch (error) {
                    item.reject(error);
                  }
                }
                break;

              case Query.TYPE_GET_CLOCK:
                {
                  try {
                    await this.connector.getClock().then(clock => {
                      this.emit("wasm_clock", clock.millis());
                      item.resolve(clock);
                    });
                  } catch (error) {
                    item.reject(error);
                  }
                }
                break;

              case Query.TYPE_FIRMWARE_UPDATE:
                {
                  try {
                    await this.requestWakeLock();
                  } catch {}

                  try {
                    await this.connector.updateFW(item.a).then(response => {
                      item.resolve(response);
                    });
                  } catch (error) {
                    item.reject(error);
                  }

                  try {
                    this.releaseWakeLock();
                  } catch {}
                }
                break;

              case Query.TYPE_DESTROY:
                {
                  try {
                    await this.connector.disconnect();
                    await this.connector.destroy();
                  } catch (error) {
                    console.warn("Error while destroying connector:", error);
                  } finally {
                    this.connector = null;
                    item.resolve();
                  }
                }
                break;

              default:
                {
                  logging.error("ERROR");
                }
                break;
            }
          }
        } catch (e) {
          logging.error("Error while #process", item, ":", e);
        } finally {
          this.#processing = false;
        }
      })();
    }
  }

  process(bytecode, came_from_this = false) {
    try {
      this.emit("wasm_execute", new Uint8Array(bytecode.buffer));

      let reader = new TnglReader(bytecode);

      let utc_timestamp = new Date().getTime();

      logging.verbose(reader);

      let emitted_events = [];

      while (reader.available > 0) {
        const command_flag = reader.peekFlag();

        switch (command_flag) {
          case COMMAND_FLAGS.FLAG_REINTERPRET_TNGL:
            {
              logging.verbose("FLAG_REINTERPRET_TNGL");
              reader.readFlag(); // COMMAND_FLAGS.FLAG_REINTERPRET_TNGL

              const clock_ms = reader.readUint48();
              const uint8_t = reader.readUint8();
              const tngl_size = reader.readUint32();
              //const bytecode_offset = reader.position() + offset;
              reader.forward(tngl_size);

              logging.verbose(`tngl_size=${tngl_size}`);
              //logging.debug("bytecode_offset=%u", bytecode_offset);
            }
            break;

          case COMMAND_FLAGS.FLAG_EMIT_EVENT:
          case COMMAND_FLAGS.FLAG_EMIT_TIMESTAMP_EVENT:
          case COMMAND_FLAGS.FLAG_EMIT_COLOR_EVENT:
          case COMMAND_FLAGS.FLAG_EMIT_PERCENTAGE_EVENT:
          case COMMAND_FLAGS.FLAG_EMIT_LABEL_EVENT:
            {
              let event_value = null;
              let event_type = "unknown";

              let log_value_prefix = "";
              let log_value_postfix = "";

              const event_flag = reader.readFlag();

              switch (event_flag) {
                case COMMAND_FLAGS.FLAG_EMIT_EVENT:
                  logging.verbose("FLAG_EVENT");
                  event_value = null;
                  event_type = "none";
                  break;

                case COMMAND_FLAGS.FLAG_EMIT_TIMESTAMP_EVENT:
                  logging.verbose("FLAG_TIMESTAMP_EVENT");
                  event_value = reader.readInt32();
                  event_type = "timestamp";
                  log_value_postfix = "ms";
                  break;

                case COMMAND_FLAGS.FLAG_EMIT_COLOR_EVENT:
                  logging.verbose("FLAG_COLOR_EVENT");
                  const bytes = reader.readBytes(3);
                  event_value = rgbToHex(bytes[0], bytes[1], bytes[2]);
                  event_type = "color";
                  break;

                case COMMAND_FLAGS.FLAG_EMIT_PERCENTAGE_EVENT:
                  logging.verbose("FLAG_PERCENTAGE_EVENT");
                  event_value = Math.round(mapValue(reader.readInt32(), -268435455, 268435455, -100, 100) * 1000000.0) / 1000000.0;
                  event_type = "percentage";
                  log_value_postfix = "%";
                  break;

                case COMMAND_FLAGS.FLAG_EMIT_LABEL_EVENT:
                  logging.verbose("FLAG_LABEL_EVENT");
                  event_value = String.fromCharCode(...reader.readBytes(5)).match(/[\w\d_]*/g)[0];
                  event_type = "label";
                  log_value_prefix = "$";
                  break;

                default:
                  if (logging.level >= 4) {
                    logging.warn(`Unknown event flag: ${event_flag}`);
                  }
                  reader.forward(reader.available);
                  return;
              }

              logging.verbose(`event_value = ${event_value}`);

              const event_label = String.fromCharCode(...reader.readBytes(5)).match(/[\w\d_]*/g)[0]; // 5 bytes
              logging.verbose(`event_label = ${event_label}`);

              let event_timestamp = reader.readUint48(); // 6 bytes in 0.9
              logging.verbose(`event_timestamp = ${event_timestamp} ms`);

              const event_device_id = reader.readUint8(); // 1 byte
              logging.verbose(`event_device_id = ${event_device_id}`);

              if (event_timestamp === 0 || event_timestamp >= 0xffffffffffff) {
                event_timestamp = this.clock.millis();
              }

              emitted_events.unshift({
                type: event_type, // The type of the event as string "none", "timestamp", "color", "percentage", "label"
                value: event_value, // null (type="none"), number (type="timestamp"), string e.g. "#ff00ff" (type="color"), number (type="percentage"), string (type="label")
                label: event_label, // Label label as a string e.g. "event"
                timestamp: event_timestamp, // TNGL Network Clock Timestamp as number
                id: event_device_id, // Event destination ID as number
                timestamp_utc: utc_timestamp--,
                info: `${event_device_id.toString().padStart(3)} -> $${event_label}: ${log_value_prefix + event_value + log_value_postfix} [${event_timestamp}ms]`, // debug information
              });
            }
            break;

          case COMMAND_FLAGS.FLAG_SET_TIMELINE:
            {
              logging.verbose("FLAG_SET_TIMELINE");
              reader.readFlag(); // COMMAND_FLAGS.FLAG_SET_TIMELINE

              const PAUSED_FLAG = 1 << 4;

              // (int32_t) = clock_timestamp
              // (int32_t) = timeline_timestamp
              // (uint8_t) = timeline_flags bits: [ Reserved,Reserved,Reserved,PausedFLag,IndexBit3,IndexBit2,IndexBit1,IndexBit0]

              const clock_timestamp = reader.readUint48(); // 6 bytes in 0.9
              const timeline_timestamp = reader.readInt32();
              const timeline_flags = reader.readUint8();
              logging.verbose(`clock_timestamp = ${clock_timestamp} ms`);
              logging.verbose(`timeline_timestamp = ${timeline_timestamp} ms`);
              logging.verbose(`timeline_flags = ${timeline_flags}`);

              const timeline_paused = timeline_flags & PAUSED_FLAG ? true : false;
              logging.verbose(`timeline_paused = ${timeline_paused ? "true" : "false"}`);

              if (came_from_this) {
                logging.verbose("skipping bytecode timeline update that came from this device");
                break;
              }

              if (timeline_paused) {
                this.#deviceReference.timeline.pause();
                this.#deviceReference.timeline.setMillis(timeline_timestamp);
              } else {
                const time_delta = this.clock.millis() - clock_timestamp;
                const current_timeline_timestamp = timeline_timestamp + time_delta;

                this.#deviceReference.timeline.unpause();
                this.#deviceReference.timeline.setMillis(current_timeline_timestamp);
              }
            }
            break;

          case COMMAND_FLAGS.FLAG_PEER_CONNECTED:
            {
              logging.verbose("FLAG_PEER_CONNECTED");
              reader.readFlag(); // CommandFlag::FLAG_PEER_CONNECTED

              const device_mac = reader
                .readBytes(6)
                .map(v => v.toString(16).padStart(2, "0"))
                .join(":");

              if (this.#connectedPeers.includes(device_mac) === false) {
                this.#connectedPeers.push(device_mac);
                this.#eventEmitter.emit("peer_connected", device_mac);
              }
            }
            break;

          case COMMAND_FLAGS.FLAG_PEER_DISCONNECTED:
            {
              logging.verbose("FLAG_PEER_DISCONNECTED");
              reader.readFlag(); // CommandFlag::FLAG_PEER_DISCONNECTED

              const device_mac = reader
                .readBytes(6)
                .map(v => v.toString(16).padStart(2, "0"))
                .join(":");

              this.#eventEmitter.emit("peer_disconnected", device_mac);
              this.eraseConnectedPeer(device_mac);
            }
            break;

          // // request land

          case COMMAND_FLAGS.FLAG_OTA_BEGIN:
            {
              logging.verbose("FLAG_OTA_BEGIN");
              reader.readFlag(); // FLAG_OTA_BEGIN

              const header_checksum = reader.readUint8();
              const header_size = reader.readUint32();

              // logging.verbose("header_checksum=%u", header_checksum);
              // logging.verbose("header_size=%u", header_size);
            }
            break;

          case COMMAND_FLAGS.FLAG_OTA_WRITE:
            {
              logging.verbose("FLAG_OTA_WRITE");
              reader.readFlag(); // FLAG_OTA_WRITE

              const header_checksum = reader.readUint8();
              const header_size = reader.readUint32();

              reader.forward(reader.available);

              // logging.verbose("header_checksum=%u", header_checksum);
              // logging.verbose("header_size=%u", header_size);
              // logging.verbose("bytes_size=%u", bytes_size);
            }
            break;

          case COMMAND_FLAGS.FLAG_OTA_END:
            {
              logging.verbose("FLAG_OTA_END");
              reader.readFlag(); // FLAG_OTA_END

              const header_checksum = reader.readUint8();
              const header_size = reader.readUint32();

              // logging.verbose("header_checksum=%u", header_checksum);
              // logging.verbose("header_size=%u", header_size);
            }
            break;

          case COMMAND_FLAGS.FLAG_OTA_RESET:
            {
              logging.verbose("FLAG_OTA_RESET");
              reader.readFlag(); // FLAG_OTA_RESET

              const header_checksum = reader.readUint8();
              const header_size = reader.readUint32();

              // logging.verbose("header_checksum=%u", header_checksum);
              // logging.verbose("header_size=%u", header_size);
            }
            break;

          default:
            if (logging.level >= 4) {
              logging.warn(`Unknown Command flag=${command_flag}, available=${reader.available})`);
            }
            reader.forward(reader.available);
            return;
        }
      }

      if (emitted_events.length) {
        emitted_events.sort((a, b) => a.timestamp - b.timestamp);
        logging.verbose("emitted_events", emitted_events);
        this.emit("emitted_events", emitted_events);

        if (logging.level >= 3) {
          const informations = emitted_events.map(x => x.info);
          logging.info(informations.join("\n"));
        }
      }
    } catch (e) {
      logging.error("Error during process:", e);
    }
  }
}

//////////////
