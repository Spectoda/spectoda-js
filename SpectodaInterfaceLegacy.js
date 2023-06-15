import { logging } from "./Logging.js";
import {
  colorToBytes,
  createNanoEvents,
  hexStringToUint8Array,
  labelToBytes,
  numberToBytes,
  percentageToBytes,
  sleep,
  stringToBytes,
  noSleep,
  detectSpectodaConnect,
  mapValue,
  rgbToHex,
  detectAndroid,
  detectSafari,
  detectChrome,
  detectWindows,
  detectLinux,
  detectIPhone,
  detectMacintosh,
  uint8ArrayToHexString,
} from "./functions.js";
import { SpectodaDummyConnector } from "./SpectodaDummyConnector.js";
import { SpectodaWebBluetoothConnector } from "./SpectodaWebBluetoothConnector.js";
import { SpectodaWebSerialConnector } from "./SpectodaWebSerialConnector.js";
// import { SpectodaConnectConnector } from "./SpectodaConnectConnector.js";
import { SpectodaWebSocketsConnector } from "./SpectodaWebSocketsConnector.js";
import { TimeTrack } from "./TimeTrack.js";
import "./TnglReader.js";
import "./TnglWriter.js";
import { TnglReader } from "./TnglReader.js";
import { FlutterConnector } from "./FlutterConnector.js";
import { t } from "./i18n.js";

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

  FLAG_WRITE_CONTROLLER_NAME_REQUEST: 202,
  FLAG_WRITE_CONTROLLER_NAME_RESPONSE: 203,
  FLAG_READ_CONTROLLER_NAME_REQUEST: 204,
  FLAG_READ_CONTROLLER_NAME_RESPONSE: 205,

  FLAG_MERGE_EVENT_HISTORY_REQUEST: 206,
  FLAG_MERGE_EVENT_HISTORY_RESPONSE: 207,
  FLAG_ERASE_EVENT_HISTORY_REQUEST: 208,
  FLAG_ERASE_EVENT_HISTORY_RESPONSE: 209,

  FLAG_REQUEST_PEER_REQUEST: 210,
  FLAG_REQUEST_PEER_RESPONSE: 211,

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
  FLAG_ROM_PHY_VDD33_REQUEST: 228,
  FLAG_ROM_PHY_VDD33_RESPONSE: 229,
  FLAG_VOLTAGE_ON_PIN_REQUEST: 230,
  FLAG_VOLTAGE_ON_PIN_RESPONSE: 231,

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

// Spectoda.js -> SpectodaInterfaceLegacy.js -> | SpectodaXXXConnector.js ->

// SpectodaInterfaceLegacy vsude vraci Promisy a ma v sobe spolecne
// koncepty pro vsechny konektory. Tzn send queue, ktery paruje odpovedi a resolvuje
// promisy.
// SpectodaInterfaceLegacy definuje
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

// TODO SpectodaInterfaceLegacy is the host of the FW simulation of the Spectoda Controller Runtime.
// TODO Wasm holds the event history, current TNGL banks and acts like the FW.
// TODO execute commands goes in and when processed goes back out to be handed over to Connectors to sendExecute() the commands to other connected Interfaces
// TODO request commands goes in and if needed another request command goes out to Connectors to sendRequest() to a external Interface with given mac address.

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
export class SpectodaInterfaceLegacy {
  #deviceReference;

  #eventEmitter;
  #wakeLock;

  #queue;
  #processing;

  #chunkSize;

  // #reconection;
  #selecting;
  #disconnectQuery;

  #reconnectionInterval;

  #connectGuard;

  #lastUpdateTime;
  #lastUpdatePercentage;

  #connectedPeers;

