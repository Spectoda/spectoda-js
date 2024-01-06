import { logging } from "../logging";
import { SpectodaWasm } from "./SpectodaWasm.js";

const WASM_VERSION = "DEBUG_0.10.0_20231123";

// Implements Spectoda_JS in javascript

// We can make many objects of Spectoda_JS if we desire (for simulation purposes for example)

// InterfaceWrapper
export class Spectoda_JS {
  #runtimeReference;

  #instance;

  constructor(runtimeReference) {
    this.#runtimeReference = runtimeReference;

    this.#instance = null;
  }

  waitForInitilize() {
    return SpectodaWasm.waitForInitilize();
  }

  // controller_identifier, controller_mac, controller_id_offset, controller_brightness
  /**
   * @param {string} label
   * @param {string} mac_address
   * @param {number} id_offset
   * @return {Promise<null>}
   */
  construct(label, mac_address, id_offset, brightness) {
    if (this.#instance) {
      throw "AlreadyContructed";
    }

    // TODO pass WASM version to load
    SpectodaWasm.initilize(WASM_VERSION);

    return SpectodaWasm.waitForInitilize().then(() => {
      const WasmInterfaceImplementation = {
        /* Constructor function is optional */
        // __construct: function () {
        //   this.__parent.__construct.call(this);
        // },

        /* Destructor function is optional */
        // __destruct: function () {
        //   this.__parent.__destruct.call(this);
        // },

        _onEvents: event_array => {
          logging.verbose("_onEvents", event_array);

          for (let i = 0; i < event_array.length; i++) {
            event_array[i].timestamp_utc = Date.now();
          }

          if (event_array.length) {
            let debug_log = "";

            {
              const e = event_array[0];
              debug_log += `${e.id} -> $${e.label}: ${e.value} [${e.timestamp}ms]`;
            }

            for (let i = 1; i < event_array.length; i++) {
              const e = event_array[i];
              debug_log += `\n${e.id} -> $${e.label}: ${e.value} [${e.timestamp}ms]`;
            }

            logging.info(debug_log);
          }

          this.#runtimeReference.emit("emitted_global_events", event_array);
        },

        _onLocalEvents: event_array => {
          logging.verbose("_onLocalEvents", event_array);

          for (let i = 0; i < event_array.length; i++) {
            event_array[i].timestamp_utc = Date.now();
          }

          if (event_array.length) {
            let debug_log = "";

            {
              const e = event_array[0];
              debug_log += `${e.id} -> $${e.label}: ${e.value} [${e.timestamp}ms] (local)`;
            }

            for (let i = 1; i < event_array.length; i++) {
              const e = event_array[i];
              debug_log += `\n${e.id} -> $${e.label}: ${e.value} [${e.timestamp}ms] (local)`;
            }

            logging.info(debug_log);
          }

          this.#runtimeReference.emit("emitted_events", event_array);
        },

        _onExecute: (commands_bytecode_vector, source_connection) => {
          logging.verbose("_onExecute", commands_bytecode_vector, source_connection);

          // try {
          // dont know how to make Uint8Array in C++ yet. So I am forced to give data out in C++ std::vector
          // const commands_bytecode = SpectodaWasm.convertNumberVectorToJSArray(commands_bytecode_vector);

          // TODO IMPLEMENT SENDING TO OTHER INTERFACES

          // } catch {

          // }

          return true;
        },

        // _onRequest: () => {
        //   logging.debug("_onRequest", );

        //   try {
        //     // dont know how to make Uint8Array in C++ yet. So I am forced to give data out in C++ std::vector
        //     const commands_bytecode = SpectodaWasm.convertNumberVectorToJSArray(commands_bytecode_vector);

        //     logging.verbose("commands_bytecode", commands_bytecode);

        //     // TODO IMPLEMENT SENDING TO OTHER INTERFACES
        //   } catch {
        //   }

        // return true;
        // },

        _onSynchronize: synchronization_object => {
          logging.verbose("_onSynchronize", synchronization_object);

          try {
            this.#runtimeReference.setClock(synchronization_object.clock_timestamp).catch(e => {
              logging.error(e);
            });
          } catch (e) {
            logging.error(e);
          }

          return true;
        },

        _handlePeerConnected: peer_mac => {
          logging.debug("_handlePeerConnected", peer_mac);

          this.#runtimeReference.emit("peer_connected", peer_mac);

          return Module.interface_error_t.SUCCESS;
        },

        _handlePeerDisconnected: peer_mac => {
          logging.debug("_handlePeerDisconnected", peer_mac);

          this.#runtimeReference.emit("peer_disconnected", peer_mac);

          return Module.interface_error_t.SUCCESS;
        },

        // virtual interface_error_t _handleTimelineManipulation(const int32_t timeline_timestamp, const bool timeline_paused, const double clock_timestamp) = 0;
        _handleTimelineManipulation: (timeline_timestamp, timeline_paused, clock_timestamp) => {
          logging.debug("_handleTimelineManipulation", timeline_timestamp, timeline_paused, clock_timestamp);

          return Module.interface_error_t.SUCCESS;
        },

        _onLog: (level, filename, message) => {
          if (level - 1 < logging.level) {
            return;
          }

          switch (level) {
            case 5:
              logging.verbose(`<spectoda> [V][${filename}]: ${message}`);
              break;
            case 4:
              logging.debug(`<spectoda> [D][${filename}]: ${message}`);
              break;
            case 3:
              logging.info(`<spectoda> [I][${filename}]: ${message}`);
              break;
            case 2:
              logging.warn(`<spectoda> [W][${filename}]: ${message}`);
              break;
            case 1:
              logging.error(`<spectoda> [E][${filename}]: ${message}`);
              break;
            default:
              logging.error(`<spectoda> [?][${filename}]: ${message}`);
              break;
          }
        },
      };

      this.#instance = SpectodaWasm.Spectoda_WASM.implement(WasmInterfaceImplementation);

      this.#instance.init(mac_address, `{"controller":{"name": "Spectoda"}}`);
      this.#instance.begin();

      // this.#instance.makePort("A", 1, brightness, 255, true, false);
      // this.#instance.makePort("B", 1, brightness, 255, true, false);
      // this.#instance.makePort("C", 1, brightness, 255, true, false);
      // this.#instance.makePort("D", 1, brightness, 255, true, false);
      // this.#instance.makePort("E", 1, brightness, 255, true, false);
      // this.#instance.makePort("F", 1, brightness, 255, true, false);
      // this.#instance.makePort("G", 1, brightness, 255, true, false);
      // this.#instance.makePort("H", 1, brightness, 255, true, false);
    });
  }

  destruct() {
    if (!this.#instance) {
      throw "AlreadyDestructed";
    }

    this.#instance.end(); // end the spectoda stuff
    this.#instance.delete(); // delete (free) C++ object
    this.#instance = null; // remove javascript reference
  }

  /**
   * @param {number} clock_timestamp
   * @return {Uint8Vector}
   */
  makePort(port_char = "A", port_size = 144, port_brightness = 255, port_power = 255, port_visible = true, port_reversed = false) {
    if (!this.#instance) {
      throw "NotConstructed";
    }

    // const std::vector<uint8_t>& _makePort(const std::string& port_char, const uint32_t port_size, const uint8_t port_brightness, const uint8_t port_power, bool port_visible, bool port_reversed)
    return this.#instance.makePort(port_char, port_size, port_brightness, port_power, port_visible, port_reversed);
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
   * @param {number} source_connection
   * @return {}
   */
  execute(execute_bytecode, source_connection) {
    if (!this.#instance) {
      throw "NotConstructed";
    }

    const execute_sucess = this.#instance.execute(SpectodaWasm.toHandle(execute_bytecode), source_connection);

    if (!execute_sucess) {
      throw "EvaluateError";
    }
  }

  /**
   * If request_evaluate_result is not SUCCESS the promise is rejected with an exception
   * @param {Uint8Array} request_bytecode
   * @param {number} source_connection
   * @return {Uint8Array}
   */
  request(request_bytecode, source_connection) {
    if (!this.#instance) {
      throw "NotConstructed";
    }

    let response_bytecode_vector = new SpectodaWasm.Uint8Vector();
    let response_bytecode = undefined;

    try {
      const request_sucess = this.#instance.request(SpectodaWasm.toHandle(request_bytecode), response_bytecode_vector, source_connection);

      if (!request_sucess) {
        throw "EvaluateError";
      }

      response_bytecode = SpectodaWasm.convertNumberVectorToJSArray(response_bytecode_vector);
    } finally {
      response_bytecode_vector.delete();
    }

    return response_bytecode;
  }

  /**
   * @param {number} clock_timestamp
   * @param {number} source_connection
   * @return {}
   * */
  synchronize(clock_timestamp, source_connection) {
    logging.debug("synchronize()");

    if (!this.#instance) {
      throw "NotConstructed";
    }

    this.#instance.synchronize(clock_timestamp, source_connection);
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

  readVariableAddress(variable_address, device_id) {
    if (!this.#instance) {
      throw "NotConstructed";
    }

    return this.#instance.readVariableAddress(variable_address, device_id);
  }
}

// if (typeof window !== "undefined") {
//   window.Spectoda_JS = Spectoda_JS;

//   window.test_wasm = function () {
//     window.instance = new Spectoda_JS();
//     window.instance.construct("con1", "ff:ff:ff:ff:ff:ff", 0).then(() => {
//       logging.verbose(window.instance.makePort("A", 144, 255, 255, true, false));
//       window.instance.execute([0x69, 0xaf, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x10, 0x68, 0xaf, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0xff], 0xffff);
//       window.instance.execute([0x72, 0xff, 0xff, 0xff, 0x0f, 0x65, 0x76, 0x74, 0x00, 0x00, 0x6e, 0x40, 0x00, 0x00, 0x00, 0x00, 0xff], 0xffff);
//       window.instance.compute();
//     });
//   };
// }
