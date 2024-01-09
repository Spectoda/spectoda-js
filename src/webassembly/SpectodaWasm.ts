import { TimeTrack } from "../TimeTrack";
import { logging } from "../logging";

let moduleInitilizing = false;
let moduleInitilized = false;
let waitingQueue: WaitingItem[] = [];

class WaitingItem {

  promise: Promise<unknown>;
  resolve: (value: unknown) => void; // type from the typescript tooltip
  reject: (reason?: any) => void; // type from the typescript tooltip

  constructor() {

    this.resolve = () => { };
    this.reject = (error: any) => { };

    this.promise = new Promise((resolve, reject) => {
      this.reject = reject;
      this.resolve = resolve;
    });
  }
}

function injectScript(src: string) {
  return new Promise((resolve, reject) => {
    if (typeof window !== "undefined" && document) {
      const script = document.createElement("script");
      script.src = src;
      script.addEventListener("load", resolve);
      script.addEventListener("error", e => reject(e.error));
      document.head.appendChild(script);
    }
  });
}

function onWasmLoad() {
  logging.info("Webassembly loaded");

  Module.onRuntimeInitialized = () => {
    moduleInitilized = true;

    logging.info("Webassembly runtime initilized");

    //? inicialize objects
    SpectodaWasm.IConnector_WASM = Module.IConnector_WASM;
    SpectodaWasm.Spectoda_WASM = Module.Spectoda_WASM;
    SpectodaWasm.Uint8Vector = Module.Uint8Vector;

    //? Filesystem mounting
    if (typeof window !== "undefined") {
      // Make a directory other than '/'
      FS.mkdir('/littlefs');
      // Then mount with IDBFS type
      FS.mount(IDBFS, {}, '/littlefs');

      // Then sync
      FS.syncfs(true, function (err: any) {
        if (err) {
          logging.error("FS.syncfs error:", err);
        }
      });

    } else {
      // TODO! implement FS pro NODE

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

    waitingQueue.forEach(wait => {
      wait.resolve(null);
    });

    Module.onRuntimeInitialized = null;
  };
}

function loadWasm(wasmVersion: string) {

  if (moduleInitilizing || moduleInitilized) {
    return;
  }

  moduleInitilizing = true;

  logging.info("spectoda-js wasm version " + wasmVersion);

  if (typeof window !== "undefined") {

    // BROWSER enviroment

    // First try to load local version
    injectScript(`http://localhost:5555/builds/${wasmVersion}.js`)
      .then(onWasmLoad)
      .catch(error => {
        logging.error(error);
        // if local version fails, load public file
        injectScript(`https://updates.spectoda.com/subdom/updates/webassembly/daily/${wasmVersion}.js`)
          .then(onWasmLoad)
          .catch(error => {
            logging.error(error);
          });
      });

  } else {

    // NODE enviroment

    if (!process.env.NEXT_PUBLIC_VERSION) {
      globalThis.Module = require(`./webassembly/${wasmVersion}.js`);
      onWasmLoad();
    }

  }

}

// This class binds the JS world with the webassembly's C
export const SpectodaWasm = {
  // const std::vector<uint8_t>&  makePort(const char port_char, const uint32_t port_size, const uint8_t port_brightness, const uint8_t port_power, bool port_visible, bool port_reversed)
  // void                         begin(const std::string& name_string, const std::string& mac_string, const deviceID_t device_id_offset)
  // void                         end()
  // void                         setClockTimestamp(const clock_ms timestamp)
  // clock_ms                     getClockTimestamp()
  // evaluate_result_t            execute(const std::vector<uint8_t>& commands_bytecode_vector, const connection_t source_connection)
  // evaluate_result_t            request(const std::vector<uint8_t>& request_bytecode_vector, std::vector<uint8_t>& response_bytecode_vector_out, const tngl::connection_t source_connection)

  // clone()
  // delete()

  //? tohle je virtualni C++ class prohnana pres emscripten, coz zpusobuje ze ji muzu naimplementovat v JS
  //? Ktery je prvne jako undefined, ale ve chvili kdy se nacte WASM, dostane implementaci z Module
  IConnector_WASM: undefined,


  //? tohle je virtualni C++ class prohnana pres emscripten, coz zpusobuje ze ji muzu naimplementovat v JS
  //? Ktery je prvne jako undefined, ale ve chvili kdy se nacte WASM, dostane implementaci z Module
  Spectoda_WASM: undefined,

  // get(arg0)
  // push_back(arg0)
  // resize(arg0, arg1)
  // set(arg0, arg1)
  // size()
  // clone()
  // delete()

  //? tohle je C++ typ prohnany pres emscripten, coz zpusobuje ze ji muzu naimplementovat v JS
  //? Ktery je prvne jako undefined, ale ve chvili kdy se nacte WASM, dostane implementaci z Module
  Uint8Vector: undefined,

  // evaluate_result_t: null,
  // send_result_t: null,

  // oposite of convertJSArrayToNumberVector() in https://emscripten.org/docs/api_reference/val.h.html
  convertNumberVectorToJSArray(vector: any) {
    let array = new Uint8Array(vector.size());
    for (let i = 0; i < array.length; i++) {
      array[i] = vector.get(i);
    }
    return array;
  },

  // wasmVersion might be DEBUG_0.9.2_20230814
  initilize(wasmVersion: string) {
    loadWasm(wasmVersion);
  },

  // TODO make it a getter?
  /**
   * @return {boolean}
   */
  initilized() {
    return moduleInitilized;
  },

  /**
   * @return {Promise<null>}
   */
  waitForInitilize() {

    if (moduleInitilized) {
      return Promise.resolve();
    }

    const wait = new WaitingItem();
    waitingQueue.push(wait);
    return wait.promise;
  },

  toHandle(value: any) {
    return Module.Emval.toHandle(value);
  },

  toValue(handle: number) {
    return Module.Emval.toValue(handle);
  },

  loadFS() {
    return Module.FS.syncfs(true, (err: any) => {
      if (err) {
        logging.error("FS.syncfs error:", err);
      }
    });
  },

  saveFS() {
    return Module.FS.syncfs(false, (err: any) => {
      if (err) {
        logging.error("FS.syncfs error:", err);
      }
    });
  }
};

if (typeof window !== "undefined") {
  window.SpectodaWasm = SpectodaWasm;
}


export class Synchronization {

  constructor() {
    this.clock = new TimeTrack();
    this.timeline = new TimeTrack();
    this.tnglFingerprint = null;
    this.historyFingerprint = null;
  }

}