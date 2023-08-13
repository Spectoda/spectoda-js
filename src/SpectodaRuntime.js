import { logging } from "../logging.ts";
import {
  createNanoEvents,
  sleep,
  detectSpectodaConnect,
  detectAndroid,
  detectChrome,
  detectWindows,
  detectLinux,
  detectIPhone,
  detectMacintosh,
  uint8ArrayToHexString,
} from "../functions";
import { SpectodaDummyConnector } from "../SpectodaDummyConnector.js";
import { SpectodaWebBluetoothConnector } from "../SpectodaWebBluetoothConnector.js";
import { SpectodaWebSerialConnector } from "../SpectodaWebSerialConnector.js";
// import { SpectodaConnectConnector } from "./SpectodaConnectConnector.js";
import { SpectodaWebSocketsConnector } from "../SpectodaWebSocketsConnector.js";
import { TimeTrack } from "../TimeTrack.js";
import "../TnglReader.js";
import "../TnglWriter.js";
import { FlutterConnector } from "../FlutterConnector.js";
import { t } from "../i18n.js";
import { SpectodaInterface } from "./SpectodaInterface.js";
import { set } from "firebase/database";
import { SimulationConnector } from "./connector/SimulationConnector.js";


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
  #spectodaReference;

  #eventEmitter;

  #queue;
  #processing;

  #chunkSize;

  #selecting;
  #disconnectQuery;

  #connectGuard;

  #lastUpdateTime;
  #lastUpdatePercentage;

  constructor(spectodaReference) {
    this.#spectodaReference = spectodaReference;

    this.interface = new SpectodaInterface(this);

    this.clock = new TimeTrack(0);

    // TODO implement a way of having more than one connector at the same time
    this.connector = /** @type {SpectodaDummyConnector | SpectodaWebBluetoothConnector | SpectodaWebSerialConnector | SpectodaConnectConnector | FlutterConnector | SpectodaWebSocketsConnector | null} */ (null);

    this.#eventEmitter = createNanoEvents();

    this.#queue = /** @type {Query[]} */ ([]);
    this.#processing = false;
    this.#chunkSize = 208; // 208 is ESPNOW chunk size

    this.#selecting = false;
    this.#disconnectQuery = null;

    this.#connectGuard = false;

    this.#lastUpdateTime = new Date().getTime();
    this.#lastUpdatePercentage = 0;

    this.onConnected = e => { };
    this.onDisconnected = e => { };

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
      this.interface.destruct();
    });

    setTimeout(async () => {

      const UPS = 30; // updates per second

      try {
        await this.interface.construct("spectoda", "01:23:45:67:89:ab", 0, 255);

        const f = (async () => {
          await this.interface.compute(); // for non visual mode compute is sufficient
          setTimeout(f, 1000 / UPS);
        });

        f();

      } catch (e) {
        logging.error(e);
      };

    }, 0);
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
    return this.on(event, callback);
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

  assignConnector(connector_type = "default") {
    logging.verbose(`assignConnector(connector_type=${connector_type})`);

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

    return this.destroyConnector().catch(() => { })
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

          case "simulation":
            this.connector = new SimulationConnector(this);
            break;

          default:
            logging.warn("Selected unknown connector");
            throw "UnknownConnector";
        }
      });
  }

  userSelect(criteria, timeout = 600000) {
    logging.verbose(`userSelect(criteria=${JSON.stringify(criteria)}, timeout=${timeout}`);

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

    const item = new Query(Query.TYPE_USERSELECT, criteria, timeout);
    this.#process(item);

    return item.promise.finally(() => {
      this.#selecting = false;
    });
  }

  autoSelect(criteria, scan_period = 4000, timeout = 10000) {
    logging.verbose(`autoSelect(criteria=${JSON.stringify(criteria)}, scan_period=${scan_period}, timeout=${timeout}`);

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

    const item = new Query(Query.TYPE_AUTOSELECT, criteria, scan_period, timeout);
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

  scan(criteria, scan_period = 5000) {
    logging.verbose(`scan(criteria=${JSON.stringify(criteria)}, scan_period=${scan_period}`);

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
    logging.verbose(`connect(timeout=${timeout}, supportLegacy=${supportLegacy}`);

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

  disconnect() {
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

    if (this.#disconnectQuery) {
      this.#disconnectQuery.resolve();
    }
  };

  connected() {
    const item = new Query(Query.TYPE_CONNECTED);
    this.#process(item);
    return item.promise;
  }

  evaluate(bytecode_uint8array, source_connection) {
    logging.debug("evaluate", { bytecode_uint8array, source_connection });

    this.interface.execute(bytecode_uint8array, source_connection);
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

        let item = undefined;

        try {
          while (this.#queue.length > 0) {
            item = this.#queue.shift();

            if (this.connector === null || this.connector === undefined) {
              item.reject("ConnectorNotAssigned");
              continue;
            }

            switch (item.type) {
              case Query.TYPE_USERSELECT: {
                try {
                  await this.connector
                    .userSelect(item.a, item.b) // criteria, timeout
                    .then(device => {
                      item.resolve(device);
                    });
                } catch (error) {
                  item.reject(error);
                }
              } break;

              case Query.TYPE_AUTOSELECT: {
                try {
                  await this.connector
                    .autoSelect(item.a, item.b, item.c) // criteria, scan_period, timeout
                    .then(device => {
                      item.resolve(device);
                    });
                } catch (error) {
                  item.reject(error);
                }
              } break;

              case Query.TYPE_SELECTED: {
                try {
                  await this.connector
                    .selected()
                    .then(device => {
                      item.resolve(device);
                    });
                } catch (error) {
                  item.reject(error);
                }
              } break;

              case Query.TYPE_UNSELECT: {
                try {
                  await this.connector
                    .unselect()
                    .then(() => {
                      item.resolve();
                    });
                } catch (error) {
                  item.reject(error);
                }
              } break;

              case Query.TYPE_SCAN: {
                try {
                  await this.connector
                    .scan(item.a, item.b) // criteria, scan_period
                    .then(device => {
                      item.resolve(device);
                    });
                } catch (error) {
                  //logging.warn(error);
                  item.reject(error);
                }
              } break;

              case Query.TYPE_CONNECT: {
                try {
                  await this.connector
                    .connect(item.a, item.b) // a = timeout, b = supportLegacy
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
                          });
                      }
                      catch (error) {
                        logging.error(error);
                        this.clock = null;
                        item.resolve(device);
                      }
                    });
                } catch (error) {
                  await this.connector.disconnect();
                  item.reject(error);
                }
              } break;

              case Query.TYPE_CONNECTED: {
                try {
                  await this.connector
                    .connected()
                    .then(device => {
                      item.resolve(device);
                    });
                } catch (error) {
                  item.reject(error);
                }
              } break;

              case Query.TYPE_DISCONNECT: {
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

              } break;

              case Query.TYPE_EXECUTE: {
                let payload = new Uint8Array(0xffff);
                let index = 0;

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
                const timeout = item.c;

                logging.debug("EXECUTE", uint8ArrayToHexString(data));
                this.emit("wasm_execute", data);

                this.interface.execute(data, 0x00);

                try {
                  await this.connector
                    .deliver(data, timeout)
                    .then(() => {
                      executesInPayload.forEach(element => element.resolve());
                    })
                } catch (error) {
                  executesInPayload.forEach(element => element.reject(error));
                }

              } break;

              case Query.TYPE_REQUEST: {
                // TODO process in internal Interface

                logging.debug("REQUEST", uint8ArrayToHexString(item.a));
                this.emit("wasm_request", item.a);

                try {
                  await this.connector
                    .request(item.a, item.b, item.c)
                    .then(response => {
                      item.resolve(response);
                    });
                } catch (error) {
                  item.reject(error);
                }
              } break;

              case Query.TYPE_SET_CLOCK: {
                this.emit("wasm_clock", item.a.millis());

                try {
                  await this.connector
                    .setClock(item.a)
                    .then(response => {
                      item.resolve(response);
                    });
                } catch (error) {
                  item.reject(error);
                }
              } break;

              case Query.TYPE_GET_CLOCK: {

                try {
                  await this.connector
                    .getClock()
                    .then(clock => {
                      this.emit("wasm_clock", clock.millis());
                      item.resolve(clock);
                    })
                } catch (error) {
                  item.reject(error);
                }

              } break;

              case Query.TYPE_FIRMWARE_UPDATE: {
                try {
                  await this.requestWakeLock();
                } catch { }

                try {
                  await this.connector
                    .updateFW(item.a)
                    .then(response => {
                      item.resolve(response);
                    });
                } catch (error) {
                  item.reject(error);
                }

                try {
                  this.releaseWakeLock();
                } catch { }

              } break;

              case Query.TYPE_DESTROY: {
                // this.#reconection = false;
                try {
                  // await this.connector
                  //   .request([COMMAND_FLAGS.FLAG_DEVICE_DISCONNECT_REQUEST], false)
                  //   .catch(() => { })
                  //   .then(() => {
                  await this.connector.disconnect();
                  // })
                  // .then(() => {
                  await this.connector.destroy();
                  // })

                  // .catch(error => {
                  //   //logging.warn(error);
                  //   this.connector = null;
                  //   item.reject(error);
                  // });

                } catch (error) {
                  console.warn("Error while destroying connector:", error);
                } finally {
                  this.connector = null;
                  item.resolve();
                }

              } break;

              default: {
                logging.error("ERROR");
              } break;
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

  readVariableAddress(variable_address, device_id) {
    logging.debug("readVariableAddress", { variable_address, device_id });

    return this.interface.readVariableAddress(variable_address, device_id);
  }
}

