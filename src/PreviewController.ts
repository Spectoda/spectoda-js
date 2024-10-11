import { createNanoEvents, sleep } from "../functions";
import { logging } from "../logging";
import { LogEntry, RingLogBuffer } from "./LogBuffer";
import { Connection, Spectoda_WASM, Spectoda_WASMImplementation, SpectodaWasm, Synchronization, Uint8Vector } from "./SpectodaWasm";

export class PreviewController {
  #macAddress;

  #instance: Spectoda_WASM | undefined;
  #config: { controller?: { name?: string }; ports?: [{ tag?: string; size?: number; brightness?: number; power?: number; visible?: boolean; reversed?: boolean }] } | undefined;

  #ports: { [key: string]: Uint8Array };
  #ringLogBuffer: RingLogBuffer;
  #eventEmitter;

  constructor(controller_mac_address: string) {
    this.#macAddress = controller_mac_address;

    this.#instance = undefined;
    this.#config = undefined;

    this.#ports = {};
    this.#eventEmitter = createNanoEvents();

    this.#ringLogBuffer = new RingLogBuffer(1000);
  }

  construct(config: object) {
    logging.info(`construct(config=${JSON.stringify(config)}`);

    if (this.#instance) {
      throw "AlreadyContructed";
    }

    this.#config = config;

    SpectodaWasm.initilize();

    return SpectodaWasm.waitForInitilize().then(() => {
      const PreviewControllerImplementation: Spectoda_WASMImplementation = {
        /* Constructor function is optional */
        // __construct: function () {
        //   this.__parent.__construct.call(this);
        // }

        /* Destructor function is optional */
        // __destruct: function () {
        //   this.__parent.__destruct.call(this);
        // },

        _onTnglUpdate: tngl_bytes_vector => {
          // logging.verbose("_onTnglUpdate", tngl_bytes_vector);

          return true;
        },

        _onEvents: event_array => {
          // logging.verbose("_onEvents", event_array);

          return true;
        },

        _onEventStateUpdates: event_state_updates_array => {
          // logging.verbose("_onEventStateUpdates", event_state_updates_array);

          return;
        },

        _onExecute: (commands_bytecode_vector: Uint8Vector) => {
          // logging.verbose("_onExecute", commands_bytecode_vector, source_connection);

          // try {
          //     // dont know how to make Uint8Array in C++ yet. So I am forced to give data out in C++ std::vector
          //     const commands_bytecode = SpectodaWasm.convertUint8VectorUint8Array(commands_bytecode_vector);

          //     // TODO IMPLEMENT SENDING TO OTHER INTERFACES

          // } catch {
          // if (source_connection.address_string === "00:00:00:00:00:00") {
          //   const array = SpectodaWasm.convertUint8VectorUint8Array(commands_bytecode_vector);
          //   this.#runtimeReference.connector?.deliver(array, source_connection);
          // }
          // }

          // return Module.send_result_t.SEND_OK;

          return true;
        },

        _onRequest: () => {
          //   logging.debug("_onRequest", );
          //   try {
          //     // dont know how to make Uint8Array in C++ yet. So I am forced to give data out in C++ std::vector
          //     const commands_bytecode = SpectodaWasm.convertUint8VectorUint8Array(commands_bytecode_vector);
          //     logging.verbose("commands_bytecode", commands_bytecode);
          //     // TODO IMPLEMENT SENDING TO OTHER INTERFACES
          //   } catch {
          //     return Module.send_result_t.SEND_ERROR;
          //   }
          //   return Module.send_result_t.SEND_OK;

          return false;
        },

        _onSynchronize: synchronization => {
          logging.debug("_onSynchronize", synchronization);

          return true;
        },

        _handlePeerConnected: peer_mac => {
          logging.debug("_handlePeerConnected", peer_mac);

          // this.#runtimeReference.emit("peer_connected", peer_mac);

          return SpectodaWasm.interface_error_t.SUCCESS;
        },

        _handlePeerDisconnected: peer_mac => {
          logging.debug("_handlePeerDisconnected", peer_mac);

          // this.#runtimeReference.emit("peer_disconnected", peer_mac);

          return SpectodaWasm.interface_error_t.SUCCESS;
        },

        // virtual interface_error_t _handleTimelineManipulation(const int32_t timeline_timestamp, const bool timeline_paused, const double clock_timestamp) = 0;
        _handleTimelineManipulation: (timeline_timestamp, timeline_paused, clock_timestamp) => {
          logging.debug("_handleTimelineManipulation", timeline_timestamp, timeline_paused, clock_timestamp);

          return SpectodaWasm.interface_error_t.SUCCESS;
        },

        _onLog: (level, filename, message) => {
          const logEntry = new LogEntry(level, filename, message);
          this.#ringLogBuffer.push(logEntry);
          // this.#eventEmitter.emit("log", logEntry);

          const name = this.#instance?.getLabel();

          switch (level) {
            case 5:
              logging.verbose(`🖥️ $${name}: \t[V][${filename}]: ${message}`);
              break;
            case 4:
              logging.debug(`🖥️ $${name}: \t[D][${filename}]: ${message}`);
              break;
            case 3:
              logging.info(`🖥️ $${name}: \t[I][${filename}]: ${message}`);
              break;
            case 2:
              logging.warn(`🖥️ $${name}:\t[W][${filename}]: ${message}`);
              // this.#eventEmitter.emit("warn", logEntry);
              break;
            case 1:
              logging.error(`🖥️ $${name}: \t[E][${filename}]: ${message}`);
              // this.#eventEmitter.emit("error", logEntry);
              break;
            default:
              console.warn(`🖥️ $${name}: \t[?][${filename}]: ${message}`);
              break;
          }
        },

        _handleReboot: () => {
          logging.debug("_handleReboot");

          setTimeout(async () => {
            await sleep(1);

            this.#instance?.end();
            {
              this.#instance = SpectodaWasm.Spectoda_WASM.implement(PreviewControllerImplementation);

              this.#instance.init(this.#macAddress, JSON.stringify(this.#config));
              this.#instance.begin();

              let current_tag = "A";

              if (this.#config?.ports) {
                for (const port of this.#config.ports) {
                  const port_tag = port.tag ? port.tag : current_tag;
                  current_tag = String.fromCharCode(port_tag.charCodeAt(0) + 1);

                  const port_size = port.size ? port.size : 1;
                  const port_brightness = port.brightness ? port.brightness : 255;
                  const port_power = port.power ? port.power : 255;
                  const port_visible = port.visible ? port.visible : true;
                  const port_reversed = port.reversed ? port.reversed : false;

                  // TODO refactor to new parameters
                  // this.#ports[port_tag] = this.#instance.makePort(port_tag, port_size, port_brightness, port_power, port_visible, port_reversed);
                }
              }
            }
          }, 1000);

          return SpectodaWasm.interface_error_t.SUCCESS;
        },
      };

      this.#instance = SpectodaWasm.Spectoda_WASM.implement(PreviewControllerImplementation);

      this.#instance.init(this.#macAddress, JSON.stringify(this.#config));
      this.#instance.begin();

      let current_tag = "A";

      if (this.#config?.ports) {
        for (const port of this.#config.ports) {
          const port_tag = port.tag ? port.tag : current_tag;
          current_tag = String.fromCharCode(port_tag.charCodeAt(0) + 1);

          const port_size = port.size ? port.size : 1;
          const port_brightness = port.brightness ? port.brightness : 255;
          const port_power = port.power ? port.power : 255;
          const port_visible = port.visible ? port.visible : true;
          const port_reversed = port.reversed ? port.reversed : false;

          // TODO refactor to new parameters
          // this.#ports[port_tag] = this.#instance.makePort(port_tag, port_size, port_brightness, port_power, port_visible, port_reversed);
        }
      }
    });
  }

