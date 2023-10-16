import { TimeTrack } from "../TimeTrack";
import { logging } from "../logging";

let moduleInitilizing = false;
let moduleInitilized = false;
let waitingQueue = [];

class Wait {
  constructor() {
    this.promise = new Promise((resolve, reject) => {
      this.reject = reject;
      this.resolve = resolve;
    });
  }
}

function injectScript(src) {
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
  console.log("Webassembly loaded");

  Module.onRuntimeInitialized = () => {
    moduleInitilized = true;

    console.log("Webassembly runtime initilized");

    SpectodaWasm.WasmInterface = Module.WasmInterface;
    SpectodaWasm.Uint8Vector = Module.Uint8Vector;
    // SpectodaWasm.send_result_t = Module.send_result_t;

    if (typeof window !== "undefined") {
      // Make a directory other than '/'
      FS.mkdir('/littlefs');
      // Then mount with IDBFS type
      FS.mount(IDBFS, {}, '/littlefs');

      // Then sync
      FS.syncfs(true, function (err) {
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
      wait.resolve();
    });

    Module.onRuntimeInitialized = null;
  };
}

function loadWasm(wasmVersion) {

  if (moduleInitilizing || moduleInitilized) {
    return;
  }

  moduleInitilizing = true;

  console.log("spectoda-js wasm version " + wasmVersion);

  if (typeof window !== "undefined") {
    // First try to load local version
    injectScript(`http://localhost:5555/builds/${wasmVersion}.js`)
      .then(onWasmLoad)
      .catch(error => {
        console.error(error);
        // if local version fails, load public file
        injectScript(`https://updates.spectoda.com/subdom/updates/webassembly/daily/${wasmVersion}.js`)
          .then(onWasmLoad)
          .catch(error => {
            console.error(error);
          });
      });
  }

  else {

    // NODE enviroment

    globalThis.Module = require(`./webassembly/${wasmVersion}.js`);
    onWasmLoad();

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

  /**
   * @type { {
   *   begin: () => void,
   *   end: () => void
   * } }
   */
  WasmInterface: null, // Uint8Array;    let array = new Uint8Array()

  // get(arg0)
  // push_back(arg0)
  // resize(arg0, arg1)
  // set(arg0, arg1)
  // size()
  // clone()
  // delete()

  Uint8Vector: null,

  // evaluate_result_t: null,
  // send_result_t: null,

  // oposite of convertJSArrayToNumberVector() in https://emscripten.org/docs/api_reference/val.h.html
  convertNumberVectorToJSArray(vector) {
    let array = new Uint8Array(vector.size());
    for (let i = 0; i < array.length; i++) {
      array[i] = vector.get(i);
    }
    return array;
  },

  // wasmVersion might be DEBUG_0.9.2_20230814
  initilize(wasmVersion) {
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

    const wait = new Wait();
    waitingQueue.push(wait);
    return wait.promise;
  },

  toHandle(value) {
    return Module.Emval.toHandle(value);
  },

  toValue(value) {
    return Module.Emval.toValue(value);
  }
};

if (typeof window !== "undefined") {
  window.SpectodaWasm = SpectodaWasm;
}


export class synchronization_t {

  constructor() {
    this.clock = new TimeTrack();
    this.timeline = new TimeTrack();
    this.tnglFingerprint = null;
    this.historyFingerprint = null;
  }

}