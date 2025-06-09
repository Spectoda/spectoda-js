// eslint-disable-next-line @typescript-eslint/ban-ts-comment

import { logging } from '../logging'

import { MainModule, Uint8Vector } from './types/wasm'

const WASM_VERSION = 'DEBUG_DEV_0.12.8_20250605'

let moduleInitilizing = false
let moduleInitilized = false

class Wait {
  promise: Promise<void>
  resolve: (value: void | PromiseLike<void>) => void
  reject: (reason?: any) => void

  constructor() {
    this.resolve = () => {}
    this.reject = () => {}

    this.promise = new Promise((resolve, reject) => {
      this.reject = reject
      this.resolve = resolve
    })
  }
}

let waitingQueue: Wait[] = []

// ? SpectodaWasm binds the JS world with the webassembly's C
// ? This is a singleton object in a way, not a class... But I didnt figure out how to implement it in TS
export class SpectodaWasm {
  //
  // TODO! disallow creating instances of this class
  constructor() {
    console.error('SpectodaWasm is a singleton class, please do not create instances of it')
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

  static interface_error_t: MainModule['interface_error_t']
  static connector_type_t: MainModule['connector_type_t']
  static connection_rssi_t: MainModule['connection_rssi_t']
  static Value: MainModule['Value']
  static Connection: MainModule['Connection']
  static Synchronization: MainModule['Synchronization']
  static Uint8Vector: MainModule['Uint8Vector']
  static Spectoda_WASM: MainModule['Spectoda_WASM']
  static IConnector_WASM: MainModule['IConnector_WASM']

  // oposite of convertJSArrayToNumberVector() in https://emscripten.org/docs/api_reference/val.h.html
  static convertUint8VectorUint8Array(vector: Uint8Vector) {
    const array = new Uint8Array(vector.size())

    for (let i = 0; i < array.length; i++) {
      array[i] = vector.get(i)
    }
    return array
  }

  // wasmVersion might be DEBUG_0.9.2_20230814
  static initialize(wasmVersion = WASM_VERSION) {
    if (moduleInitilizing || moduleInitilized) {
      return
    }
    moduleInitilizing = true
    loadWasm(wasmVersion)
  }

  static initilized() {
    return moduleInitilized
  }

  static waitForInitilize() {
    if (moduleInitilized) {
      return Promise.resolve()
    }

    const wait = new Wait()

    waitingQueue.push(wait)
    return wait.promise
  }

  static toHandle(value: any): number {
    // @ts-ignore - Emval is a global object of Emscripten
    return Module.Emval.toHandle(value)
  }

  static toValue(value: number): any {
    // @ts-ignore - Emval is a global object of Emscripten
    return Module.Emval.toValue(value)
  }

  static loadFS() {
    return new Promise((resolve, reject) => {
      // @ts-ignore - FS is a global object of Emscripten
      Module.FS.syncfs(true, (err: any) => {
        if (err) {
          logging.error('SpectodaWasm::loadFS() ERROR:', err)
          reject(err)
        } else {
          logging.info('SpectodaWasm::loadFS() Filesystem loaded')
          resolve(null)
        }
      })
    })
  }

  static saveFS() {
    return new Promise((resolve, reject) => {
      // @ts-ignore - FS is a global object of Emscripten
      Module.FS.syncfs(false, (err: any) => {
        if (err) {
          logging.error('SpectodaWasm::saveFS() ERROR:', err)
          reject(err)
        } else {
          logging.info('SpectodaWasm::saveFS() Filesystem saved')
          resolve(null)
        }
      })
    })
  }
}

function injectScript(src: string) {
  return new Promise((resolve, reject) => {
    if (typeof window !== 'undefined' && document) {
      const script = document.createElement('script')

      script.src = src
      script.addEventListener('load', resolve)
      script.addEventListener('error', reject)
      document.head.append(script)
    }
  })
}

function onWasmLoad() {
  logging.info('WASM loaded')

  const resolveWaitingQueue = () => {
    for (const wait of waitingQueue) {
      wait.resolve()
    }
    waitingQueue = []
  }

  // @ts-ignore - Module is a global object of Emscripten
  Module.onRuntimeInitialized = () => {
    moduleInitilized = true

    logging.info('WASM runtime initilized')

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
    SpectodaWasm.interface_error_t = Module.interface_error_t
    // @ts-ignore - Module is a global object of Emscripten
    SpectodaWasm.connector_type_t = Module.connector_type_t
    // @ts-ignore - Module is a global object of Emscripten
    SpectodaWasm.connection_rssi_t = Module.connection_rssi_t
    // @ts-ignore - Module is a global object of Emscripten
    SpectodaWasm.Value = Module.Value
    // @ts-ignore - Module is a global object of Emscripten
    SpectodaWasm.Connection = Module.Connection
    // @ts-ignore - Module is a global object of Emscripten
    SpectodaWasm.Synchronization = Module.Synchronization
    // @ts-ignore - Module is a global object of Emscripten
    SpectodaWasm.Uint8Vector = Module.Uint8Vector
    // @ts-ignore - Module is a global object of Emscripten
    SpectodaWasm.Spectoda_WASM = Module.Spectoda_WASM
    // @ts-ignore - Module is a global object of Emscripten
    SpectodaWasm.IConnector_WASM = Module.IConnector_WASM

    // ? BROWSER: mounting FS
    if (typeof window !== 'undefined') {
      // @ts-ignore - FS is a global object of Emscripten
      Module.FS.mkdir('/littlefs')
      // @ts-ignore - FS and IDBFS are global objects of Emscripten
      Module.FS.mount(IDBFS, {}, '/littlefs')
    }
    // ? NODE.JS: mounting FS
    else if (!process.env.NEXT_PUBLIC_VERSION) {
      // TODO make "filesystem" folder in root, if it does not exist
      // const fs = require("fs");
      // if (!fs.existsSync("filesystem")) {
      //   fs.mkdirSync("filesystem");
      // }

      // @ts-ignore - FS is a global object of Emscripten
      Module.FS.mkdir('/littlefs')
      // @ts-ignore - FS is a global object of Emscripten
      Module.FS.mount(Module.FS.filesystems.NODEFS, { root: './filesystem' }, '/littlefs')
    }

    // ? Load WASM filesystem from mounted system filesystem
    SpectodaWasm.loadFS().finally(() => {
      resolveWaitingQueue()
    })

    // ? BROWSER: Save WASM filesystem before window unload
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        SpectodaWasm.saveFS()
      })
    }
    // ? NODE.JS: enviroment save WASM filesystem before app exit
    else if (!process.env.NEXT_PUBLIC_VERSION) {
      process.on('exit', () => {
        SpectodaWasm.saveFS()
      })
    }

    // @ts-ignore - Module is a global objects of Emscripten
    Module.onRuntimeInitialized = undefined
  }
}

function loadWasm(wasmVersion: string) {
  logging.info('Loading spectoda-js WASM version ' + wasmVersion)

  // BROWSER enviroment
  if (typeof window !== 'undefined') {
    // First try to load local version
    injectScript(`http://localhost:5555/builds/${wasmVersion}.js`)
      .then(onWasmLoad)
      .catch((error) => {
        // logging.error(error);
        // if local version fails, load public file
        injectScript(`https://updates.spectoda.com/subdom/updates/webassembly/daily/${wasmVersion}.js`)
          .then(onWasmLoad)
          .catch((error) => {
            logging.error('Failed to fetch WASM', error)
          })
      })
  }
  // NODE enviroment
  else if (!process.env.NEXT_PUBLIC_VERSION) {
    // @ts-ignore
    globalThis.Module = require(`../../../webassembly/${wasmVersion}.js`) //! dont know how to declare Module for globalThis in TS
    onWasmLoad()
  }
}

if (typeof window !== 'undefined') {
  window.SpectodaWasm = SpectodaWasm
}