  destruct() {
    if (!this.#instance) {
      throw "NotConstructed";
    }

    this.#instance.end(); // end the spectoda stuff
    this.#instance.delete(); // delete (free) C++ object
    this.#instance = undefined; // remove javascript reference
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

  getPort(port_tag: string) {
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
  setClock(clock_timestamp: number) {
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

  execute(execute_bytecode: Uint8Array, source_connection: Connection) {
    if (!this.#instance) {
      throw "NotConstructed";
    }

    const execute_sucess = this.#instance.execute(SpectodaWasm.toHandle(execute_bytecode), source_connection);

    if (!execute_sucess) {
      throw "EvaluateError";
    }
  }

  request(request_bytecode: Uint8Array, source_connection: Connection) {
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

      response_bytecode = SpectodaWasm.convertUint8VectorUint8Array(response_bytecode_vector);
    } finally {
      response_bytecode_vector.delete();
    }

    return response_bytecode;
  }

  synchronize(synchronization: Synchronization, source_connection: Connection) {
    logging.debug("synchronize()");

    if (!this.#instance) {
      throw "NotConstructed";
    }

    this.#instance.synchronize(synchronization, source_connection);
  }

  process() {
    if (!this.#instance) {
      throw "NotConstructed";
    }

    this.#instance.process();
  }

  render() {
    if (!this.#instance) {
      throw "NotConstructed";
    }

    this.#instance.render();
  }

  readVariableAddress(variable_address: number, device_id: number) {
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

  on(event: string, callback: Function) {
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
