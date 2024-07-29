import { SpectodaDummyConnector } from "../SpectodaDummyConnector.js";
import { SpectodaWebBluetoothConnector } from "../SpectodaWebBluetoothConnector.js";
import { createNanoEvents, createNanoEventsWithWrappedEmit, detectAndroid, detectChrome, detectLinux, detectMacintosh, detectNode, detectSpectodaConnect, detectWindows, numberToBytes, sleep, uint8ArrayToHexString } from "../functions";
import { logging } from "../logging";
import { SpectodaWebSerialConnector } from "./connector/SpectodaWebSerialConnector";
// import { SpectodaConnectConnector } from "./SpectodaConnectConnector.js";
import { FlutterConnector } from "../FlutterConnector.js";
import { TimeTrack } from "../TimeTrack.js";
import { PreviewController } from "./PreviewController.js";
import { SpectodaWasm } from "./SpectodaWasm";
import { COMMAND_FLAGS, Spectoda_JS } from "./Spectoda_JS.js";

import { TnglReader } from "../TnglReader.js";
import { TnglWriter } from "../TnglWriter.js";
import { SpectodaNodeBluetoothConnector } from "./connector/SpectodaNodeBleConnector";
import { SpectodaNodeSerialConnector } from "./connector/SpectodaNodeSerialConnector";
import { SpectodaSimulatedConnector } from "./connector/SpectodaSimulatedConnector";

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
export const allEventsEmitter = createNanoEvents();

export function emitHandler({ event, args }) {
  allEventsEmitter.emit("on", { name: event, args });
}

class BitSet {
  constructor(size) {
    this.size = size;
    this.bitArray = new Uint32Array(Math.ceil(size / 32));
  }

  setBit(position) {
    const index = Math.floor(position / 32);
    const bit = position % 32;
    this.bitArray[index] |= 1 << bit;
  }

  clearBit(position) {
    const index = Math.floor(position / 32);
    const bit = position % 32;
    this.bitArray[index] &= ~(1 << bit);
  }

  toggleBit(position) {
    const index = Math.floor(position / 32);
    const bit = position % 32;
    this.bitArray[index] ^= 1 << bit;
  }

  isSet(position) {
    const index = Math.floor(position / 32);
    const bit = position % 32;
    return (this.bitArray[index] & (1 << bit)) !== 0;
  }

