// eslint-disable-next-line @typescript-eslint/ban-ts-comment

import { logging } from "../logging";

const WASM_VERSION = "DEBUG_DEV_0.12.0_20241113";

/// ========== DEBUG_DEV_0.12.0_20241113.d.ts ========== ///

export interface interface_error_tValue<T extends number> {
  value: T;
}
export type interface_error_t = interface_error_tValue<0> | interface_error_tValue<255>;

export interface connector_type_tValue<T extends number> {
  value: T;
}
export type connector_type_t =
  | connector_type_tValue<0>
  | connector_type_tValue<1>
  | connector_type_tValue<2>
  | connector_type_tValue<3>
  | connector_type_tValue<4>
  | connector_type_tValue<5>
  | connector_type_tValue<6>
  | connector_type_tValue<7>;

export interface connection_rssi_tValue<T extends number> {
  value: T;
}
export type connection_rssi_t = connection_rssi_tValue<127> | connection_rssi_tValue<-128>;

export interface Connection {
  connector_type: connector_type_t;
  connection_rssi: connection_rssi_t;
  address_string: ArrayBuffer | Uint8Array | Uint8ClampedArray | Int8Array | string;
  delete(): void;
}

export interface Value {
  isPercentage(): boolean;
  setPercentage(_0: number): void;
  asPercentage(): number;
  delete(): void;
}

export interface Synchronization {
  history_fingerprint: number;
  tngl_fingerprint: number;
  clock_timestamp: number;
  timeline_clock_timestamp: number;
  tngl_clock_timestamp: number;
  fw_compilation_timestamp: number;
  origin_address: ArrayBuffer | Uint8Array | Uint8ClampedArray | Int8Array | string;
  toUint8Array(): any;
  delete(): void;
}

export interface Uint8Vector {
  push_back(_0: number): void;
  resize(_0: number, _1: number): void;
  size(): number;
  set(_0: number, _1: number): boolean;
  get(_0: number): any;
  delete(): void;
}

export interface IConnector_WASM {
  _process(): void;
  init(_0: connector_type_t): boolean;
  _scan(_0: ArrayBuffer | Uint8Array | Uint8ClampedArray | Int8Array | string, _1: number, _2: any): boolean;
  _userConnect(_0: ArrayBuffer | Uint8Array | Uint8ClampedArray | Int8Array | string, _1: number, _2: any): boolean;
  _autoConnect(_0: ArrayBuffer | Uint8Array | Uint8ClampedArray | Int8Array | string, _1: number, _2: number, _3: any): boolean;
  _disconnect(_0: any): boolean;
  _sendExecute(_0: Uint8Vector, _1: any): void;
  _sendRequest(_0: number, _1: Uint8Vector, _2: any): boolean;
  _sendResponse(_0: number, _1: number, _2: Uint8Vector, _3: any): boolean;
  _sendSynchronize(_0: any, _1: any): void;
  delete(): void;
}

export interface ImplementedIConnector_WASM extends IConnector_WASM {
  notifyOnDestruction(): void;
  delete(): void;
}