  constructor(deviceReference /*, reconnectionInterval = 1000*/) {
    this.#deviceReference = deviceReference;

    this.clock = new TimeTrack(0);

    this.connector = /** @type {SpectodaDummyConnector | SpectodaWebBluetoothConnector | SpectodaWebSerialConnector | SpectodaConnectConnector | FlutterConnector | SpectodaWebSocketsConnector | null} */ (null);

    this.#eventEmitter = createNanoEvents();
    this.#wakeLock = null;

    this.#queue = /** @type {Query[]} */ ([]);
    this.#processing = false;
    this.#chunkSize = 208; // 208 is ESPNOW chunk size

    // this.#reconection = false;
    this.#selecting = false;
    this.#disconnectQuery = null;

    // this.#reconnectionInterval = reconnectionInterval;

    this.#connectGuard = false;

    this.#lastUpdateTime = new Date().getTime();
    this.#lastUpdatePercentage = 0;

    this.#connectedPeers = [];

    this.onConnected = e => {};
    this.onDisconnected = e => {};

    this.#eventEmitter.on("ota_progress", value => {
      const now = new Date().getTime();

      const time_delta = now - this.lastUpdateTime;
      logging.verbose("time_delta:", time_delta);
      this.lastUpdateTime = now;

      const percentage_delta = value - this.lastUpdatePercentage;
      logging.verbose("percentage_delta:", percentage_delta);
      this.lastUpdatePercentage = value;

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

  requestWakeLock() {
    logging.debug("> Activating wakeLock...");
    if (detectSpectodaConnect()) {
      return window.flutter_inappwebview.callHandler("setWakeLock", true);
    } else {
      return noSleep.enable();
    }
  }

  releaseWakeLock() {
    logging.debug("> Deactivating wakeLock...");
    if (detectSpectodaConnect()) {
      return window.flutter_inappwebview.callHandler("setWakeLock", false);
    } else {
      noSleep.disable();
      return Promise.resolve();
    }
  }

  assignConnector(connector_type = "default") {
    if (connector_type === null) {
      connector_type = "none";
    }

    if (connector_type == "") {
      connector_type = "default";
    }

    // leave this at info, for faster debug
    logging.info(`> Assigning ${connector_type} connector...`);

    if ((!this.connector && connector_type === "none") || (this.connector && this.connector.type === connector_type)) {
      logging.warn("Reassigning current connector.");
      // return Promise.resolve();
    }

    if (connector_type == "default" || connector_type == "automatic") {
      if (detectSpectodaConnect()) {
        connector_type = "flutter";
      } else if (navigator.bluetooth) {
        connector_type = "webbluetooth";
      } else {
        connector_type = "none";
      }
    }

    return (this.connector ? this.destroyConnector() : Promise.resolve())
      .catch(() => {})
      .then(() => {
        switch (connector_type) {
          case "none":
            this.connector = null;
            break;

          case "dummy":
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
              // iPhone outside Bluefy and SpectodaConnect
              if (detectIPhone()) {
                // @ts-ignore
                window.confirm(t("Z tohoto webového prohlížeče bohužel není možné NARU ovládat. Prosím, stáhněte si aplikaci Spectoda Connect."), t("Prohlížeč není podporován")).then(result => {
                  if (result) {
                    // redirect na Bluefy v app store
                    window.location.replace("https://apps.apple.com/us/app/id1635118423");
                  }
                });
              }
              // Macs outside Google Chrome
              else if (detectMacintosh()) {
                // @ts-ignore
                window.confirm(t("Z tohoto webového prohlížeče bohužel není možné NARU ovládat. Prosím, otevřete aplikace v prohlížeči Google Chrome."), t("Prohlížeč není podporován")).then(result => {
                  if (result) {
                    // redirect na Google Chrome
                    window.location.replace("https://www.google.com/intl/cs_CZ/chrome/");
                  }
                });
              }
              // Android outside Google Chrome
              else if (detectAndroid()) {
                // @ts-ignore
                window.confirm(t("Z tohoto webového prohlížeče bohužel není možné NARU ovládat. Prosím, stáhněte si aplikaci Spectoda Connect."), t("Prohlížeč není podporován")).then(result => {
                  if (result) {
                    // redirect na Google Chrome
                    window.location.replace("https://play.google.com/store/apps/details?id=com.spectoda.spectodaconnect");
                  }
                });
              }
              // Windows outside Google Chrome
              else if (detectWindows()) {
                // @ts-ignore
                window.confirm(t("Z tohoto webového prohlížeče bohužel není možné NARU ovládat. Prosím, otevřete aplikace v prohlížeči Google Chrome."), t("Prohlížeč není podporován")).then(result => {
                  if (result) {
                    // redirect na Google Chrome
                    window.location.replace("https://www.google.com/intl/cs_CZ/chrome/");
                  }
                });
              }
              // Linux ChromeBooks atd...
              else {
                window.confirm(t("Z tohoto webového prohlížeče bohužel nejspíš není možné NARU ovládat."));
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

          case "flutter":
            if (detectSpectodaConnect() || detectWindows() || detectMacintosh()) {
              this.connector = new FlutterConnector(this);
            } else {
              logging.error("Error: Assigning unsupported connector");
              this.connector = null;
            }
            break;

          case "websockets":
            this.connector = new SpectodaWebSocketsConnector(this);
            break;

          default:
            logging.warn("Selected unknown connector");
            throw "UnknownConnector";
        }
      });
  }

  // reconnection(enable) {
  //   this.#reconection = enable;
  // }

  userSelect(criteria, timeout = 600000) {
    // this.#reconection = false;

    if (timeout < 1000) {
      logging.error("Timeout is too short.");
      return Promise.reject("InvalidTimeout");
    }

    if (this.#selecting) {
      return Promise.reject("SelectingInProgress");
    }

    this.#selecting = true;

    if (criteria === null) {
      criteria = [];
    } else if (!Array.isArray(criteria)) {
      criteria = [criteria];
    }

    logging.debug(`userSelect(criteria=${JSON.stringify(criteria)}, timeout=${timeout}`);

    const item = new Query(Query.TYPE_USERSELECT, criteria, timeout);
    this.#process(item);

    return item.promise.finally(() => {
      this.#selecting = false;
    });
  }

  autoSelect(criteria, scan_period = 4000, timeout = 10000) {
    // this.#reconection = false;

    if (timeout < 1000) {
      logging.error("Timeout is too short.");
      return Promise.reject("InvalidTimeout");
    }

    if (this.#selecting) {
      return Promise.reject("SelectingInProgress");
    }

    this.#selecting = true;

    if (criteria === null) {
      criteria = [];
    } else if (!Array.isArray(criteria)) {
      criteria = [criteria];
    }

    logging.debug(`autoSelect(criteria=${JSON.stringify(criteria)}, scan_period=${scan_period}, timeout=${timeout}`);

    const item = new Query(Query.TYPE_AUTOSELECT, criteria, scan_period, timeout);
    this.#process(item);

    return item.promise.finally(() => {
      this.#selecting = false;
    });

  }

  unselect() {
    const item = new Query(Query.TYPE_UNSELECT);
    this.#process(item);
    return item.promise;
  }

  selected() {
    const item = new Query(Query.TYPE_SELECTED);
    this.#process(item);
    return item.promise;
  }

  scan(criteria, scan_period = 5000) {
    // this.#reconection = false;

    if (scan_period < 1000) {
      logging.error("Scan period is too short.");
      return Promise.reject("InvalidScanPeriod");
    }

    if (this.#selecting) {
      return Promise.reject("SelectingInProgress");
    }

    this.#selecting = true;

    if (criteria === null) {
      criteria = [];
    } else if (!Array.isArray(criteria)) {
      criteria = [criteria];
    }

    const item = new Query(Query.TYPE_SCAN, criteria, scan_period);
    this.#process(item);
    return item.promise.finally(() => {
      this.#selecting = false;
    });
  }

  connect(timeout = 10000, supportLegacy = false) {
    if (timeout < 1000) {
      logging.error("Timeout is too short.");
      return Promise.reject("InvalidTimeout");
    }

    const item = new Query(Query.TYPE_CONNECT, timeout, supportLegacy);
    this.#process(item);
    return item.promise;
  }

  #onConnected = event => {
    if (this.#connectGuard) {
      logging.error("Connecting logic error. #connected called when already connected?");
      logging.warn("Ignoring the #connected event");
      return;
    }

    this.#connectGuard = true;
    this.onConnected(event);
  };

  eraseConnectedPeers() {
    this.#connectedPeers = [];
  }

  setConnectedPeers(peers) {
    this.#connectedPeers = peers;
  }

  disconnect() {
    // this.#reconection = false;

    const item = new Query(Query.TYPE_DISCONNECT);
    this.#process(item);
    return item.promise;
  }

  #onDisconnected = event => {
    if (!this.#connectGuard) {
      logging.error("Connecting logic error. #disconnected called when already disconnected?");
      logging.warn("Ignoring the #disconnected event");
      return;
    }

    this.#connectGuard = false;
    this.onDisconnected(event);

    // if (this.#reconection && this.#reconnectionInterval) {
    //   logging.info("Reconnecting...");
    //   setTimeout(() => {
    //     logging.debug("Reconnecting device");
    //     return this.connect(this.#reconnectionInterval).catch(() => {
    //       logging.warn("Reconnection failed.");
    //     });
    //   }, 2000);
    // }

    if (this.#disconnectQuery) {
      this.#disconnectQuery.resolve();
    }
  };

