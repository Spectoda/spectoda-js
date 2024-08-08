import { logging } from "../logging";
import { Connection, SpectodaWasm, Spectoda_WASM, Spectoda_WASMImplementation } from "./SpectodaWasm";
import { sleep } from "../functions";
import { SpectodaRuntime } from "./SpectodaRuntime";

export const COMMAND_FLAGS = Object.freeze({
  FLAG_UNSUPPORTED_COMMND_RESPONSE: 255, // TODO change FLAG_OTA_BEGIN to not be 255.

  // legacy FW update flags
  FLAG_OTA_BEGIN: 255, // legacy
  FLAG_OTA_WRITE: 0, // legacy // TODO change FLAG_OTA_WRITE to not be 0.
  FLAG_OTA_END: 254, // legacy
  FLAG_OTA_RESET: 253, // legacy

  FLAG_DEVICE_REBOOT_REQUEST: 5, // legacy
  FLAG_DEVICE_DISCONNECT_REQUEST: 6,

  FLAG_CONFIG_UPDATE_REQUEST: 10,
  FLAG_CONFIG_UPDATE_RESPONSE: 11,

  // Former CommandFlag begin

  // FLAG_RSSI_DATA:  100,
  FLAG_PEER_CONNECTED: 101,
  FLAG_PEER_DISCONNECTED: 102,

  // FLAG_CONF_BYTES:  103,
  FLAG_REINTERPRET_TNGL: 104,
  FLAG_SET_TIMELINE: 105,

  FLAG_EMIT_EVENT: 111,
  FLAG_EMIT_TIMESTAMP_EVENT: 112,
  FLAG_EMIT_COLOR_EVENT: 113,
  FLAG_EMIT_PERCENTAGE_EVENT: 114,
  FLAG_EMIT_LABEL_EVENT: 115,

  // Former CommandFlag end

  FLAG_READ_PORT_PIXELS_REQUEST: 190,
  FLAG_READ_PORT_PIXELS_RESPONSE: 191,
  FLAG_WRITE_PORT_PIXELS_REQUEST: 192,
  FLAG_WRITE_PORT_PIXELS_RESPONSE: 193,
  FLAG_EVALUATE_ON_CONTROLLER_REQUEST: 194,
  FLAG_EVALUATE_ON_CONTROLLER_RESPONSE: 195,

  FLAG_READ_CONTROLLER_CODES_REQUEST: 196,
  FLAG_READ_CONTROLLER_CODES_RESPONSE: 197,
  FLAG_WRITE_CONTROLLER_CODES_REQUEST: 198,
  FLAG_WRITE_CONTROLLER_CODES_RESPONSE: 199,
  FLAG_READ_OWNER_SIGNATURE_REQUEST: 200,
  FLAG_READ_OWNER_SIGNATURE_RESPONSE: 201,

  FLAG_WRITE_CONTROLLER_NAME_REQUEST: 202,
  FLAG_WRITE_CONTROLLER_NAME_RESPONSE: 203,
  FLAG_READ_CONTROLLER_NAME_REQUEST: 204,
  FLAG_READ_CONTROLLER_NAME_RESPONSE: 205,

  FLAG_MERGE_EVENT_HISTORY_REQUEST: 206,
  FLAG_MERGE_EVENT_HISTORY_RESPONSE: 207,
  FLAG_ERASE_EVENT_HISTORY_REQUEST: 208,
  FLAG_ERASE_EVENT_HISTORY_RESPONSE: 209,

  FLAG_REQUEST_PEER_REQUEST: 210,
  FLAG_REQUEST_PEER_RESPONSE: 211,

  FLAG_EVENT_HISTORY_BC_REQUEST: 212,
  FLAG_EVENT_HISTORY_BC_RESPONSE: 213,

  FLAG_VISIBLE_PEERS_REQUEST: 214,
  FLAG_VISIBLE_PEERS_RESPONSE: 215,

  FLAG_FW_UPDATE_PEER_REQUEST: 216,
  FLAG_FW_UPDATE_PEER_RESPONSE: 217,

  FLAG_SYNC_STATE_REQUEST: 218,
  FLAG_SYNC_STATE_RESPONSE: 219,

  FLAG_SAVE_STATE_REQUEST: 220,
  FLAG_SAVE_STATE_RESPONSE: 221,

  FLAG_SLEEP_REQUEST: 222,
  FLAG_SLEEP_RESPONSE: 223,
  FLAG_CONNECTED_PEERS_INFO_REQUEST: 224,
  FLAG_CONNECTED_PEERS_INFO_RESPONSE: 225,

  FLAG_DEVICE_CONFIG_REQUEST: 226,
  FLAG_DEVICE_CONFIG_RESPONSE: 227,
  FLAG_ROM_PHY_VDD33_REQUEST: 228,
  FLAG_ROM_PHY_VDD33_RESPONSE: 229,
  FLAG_VOLTAGE_ON_PIN_REQUEST: 230,
  FLAG_VOLTAGE_ON_PIN_RESPONSE: 231,

  FLAG_CHANGE_DATARATE_REQUEST: 232,
  FLAG_CHANGE_DATARATE_RESPONSE: 233,

  FLAG_FW_VERSION_REQUEST: 234,
  FLAG_FW_VERSION_RESPONSE: 235,
  FLAG_ERASE_OWNER_REQUEST: 236,
  FLAG_ERASE_OWNER_RESPONSE: 237,

  FLAG_TNGL_FINGERPRINT_REQUEST: 242,
  FLAG_TNGL_FINGERPRINT_RESPONSE: 243,
  FLAG_TIMELINE_REQUEST: 244,
  FLAG_TIMELINE_RESPONSE: 245,

  FLAG_CONNECT_REQUEST: 238,
  FLAG_CONNECT_RESPONSE: 239,
  FLAG_ADOPT_REQUEST: 240,
  FLAG_ADOPT_RESPONSE: 241,
});

