// eslint-disable-next-line @typescript-eslint/ban-ts-comment

import { sleep } from "../functions";
import { logging } from "../logging";
import { SpectodaRuntime } from "./SpectodaRuntime";
import { SpectodaWasm } from "./SpectodaWasm";
import { SpectodaEventStateValue } from "./types/event";
import { Connection, IConnector_WASM, IConnector_WASMImplementation, Spectoda_WASM, Spectoda_WASMImplementation, Synchronization, Uint8Vector, Value, interface_error_t } from "./types/wasm";

// Implements Spectoda_JS in javascript
// We can make many objects of Spectoda_JS if we desire (for simulation purposes for example)

// InterfaceWrapper
export class Spectoda_JS {
  #runtimeReference;

  #spectoda_wasm: Spectoda_WASM | undefined;
  #connectors: IConnector_WASM[];

  constructor(runtimeReference: SpectodaRuntime) {
    this.#runtimeReference = runtimeReference;

    this.#spectoda_wasm = undefined;
    this.#connectors = [];
  }

  inicilize() {
    // TODO pass WASM version to load
    SpectodaWasm.initilize();
    return SpectodaWasm.waitForInitilize();
  }

  waitForInitilize() {
    return SpectodaWasm.waitForInitilize();
  }

  construct(controller_config: object, constroller_mac_address: string) {
    logging.debug(`Spectoda_JS::construct(controller_config=${JSON.stringify(controller_config)}, constroller_mac_address=${constroller_mac_address})`);

    if (this.#spectoda_wasm) {
      throw "AlreadyContructed";
    }

    return SpectodaWasm.waitForInitilize().then(() => {
      const WasmInterfaceImplementation: Spectoda_WASMImplementation = {
        /* Constructor function is optional */
        // __construct: function () {
        //   this.__parent.__construct.call(this);
        // },

        /* Destructor function is optional */
        // __destruct: function () {
        //   this.__parent.__destruct.call(this);
        // },

        _onTnglUpdate: (tngl_bytes_vector, used_ids_vector) => {
          logging.verbose("Spectoda_JS::_onTnglUpdate", tngl_bytes_vector, used_ids_vector);

          try {
            // dont know how to make Uint8Array in C++ yet. So I am forced to give data out in C++ std::vector
            const tngl_bytes = SpectodaWasm.convertUint8VectorUint8Array(tngl_bytes_vector);
            const used_ids = SpectodaWasm.convertUint8VectorUint8Array(used_ids_vector);
            this.#runtimeReference.emit("tngl_update", { tngl_bytes: tngl_bytes, used_ids: used_ids });
          } catch {
            //
          }

          return true;
        },

        _onEvents: event_array => {
          logging.verbose("Spectoda_JS::_onEvents", event_array);

          if (logging.level >= 1 && event_array.length > 0) {
            let debug_log = "";

            {
              const e = event_array[0];
              debug_log += `🕹️ $${e.label} -> ${e.id}: ${e.debug} [🕒 ${e.timestamp}]`;
            }

            for (let i = 1; i < event_array.length; i++) {
              const e = event_array[i];
              debug_log += `\n🕹️ $${e.label} -> ${e.id}: ${e.debug} [🕒 ${e.timestamp}]`;
            }

            logging.log(debug_log);
          }

          this.#runtimeReference.emit("emittedevents", event_array);

          return true;
        },

        _onEventStateUpdates: event_state_updates_array => {
          logging.verbose("Spectoda_JS::_onEventStateUpdates", event_state_updates_array);

          if (logging.level >= 3 && event_state_updates_array.length > 0) {
            let debug_log = "";

            const name = this.#spectoda_wasm?.getLabel();

            {
              const e = event_state_updates_array[0];
              debug_log += `🖥️ $${name}: \t📍 $${e.label} <- ${e.id}: ${e.debug} [🕒 ${e.timestamp}]`;
            }

            for (let i = 1; i < event_state_updates_array.length; i++) {
              const e = event_state_updates_array[i];
              debug_log += `\n🖥️ $${name}: \t📍 $${e.label} <- ${e.id}: ${e.debug} [🕒 ${e.timestamp}]`;
            }

            logging.log(debug_log);
          }

          // TODO! refactor "emitted_events" for the needs of the Store
          for (const element of event_state_updates_array) {
            // ! This will be removed after Store is implemented
            // @ts-ignore
            element.timestamp_utc = Date.now();
          }
          this.#runtimeReference.emit("eventstateupdates", event_state_updates_array);

          // ! emitted_events is deprecated
          // @ts-ignore
          this.#runtimeReference.emit("emitted_events", event_state_updates_array);

          return true;
        },

        _onExecute: (commands_bytecode_vector: Uint8Vector) => {
          logging.verbose("Spectoda_JS::_onExecute", commands_bytecode_vector);

          // dont know how to make Uint8Array in C++ yet. So I am forced to give data out in C++ std::vector
          // const commands_bytecode = SpectodaWasm.convertUint8VectorUint8Array(commands_bytecode_vector);

          // try {
          //   const command_bytecode = SpectodaWasm.convertUint8VectorUint8Array(commands_bytecode_vector);
          //   const THIS_CONTROLLER_CONNECTION = SpectodaWasm.Connection.make("00:00:00:00:00:00", SpectodaWasm.connector_type_t.CONNECTOR_UNDEFINED, SpectodaWasm.connection_rssi_t.RSSI_MAX);
          //   this.#runtimeReference.sendExecute(command_bytecode, THIS_CONTROLLER_CONNECTION).catch(e => {
          //     logging.error(e);
          //     return false;
          //   });
          // } catch (e) {
          //   logging.error(e);
          //   return false;
          // }

          return true;
        },

        // ! TODO NEXT
        // ! for now only version that does not
        _onRequest: (request_ticket_number: number, request_bytecode_vector: Uint8Vector, destination_connection: Connection) => {
          logging.debug(`Spectoda_JS::_onRequest(request_ticket_number=${request_ticket_number})`);

          // try {
          //   const request_bytecode = SpectodaWasm.convertUint8VectorUint8Array(request_bytecode_vector);
          //   this.#runtimeReference.sendRequest(request_ticket_number, request_bytecode, destination_connection).catch(e => {
          //     logging.error(e);
          //     return false;
          //   });
          // } catch (e) {
          //   logging.error(e);
          //   return false;
          // }

          return true;
        },

        _onSynchronize: (synchronization: Synchronization) => {
          logging.debug("Spectoda_JS::_onSynchronize", synchronization);

          try {
            this.#runtimeReference.emit("wasm_clock", synchronization.clock_timestamp);
            logging.debug(`🕒 $${this.#spectoda_wasm?.getLabel()}: ${synchronization.clock_timestamp}`);

            if (Math.abs(this.#runtimeReference.clock.millis() - synchronization.clock_timestamp) > 10) {
              this.#runtimeReference.clock.setMillisWithoutEvent(synchronization.clock_timestamp);
            }
          } catch (e) {
            logging.error(e);
          }

          // TODO IMPLEMENT SENDING TO OTHER CONNECTIONS
          return true;
        },

        _onProcess: options => {
          logging.verbose("Spectoda_JS::_onProcess", options);

          return true;
        },

        _onLog: (level, filename, message) => {
          // if (level - 1 < logging.level) {
          //   return;
          // }

          const name = this.#spectoda_wasm?.getLabel();

          switch (level) {
            case 5: {
              logging.verbose(`🖥️ $${name}: \t[V][${filename}]: ${message}`);
              break;
            }
            case 4: {
              logging.debug(`🖥️ $${name}: \t[D][${filename}]: ${message}`);
              break;
            }
            case 3: {
              logging.info(`🖥️ $${name}: \t[I][${filename}]: ${message}`);
              break;
            }
            case 2: {
              logging.warn(`🖥️ $${name}: \t[W][${filename}]: ${message}`);
              break;
            }
            case 1: {
              logging.error(`🖥️ $${name}: \t[E][${filename}]: ${message}`);
              break;
            }
            default: {
              console.warn(`🖥️ $${name}: \t[?][${filename}]: ${message}`);
              break;
            }
          }

          // this.#runtimeReference.emit("controller-log", `🖥️ $${name}: \t[?][${filename}]: ${message}`);
        },

        _handlePeerConnected: peer_mac => {
          logging.debug("Spectoda_JS::_handlePeerConnected", peer_mac);

          this.#runtimeReference.emit("peer_connected", peer_mac);

          return SpectodaWasm.interface_error_t.SUCCESS;
        },

        _handlePeerDisconnected: peer_mac => {
          logging.debug("Spectoda_JS::_handlePeerDisconnected", peer_mac);

          this.#runtimeReference.emit("peer_disconnected", peer_mac);

          return SpectodaWasm.interface_error_t.SUCCESS;
        },

        // virtual interface_error_t _handleTimelineManipulation(const int32_t timeline_timestamp, const bool timeline_paused, const double clock_timestamp) = 0;
        _handleTimelineManipulation: (timeline_timestamp: number, timeline_paused: boolean, timeline_date: string): interface_error_t => {
          logging.debug(`Spectoda_JS::_handleTimelineManipulation(timeline_timestamp=${timeline_timestamp}, timeline_paused=${timeline_paused}, timeline_date=${timeline_date})`);

          // TODO! Refactor timeline mechanics to inclute date
          this.#runtimeReference.spectodaReference.timeline.setMillis(timeline_timestamp);
          if (timeline_paused) {
            this.#runtimeReference.spectodaReference.timeline.pause();
          } else {
            this.#runtimeReference.spectodaReference.timeline.unpause();
          }
          this.#runtimeReference.spectodaReference.timeline.setDate(timeline_date);

          return SpectodaWasm.interface_error_t.SUCCESS;
        },

        _handleReboot: () => {
          logging.debug("Spectoda_JS::_handleReboot");

          setTimeout(async () => {
            this.#runtimeReference.emit("#disconnected");
            await sleep(1);

            try {
              this.destruct();
            } catch (e) {
              logging.error(e);
            }

            this.construct(controller_config, constroller_mac_address);
          }, 1000);

          return SpectodaWasm.interface_error_t.SUCCESS;
        },
      };

      const WasmConnectorImplementation: IConnector_WASMImplementation = {
        // _scan: (criteria_json: string, scan_period: number, result_out: any) => boolean;
        _scan: (criteria_json: string, scan_period: number, result_out: any) => {
          return false;
        },

        // _autoConnect: (criteria_json: string, scan_period: number, timeout: number, result_out: any) => boolean;
        _autoConnect: (criteria_json: string, scan_period: number, timeout: number, result_out: any) => {
          return false;
        },

        // _userConnect: (criteria_json: string, timeout: number, result_out: any) => boolean;
        _userConnect: (criteria_json: string, timeout: number, result_out: any) => {
          return false;
        },

        // _disconnect: (connection: Connection) => boolean;
        _disconnect: (connection: Connection) => {
          return false;
        },

        // _sendExecute: (command_bytes: Uint8Vector, source_connection: Connection) => void;
        _sendExecute: (command_bytecode: Uint8Vector, source_connection: Connection) => {
          logging.debug(`Spectoda_JS::_sendExecute(command_bytecode=${command_bytecode}, source_connection=${source_connection}`);

          try {
            const command_bytecode_array = SpectodaWasm.convertUint8VectorUint8Array(command_bytecode);
            this.#runtimeReference.sendExecute(command_bytecode_array, source_connection).catch(e => {
              logging.error(e);
              return false;
            });
          } catch (e) {
            logging.error(e);
            return false;
          }
        },

        // _sendRequest: (request_ticket_number: number, request_bytecode: Uint8Vector, destination_connection: Connection) => boolean;
        _sendRequest: (request_ticket_number: number, request_bytecode: Uint8Vector, destination_connection: Connection) => {
          logging.debug(`Spectoda_JS::_sendRequest(request_ticket_number=${request_ticket_number}, request_bytecode=${request_bytecode}, destination_connection=${destination_connection}`);

          try {
            const request_bytecode_array = SpectodaWasm.convertUint8VectorUint8Array(request_bytecode);
            this.#runtimeReference.sendRequest(request_ticket_number, request_bytecode_array, destination_connection).catch(e => {
              logging.error(e);
              return false;
            });
          } catch (e) {
            logging.error(e);
            return false;
          }

          return true;
        },

        // _sendResponse: (request_ticket_number: number, request_result: number, response_bytecode: Uint8Vector, destination_connection: Connection) => boolean;
        _sendResponse: (request_ticket_number: number, request_result: number, response_bytecode: Uint8Vector, destination_connection: Connection) => {
          return false;
        },

        // _sendSynchronize: (synchronization: Synchronization, source_connection: Connection) => void;
        _sendSynchronize: (synchronization: Synchronization, source_connection: Connection) => {
          logging.verbose(`Spectoda_JS::_sendSynchronize(synchronization=${synchronization}, source_connection=${source_connection}`);

          // history_fingerprint: number;
          // tngl_fingerprint: number;
          // clock_timestamp: number;
          // timeline_clock_timestamp: number;
          // tngl_clock_timestamp: number;
          // fw_compilation_timestamp: number;
          // origin_address: number

          // logging.info(`history_fingerprint=${synchronization.history_fingerprint}, tngl_fingerprint=${synchronization.tngl_fingerprint}, clock_timestamp=${synchronization.clock_timestamp}
          //   , timeline_clock_timestamp=${synchronization.tngl_fingerprint}, tngl_clock_timestamp=${synchronization.tngl_clock_timestamp}, fw_compilation_timestamp=${synchronization.fw_compilation_timestamp}, origin_address${synchronization.origin_address}`);
          // logging.info(`address_string=${source_connection.address_string.toString()}, connector_type=${source_connection.connector_type.value.toString()}, connection_rssi=${source_connection.connection_rssi.value.toString()}`);

          this.#runtimeReference.sendSynchronize(synchronization, source_connection).catch(e => {
            // ! DISABLED 11. 9. 2024 By @mchlkucera
            // Because of console.error spamming on frontend
            logging.warn(e);
          });
        },

        // _process: () => void;
        _process: () => {
          // logging.info(`process()`);
        },
      };

      this.#spectoda_wasm = SpectodaWasm.Spectoda_WASM.implement(WasmInterfaceImplementation);

      const cosntroller_config_json = JSON.stringify(controller_config);
      logging.verbose(`cosntroller_config_json=${cosntroller_config_json}`);

      this.#spectoda_wasm.init(constroller_mac_address, cosntroller_config_json);

      this.#connectors = [];

      const connector = SpectodaWasm.IConnector_WASM.implement(WasmConnectorImplementation);
      connector.init(SpectodaWasm.connector_type_t.CONNECTOR_BLE);
      this.registerConnector(connector);

      this.#connectors.push(connector);

      this.#spectoda_wasm.begin();
    });
  }

  destruct() {
    if (!this.#spectoda_wasm) {
      throw "AlreadyDestructed";
    }

    this.#spectoda_wasm.end(); // end the spectoda stuff
    this.#spectoda_wasm.delete(); // delete (free) C++ object
    this.#spectoda_wasm = undefined; // remove javascript reference

    // for (let i = 0; i < this.#connectors.length; i++) {
    //   this.#connectors[i].delete();
    // }
  }

  makePort(port_label: string, port_config: string): Uint32Array {
    logging.info(`Spectoda_JS::makePort(port_label=${port_label}, port_config=${port_config})`);

    if (!this.#spectoda_wasm) {
      throw "NotConstructed";
    }

    return this.#spectoda_wasm.makePort(port_label, port_config);
  }

  registerConnector(connector: IConnector_WASM) {
    if (!this.#spectoda_wasm) {
      throw "NotConstructed";
    }

    this.#spectoda_wasm.registerConnector(connector);
  }

  setClockTimestamp(clock_timestamp: number) {
    if (!this.#spectoda_wasm) {
      throw "NotConstructed";
    }

    this.#spectoda_wasm.setClockTimestamp(clock_timestamp);
  }

  getClockTimestamp() {
    if (!this.#spectoda_wasm) {
      throw "NotConstructed";
    }

    return this.#spectoda_wasm.getClockTimestamp();
  }

  execute(execute_bytecode: Uint8Array, source_connection: Connection): void {
    logging.debug(`Spectoda_JS::execute(execute_bytecode=${execute_bytecode}, source_connection=${source_connection})`);

    if (!this.#spectoda_wasm) {
      throw "NotConstructed";
    }

    const execute_sucess = this.#spectoda_wasm.execute(SpectodaWasm.toHandle(execute_bytecode), source_connection);

    if (!execute_sucess) {
      throw "EvaluateError";
    }
  }

  request(request_bytecode: Uint8Array, source_connection: Connection) {
    logging.debug(`Spectoda_JS::request(request_bytecode=${request_bytecode}, source_connection=${source_connection})`);

    if (!this.#spectoda_wasm) {
      throw "NotConstructed";
    }

    const response_bytecode_vector = new SpectodaWasm.Uint8Vector();
    let response_bytecode = undefined;

    try {
      const request_sucess = this.#spectoda_wasm.request(SpectodaWasm.toHandle(request_bytecode), response_bytecode_vector, source_connection);

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
    logging.debug(`Spectoda_JS::synchronize(synchronization=`, synchronization, `source_connection=`, source_connection, `)`);

    if (!this.#spectoda_wasm) {
      throw "NotConstructed";
    }

    this.#spectoda_wasm.synchronize(synchronization, source_connection);
  }

  // ? process() is calling compute() and render() in the right order
  process(
    options: { skip_berry_plugin_update: boolean; skip_eventstate_updates: boolean; force_event_emittion: boolean; skip_event_emittion: boolean } = {
      skip_berry_plugin_update: false,
      skip_eventstate_updates: false,
      force_event_emittion: false,
      skip_event_emittion: false,
    },
  ) {
    logging.verbose("Spectoda_JS::process()");

    if (!this.#spectoda_wasm) {
      throw "NotConstructed";
    }

    this.#spectoda_wasm.process(options.skip_berry_plugin_update, options.skip_eventstate_updates, options.force_event_emittion, options.skip_event_emittion);
  }

  // ? render() is forcing a render cycle
  render(options: { power: number } = { power: 255 }) {
    logging.verbose("Spectoda_JS::render()");

    if (!this.#spectoda_wasm) {
      throw "NotConstructed";
    }

    this.#spectoda_wasm.render(options.power);
  }

  readVariableAddress(variable_address: number, device_id: number) {
    logging.verbose(`Spectoda_JS::readVariableAddress(variable_address=${variable_address}, device_id=${device_id})`);

    if (!this.#spectoda_wasm) {
      throw "NotConstructed";
    }

    return this.#spectoda_wasm.readVariableAddress(variable_address, device_id);
  }

  emitValue(event_label: string, event_value: Value, event_id: number) {
    logging.verbose(`Spectoda_JS::emitValue(event_label=${event_label}, event_value=${event_value}, event_id=${event_id})`);

    if (!this.#spectoda_wasm) {
      throw "NotConstructed";
    }

    return this.#spectoda_wasm.emitValue(event_label, event_value, event_id, true);
  }

  emitNumber(event_label: string, event_number_value: number, event_id: number) {
    logging.verbose(`Spectoda_JS::emitNumber(event_label=${event_label}, event_number_value=${event_number_value}, event_id=${event_id})`);

    return this.emitValue(event_label, SpectodaWasm.Value.makeNumber(event_number_value), event_id);
  }

  emitLabel(event_label: string, event_label_value: string, event_id: number) {
    logging.verbose(`Spectoda_JS::emitLabel(event_label=${event_label}, event_label_value=${event_label_value}, event_id=${event_id})`);

    return this.emitValue(event_label, SpectodaWasm.Value.makeLabel(event_label_value), event_id);
  }

  emitTimestamp(event_label: string, event_timestamp_value: number, event_id: number) {
    logging.verbose(`Spectoda_JS::emitTimestamp(event_label=${event_label}, event_timestamp_value=${event_timestamp_value}, event_id=${event_id})`);

    return this.emitValue(event_label, SpectodaWasm.Value.makeTimestamp(event_timestamp_value), event_id);
  }

  emitPercentage(event_label: string, event_percentage_value: number, event_id: number) {
    logging.verbose(`Spectoda_JS::emitPercentage(event_label=${event_label}, event_percentage_value=${event_percentage_value}, event_id=${event_id})`);

    return this.emitValue(event_label, SpectodaWasm.Value.makePercentage(event_percentage_value), event_id);
  }

  emitDate(event_label: string, event_date_value: string, event_id: number) {
    logging.verbose(`Spectoda_JS::emitDate(event_label=${event_label}, event_date_value=${event_date_value}, event_id=${event_id})`);

    return this.emitValue(event_label, SpectodaWasm.Value.makeDate(event_date_value), event_id);
  }

  emitColor(event_label: string, event_color_value: string, event_id: number) {
    logging.verbose(`Spectoda_JS::emitColor(event_label=${event_label}, event_color_value=${event_color_value}, event_id=${event_id})`);

    return this.emitValue(event_label, SpectodaWasm.Value.makeColor(event_color_value), event_id);
  }

  emitPixels(event_label: string, event_pixels_value: number, event_id: number) {
    logging.verbose(`Spectoda_JS::emitPixels(event_label=${event_label}, event_pixels_value=${event_pixels_value}, event_id=${event_id})`);

    return this.emitValue(event_label, SpectodaWasm.Value.makePixels(event_pixels_value), event_id);
  }

  emitBoolean(event_label: string, event_boolean_value: boolean, event_id: number) {
    logging.verbose(`Spectoda_JS::emitBoolean(event_label=${event_label}, event_boolean_value=${event_boolean_value}, event_id=${event_id})`);

    return this.emitValue(event_label, SpectodaWasm.Value.makeBoolean(event_boolean_value), event_id);
  }

  emitNull(event_label: string, event_id: number) {
    logging.verbose(`Spectoda_JS::emitNull(event_label=${event_label}, event_id=${event_id})`);

    return this.emitValue(event_label, SpectodaWasm.Value.makeNull(), event_id);
  }

  eraseHistory() {
    logging.verbose("Spectoda_JS::eraseHistory()");

    if (!this.#spectoda_wasm) {
      throw "NotConstructed";
    }

    this.#spectoda_wasm.eraseHistory();
  }

  eraseTimeline() {
    logging.verbose("Spectoda_JS::eraseTimeline()");

    if (!this.#spectoda_wasm) {
      throw "NotConstructed";
    }

    this.#spectoda_wasm.eraseTimeline();
  }

  eraseTngl() {
    logging.verbose("Spectoda_JS::eraseTngl()");

    if (!this.#spectoda_wasm) {
      throw "NotConstructed";
    }

    this.#spectoda_wasm.eraseTngl();
  }

  getEventState(event_state_name: string, event_state_id: number): SpectodaEventStateValue | undefined {
    logging.verbose(`Spectoda_JS::getEventState(event_state_name=${event_state_name}, event_state_id=${event_state_id})`);

    if (!this.#spectoda_wasm) {
      throw "NotConstructed";
    }

    return this.#spectoda_wasm.getEventState(event_state_name, event_state_id);
  }

  getDateTime(): { time: number; date: string } {
    if (!this.#spectoda_wasm) {
      throw "NotConstructed";
    }

    return this.#spectoda_wasm.getDateTime();
  }

  registerDeviceContext(device_id: number): boolean {
    logging.verbose(`Spectoda_JS::registerDeviceContext(device_id=${device_id})`);

    if (!this.#spectoda_wasm) {
      throw "NotConstructed";
    }

    return this.#spectoda_wasm.registerDeviceContext(device_id);
  }
}
