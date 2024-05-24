import { createNanoEvents } from "../functions";
import { logging } from "../logging";
import { LogEntry, RingLogBuffer } from "./LogBuffer";
import { SpectodaWasm } from "./SpectodaWasm.js";

export class PreviewController {
  #macAddress;

  #instance;
  #config;

  #ports;
  #ringLogBuffer;
  #eventEmitter;

  constructor(controller_mac_address) {
    this.#macAddress = controller_mac_address;

    this.#instance = null;
    this.#config = undefined;

    this.#ports = {};
    this.#eventEmitter = createNanoEvents();
  }

  /**
   * @param {string} controller_mac_address
   * @return {Promise<null>}
   */
  construct(config) {
    logging.info(`construct(config=${JSON.stringify(config)})`);

    if (this.#instance) {
      throw "AlreadyContructed";
    }

    this.#config = config;
    this.#ringLogBuffer = new RingLogBuffer(1000);

    return SpectodaWasm.waitForInitilize().then(() => {
      const PreviewControllerImplementation = {
        /* Constructor function is optional */
        // __construct: function () {
        //   this.__parent.__construct.call(this);
        // },

        /* Destructor function is optional */
        // __destruct: function () {
        //   this.__parent.__destruct.call(this);
        // },

        _onEvents: event_array => {
          // logging.verbose("_onEvents", event_array);
          // for (let i = 0; i < event_array.length; i++) {
          //     event_array[i].timestamp_utc = Date.now();
          // }
          // if (event_array.length) {
          //     let debug_log = "";
          //     {
          //         const e = event_array[0];
          //         debug_log += `${e.id} -> $${e.label}: ${e.value} [${e.timestamp}ms]`;
          //     }
          //     for (let i = 1; i < event_array.length; i++) {
          //         const e = event_array[i];
          //         debug_log += `\n${e.id} -> $${e.label}: ${e.value} [${e.timestamp}ms]`;
          //     }
          //     logging.info(debug_log);
          // }
          // this.#runtimeReference.emit("emitted_events", event_array);
        },

        _onLocalEvents: event_array => {
          // logging.verbose("_onLocalEvents", event_array);
          // for (let i = 0; i < event_array.length; i++) {
          //     event_array[i].timestamp_utc = Date.now();
          // }
          // if (event_array.length) {
          //     let debug_log = "";
          //     {
          //         const e = event_array[0];
          //         debug_log += `${e.id} -> $${e.label}: ${e.value} [${e.timestamp}ms] (local)`;
          //     }
          //     for (let i = 1; i < event_array.length; i++) {
          //         const e = event_array[i];
          //         debug_log += `\n${e.id} -> $${e.label}: ${e.value} [${e.timestamp}ms] (local)`;
          //     }
          //     logging.info(debug_log);
          // }
          // this.#runtimeReference.emit("emitted_local_events", event_array);
        },

        _onExecute: (commands_bytecode_vector, source_connection) => {
          // logging.verbose("_onExecute", commands_bytecode_vector, source_connection);

          // try {
          //     // dont know how to make Uint8Array in C++ yet. So I am forced to give data out in C++ std::vector
          //     const commands_bytecode = SpectodaWasm.convertNumberVectorToJSArray(commands_bytecode_vector);

          //     // TODO IMPLEMENT SENDING TO OTHER INTERFACES

          // } catch {
          //     return Module.send_result_t.SEND_ERROR;
          // }

          // return Module.send_result_t.SEND_OK;

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
        //     return Module.send_result_t.SEND_ERROR;
        //   }

        //   return Module.send_result_t.SEND_OK;

        // return true;
        // },

        _onSynchronize: synchronization_object => {
          // logging.debug("_onSynchronize", synchronization_object);

          return true;
        },

        _handlePeerConnected: peer_mac => {
          logging.debug("_handlePeerConnected", peer_mac);

          // this.#runtimeReference.emit("peer_connected", peer_mac);

          return Module.interface_error_t.SUCCESS;
        },

        _handlePeerDisconnected: peer_mac => {
          logging.debug("_handlePeerDisconnected", peer_mac);

          // this.#runtimeReference.emit("peer_disconnected", peer_mac);

          return Module.interface_error_t.SUCCESS;
        },

        // virtual interface_error_t _handleTimelineManipulation(const int32_t timeline_timestamp, const bool timeline_paused, const double clock_timestamp) = 0;
        _handleTimelineManipulation: (timeline_timestamp, timeline_paused, clock_timestamp) => {
          logging.debug("_handleTimelineManipulation", timeline_timestamp, timeline_paused, clock_timestamp);

          return Module.interface_error_t.SUCCESS;
        },

        _onLog: (level, filename, message) => {
          const logEntry = new LogEntry(level, filename, message);
          this.#ringLogBuffer.push(logEntry);
          this.#eventEmitter.emit("log", logEntry);

          switch (level) {
            case 5:
              logging.verbose(`<${this.mac}> [V][${filename}]: ${message}`);
              break;
            case 4:
              logging.debug(`<${this.mac}> [D][${filename}]: ${message}`);
              break;
            case 3:
              logging.info(`<${this.mac}> [I][${filename}]: ${message}`);
              break;
            case 2:
              logging.warn(`<${this.mac}> [W][${filename}]: ${message}`);
              this.#eventEmitter.emit("warn", logEntry);
              break;
            case 1:
              logging.error(`<${this.mac}> [E][${filename}]: ${message}`);
              this.#eventEmitter.emit("error", logEntry);
              break;
            default:
              logging.error(`<${this.mac}> [?][${filename}]: ${message}`);
              this.#eventEmitter.emit("unknown", logEntry);
              break;
          }
        },
      };

      this.#instance = SpectodaWasm.Spectoda_WASM.implement(PreviewControllerImplementation);

      // const label = this.#config.controller?.label ? this.#config.controller?.label : "Spect";
      // const id_offset = this.#config.controller?.id_offset ? this.#config.controller?.id_offset : 0;
      // const brightness = this.#config.controller?.brightness ? this.#config.controller?.brightness : 255;

      this.#instance.init(this.#macAddress, JSON.stringify(this.#config));
      this.#instance.begin();

      let current_tag = "A";

      if (this.#config.ports) {
        for (const port of this.#config.ports) {
          const port_tag = port.tag ? port.tag : current_tag;
          current_tag = String.fromCharCode(port_tag.charCodeAt(0) + 1);

          const port_size = port.size ? port.size : 1;
          const port_brightness = port.brightness ? port.brightness : 255;
          const port_power = port.power ? port.power : 255;
          const port_visible = port.visible ? port.visible : true;
          const port_reversed = port.reversed ? port.reversed : false;

          this.#ports[port_tag] = this.#instance.makePort(port_tag, port_size, port_brightness, port_power, port_visible, port_reversed);
        }
      }
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

  // /**
  //  * @param {number} clock_timestamp
  //  * @return {Uint8Vector}
  //  */
  // makePort(port_tag = "A", port_size = 1, port_brightness = 255, port_power = 255, port_visible = true, port_reversed = false) {
  //     if (!this.#instance) {
  //         throw "NotConstructed";
  //     }

  //     // const std::vector<uint8_t>& _makePort(const std::string& port_tag, const uint32_t port_size, const uint8_t port_brightness, const uint8_t port_power, bool port_visible, bool port_reversed)
  //     return this.#instance.makePort(port_tag, port_size, port_brightness, port_power, port_visible, port_reversed);
  // }

  getPort(port_tag) {
    if (!this.#instance) {
      throw "NotConstructed";
    }

    return this.#ports[port_tag];
  }

  getPorts() {
    if (!this.#instance) {
      throw "NotConstructed";
    }

    return this.#ports;
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

  bakeTnglFrame() {
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

  getLogs() {
    return this.#ringLogBuffer.getAllLogs();
  }

  clearLogs() {
    this.#ringLogBuffer.clear();
    this.#eventEmitter.emit("clear_logs");
  }

  on(event, callback) {
    return this.#eventEmitter.on(event, callback);
  }

  // returns string
  get mac() {
    // logging.debug("get mac()");

    if (!this.#instance) {
      throw "NotConstructed";
    }

    return this.#macAddress;
  }

  // returns std::string a.k.a string
  get label() {
    // logging.debug("get label()");

    if (!this.#instance) {
      throw "NotConstructed";
    }

    return this.#instance.getLabel();
  }

  // returns int32_t a.k.a number
  get identifier() {
    // logging.debug("get identifier()");

    if (!this.#instance) {
      throw "NotConstructed";
    }

    return this.#instance.getIdentifier();
  }
}