// Implements Spectoda_JS in javascript

// We can make many objects of Spectoda_JS if we desire (for simulation purposes for example)

// InterfaceWrapper
export class Spectoda_JS {
  #runtimeReference;

  #instance: Spectoda_WASM | undefined;

  constructor(runtimeReference: SpectodaRuntime) {
    this.#runtimeReference = runtimeReference;

    this.#instance = undefined;
  }

  inicilize() {
    // TODO pass WASM version to load
    SpectodaWasm.initilize();
    return SpectodaWasm.waitForInitilize();
  }

  waitForInitilize() {
    return SpectodaWasm.waitForInitilize();
  }

  construct(controller_name: string, mac_address: string, id_offset: number, brightness: number) {
    logging.debug(`construct(controller_name=${controller_name}, mac_address=${mac_address}, id_offset=${id_offset}, brightness=${brightness})`);

    if (this.#instance) {
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

        _onTnglUpdate: tngl_bytes_vector => {
          logging.verbose("_onTnglUpdate", tngl_bytes_vector);

          try {
            // dont know how to make Uint8Array in C++ yet. So I am forced to give data out in C++ std::vector
            const tngl_bytes = SpectodaWasm.convertNumberVectorToJSArray(tngl_bytes_vector);

            this.#runtimeReference.emit("written_tngl", tngl_bytes);
          } catch {
            //
          }

          return true;
        },

        _onEvents: event_array => {
          logging.verbose("_onEvents", event_array);

          if (logging.level >= 1 && event_array.length) {
            let debug_log = "";

            const name = this.#instance?.getLabel();

            {
              const e = event_array[0];
              debug_log += `🕹️ @${e.id} -> $${e.label}: ${e.value}\ [🕒 ${e.timestamp}ms]`;
            }

            for (let i = 1; i < event_array.length; i++) {
              const e = event_array[i];
              debug_log += `\n🕹️ @${e.id} -> $${e.label}: ${e.value} [🕒 ${e.timestamp}ms]`;
            }

            console.log(debug_log);
          }

          return true;
        },

        _onEventStateUpdates: event_state_updates_array => {
          logging.verbose("_onEventStateUpdates", event_state_updates_array);

          if (logging.level >= 1 && event_state_updates_array.length) {
            let debug_log = "";

            const name = this.#instance?.getLabel();

            {
              const e = event_state_updates_array[0];
              debug_log += `🖥️ $${name}: \t🕹️ $${e.label}[@${e.id}]: ${e.value} [🕒 ${e.timestamp}ms]`;
            }

            for (let i = 1; i < event_state_updates_array.length; i++) {
              const e = event_state_updates_array[i];
              debug_log += `\n🖥️ $${name}: \t🕹️ $${e.label}[@${e.id}]: ${e.value} [🕒 ${e.timestamp}ms]`;
            }

            console.log(debug_log);
          }

          // TODO! refactor "emitted_events" for the needs of the Store
          for (let i = 0; i < event_state_updates_array.length; i++) {
            // ! This will be removed after Store is implemented
            event_state_updates_array[i].timestamp_utc = Date.now();
          }
          this.#runtimeReference.emit("emitted_events", event_state_updates_array);

          return true;
        },

        _onExecute: (commands_bytecode_vector, source_connection) => {
          logging.verbose("_onExecute", commands_bytecode_vector, source_connection);

          // try {
          // dont know how to make Uint8Array in C++ yet. So I am forced to give data out in C++ std::vector
          // const commands_bytecode = SpectodaWasm.convertNumberVectorToJSArray(commands_bytecode_vector);

          // TODO IMPLEMENT SENDING TO OTHER CONNECTIONS

          // } catch {

          // }

          return true;
        },

        _onRequest: () => {
          logging.debug("_onRequest");

          try {
            // dont know how to make Uint8Array in C++ yet. So I am forced to give data out in C++ std::vector
            // const commands_bytecode = SpectodaWasm.convertNumberVectorToJSArray(commands_bytecode_vector);
            // logging.verbose("commands_bytecode", commands_bytecode);
            // TODO IMPLEMENT SENDING TO OTHER CONNECTIONS
          } catch {}

          return true;
        },

        _onSynchronize: synchronization_object => {
          logging.debug("_onSynchronize", synchronization_object);

          try {
            this.#runtimeReference.clock.setMillis(synchronization_object.clock_timestamp);
          } catch (e) {
            logging.error(e);
          }

          // TODO IMPLEMENT SENDING TO OTHER CONNECTIONS
          return true;
        },

        _onLog: (level, filename, message) => {
          // if (level - 1 < logging.level) {
          //   return;
          // }

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
              logging.warn(`🖥️ $${name}: \t[W][${filename}]: ${message}`);
              break;
            case 1:
              logging.error(`🖥️ $${name}: \t[E][${filename}]: ${message}`);
              break;
            default:
              logging.error(`🖥️ $${name}: \t[?][${filename}]: ${message}`);
              break;
          }
        },

        _handlePeerConnected: peer_mac => {
          logging.debug("_handlePeerConnected", peer_mac);

          this.#runtimeReference.emit("peer_connected", peer_mac);

          return SpectodaWasm.interface_error_t.SUCCESS;
        },

        _handlePeerDisconnected: peer_mac => {
          logging.debug("_handlePeerDisconnected", peer_mac);

          this.#runtimeReference.emit("peer_disconnected", peer_mac);

          return SpectodaWasm.interface_error_t.SUCCESS;
        },

        // virtual interface_error_t _handleTimelineManipulation(const int32_t timeline_timestamp, const bool timeline_paused, const double clock_timestamp) = 0;
        _handleTimelineManipulation: (timeline_timestamp, timeline_paused, clock_timestamp) => {
          logging.debug("_handleTimelineManipulation", timeline_timestamp, timeline_paused, clock_timestamp);

          return SpectodaWasm.interface_error_t.SUCCESS;
        },

        _handleReboot: () => {
          logging.debug("_handleReboot");

          setTimeout(async () => {
            this.#runtimeReference.emit("#disconnected");
            await sleep(1);

            try {
              this.destruct();
            } catch (e) {
              logging.error(e);
            }

            this.construct(controller_name, mac_address, id_offset, brightness);
          }, 1000);

          return SpectodaWasm.interface_error_t.SUCCESS;
        },
      };