  connected() {
    const item = new Query(Query.TYPE_CONNECTED);
    this.#process(item);
    return item.promise;
  }

  execute(bytes, bytes_label, timeout = 5000) {
    if (timeout < 100) {
      logging.error("Timeout is too short.");
      return Promise.reject("InvalidTimeout");
    }

    logging.verbose("execute", { bytes, bytes_label, timeout });
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

  request(bytes, read_response = true, timeout = 5000) {
    if (timeout < 100) {
      logging.error("Timeout is too short.");
      return Promise.reject("InvalidTimeout");
    }

    logging.verbose("request", { bytes, read_response, timeout });
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

        try {
          while (this.#queue.length > 0) {
            const item = this.#queue.shift();

            if (this.connector === null || this.connector === undefined) {
              logging.warn("Trying to do something while connector is not assigned");
              item.reject("ConnectorNotAssigned");
              continue;
            }

            switch (item.type) {
              case Query.TYPE_USERSELECT:
                // this.#reconection = false;
                await this.connector
                  .userSelect(item.a, item.b) // criteria, timeout
                  .then(device => {
                    item.resolve(device);
                  })
                  .catch(error => {
                    //logging.warn(error);
                    item.reject(error);
                  });
                break;

              case Query.TYPE_AUTOSELECT:
                // this.#reconection = false;
                await this.connector
                  .autoSelect(item.a, item.b, item.c) // criteria, scan_period, timeout
                  .then(device => {
                    item.resolve(device);
                  })
                  .catch(error => {
                    //logging.warn(error);
                    item.reject(error);
                  });
                break;

              case Query.TYPE_SELECTED:
                await this.connector
                  .selected()
                  .then(device => {
                    item.resolve(device);
                  })
                  .catch(error => {
                    //logging.warn(error);
                    item.reject(error);
                  });
                break;

              case Query.TYPE_UNSELECT:
                // this.#reconection = false;
                await this.connector
                  .unselect()
                  .then(() => {
                    item.resolve();
                  })
                  .catch(error => {
                    //logging.warn(error);
                    item.reject(error);
                  });
                break;

              case Query.TYPE_SCAN:
                await this.connector
                  .scan(item.a, item.b) // criteria, scan_period
                  .then(device => {
                    item.resolve(device);
                  })
                  .catch(error => {
                    //logging.warn(error);
                    item.reject(error);
                  });
                break;

              case Query.TYPE_CONNECT:
                // this.#reconection = true;
                logging.verbose("TYPE_CONNECT begin");
                await this.connector
                  .connect(item.a, item.b) // a = timeout, b = supportLegacy
                  .then(device => {

                    if (!this.#connectGuard) {
                      logging.error("Connection logic error. #connected not called during successful connect()?");
                      logging.warn("Emitting #connected");
                      this.#eventEmitter.emit("#connected");
                    }

                    return (
                      this.connector
                        .getClock()
                        .then(clock => {
                          this.clock = clock;
                          item.resolve(device);
                        })
                        // .catch(error => {
                        //   this.disconnect();
                        //   logging.warn(error);
                        //   item.reject(error);
                        // });
                        .catch(error => {
                          logging.error(error);
                          this.clock = null;
                          item.resolve(device);
                        })
                    );
                  })
                  .catch(error => {
                    this.disconnect();
                    //logging.warn(error);
                    item.reject(error);
                  });
                break;

              case Query.TYPE_CONNECTED:
                await this.connector
                  .connected()
                  .then(device => {
                    item.resolve(device);
                  })
                  .catch(error => {
                    //logging.warn(error);
                    item.reject(error);
                  });
                break;

              case Query.TYPE_DISCONNECT:
                // this.#reconection = false;
                this.#disconnectQuery = new Query();
                await this.connector
                  .disconnect()
                  .then(this.#disconnectQuery.promise)
                  .then(() => {
                    this.#disconnectQuery = null;
                    item.resolve();
                  })
                  .catch(error => {
                    //logging.warn(error);
                    item.reject(error);
                  });
                break;

              case Query.TYPE_EXECUTE:
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

                await this.connector
                  .deliver(data, timeout)
                  .then(() => {
                    try {
                      this.process(new DataView(data.buffer));
                    } catch (e) {
                      logging.error(e);
                    }
                    // item.resolve();
                    executesInPayload.forEach(element => element.resolve());
                  })
                  .catch(error => {
                    //logging.warn(error);
                    // item.reject(error);
                    executesInPayload.forEach(element => element.reject(error));
                  });
                break;

              case Query.TYPE_REQUEST:
                // TODO process in internal Interface
                // this.process(new DataView(data.buffer)).catch((e)=>{console.error(e)});

                logging.debug("REQUEST", uint8ArrayToHexString(item.a));

                this.emit("wasm_request", item.a);

                await this.connector
                  .request(item.a, item.b, item.c)
                  .then(response => {
                    item.resolve(response);
                  })
                  .catch(error => {
                    logging.warn(error);
                    item.reject(error);
                  });
                break;

              case Query.TYPE_SET_CLOCK:
                this.emit("wasm_clock", item.a.millis());

                await this.connector
                  .setClock(item.a)
                  .then(response => {
                    item.resolve(response);
                  })
                  .catch(error => {
                    //logging.warn(error);
                    item.reject(error);
                  });
                break;

              case Query.TYPE_GET_CLOCK:
                await this.connector
                  .getClock()
                  .then(clock => {
                    this.emit("wasm_clock", clock.millis());

                    item.resolve(clock);
                  })
                  .catch(error => {
                    //logging.warn(error);
                    item.reject(error);
                  });
                break;

              case Query.TYPE_FIRMWARE_UPDATE:
                try {
                  await this.requestWakeLock();
                } catch {}
                await this.connector
                  .updateFW(item.a)
                  .then(response => {
                    item.resolve(response);
                  })
                  .catch(error => {
                    //logging.warn(error);
                    item.reject(error);
                  })
                  .finally(() => {
                    this.releaseWakeLock();
                  });
                break;

              case Query.TYPE_DESTROY:
                // this.#reconection = false;
                await this.connector
                  .request([COMMAND_FLAGS.FLAG_DEVICE_DISCONNECT_REQUEST], false)
                  .catch(() => {})
                  .then(() => {
                    return this.connector.disconnect();
                  })
                  .then(() => {
                    return this.connector.destroy();
                  })
                  .then(() => {
                    this.connector = null;
                    item.resolve();
                  })
                  .catch(error => {
                    //logging.warn(error);
                    this.connector = null;
                    item.reject(error);
                  });
                break;

              default:
                break;
            }
          }
        } catch (e) {
          logging.error(e);
        } finally {
          this.#processing = false;
        }
      })();
    }
  }

  process(bytecode) {

    this.emit("wasm_execute", new Uint8Array(bytecode.buffer));

    let reader = new TnglReader(bytecode);

    let utc_timestamp = new Date().getTime();

    logging.verbose(reader);

    let emitted_events = [];

    while (reader.available > 0) {
      switch (reader.peekFlag()) {
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

            // Runtime::feed(reader, bytecode_offset, tngl_size);
          }
          break;

        case COMMAND_FLAGS.FLAG_EMIT_EVENT:
        case COMMAND_FLAGS.FLAG_EMIT_TIMESTAMP_EVENT:
        case COMMAND_FLAGS.FLAG_EMIT_COLOR_EVENT:
        case COMMAND_FLAGS.FLAG_EMIT_PERCENTAGE_EVENT:
        case COMMAND_FLAGS.FLAG_EMIT_LABEL_EVENT:
          {
            // let is_lazy = false;
            let event_value = null;
            let event_type = "unknown";

            let log_value_prefix = "";
            let log_value_postfix = "";

            switch (reader.readFlag()) {
              // case COMMAND_FLAGS.FLAG_EMIT_LAZY_EVENT:
              //   is_lazy = true;
              case COMMAND_FLAGS.FLAG_EMIT_EVENT:
                logging.verbose("FLAG_EVENT");
                event_value = null;
                event_type = "none";
                break;

              // case COMMAND_FLAGS.FLAG_EMIT_LAZY_TIMESTAMP_EVENT:
              //   is_lazy = true;
              case COMMAND_FLAGS.FLAG_EMIT_TIMESTAMP_EVENT:
                logging.verbose("FLAG_TIMESTAMP_EVENT");
                event_value = reader.readInt32();
                event_type = "timestamp";
                log_value_postfix = "ms";
                break;

              // case COMMAND_FLAGS.FLAG_EMIT_LAZY_COLOR_EVENT:
              //   is_lazy = true;
              case COMMAND_FLAGS.FLAG_EMIT_COLOR_EVENT:
                logging.verbose("FLAG_COLOR_EVENT");
                const bytes = reader.readBytes(3);
                event_value = rgbToHex(bytes[0], bytes[1], bytes[2]);
                event_type = "color";
                break;

              // case COMMAND_FLAGS.FLAG_EMIT_LAZY_PERCENTAGE_EVENT:
              //   is_lazy = true;
              case COMMAND_FLAGS.FLAG_EMIT_PERCENTAGE_EVENT:
                logging.verbose("FLAG_PERCENTAGE_EVENT");
                event_value = Math.round(mapValue(reader.readInt32(), -268435455, 268435455, -100, 100) * 1000000.0) / 1000000.0;
                event_type = "percentage";
                log_value_postfix = "%";
                break;

              // case COMMAND_FLAGS.FLAG_EMIT_LAZY_LABEL_EVENT:
              //   is_lazy = true;
              case COMMAND_FLAGS.FLAG_EMIT_LABEL_EVENT:
                logging.verbose("FLAG_LABEL_EVENT");
                event_value = String.fromCharCode(...reader.readBytes(5)).match(/[\w\d_]*/g)[0];
                event_type = "label";
                log_value_prefix = "$";
                break;

              default:
                // logging.error("ERROR");
                break;
            }

            // logging.verbose(`is_lazy = ${is_lazy ? "true" : "false"}`);
            logging.verbose(`event_value = ${event_value}`);

            const event_label = String.fromCharCode(...reader.readBytes(5)).match(/[\w\d_]*/g)[0]; // 5 bytes
            logging.verbose(`event_label = ${event_label}`);

            const event_timestamp = reader.readUint48(); // 6 bytes in 0.9
            logging.verbose(`event_timestamp = ${event_timestamp} ms`);

            const event_device_id = reader.readUint8(); // 1 byte
            logging.verbose(`event_device_id = ${event_device_id}`);

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
          logging.error(`ERROR flag=${reader.readFlag()}, available=${reader.available}`);
          reader.forward(reader.available);
          break;
      }
    }

    if (emitted_events.length) {
      this.emit("emitted_events", emitted_events);

      const informations = emitted_events.map(x => x.info);
      logging.info(informations.join("\n"));
    }
  }
}

//////////////
