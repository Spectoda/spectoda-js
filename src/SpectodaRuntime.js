import { SpectodaDummyConnector } from "./connector/SpectodaDummyConnector";
import { SpectodaWebBluetoothConnector } from "./connector/SpectodaWebBluetoothConnector";
import { SpectodaWebSerialConnector } from "./connector/SpectodaWebSerialConnector";
import { createNanoEvents, createNanoEventsWithWrappedEmit, detectAndroid, detectChrome, detectLinux, detectMacintosh, detectNode, detectSpectodaConnect, detectWindows, numberToBytes, sleep, uint8ArrayToHexString } from "./functions";
import { logging } from "./logging";
// import { SpectodaConnectConnector } from "./SpectodaConnectConnector";
import { TimeTrack } from "./TimeTrack";
import { FlutterConnector } from "./connector/FlutterConnector";
import { SimulationConnector } from "./connector/SimulationConnector";
import { COMMAND_FLAGS } from "./constants";
import { PreviewController } from "./webassembly/PreviewController";
// import { SpectodaWasm } from "./webassembly/SpectodaWasm";
import { Spectoda_JS } from "./webassembly/Spectoda_JS";

import { TnglReader } from "./TnglReader";
import { TnglWriter } from "./TnglWriter";
import { SpectodaNodeBluetoothConnector } from "./connector/SpectodaNodeBleConnector";
import { SpectodaNodeSerialConnector } from "./connector/SpectodaNodeSerialConnector";

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

function emitHandler(event, args) {
  logging.verbose("emitHandler", event, args);
  allEventsEmitter.emit("on", { name: event, args });
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

    // // open external links in Flutter SC
    // if (detectSpectodaConnect()) {
    //   // target="_blank" global handler
    //   // @ts-ignore

    //   /** @type {HTMLBodyElement} */ document.querySelector("body").addEventListener("click", function (e) {
    //     e.preventDefault();

    //     (function (e, d, w) {
    //       if (!e.composedPath) {
    //         e.composedPath = function () {
    //           if (this.path) {
    //             return this.path;
    //           }
    //           var target = this.target;

    //           this.path = [];
    //           while (target.parentNode !== null) {
    //             this.path.push(target);
    //             target = target.parentNode;
    //           }
    //           this.path.push(d, w);
    //           return this.path;
    //         };
    //       }
    //     })(Event.prototype, document, window);
    //     // @ts-ignore
    //     const path = e.path || (e.composedPath && e.composedPath());

    //     // @ts-ignore
    //     for (let el of path) {
    //       if (el.tagName === "A" && el.getAttribute("target") === "_blank") {
    //         e.preventDefault();
    //         const url = el.getAttribute("href");
    //         logging.verbose(url);
    //         // @ts-ignore
    //         logging.debug("Openning external url", url);
    //         window.flutter_inappwebview.callHandler("openExternalUrl", url);
    //         break;
    //       }
    //     }
    //   });
    // }

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

    // this.previewControllers = {};

    // this.#eventEmitter.on("wasm_execute", command => {
    //   for (const previewController of Object.values(this.previewControllers)) {
    //     try {
    //       previewController.execute(command, 123456789);
    //     } catch (error) {
    //       logging.error(error);
    //     }
    //   }
    // });

    // this.#eventEmitter.on("wasm_request", command => {
    //   for (const previewController of Object.values(this.previewControllers)) {
    //     previewController.request(e, 123456789);
    //   }
    // });

    // this.#eventEmitter.on("wasm_clock", timestamp => {
    //   for (const previewController of Object.values(this.previewControllers)) {
    //     try {
    //       previewController.setClock(timestamp, 123456789);
    //     } catch (error) {
    //       logging.error(error);
    //     }
    //   }
    // });
  }

  // #runtimeTask = async () => {
  //   const UPS = 2; // updates per second

  //   try {
  //     await this.spectoda.construct("spectoda", "01:23:45:67:89:ab", 0, 255);

  //     await sleep(0.1); // short delay to let fill up the queue to merge the execute items if possible

  //     const f = async () => {
  //       await this.spectoda.compute(); // for non visual mode compute is sufficient
  //       setTimeout(f, 1000 / UPS);
  //     };

  //     f();
  //   } catch (e) {
  //     logging.error(e);
  //   }
  // };

  // #inicilize() {
  //   if (!this.#inicilized) {
  //     this.#runtimeTask();
  //     this.#inicilized = true;
  //   }

  //   return this.spectoda.waitForInitilize();
  // }

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
      logging.warn("Reassigning current connector");
      // return Promise.resolve();
    }

    if (connector_type == "default" || connector_type == "automatic") {
      if (detectSpectodaConnect()) {
        connector_type = "flutter";
      } else if (typeof navigator !== "undefined" && navigator.bluetooth) {
        connector_type = "webbluetooth";
      } else {
        connector_type = "none";
      }
    }

    return (this.connector ? this.destroyConnector() : Promise.resolve())
      .catch(() => { })
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

          case "nodebluetooth":
            if (detectNode()) {
              this.connector = new SpectodaNodeBluetoothConnector(this);
            } else {
              logging.error("Error: Assigning unsupported connector");
              this.connector = null;
            }
            break;

          case "nodeserial":
            if (detectNode()) {
              this.connector = new SpectodaNodeSerialConnector(this);
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
    this.previewControllers[controller_mac_address] = controller;
    controller.construct(controller_config);

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

    for (const previewController of Object.values(this.previewControllers)) {
      previewController.bakeTnglFrame();
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
        const request_bytes = [COMMAND_FLAGS.READ_PORT_PIXELS_REQUEST, ...numberToBytes(request_uuid, 4), portTag, PIXEL_ENCODING_CODE];

        logging.debug("Sending request", uint8ArrayToHexString(request_bytes));
        const response = await previewController.request(new Uint8Array(request_bytes), 123456789);

        logging.debug("Received response", uint8ArrayToHexString(response));
        const tempReader = new TnglReader(new DataView(response.buffer));

        const response_flag = tempReader.readFlag();
        if (response_flag !== COMMAND_FLAGS.READ_PORT_PIXELS_RESPONSE) {
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

          tempWriter.writeBytes([COMMAND_FLAGS.WRITE_PORT_PIXELS_REQUEST, ...numberToBytes(uuidCounter++, 4), portTag, PIXEL_ENCODING_CODE, ...numberToBytes(pixelDataSize, 2), ...pixelData]);
        }
      }

      const controllerIdentifier = previewController.identifier;
      logging.debug("controllerIdentifier=", controllerIdentifier);

      const tempWriterDataView = tempWriter.bytes;
      const tempWriterDataArray = new Uint8Array(tempWriterDataView.buffer);

      writer.writeBytes([COMMAND_FLAGS.EVALUATE_ON_CONTROLLER_REQUEST, ...numberToBytes(uuidCounter++, 4), ...numberToBytes(controllerIdentifier, 4), ...numberToBytes(tempWriter.written, 2), ...tempWriterDataArray]);
    }

    const command_bytes = new Uint8Array(writer.bytes.buffer);
    logging.verbose("command_bytes=", command_bytes);

    this.execute(command_bytes);

    return command_bytes;
  }
}