export interface Spectoda_WASM {
  _handleReboot(): interface_error_t;
  begin(): void;
  end(): void;
  synchronize(_0: Synchronization, _1: Connection): void;
  eraseHistory(): void;
  eraseTimeline(): void;
  eraseTngl(): void;
  registerConnector(_0: IConnector_WASM): void;
  _onTnglUpdate(_0: Uint8Vector): boolean;
  _onExecute(_0: Uint8Vector): boolean;
  _onSynchronize(_0: Synchronization): boolean;
  process(_0: boolean, _1: boolean, _2: boolean, _3: boolean): void;
  render(_0: number): void;
  registerDeviceContext(_0: number): boolean;
  execute(_0: number, _1: Connection): boolean;
  request(_0: number, _1: Uint8Vector, _2: Connection): boolean;
  getIdentifier(): number;
  setClockTimestamp(_0: number): void;
  getClockTimestamp(): number;
  _handlePeerConnected(_0: ArrayBuffer | Uint8Array | Uint8ClampedArray | Int8Array | string): interface_error_t;
  _handlePeerDisconnected(_0: ArrayBuffer | Uint8Array | Uint8ClampedArray | Int8Array | string): interface_error_t;
  _handleTimelineManipulation(_0: number, _1: boolean, _2: ArrayBuffer | Uint8Array | Uint8ClampedArray | Int8Array | string): interface_error_t;
  _onLog(_0: number, _1: ArrayBuffer | Uint8Array | Uint8ClampedArray | Int8Array | string, _2: ArrayBuffer | Uint8Array | Uint8ClampedArray | Int8Array | string): void;
  init(_0: ArrayBuffer | Uint8Array | Uint8ClampedArray | Int8Array | string, _1: ArrayBuffer | Uint8Array | Uint8ClampedArray | Int8Array | string): boolean;
  getLabel(): string;
  writeIO(_0: ArrayBuffer | Uint8Array | Uint8ClampedArray | Int8Array | string, _1: number, _2: Value): boolean;
  readIO(_0: ArrayBuffer | Uint8Array | Uint8ClampedArray | Int8Array | string, _1: number, _2: Value): boolean;
  emitEvent(_0: ArrayBuffer | Uint8Array | Uint8ClampedArray | Int8Array | string, _1: Value, _2: number, _3: boolean): void;
  _onEvents(_0: any): boolean;
  _onEventStateUpdates(_0: any): boolean;
  _onRequest(_0: number, _1: Uint8Vector, _2: any): boolean;
  _onProcess(_0: any): boolean;
  makePort(_0: ArrayBuffer | Uint8Array | Uint8ClampedArray | Int8Array | string, _1: ArrayBuffer | Uint8Array | Uint8ClampedArray | Int8Array | string): any;
  readVariableAddress(_0: number, _1: number): any;
  getEventState(_0: ArrayBuffer | Uint8Array | Uint8ClampedArray | Int8Array | string, _1: number): any;
  getDateTime(): any;
  delete(): void;
}

export interface ImplementedSpectoda_WASM extends Spectoda_WASM {
  notifyOnDestruction(): void;
  delete(): void;
}

export interface MainModule {
  interface_error_t: { SUCCESS: interface_error_tValue<0>; FAIL: interface_error_tValue<255> };
  connector_type_t: {
    CONNECTOR_UNDEFINED: connector_type_tValue<0>;
    CONNECTOR_ESPNOW: connector_type_tValue<1>;
    CONNECTOR_BLE: connector_type_tValue<2>;
    CONNECTOR_SERIAL: connector_type_tValue<3>;
    CONNECTOR_WEBSOCKETS: connector_type_tValue<4>;
    CONNECTOR_TWAI: connector_type_tValue<5>;
    CONNECTOR_SIMULATED: connector_type_tValue<6>;
    CONNECTOR_MAX: connector_type_tValue<7>;
  };
  connection_rssi_t: { RSSI_MAX: connection_rssi_tValue<127>; RSSI_MIN: connection_rssi_tValue<-128> };
  Connection: { make(_0: ArrayBuffer | Uint8Array | Uint8ClampedArray | Int8Array | string, _1: connector_type_t, _2: connection_rssi_t): Connection };
  Value: { makePercentage(_0: number): Value };
  Synchronization: { make(_0: number, _1: ArrayBuffer | Uint8Array | Uint8ClampedArray | Int8Array | string, _2: number, _3: number, _4: number, _5: number, _6: number): Synchronization; makeFromUint8Array(_0: any): Synchronization };
  Uint8Vector: { new (): Uint8Vector };
  IConnector_WASM: { implement(_0: any): ImplementedIConnector_WASM; extend(_0: ArrayBuffer | Uint8Array | Uint8ClampedArray | Int8Array | string, _1: any): any };
  ImplementedIConnector_WASM: {};
  Spectoda_WASM: { implement(_0: any): ImplementedSpectoda_WASM; extend(_0: ArrayBuffer | Uint8Array | Uint8ClampedArray | Int8Array | string, _1: any): any };
  ImplementedSpectoda_WASM: {};
}

