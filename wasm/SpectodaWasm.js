import { Module } from "./spectoda-wasm-debug";
// import Module from "./spectoda-wasm-release";

// const Module = debug ? await import("./spectoda-wasm-debug.js") : await import("./spectoda-wasm-release.js");

class Wait {
  constructor() {
    this.promise = new Promise((resolve, reject) => {
      this.reject = reject;
      this.resolve = resolve;
    });
  }
}

let moduleInitilized = false;
let waitingQueue = [];

Module.onRuntimeInitialized = () => {
  moduleInitilized = true;

  waitingQueue.forEach(wait => {
    wait.resolve();
  });

  if (typeof window !== "undefined") {
    window.Module = Module;
  }
};

// JS to WASM bindings

const RESULT_SUCCESS = 0;

/**
 * @param {number} ptr
 * @return {number}
 */
const HEAPU32_PTR = function (ptr) {
  return ptr / 4;
};

// This class binds the JS world with the webassembly's C
export const SpectodaWasm = {
  // // /**
  // //  * @param {boolean} value
  // //  */
  // // set initilized(value) {
  // //   this._initilized = value;
  // // },

  // // /**
  // //  * @return {boolean}
  // //  */
  // // get initilized() {
  // //   this._initilized || false;
  // // },

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

  /** returns a promise that resolves Interface instance handle (pointer in wasm heap memory)
   *  for now only one instance is allowed
   * @param {string} label "contr"
   * @param {string} mac_address "ff:ff:ff:ff:ff:ff"
   * @param {number} id_offset 0
   * @return {Promise<number>}
   */
  makeInstance(label, mac_address, id_offset) {
    return waitForInitilize().then(() => {
      const label_bytes_size = label.length;
      const label_bytes_ptr = Module["_malloc"](label_bytes_size);

      // Copy the string into the WASM memory
      for (let i = 0; i < label.length; i++) {
        Module.HEAPU8[label_bytes_ptr + i] = label.charCodeAt(i);
      }
      Module.HEAPU8[label_bytes_ptr + label_bytes_size] = 0; // null terminator

      const mac_parts = mac_address.split(':');
      const mac_bytes_size = 6;
      const mac_bytes_ptr = Module["_malloc"](mac_bytes_size); 

      for (let i = 0; i < mac_parts.length && i < mac_bytes_size; i++) {
        Module.HEAPU8[mac_bytes_ptr + i] = parseInt(mac_parts[i], 16);
      }

      // makeInstance(const char* const controller_identifier, const uint8_t* const controller_mac, const uint8_t controller_id_offset)
      const instance = Module["_makeInstance"](label_bytes_ptr, mac_bytes_ptr, id_offset);

      Module["_free"](label_bytes_ptr);
      Module["_free"](mac_bytes_ptr);

      return instance;
    });
  },

  /** returns a Interface instance pointer
   *  for now only one instance is allowed
   * @param {number} interface_handle
   * @param {string} port_char
   * @param {number} port_size
   * @param {number} port_brightness
   * @param {number} port_power
   * @param {boolean} port_visible
   * @param {boolean} port_reversed
   * returns array of r,g,b bytes to which pixels are drawn on render()
   * @return {Uint8Array}
   */
  makePort(interface_handle, port_char, port_size, port_brightness, port_power, port_visible, port_reversed) {
    if (!moduleInitilized) {
      throw "WebassemblyNotInitilized";
    }

    const portBufferPtr = Module["_createPort"](interface_handle, port_char.charCodeAt(0), port_size, port_brightness, port_power, port_visible, port_reversed);
    return new Uint8Array(Module.HEAPU8.buffer, portBufferPtr, port_size * 3);
  },

  /**
   * @param {number} interface_handle
   * @return {null}
   */
  render(interface_handle) {
    if (!moduleInitilized) {
      throw "WebassemblyNotInitilized";
    }

    Module["_render"](interface_handle);
  },

  /**
   * @param {number} interface_handle
   * @param {number} clock_timestamp
   * @return {null}
   */
  setClock(interface_handle, clock_timestamp) {
    if (!moduleInitilized) {
      throw "WebassemblyNotInitilized";
    }

    Module["_setClock"](interface_handle, clock_timestamp);
  },

  /**
   * @param {number} interface_handle
   * @return {number}
   */
  getClock(interface_handle) {
    if (!moduleInitilized) {
      throw "WebassemblyNotInitilized";
    }

    return Module["_getClock"](interface_handle);
  },

  /**
   * @param {number} interface_handle
   * @param {Uint8Array} commands
   * @return {null}
   */
  execute(interface_handle, commands) {
    if (!moduleInitilized) {
      throw "WebassemblyNotInitilized";
    }

    const command_bytes = commands;

    // console.log("command_bytes", command_bytes);

    const command_bytes_size = command_bytes.length;
    const command_bytes_ptr = Module["_malloc"](command_bytes_size); // Allocate memory for the array
    Module.HEAPU8.set(command_bytes, command_bytes_ptr); // Copy the array data into the WASM memory

    // console.log("command_bytes_size", command_bytes_size);
    // console.log("command_bytes_ptr", command_bytes_ptr);

    Module["_execute"](interface_handle, command_bytes_ptr, command_bytes_size);

    Module["_free"](command_bytes_ptr); // Free the memory when you're done with it
  },

  /**
   * If request_evaluate_result is not SUCCESS the promise is rejected with an exception
   * @param {number} interface_handle
   * @param {Uint8Array} command
   * @return {Uint8Array}
   */
  request(interface_handle, command) {
    if (!moduleInitilized) {
      throw "WebassemblyNotInitilized";
    }

    const request_bytes = command;

    // console.log("request_bytes", request_bytes);

    const request_bytes_size = request_bytes.length;
    const request_bytes_ptr = Module["_malloc"](request_bytes_size); // Allocate memory for the array
    Module.HEAPU8.set(request_bytes, request_bytes_ptr); // Copy the array data into the WASM memory

    // console.log("request_bytes_size", request_bytes_size);
    // console.log("request_bytes_ptr", request_bytes_ptr);

    // typedef struct {
    //     uint8_t* response_bytecode_hp;
    //     uint32_t response_bytecode_size;
    //     uint32_t request_evaluate_result;
    // } request_result_t;

    const response_result_ptr = Module["_malloc"](12);

    // console.log("response_result_ptr", response_result_ptr);

    // INTERFACE RequestResult request(const uint8_t* const request_bytecode, const size_t request_bytecode_size, const connection_handle_t source_connection)
    Module["_request"](interface_handle, request_bytes_ptr, request_bytes_size, response_result_ptr);

    const response_bytecode_ptr = Module.HEAPU32[HEAPU32_PTR(response_result_ptr)];
    const response_bytecode_size = Module.HEAPU32[HEAPU32_PTR(response_result_ptr) + 1];
    const request_evaluate_result = Module.HEAPU32[HEAPU32_PTR(response_result_ptr) + 2];

    let response_bytes = null;

    if (request_evaluate_result == RESULT_SUCCESS) {
      response_bytes = new Uint8Array(response_bytecode_size);
      response_bytes.set(HEAPU8.subarray(response_bytecode_ptr, response_bytecode_ptr + response_bytecode_size));
    }

    // console.log("response_bytecode_ptr", response_bytecode_ptr);
    // console.log("response_bytecode_size", response_bytecode_size);
    // console.log("request_evaluate_result", request_evaluate_result);

    // console.log("response_bytes", response_bytes);

    Module["_free"](request_bytes_ptr);
    Module["_free"](response_bytecode_ptr);
    Module["_free"](response_result_ptr);

    if (!response_bytes) {
      throw "RequestEvaluateError";
    }

    return response_bytes;
  },
};
