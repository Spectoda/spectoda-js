import { logging } from "../Logging.js";
import { SpectodaWasm } from "./SpectodaWasm.js";
import { createNanoEvents } from "../functions";

// Implements SpectodaInterface in javascript

// We can make many objects of SpectodaInterface if we desire (for simulation purposes for example)

// Interface Wrapper
export class Interface {
  #instance;

  #eventEmitter;

  constructor() {
    this.#instance = null;

    this.#eventEmitter = createNanoEvents();
  }

  #onHandle(event_array) {
    // decode events
    console.log("onHandle", event_array);

    this.#eventEmitter.emit("events", event_array);
  }

  #onSendExecute(commands_bytecode_vector, source_connection) {
    // hand the vector to all interfaces I am connected with
    console.log("onSendExecute", commands_bytecode_vector, source_connection);
  }

  #onPeerConnected(peer_mac) {
    // hand the vector to all interfaces I am connected with
    console.log("onPeerConnected", peer_mac);

    this.#eventEmitter.emit("peer_connected", peer_mac);
  }

  #onPeerDisconnected(peer_mac) {
    // hand the vector to all interfaces I am connected with
    console.log("onPeerDisconnected", peer_mac);

    this.#eventEmitter.emit("peer_disconnected", peer_mac);
  }

  /**
   * @param {string} label
   * @param {string} mac_address
   * @param {number} id_offset
   * @return {Promise<null>}
   */
  construct(label, mac_address, id_offset) {
    if (this.#instance) {
      throw "AlreadyContructed";
    }

    return SpectodaWasm.waitForInitilize().then(() => {
      const self = this;

      const WasmInterfaceImplementation = {
        __construct: function () {
          this.__parent.__construct.call(this);
        },
        __destruct: function () {
          this.__parent.__destruct.call(this);
        },

        _handle: function (event_array) {
          // virtual void _handle(const deviceID_t device_id, const val& event_array) = 0;
          console.log("_handle", event_array);

          self.#onHandle(event_array);

          return undefined;
        },

        _sendExecute: function (commands_bytecode_vector, source_connection) {
          // virtual send_result_t _sendExecute(const std::vector<uint8_t>& commands_bytecode_vector, const connection_handle_t source_connection) = 0;
          console.log("_sendExecute", commands_bytecode_vector, source_connection);

          try {
            self.#onSendExecute(commands_bytecode_vector, source_connection);
          } catch {
            return Module.send_result_t.SEND_ERROR;
          }

          return Module.send_result_t.SEND_OK;
        },

        _handlePeerConnected: function (peer_mac) {
          console.log("_handlePeerConnected", peer_mac);

          self.#onPeerConnected(peer_mac);

          return Module.interface_error_t.SUCCESS;
        },

        _handlePeerDisconnected: function (peer_mac) {
          console.log("_handlePeerDisconnected", peer_mac);

          self.#onPeerDisconnected(peer_mac);

          return Module.interface_error_t.SUCCESS;
        },
      };

      this.#instance = SpectodaWasm.WasmInterface.implement(WasmInterfaceImplementation);
      this.#instance.begin(label, mac_address, id_offset);
    });
  }

  destruct() {
    if (!this.#instance) {
      throw "AlreadyDestructed";
    }

    this.#instance.end();
    this.#instance.delete();
    this.#instance = null;
  }

  /**
   * @param {number} clock_timestamp
   * @return {Uint8Array}
   */
  makePort() {
    if (!this.#instance) {
      throw "NotConstructed";
    }

    // const std::vector<uint8_t>& _makePort(const char port_char, const uint32_t port_size, const uint8_t port_brightness, const uint8_t port_power, bool port_visible, bool port_reversed)
    this.#instance.makePort("A".charCodeAt(0), 144, 255, 255, true, false);

    return new Uint8Array(0); // WIP
  }

  /**
   * @param {number} clock_timestamp
   * @return {null}
   */
  setClock(clock_timestamp) {
    if (!this.#instance) {
      throw "NotConstructed";
    }

    this.#instance.setClockTimestamp(clock_timestamp);
  }

  /**
   * @return {number}
   */
  getClock() {
    if (!this.#instance) {
      throw "NotConstructed";
    }

    return this.#instance.getClockTimestamp();
  }

  /**
   * @param {Uint8Array} execute_bytecode
   * @return {}
   */
  execute(execute_bytecode, connection_handle) {
    if (!this.#instance) {
      throw "NotConstructed";
    }

    let execute_vector = new SpectodaWasm.Uint8Vector();

    execute_vector.resize(execute_bytecode.length, 0);

    for (let i = 0; i < execute_bytecode.length; i++) {
      execute_vector.set(i, execute_bytecode[i]);
    }

    const evaluate_result = this.#instance.execute(execute_vector, connection_handle);

    execute_vector.delete();

    if (evaluate_result != SpectodaWasm.evaluate_result_t.COMMAND_SUCCESS) {
      throw "EvaluateError";
    }
  }

  /**
   * If request_evaluate_result is not SUCCESS the promise is rejected with an exception
   * @param {Uint8Array} command
   * @return {Uint8Array}
   */
  request(request_bytecode, connection_handle) {
    if (!this.#instance) {
      throw "NotConstructed";
    }

    let request_vector = new SpectodaWasm.Uint8Vector();
    let response_vector = new SpectodaWasm.Uint8Vector();

    request_vector.resize(request_bytecode.length, 0);

    for (let i = 0; i < request_bytecode.length; i++) {
      request_vector.set(i, request_bytecode[i]);
    }

    const evaluate_result = this.#instance.request(request_vector, response_vector, connection_handle);

    request_vector.delete();

    let response_bytecode = new Uint8Array(response_vector.size());

    for (let i = 0; i < response_vector.size(); i++) {
      response_bytecode[i] = response_vector[i];
    }

    response_vector.delete();

    if (evaluate_result != SpectodaWasm.evaluate_result_t.COMMAND_SUCCESS) {
      throw "EvaluateError";
    }

    return response_bytecode;
  }

  compute() {
    if (!this.#instance) {
      throw "NotConstructed";
    }

    this.#instance.compute();
  }

  render() {
    if (!this.#instance) {
      throw "NotConstructed";
    }

    this.#instance.render();
  }
}

if (typeof window !== "undefined") {
  window.Interface = Interface;

  window.test_wasm = function() {

    window.instance = new Interface();
    window.instance.construct("con1", "ff:ff:ff:ff:ff:ff", 0).then(()=>{
      window.instance.makePort();
      window.instance.execute([0x69,0xaf,0x06,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x10,0x68,0xaf,0x06,0x00,0x00,0x00,0x00,0x00,0x01,0x00,0x00,0x00,0xff], 0xffff);
      window.instance.execute([0x72,0xff,0xff,0xff,0x0f,0x65,0x76,0x74,0x00,0x00,0x6e,0x40,0x00,0x00,0x00,0x00,0xff], 0xffff);
      window.instance.compute();
    });


  }
}