/// ========== DEBUG_DEV_0.12.0_20241113.d.ts ========== ///

/// =================== MANUAL INTERFACES ================= ///

export interface SpectodaEvent {
  debug: string;
  label: string;
  type: number;
  value: any;
  timestamp: number;
  id: number;
}

export interface Spectoda_WASMImplementation {
  // ! C++ Code the Spectoda_WASMImplementation is mapped to and MUST be in sync for WASM binding to work properly
  // ! please keep it here as it is used for determining if there are some changes in C++ vs this file. For more info contact @immakermatty

  // bool _onTnglUpdate(const std::vector<uint8_t>& tngl_bytes) override
  // {
  //     return call<bool>("_onTnglUpdate", tngl_bytes);
  // }

  // bool _onEvents(const val& event_array) override
  // {
  //     return call<bool>("_onEvents", event_array);
  // }

  // bool _onEventStateUpdates(const val& event_state_updates_array) override
  // {
  //     return call<bool>("_onEventStateUpdates", event_state_updates_array);
  // }

  // bool _onExecute(const std::vector<uint8_t>& execute_bytecode) override
  // {
  //     return call<bool>("_onExecute", execute_bytecode);
  // }

  // bool _onRequest(const int32_t request_ticket_number, const std::vector<uint8_t>& request_bytecode_vector, const val& destination_connection) override
  // {
  //     return call<bool>("_onRequest", request_ticket_number, request_bytecode_vector, destination_connection);
  // }

  // bool _onSynchronize(const val& synchronization) override
  // {
  //     return call<bool>("_onSynchronize", synchronization);
  // }

  // bool _onProcess(const val& options) override
  // {
  //     val process_options = val::object();
  //     process_options.set("skip_berry_plugin_update", bool(options.skip_berry_plugin_update));
  //     process_options.set("skip_eventstate_updates", bool(options.skip_eventstate_updates));
  //
  //     return call<bool>("_onProcess", options);
  // }

  // interface_error_t _handlePeerConnected(const std::string& peer_mac) override
  // {
  //     return call<interface_error_t>("_handlePeerConnected", peer_mac);
  // }

  // interface_error_t _handlePeerDisconnected(const std::string& peer_mac) override
  // {
  //     return call<interface_error_t>("_handlePeerDisconnected", peer_mac);
  // }

  // interface_error_t _handleTimelineManipulation(const timeline_ms timeline_timestamp, const bool timeline_paused, const std::string& timeline_date) override
  // {
  //     return call<interface_error_t>("_handleTimelineManipulation", timeline_timestamp, timeline_paused, timeline_date);
  // }

  // interface_error_t _handleReboot() override
  // {
  //     return call<interface_error_t>("_handleReboot");
  // }

  // void _onLog(const int32_t level, const std::string& where, const std::string& message) const override
  // {
  //     call<void>("_onLog", level, where, message);
  // }

  // // __construct: function () {}
  // // __destruct: function () {}
  _onTnglUpdate(tngl_bytes: Uint8Vector): boolean;
  _onEvents(event_array: SpectodaEvent[]): boolean;
  _onEventStateUpdates(event_array: SpectodaEvent[]): boolean;
  _onExecute(execute_bytecode: Uint8Vector): boolean;
  _onRequest(request_ticket_number: number, request_bytecode_vector: Uint8Vector, destination_connection: Connection): boolean;
  _onSynchronize(synchronization: Synchronization): boolean;
  _onProcess(options: { skip_berry_plugin_update: boolean; skip_eventstate_updates: boolean }): boolean;
  _handlePeerConnected(peer_mac: string): interface_error_t;
  _handlePeerDisconnected(peer_mac: string): interface_error_t;
  _handleTimelineManipulation(timeline_timestamp: number, timeline_paused: boolean, timeline_date: string): interface_error_t;
  _handleReboot(): interface_error_t;
  _onLog(level: number, where: string, message: string): void;
}

export interface IConnector_WASMImplementation {
  // ! C++ Code the IConnector_WASMImplementation is mapped to and MUST be in sync for WASM binding to work properly
  // ! please keep it here as it is used for determining if there are some changes in C++ vs this file. For more info contact @immakermatty