      this.#instance = SpectodaWasm.Spectoda_WASM.implement(WasmInterfaceImplementation);

      const config = `{"controller": {"name": "${controller_name}", "brightness": ${brightness}, "id": ${id_offset}}}`;
      logging.verbose(config);

      this.#instance.init(mac_address, config);

      // this.#instance.registerConnector();

      this.#instance.begin();
    });
  }

  destruct() {
    if (!this.#instance) {
      throw "AlreadyDestructed";
    }

    this.#instance.end(); // end the spectoda stuff
    this.#instance.delete(); // delete (free) C++ object
    this.#instance = undefined; // remove javascript reference

    // for (let i = 0; i < this.#connectors.length; i++) {
    //   this.#connectors[i].delete();
    // }
  }

  makePort(port_char = "A", port_size = 144, port_brightness = 255, port_power = 255, port_visible = true, port_reversed = false) {
    logging.info(`makePort(port_char=${port_char}, port_size=${port_size}, port_brightness=${port_brightness}, port_power=${port_power}, port_visible=${port_visible}, port_reversed=${port_reversed})`);

    if (!this.#instance) {
      throw "NotConstructed";
    }

    // const std::vector<uint8_t>& _makePort(const std::string& port_char, const uint32_t port_size, const uint8_t port_brightness, const uint8_t port_power, bool port_visible, bool port_reversed)
    return this.#instance.makePort(port_char, port_size, port_brightness, port_power, port_visible, port_reversed);
  }

  setClock(clock_timestamp: number) {
    if (!this.#instance) {
      throw "NotConstructed";
    }

    this.#instance.setClockTimestamp(clock_timestamp);
  }

  getClock() {
    if (!this.#instance) {
      throw "NotConstructed";
    }

    return this.#instance.getClockTimestamp();
  }

  execute(execute_bytecode: Uint8Array, source_connection: Connection) {
    logging.debug(`execute(execute_bytecode=${execute_bytecode}, source_connection=${source_connection})`);

    if (!this.#instance) {
      throw "NotConstructed";
    }

    const execute_sucess = this.#instance.execute(SpectodaWasm.toHandle(execute_bytecode), source_connection);

    if (!execute_sucess) {
      throw "EvaluateError";
    }
  }

  request(request_bytecode: Uint8Array, source_connection: Connection) {
    logging.debug(`request(request_bytecode=${request_bytecode}, source_connection=${source_connection})`);

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

  synchronize(clock_timestamp: number, source_connection: Connection) {
    logging.debug(`synchronize(clock_timestamp=${clock_timestamp}, source_connection=${source_connection})`);

    if (!this.#instance) {
      throw "NotConstructed";
    }

    this.#instance.synchronize(clock_timestamp, source_connection);
  }

  process() {
    logging.verbose("process()");

    if (!this.#instance) {
      throw "NotConstructed";
    }

    this.#instance.process();
  }

  render() {
    logging.verbose("render()");

    if (!this.#instance) {
      throw "NotConstructed";
    }

    this.#instance.render();
  }

  readVariableAddress(variable_address: number, device_id: number) {
    logging.verbose(`readVariableAddress(variable_address=${variable_address}, device_id=${device_id})`);

    if (!this.#instance) {
      throw "NotConstructed";
    }

    return this.#instance.readVariableAddress(variable_address, device_id);
  }
}