  toString() {
    return Array.from(this.bitArray)
      .map(num => num.toString(2).padStart(32, "0"))
      .reverse()
      .join("");
  }
}

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

  #inicilized;

  #assignedConnector;
  #assignedConnectorParameter;

  #ups;
  #fps;

  constructor(spectodaReference) {
    this.#spectodaReference = spectodaReference;

    this.spectoda = new Spectoda_JS(this);

    this.clock = new TimeTrack(0);

    // TODO implement a way of having more than one connector at the same time
    this.connector = /** @type {SpectodaDummyConnector | SpectodaWebBluetoothConnector | SpectodaWebSerialConnector | SpectodaConnectConnector | FlutterConnector | null} */ (null);

    this.#eventEmitter = createNanoEventsWithWrappedEmit(emitHandler);

    this.#queue = /** @type {Query[]} */ ([]);
    this.#processing = false;
    this.#chunkSize = 208; // 208 is ESPNOW chunk size

    this.#selecting = false;
    this.#disconnectQuery = null;

    this.#connectGuard = false;

    this.#lastUpdateTime = new Date().getTime();
    this.#lastUpdatePercentage = 0;

    this.#assignedConnector = "none";
    this.#assignedConnectorParameter = undefined;

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

    if (typeof window !== "undefined") {
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

        if (this.#inicilized) {
          this.destroyConnector();
          this.spectoda.destruct();
        }
      });
    }

    this.previewControllers = {};

    this.#eventEmitter.on("wasm_execute", command => {
      logging.debug("wasm_execute", command);
      for (const previewController of Object.values(this.previewControllers)) {
        try {
          previewController.execute(command, 123456789);
        } catch (error) {
          logging.error(error);
        }
      }
    });

    // this.#eventEmitter.on("wasm_request", command => {
    //   for (const previewController of Object.values(this.previewControllers)) {
    //     previewController.request(e, 123456789);
    //   }
    // });

    this.#eventEmitter.on("wasm_clock", timestamp => {
      logging.debug("wasm_clock", timestamp);
      for (const previewController of Object.values(this.previewControllers)) {
        try {
          previewController.setClock(timestamp, 123456789);
        } catch (error) {
          logging.error(error);
        }
      }
    });

    this.#ups = 5;
    this.#fps = 5;
  }

  #runtimeTask = async () => {
    try {
      await this.spectoda.inicilize();
      await this.spectoda.construct(this.WIP_name ? this.WIP_name : "APP", "00:00:45:67:89:ab", 0, 255);

      await sleep(0.1); // short delay to let fill up the queue to merge the execute items if possible

      // TODO figure out #fps (render) vs #ups (compute) for non visual processing (a.k.a event handling for example)

      const __render = async () => {
        await this.spectoda.render(); // for non visual mode compute is sufficient

        // TODO if the fps was set to 0 and then back to some value, then the render loop should be started again
        if (this.#fps !== 0) {
          setTimeout(__render, 1000 / this.#fps);
        }
      };

      __render();
    } catch (e) {
      logging.error(e);
    }
  };

  #inicilize() {
    if (!this.#inicilized) {
      this.#inicilized = true;
      this.#runtimeTask();
    }
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

  assignConnector(desired_connector = "default", connector_parameter = undefined) {
    logging.verbose(`assignConnector(desired_connector=${desired_connector})`);

    let choosen_connector = undefined;

    if (desired_connector == "default" || desired_connector == "automatic") {
      if (detectSpectodaConnect()) {
        desired_connector = "serial";
      } else {
        desired_connector = "bluetooth";
      }
    }

    if (desired_connector.includes("bluetooth")) {
      if (detectSpectodaConnect()) {
        choosen_connector = "flutterbluetooth";
      } else if ((detectAndroid() && detectChrome()) || (detectMacintosh() && detectChrome()) || (detectWindows() && detectChrome()) || (detectLinux() && detectChrome())) {
        choosen_connector = "webbluetooth";
      } else if (detectNode()) {
        choosen_connector = "nodebluetooth";
      } else {
        throw "UnsupportedConnectorPlatform";
      }
    }
    //
    else if (desired_connector.includes("serial")) {
      if (detectNode()) {
        choosen_connector = "nodeserial";
      } else if ((detectMacintosh() && detectChrome()) || (detectWindows() && detectChrome()) || (detectLinux() && detectChrome())) {
        choosen_connector = "webserial";
      } else {
        throw "UnsupportedConnectorPlatform";
      }
    }
    //
    else if (desired_connector.includes("dummy")) {
      choosen_connector = "dummy";
    }
    //
    else if (desired_connector.includes("simulated")) {
      choosen_connector = "simulated";
    }
    //
    else if (desired_connector.includes("none") || desired_connector == "") {
      choosen_connector = "none";
    }

    if (choosen_connector === undefined) {
      throw "UnsupportedConnector";
    }

    // leave this at info, for faster debug
    logging.info(`> Assigning ${choosen_connector} connector with parameter:`, connector_parameter);
    this.#assignedConnector = choosen_connector;
    this.#assignedConnectorParameter = connector_parameter;
  }

  async #updateConnector() {
    if ((this.connector !== null && this.#assignedConnector === this.connector.type) || (this.connector === null && this.#assignedConnector === "none")) {
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
        this.connector = new SpectodaSimulatedConnector(this);
        this.connector.init(this.#assignedConnectorParameter);
        break;

      case "dummy":
        this.connector = new SpectodaDummyConnector(this);
        break;

      case "webbluetooth":
        this.connector = new SpectodaWebBluetoothConnector(this);
        break;

      case "webserial":
        this.connector = new SpectodaWebSerialConnector(this);
        break;

      case "flutterbluetooth":
        this.connector = new FlutterConnector(this);
        break;

      case "nodebluetooth":
        this.connector = new SpectodaNodeBluetoothConnector(this);
        break;

      case "nodeserial":
        this.connector = new SpectodaNodeSerialConnector(this);
        break;

      //? TBD in the future
      // case "websockets":
      //   this.connector = new SpectodaWebSocketsConnector(this);
      //   break;

      default:
        logging.warn(`Unsupported connector: ${this.#assignedConnector}`);

        this.#assignedConnector = "none";
        this.connector = null;
    }
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

    // TODO! make sure that criteria is always an array of at least one object
    if (criteria === null || criteria === undefined || typeof criteria !== "object" || !Array.isArray(criteria)) {
      throw "InvalidCriteria";
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

    // TODO! make sure that criteria is always an array of at least one object
    if (criteria === null || criteria === undefined || typeof criteria !== "object" || !Array.isArray(criteria)) {
      throw "InvalidCriteria";
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

  connect(timeout = 10000) {
    logging.verbose(`connect(timeout=${timeout})`);

    if (timeout < 1000) {
      logging.error("Timeout is too short.");
      return Promise.reject("InvalidTimeout");
    }

    const item = new Query(Query.TYPE_CONNECT, timeout);
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
    logging.verbose("evaluate(bytecode_uint8array=", bytecode_uint8array, "source_connection=", source_connection, ")");

    this.spectoda.execute(bytecode_uint8array, source_connection);
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

  setClock() {
    const item = new Query(Query.TYPE_SET_CLOCK, this.clock);
    this.#process(item);
    return item.promise;
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
        await this.#inicilize();
        await this.spectoda.waitForInitilize();

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
                      .autoSelect(item.a, item.b, item.c) // criteria, scan_period, timeout
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
                      .scan(item.a, item.b) // criteria, scan_period
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
                      .then(async device => {
                        if (!this.#connectGuard) {
                          logging.error("Connection logic error. #connected not called during successful connect()?");
                          logging.warn("Emitting #connected");
                          this.#eventEmitter.emit("#connected");
                        }

                        try {
                          this.clock = await this.connector.getClock();
                          this.spectoda.setClock(this.clock.millis());
                          this.emit("wasm_clock", this.clock.millis());
                          item.resolve(device);
                        } catch (error) {
                          logging.error(error);
                          this.clock = new TimeTrack(0);
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
                  this.spectoda.execute(data, 0x00);

                  try {
                    await this.connector.deliver(data, timeout).then(() => {
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
                  this.spectoda.request(item.a, 0x00);

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
                  this.spectoda.setClock(item.a.millis());

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
                      // this.emit("wasm_clock", clock.millis());
                      // this.spectoda.setClock(clock.millis());

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
                    logging.warn("Error while destroying connector:", error);
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
          logging.error("Runtime::#process() ERROR", item, ":", e);
        } finally {
          this.#processing = false;
        }
      })();
    }
  }

  readVariableAddress(variable_address, device_id) {
    logging.verbose("readVariableAddress", { variable_address, device_id });
    return this.spectoda.readVariableAddress(variable_address, device_id);
  }

  WIP_makePreviewController(controller_mac_address, controller_config) {
    logging.debug(`> Making PreviewController ${controller_mac_address}...`);

    if (typeof controller_config === "string") {
      controller_config = JSON.parse(controller_config);
    }

    logging.verbose(`controller_config=`, controller_config);

    let controller = new PreviewController(controller_mac_address);
    controller.construct(controller_config);
    this.previewControllers[controller_mac_address] = controller;

    return controller;
  }

  WIP_getPreviewController(controller_mac_address) {
    logging.verbose(`> Getting PreviewController ${controller_mac_address}...`);

    return this.previewControllers[controller_mac_address];
  }

  WIP_getPreviewControllers() {
    logging.verbose(`> Getting PreviewControllers...`);

    return this.previewControllers;
  }

  WIP_renderPreview() {
    // logging.verbose(`> Rendering preview...`);

    try {
      for (const previewController of Object.values(this.previewControllers)) {
        previewController.bakeTnglFrame();
      }
    } catch (e) {
      console.error(e);
    }
  }

  WIP_loadFS() {
    return SpectodaWasm.loadFS();
  }

  WIP_saveFS() {
    return SpectodaWasm.saveFS();
  }

  // returns a promise that resolves a bytecode of the captured port pixels
  async WIP_capturePixels() {
    const A_ASCII_CODE = "A".charCodeAt(0);
    const D_ASCII_CODE = "D".charCodeAt(0);

    const PIXEL_ENCODING_CODE = 1;

    let uuidCounter = Math.floor(Math.random() * 0xffffffff);

    const writer = new TnglWriter(65535);

    for (const previewController of Object.values(this.previewControllers)) {
      const tempWriter = new TnglWriter(65535);

      for (let portTag = A_ASCII_CODE; portTag <= D_ASCII_CODE; portTag++) {
        const request_uuid = uuidCounter++;
        const request_bytes = [COMMAND_FLAGS.FLAG_READ_PORT_PIXELS_REQUEST, ...numberToBytes(request_uuid, 4), portTag, PIXEL_ENCODING_CODE];

        logging.debug("Sending request", uint8ArrayToHexString(request_bytes));
        const response = await previewController.request(new Uint8Array(request_bytes), 123456789);

        logging.debug("Received response", uint8ArrayToHexString(response));
        const tempReader = new TnglReader(new DataView(response.buffer));

        const response_flag = tempReader.readFlag();
        if (response_flag !== COMMAND_FLAGS.FLAG_READ_PORT_PIXELS_RESPONSE) {
          logging.error("InvalidResponse1");
          continue;
        }

        const response_uuid = tempReader.readUint32();
        if (response_uuid !== request_uuid) {
          logging.error("InvalidResponse2");
          continue;
        }

        const error_code = tempReader.readUint8();
        if (error_code === 0) {
          // error_code 0 is success
          const pixelDataSize = tempReader.readUint16();
          logging.debug("pixelDataSize=", pixelDataSize);

          const pixelData = tempReader.readBytes(pixelDataSize);
          logging.debug("pixelData=", pixelData);

          tempWriter.writeBytes([COMMAND_FLAGS.FLAG_WRITE_PORT_PIXELS_REQUEST, ...numberToBytes(uuidCounter++, 4), portTag, PIXEL_ENCODING_CODE, ...numberToBytes(pixelDataSize, 2), ...pixelData]);
        }
      }

      const controllerIdentifier = previewController.identifier;
      logging.debug("controllerIdentifier=", controllerIdentifier);

      const tempWriterDataView = tempWriter.bytes;
      const tempWriterDataArray = new Uint8Array(tempWriterDataView.buffer);

      writer.writeBytes([COMMAND_FLAGS.FLAG_EVALUATE_ON_CONTROLLER_REQUEST, ...numberToBytes(uuidCounter++, 4), ...numberToBytes(controllerIdentifier, 4), ...numberToBytes(tempWriter.written, 2), ...tempWriterDataArray]);
    }

    const command_bytes = new Uint8Array(writer.bytes.buffer);
    logging.verbose("command_bytes=", command_bytes);

    this.execute(command_bytes);

    return command_bytes;
  }

  WIP_previewToJSON() {
    const segmnet_template = `{
      "segment": "seg1",
      "id": 0,
      "sections": []
    }`;

    let segment = JSON.parse(segmnet_template);

    const A_ASCII_CODE = "A".charCodeAt(0);
    const D_ASCII_CODE = "D".charCodeAt(0);

    const PIXEL_ENCODING_CODE = 1;

    let uuidCounter = Math.floor(Math.random() * 0xffffffff);

    const writer = new TnglWriter(65535);

    for (const previewController of Object.values(this.previewControllers)) {
      for (let portTag = A_ASCII_CODE; portTag <= D_ASCII_CODE; portTag++) {
        const request_uuid = uuidCounter++;
        const request_bytes = [COMMAND_FLAGS.FLAG_READ_PORT_PIXELS_REQUEST, ...numberToBytes(request_uuid, 4), portTag, PIXEL_ENCODING_CODE];

        logging.debug("Sending request", uint8ArrayToHexString(request_bytes));
        const response = previewController.request(new Uint8Array(request_bytes), 123456789);

        logging.debug("Received response", uint8ArrayToHexString(response));
        const tempReader = new TnglReader(new DataView(response.buffer));

        const response_flag = tempReader.readFlag();
        if (response_flag !== COMMAND_FLAGS.FLAG_READ_PORT_PIXELS_RESPONSE) {
          logging.error("InvalidResponse1");
          continue;
        }

        const response_uuid = tempReader.readUint32();
        if (response_uuid !== request_uuid) {
          logging.error("InvalidResponse2");
          continue;
        }

        const error_code = tempReader.readUint8();
        if (error_code === 0) {
          // error_code 0 is success
          const pixelDataSize = tempReader.readUint16();
          logging.debug("pixelDataSize=", pixelDataSize);

          const pixelData = tempReader.readBytes(pixelDataSize);
          logging.debug("pixelData=", pixelData);

          let bitset = new BitSet(pixelDataSize * 8);
          for (let i = 0; i < pixelDataSize; i++) {
            for (let j = 0; j < 8; j++) {
              if (pixelData[i] & (1 << j)) {
                bitset.setBit(i * 8 + j);
              }
            }
          }

          console.log(`Controller ${previewController.label}, Port ${String.fromCharCode(portTag)}:`, bitset.toString());

          const section_template = `{
            "controller": "con1",
            "port": "A",
            "from": 0,
            "to": 0,
            "reversed": false
          }`;

          let section = JSON.parse(section_template);
          section.controller = previewController.label;
          section.port = String.fromCharCode(portTag);
          section.from = undefined;
          section.to = undefined;
          section.reversed = false;

          for (let i = 0; i < bitset.size; i++) {
            if (bitset.isSet(i) && section.from === undefined) {
              section.from = i;
            }
            if (!bitset.isSet(i) && section.from !== undefined) {
              section.to = i;
              if (section.to - section.from > 40) {
                segment.sections.push(section);
              }

              section = JSON.parse(section_template);
              section.controller = previewController.label;
              section.port = String.fromCharCode(portTag);
              section.from = undefined;
              section.to = undefined;
              section.reversed = false;
            }
          }

          if (section.from !== undefined) {
            section.to = bitset.size;

            if (section.to - section.from > 40) {
              segment.sections.push(section);
            }
          }
        }
      }
    }

    console.log(JSON.stringify(segment));

    return segment;
  }

  async WIP_waitForInitilize() {
    return this.spectoda.waitForInitilize();
  }

  WIP_setFPS(fps) {
    this.#fps = fps;
  }

  WIP_makePort(port_char = "A", port_size = 1, port_brightness = 255, port_power = 255, port_visible = true, port_reversed = false) {
    return this.spectoda.makePort(port_char, port_size, port_brightness, port_power, port_visible, port_reversed);
  }

  WIP_compute() {
    return this.spectoda.compute();
  }

  WIP_render() {
    return this.spectoda.render();
  }

  WIP_setName(name) {
    this.WIP_name = name;
  }
}