  // bool _scan(const std::string& criteria_json, const int32_t scan_period, const val& result_out) override
  // {
  //     return call<bool>("_scan", criteria_json, scan_period, result_out);
  // }

  // bool _autoConnect(const std::string& criteria_json, const int32_t scan_period, const int32_t timeout, const val& result_out) override
  // {
  //     return call<bool>("_autoConnect", criteria_json, scan_period, timeout, result_out);
  // }

  // bool _userConnect(const std::string& criteria_json, const int32_t timeout, const val& result_out) override
  // {
  //     return call<bool>("_userConnect", criteria_json, timeout, result_out);
  // }

  // bool _disconnect(const val& connection) override
  // {
  //     return call<bool>("_disconnect", connection);
  // }

  // void _sendExecute(const std::vector<uint8_t>& command_bytes, const val& source_connection) override
  // {
  //     return call<void>("_sendExecute", command_bytes, source_connection);
  // }

  // bool _sendRequest(const int32_t request_ticket_number, std::vector<uint8_t>& request_bytecode, const val& destination_connection) override
  // {
  //     return call<bool>("_sendRequest", request_ticket_number, request_bytecode, destination_connection);
  // }

  // bool _sendResponse(const int32_t request_ticket_number, const int32_t request_result, std::vector<uint8_t>& response_bytecode, const val& destination_connection) override
  // {
  //     return call<bool>("_sendResponse", request_ticket_number, request_result, response_bytecode, destination_connection);
  // }

  // void _sendSynchronize(const val& synchronization, const val& source_connection) override
  // {
  //     return call<void>("_sendSynchronize", synchronization, source_connection);
  // }

  // void _process() override
  // {
  //     return call<void>("_process");
  // }

  // // __construct: function () {}
  // // __destruct: function () {}
  _scan: (criteria_json: string, scan_period: number, result_out: any) => boolean;
  _autoConnect: (criteria_json: string, scan_period: number, timeout: number, result_out: any) => boolean;
  _userConnect: (criteria_json: string, timeout: number, result_out: any) => boolean;
  _disconnect: (connection: Connection) => boolean;
  _sendExecute: (command_bytes: Uint8Vector, source_connection: Connection) => void;
  _sendRequest: (request_ticket_number: number, request_bytecode: Uint8Vector, destination_connection: Connection) => boolean;
  _sendResponse: (request_ticket_number: number, request_result: number, response_bytecode: Uint8Vector, destination_connection: Connection) => boolean;
  _sendSynchronize: (synchronization: Synchronization, source_connection: Connection) => void;
  _process: () => void;
}

/// ======================================================= ///

let moduleInitilizing = false;
let moduleInitilized = false;

class Wait {
  promise: Promise<void>;
  resolve: (value: void | PromiseLike<void>) => void;
  reject: (reason?: any) => void;

  constructor() {
    this.resolve = () => {};
    this.reject = () => {};

    this.promise = new Promise((resolve, reject) => {
      this.reject = reject;
      this.resolve = resolve;
    });
  }
}

let waitingQueue: Wait[] = [];

// ? SpectodaWasm binds the JS world with the webassembly's C
// ? This is a singleton object in a way, not a class... But I didnt figure out how to implement it in TS
export class SpectodaWasm {
  //
  // TODO! disallow creating instances of this class
  constructor() {
    console.error("SpectodaWasm is a singleton class, please do not create instances of it");
  }

