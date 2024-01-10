import { TimeTrack } from "../TimeTrack";
import { logging } from "../logging";
import { MainModule, Uint8Vector } from "./webassembly";

const WASM_VERSION = "DEBUG_0.11.0_20240109";

let __isWasmLoadCalled = false;

function __onWasmLoad(): Promise<void> {
  logging.info("Webassembly loaded");

  return new Promise((resolve, reject) => {

    const timeoutHandle = setTimeout(() => {
      logging.error("Webassembly initialization timeout");
      reject(new Error("InitializationTimeout"));
    }, 60000);

    Module.onRuntimeInitialized = () => {
      logging.info("Webassembly runtime initilized");

      clearTimeout(timeoutHandle);
      Module.onRuntimeInitialized = null;

      //? Filesystem mounting
      // BROWSER enviroment
      if (typeof window !== "undefined") {
        // Make a directory other than '/'
        FS.mkdir("/littlefs");
        // Then mount with IDBFS type
        FS.mount(IDBFS, {}, "/littlefs");

        // Then sync
        FS.syncfs(true, function (err: any) {
          if (err) {
            logging.error("FS.syncfs error:", err);
          }
        });
      }
      // NODE enviroment
      else {
        // TODO - implement mounting for node
        //   // Make a directory other than '/'
        //   Module.FS.mkdir('/littlefs');
        //   // Then mount with IDBFS type
        //   Module.FS.mount(Module.FS.filesystems.NODEFS, {}, '/littlefs');
        //   // Then sync
        //   Module.FS.syncfs(true, function (err) {
        //       if (err) {
        //           logging.error("FS.syncfs error:", err);
        //       }
        //   });
      }

      resolve();
    };
  })
}

function __loadWasm(wasmVersion: string): Promise<void> {

  function injectScript(src: string) {
    return new Promise((resolve, reject) => {
      if (!document) {
        logging.error("document is not defined");
        reject(new Error("DocumentNotDefined"));
      }
      const script = document.createElement("script");
      script.src = src;
      script.addEventListener("load", resolve);
      script.addEventListener("error", e => reject(e.error));
      document.head.appendChild(script);
    });
  }

  if (!__isWasmLoadCalled) {
    __isWasmLoadCalled = true;
  } else {
    logging.error("__loadWasm() already called");
    throw new Error("WasmLoadAlreadyCalled");
  }

  logging.info(`Loading webassembly version ${wasmVersion}...`);

  // BROWSER enviroment
  if (typeof window !== "undefined") {
    // First try to load local version
    injectScript(`http://localhost:5555/builds/${wasmVersion}.js`)
      .then(() => {
        return __onWasmLoad()
      })
      .catch(error => {
        logging.error(error);
        // if local version fails, load public file
        injectScript(`https://updates.spectoda.com/subdom/updates/webassembly/daily/${wasmVersion}.js`)
          .then(() => {
            return __onWasmLoad();
          })
          .catch(error => {
            logging.error(error);
          });
      });
  }
  // NEXT.JS enviroment
  else if (process && process.env && process.env.NEXT_PUBLIC_VERSION) {

    return Promise.resolve();
  }
  // NODE enviroment 
  else if (!process.env.NEXT_PUBLIC_VERSION) {

    globalThis.Module = require(`./webassembly/${wasmVersion}.js`);
    return __onWasmLoad();
  }
  // UNKNOWN enviroment

  logging.error("Unknown enviroment for webassembly loading");
  return Promise.reject("UnknownEnviroment");
}


// This class creates the Module object, which is the main object for the webassembly on its construction

class SpectodaWasmRuntime {

  #version: string;

  //? tohle je virtualni C++ class prohnana pres emscripten, coz zpusobuje ze ji muzu naimplementovat v JS
  //? Ktery je prvne jako undefined, ale ve chvili kdy se nacte WASM, dostane implementaci z Module
  IConnector_WASM: MainModule["IConnector_WASM"];

  //? tohle je virtualni C++ class prohnana pres emscripten, coz zpusobuje ze ji muzu naimplementovat v JS
  //? Ktery je prvne jako undefined, ale ve chvili kdy se nacte WASM, dostane implementaci z Module
  Spectoda_WASM: MainModule["Spectoda_WASM"];

  //? tohle je C++ typ prohnany pres emscripten, coz zpusobuje ze ji muzu naimplementovat v JS
  //? Ktery je prvne jako undefined, ale ve chvili kdy se nacte WASM, dostane implementaci z Module
  Uint8Vector: MainModule["Uint8Vector"];

  constructor(version: string) {
    this.#version = version;

    //? inicialize objects
    this.IConnector_WASM = Module.IConnector_WASM;
    this.Spectoda_WASM = Module.Spectoda_WASM;
    this.Uint8Vector = Module.Uint8Vector;
  }

  toHandle(value: any) {
    return Module.Emval.toHandle(value);
  }

  toValue(handle: any) {
    return Module.Emval.toValue(handle);
  }

  loadFS() {
    return FS.syncfs(true, (err: any) => {
      if (err) {
        logging.error("FS.syncfs error:", err);
      }
    });
  }

  saveFS() {
    return FS.syncfs(false, (err: any) => {
      if (err) {
        logging.error("FS.syncfs error:", err);
      }
    });
  }

  getVersion() {
    return this.#version;
  }

}

////////////////////////////////////////////////////////////////////////////////////////////////////

class WaitingAccess {
  promise: Promise<SpectodaWasmRuntime>;
  resolve: ((value: SpectodaWasmRuntime) => void) | undefined; // type from the typescript tooltip
  reject: ((reason?: any) => void) | undefined; // type from the typescript tooltip

  constructor() {
    this.promise = new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
}



// This class binds the JS world with the webassembly's C
export const SpectodaWasm = {

  _initializing: false,
  _version: WASM_VERSION as string,
  _runtime: undefined as SpectodaWasmRuntime | undefined,
  _waiting: [] as WaitingAccess[],

  // version might be DEBUG_0.9.2_20230814
  setVersion(version: string): void {

    if (this._initializing || this._runtime) {
      throw new Error("SpectodaWasm version cant be changed after access() is called");
    }

    this._version = version;
  },

  access(): Promise<SpectodaWasmRuntime> {
    if (this._runtime) {
      return Promise.resolve(this._runtime);
    }

    if (!this._initializing) {
      __loadWasm(this._version).then(() => {
        this._runtime = new SpectodaWasmRuntime(this._version);
        for (const w of this._waiting) {
          w.resolve(this._runtime);
        }
        this._waiting.length = 0;
      });
    }

    const wait = new WaitingAccess();
    this._waiting.push(wait);
    return wait.promise;
  },

  // oposite of convertJSArrayToNumberVector() in https://emscripten.org/docs/api_reference/val.h.html
  convertNumberVectorToJSArray(vector: Uint8Vector) {
    let array = new Uint8Array(vector.size());
    for (let i = 0; i < array.length; i++) {
      array[i] = vector.get(i);
    }
    return array;
  },

};

if (typeof window !== "undefined") {
  window.SpectodaWasm = SpectodaWasm;
}

export class Synchronization {
  clock: TimeTrack;
  timeline: TimeTrack;
  tnglFingerprint: null;
  historyFingerprint: null;

  constructor() {
    this.clock = new TimeTrack();
    this.timeline = new TimeTrack();
    this.tnglFingerprint = null;
    this.historyFingerprint = null;
  }
}