  // ? from MainModule:
  // interface_error_t: { SUCCESS: interface_error_tValue<0>; FAIL: interface_error_tValue<255> };
  // connector_type_t: {
  //   CONNECTOR_UNDEFINED: connector_type_tValue<0>;
  //   CONNECTOR_ESPNOW: connector_type_tValue<1>;
  //   CONNECTOR_BLE: connector_type_tValue<2>;
  //   CONNECTOR_SERIAL: connector_type_tValue<3>;
  //   CONNECTOR_WEBSOCKETS: connector_type_tValue<4>;
  //   CONNECTOR_TWAI: connector_type_tValue<5>;
  //   CONNECTOR_MAX: connector_type_tValue<6>;
  // };
  // connection_rssi_t: { RSSI_MAX: connection_rssi_tValue<127>; RSSI_MIN: connection_rssi_tValue<-128> };
  // Connection: { new (): Connection };
  // Uint8Vector: { new (): Uint8Vector };
  // Spectoda_WASM: { implement(_0: any): ImplementedSpectoda_WASM; extend(_0: ArrayBuffer | Uint8Array | Uint8ClampedArray | Int8Array | string, _1: any): any };
  // // ImplementedSpectoda_WASM: {};
  // IConnector_WASM: { implement(_0: any): ImplementedIConnector_WASM; extend(_0: ArrayBuffer | Uint8Array | Uint8ClampedArray | Int8Array | string, _1: any): any };
  // // ImplementedIConnector_WASM: {};

  static interface_error_t: MainModule["interface_error_t"];
  static connector_type_t: MainModule["connector_type_t"];
  static connection_rssi_t: MainModule["connection_rssi_t"];
  static Value: MainModule["Value"];
  static Connection: MainModule["Connection"];
  static Synchronization: MainModule["Synchronization"];
  static Uint8Vector: MainModule["Uint8Vector"];
  static Spectoda_WASM: MainModule["Spectoda_WASM"];
  static IConnector_WASM: MainModule["IConnector_WASM"];

  // oposite of convertJSArrayToNumberVector() in https://emscripten.org/docs/api_reference/val.h.html
  static convertUint8VectorUint8Array(vector: Uint8Vector) {
    const array = new Uint8Array(vector.size());
    for (let i = 0; i < array.length; i++) {
      array[i] = vector.get(i);
    }
    return array;
  }

  // wasmVersion might be DEBUG_0.9.2_20230814
  static initilize(wasmVersion = WASM_VERSION) {
    if (moduleInitilizing || moduleInitilized) {
      return;
    }
    moduleInitilizing = true;
    loadWasm(wasmVersion);
  }

  static initilized() {
    return moduleInitilized;
  }

  static waitForInitilize() {
    if (moduleInitilized) {
      return Promise.resolve();
    }

    const wait = new Wait();
    waitingQueue.push(wait);
    return wait.promise;
  }

  static toHandle(value: any): number {
    // @ts-ignore - Emval is a global object of Emscripten
    return Module.Emval.toHandle(value);
  }

  static toValue(value: number): any {
    // @ts-ignore - Emval is a global object of Emscripten
    return Module.Emval.toValue(value);
  }

  static loadFS() {
    // @ts-ignore - FS is a global object of Emscripten
    return Module.FS.syncfs(true, (err: any) => {
      if (err) {
        logging.error("FS.syncfs error:", err);
      }
    });
  }

  static saveFS() {
    // @ts-ignore - FS is a global object of Emscripten
    return Module.FS.syncfs(false, (err: any) => {
      if (err) {
        logging.error("FS.syncfs error:", err);
      }
    });
  }
}

function injectScript(src: string) {
  return new Promise((resolve, reject) => {
    if (typeof window !== "undefined" && document) {
      const script = document.createElement("script");
      script.src = src;
      script.addEventListener("load", resolve);
      script.addEventListener("error", reject);
      document.head.append(script);
    }
  });
}

function onWasmLoad() {
  logging.info("Webassembly loaded");

  const resolveWaitingQueue = () => {
    for (const wait of waitingQueue) {
      wait.resolve();
    }
    waitingQueue = [];
  };

  // @ts-ignore - Module is a global object of Emscripten
  Module.onRuntimeInitialized = () => {
    moduleInitilized = true;

    logging.info("Webassembly runtime initilized");

    // static interface_error_t: MainModule["interface_error_t"];
    // static connector_type_t: MainModule["connector_type_t"];
    // static connection_rssi_t: MainModule["connection_rssi_t"];
    // static Connection: MainModule["Connection"];
    // static Synchronization: MainModule["Synchronization"];
    // static Uint8Vector: MainModule["Uint8Vector"];
    // static Spectoda_WASM: MainModule["Spectoda_WASM"];
    // static IConnector_WASM: MainModule["IConnector_WASM"];

    // ? SpectodaWasm holds the class definitions of the webassembly

    // @ts-ignore - Module is a global object of Emscripten
    SpectodaWasm.interface_error_t = Module.interface_error_t;
    // @ts-ignore - Module is a global object of Emscripten
    SpectodaWasm.connector_type_t = Module.connector_type_t;
    // @ts-ignore - Module is a global object of Emscripten
    SpectodaWasm.connection_rssi_t = Module.connection_rssi_t;
    // @ts-ignore - Module is a global object of Emscripten
    SpectodaWasm.Value = Module.Value;
    // @ts-ignore - Module is a global object of Emscripten
    SpectodaWasm.Connection = Module.Connection;
    // @ts-ignore - Module is a global object of Emscripten
    SpectodaWasm.Synchronization = Module.Synchronization;
    // @ts-ignore - Module is a global object of Emscripten
    SpectodaWasm.Uint8Vector = Module.Uint8Vector;
    // @ts-ignore - Module is a global object of Emscripten
    SpectodaWasm.Spectoda_WASM = Module.Spectoda_WASM;
    // @ts-ignore - Module is a global object of Emscripten
    SpectodaWasm.IConnector_WASM = Module.IConnector_WASM;

    if (typeof window !== "undefined") {
      // @ts-ignore - FS is a global object of Emscripten
      Module.FS.mkdir("/littlefs");
      // @ts-ignore - FS and IDBFS are global objects of Emscripten
      Module.FS.mount(IDBFS, {}, "/littlefs");

      // @ts-ignore - FS is a global objects of Emscripten
      Module.FS.syncfs(true, function (err: any) {
        if (err) {
          logging.error("ERROR ds8a769s:", err);
        }
        resolveWaitingQueue();
      });
    }
    // ? Node.js enviroment
    else if (!process.env.NEXT_PUBLIC_VERSION) {
      // Node.js make "filesystem" folder in root
      // const fs = require("fs");
      // if (!fs.existsSync("filesystem")) {
      //   fs.mkdirSync("filesystem");
      // }

      // @ts-ignore - FS is a global object of Emscripten
      Module.FS.mkdir("/littlefs");
      // @ts-ignore - FS is a global object of Emscripten
      Module.FS.mount(Module.FS.filesystems.NODEFS, { root: "./filesystem" }, "/littlefs");

      // @ts-ignore - FS is a global object of Emscripten
      Module.FS.syncfs(true, function (err: any) {
        if (err) {
          logging.error("ERROR ds798asa:", err);
        }
        resolveWaitingQueue();
      });
    }

    // TODO Save filesystem before window unload after we switch to network authenticaiton
    // if (typeof window !== "undefined") {
    //   window.addEventListener("beforeunload", () => {
    //     SpectodaWasm.saveFS();
    //   });
    // }

    // @ts-ignore - Module is a global objects of Emscripten
    Module.onRuntimeInitialized = undefined;
  };
}

function loadWasm(wasmVersion: string) {
  logging.info("Loading spectoda-js WASM version " + wasmVersion);

  // BROWSER enviroment
  if (typeof window !== "undefined") {
    // First try to load local version
    injectScript(`http://localhost:5555/builds/${wasmVersion}.js`)
      .then(onWasmLoad)
      .catch(error => {
        // logging.error(error);
        // if local version fails, load public file
        injectScript(`https://updates.spectoda.com/subdom/updates/webassembly/daily/${wasmVersion}.js`)
          .then(onWasmLoad)
          .catch(error => {
            logging.error("Failed to fetch WASM", error);
          });
      });
  }
  // NODE enviroment
  else if (!process.env.NEXT_PUBLIC_VERSION) {
    // @ts-ignore
    globalThis.Module = require(`../../../webassembly/${wasmVersion}.js`); //! dont know how to declare Module for globalThis in TS
    onWasmLoad();
  }
}

if (typeof window !== "undefined") {
  window.SpectodaWasm = SpectodaWasm;
}
