import { createNanoEvents } from "../functions";
import { logging } from "../logging";
import { SpectodaWasm } from "./SpectodaWasm";

const CHUNK_SIZE = 208;

// JS Implements Spectoda C++ class for javascript. Thus Spectoda_JS
// ESP32 Implements Spectoda C++ class for esp-idf. Thus Spectoda_ESP32

// We can make many objects of Spectoda_JS if we desire (for simulation purposes for example)

// This coresponds to SpectodaSpectoda.cpp 

// Deffered object
// TODO rename to QueueItem
class Query {
  static TYPE_EXECUTE = 1;
  static TYPE_DELIVER = 2;
  static TYPE_TRANSMIT = 3;
  static TYPE_USERSELECT = 4;
  static TYPE_AUTOSELECT = 5;
  static TYPE_SELECTED = 6;
  static TYPE_UNSELECT = 7;
  static TYPE_SCAN = 16;
  static TYPE_CONNECT = 8;
  static TYPE_CONNECTED = 9;
  static TYPE_DISCONNECT = 10;
  static TYPE_REQUEST = 11;
  static TYPE_SET_CLOCK = 12;
  static TYPE_GET_CLOCK = 13;
  static TYPE_FIRMWARE_UPDATE = 14;
  static TYPE_DESTROY = 15;

  constructor(type, a = null, b = null, c = null, d = null) {
    this.type = type;
    this.a = a;
    this.b = b;
    this.c = c;
    this.d = d;
    this.promise = new Promise((resolve, reject) => {
      this.reject = reject;
      this.resolve = resolve;
    });
  }
}

// InterfaceWrapper
export class Spectoda_JS {
  #eventEmitter;

  #instance;

  #inicilized;

  #queue;
  #processing;

  #runtimeReference;

  constructor() {
    this.#eventEmitter = createNanoEvents(); // dont wrap emit function, call whatever needs to be done directly from .emit()

    this.#instance = null;
    this.#inicilized = false;

    this.#queue = /** @type {Query[]} */ ([]);
    this.#processing = false;
  }

  ////////////////////////////////////////////////////////////////////////////////////////////////

  // JavaScript implementation of the Spectoda_WASM C++ class 
  #Spectoda_WASM = {

    /* Constructor function is optional */
    // __construct: function () {
    //   this.__parent.__construct.call(this);
    // },

    /* Destructor function is optional */
    // __destruct: function () {
    //   this.__parent.__destruct.call(this);
    // },

    _onEvents: (event_array) => {
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

    _onLocalEvents: (event_array) => {
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

    _handlePeerConnected: (peer_mac) => {
      logging.debug("_handlePeerConnected", peer_mac);

      this.#runtimeReference.emit("peer_connected", peer_mac);

      return Module.interface_error_t.SUCCESS;
    },

    _handlePeerDisconnected: (peer_mac) => {
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
  }

  ////////////////////////////////////////////////////////////////////////////////////////////////

  /**
 * @name addEventListener
 * @param {string} event
 * @param {Function} callback
 *
 * events: "disconnected", "connected"
 *
 * all events: event.target === the sender object (SpectodaWebBluetoothConnector)
 * event "disconnected": event.reason has a string with a disconnect reason
 *
 * @returns {Function} unbind function
 */

  on(event, callback) {
    return this.#eventEmitter.on(event, callback);
  }

  emit(event, ...arg) {
    // TODO emit event also to RemoteControl if in receiver mode
    this.#eventEmitter.emit(event, ...arg);
  }

  ////////////////////////////////////////////////////////////////////////////////////////////////

  #inicilize() {
    if (!this.#inicilized) {
      this.#runtimeTask();
      this.#inicilized = true;
    }

    return this.spectoda.waitForInitilize();
  }

  // This runs the internal Spectoda logic
  #runtimeTask = async () => {
    const UPS = 2; // updates per second

    try {
      await this.#instance.construct("spectoda", "01:23:45:67:89:ab", 0, 255);

      await sleep(0.1);

      const f = async () => {
        await this.#instance.compute(); // for non visual mode compute is sufficient
        setTimeout(f, 1000 / UPS);
      };

      f();
    } catch (e) {
      logging.error(e);
    }
  };

  // controller_identifier, controller_mac, controller_id_offset, controller_brightness
  /**
   * @param {string} label
   * @param {string} mac_address
   * @param {number} id_offset
   * @return {Promise<null>}
   */
  // TODO: change construct args to be constructed from JSON config
  construct(label, mac_address, id_offset, brightness) {
    if (this.#instance) {
      throw "AlreadyContructed";
    }

    // TODO pass WASM version to load
    // TODO move SpectodaWasm inicialization to SpectodaWasm.js file

    return SpectodaWasm.waitForInitilize().then(() => {
      this.#instance = SpectodaWasm.Spectoda_WASM.implement(this.#Spectoda_WASM);

      this.#instance.init(mac_address, `{"controller":{"name": "Spectoda"}}`);
      this.#instance.begin();
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
  // TODO make the parameters an object
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

  // compute() {
  //   if (!this.#instance) {
  //     throw "NotConstructed";
  //   }

  //   this.#instance.compute();
  // }

  // render() {
  //   if (!this.#instance) {
  //     throw "NotConstructed";
  //   }

  //   this.#instance.render();
  // }

  readVariableAddress(variable_address, device_id) {
    if (!this.#instance) {
      throw "NotConstructed";
    }

    return this.#instance.readVariableAddress(variable_address, device_id);
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


  ////////////////////////////////////////////////////////////////////////////////////////////////


  async #processTask() {

    await this.#inicilize();

    await sleep(0.001); // short delay to let fill up the queue to merge multiple execute items if possible

    let item = undefined;

    try {
      while (this.#queue.length > 0) {
        item = this.#queue.shift();

        if (this.connector === null || this.connector === undefined) {
          item.reject("ConnectorNotAssigned");
          continue;
        }

        switch (item.type) {
          case Query.TYPE_USERSELECT:
            {
              try {
                await this.connector
                  .userSelect(item.a, item.b) // criteria, timeout
                  .then(device => {
                    item.resolve(device);
                  });
              } catch (error) {
                item.reject(error);
              }
            }
            break;

          case Query.TYPE_AUTOSELECT:
            {
              try {
                await this.connector
                  .autoSelect(item.a, item.b, item.c) // criteria, scan_period, timeout
                  .then(device => {
                    item.resolve(device);
                  });
              } catch (error) {
                item.reject(error);
              }
            }
            break;

          case Query.TYPE_SELECTED:
            {
              try {
                await this.connector.selected().then(device => {
                  item.resolve(device);
                });
              } catch (error) {
                item.reject(error);
              }
            }
            break;

          case Query.TYPE_UNSELECT:
            {
              try {
                await this.connector.unselect().then(() => {
                  item.resolve();
                });
              } catch (error) {
                item.reject(error);
              }
            }
            break;

          case Query.TYPE_SCAN:
            {
              try {
                await this.connector
                  .scan(item.a, item.b) // criteria, scan_period
                  .then(device => {
                    item.resolve(device);
                  });
              } catch (error) {
                //logging.warn(error);
                item.reject(error);
              }
            }
            break;

          case Query.TYPE_CONNECT:
            {
              try {
                await this.connector
                  .connect(item.a) // a = timeout
                  .then(async device => {

                    // if (!this.#connectGuard) {
                    //   logging.error("Connection logic error. #connected not called during successful connect()?");
                    //   logging.warn("Emitting #connected");
                    //   this.#eventEmitter.emit("#connected");
                    // }

                    try {
                      this.clock = await this.connector.getClock();
                      this.spectoda.setClock(this.clock.millis());
                      this.emit("wasm_clock", this.clock.millis());
                      item.resolve(device);
                    } catch (error) {
                      logging.error(error);
                      this.clock = new TimeTrack(0);
                      item.resolve(device);
                    }
                  });
              } catch (error) {
                await this.connector.disconnect();
                item.reject(error);
              }
            }
            break;

          case Query.TYPE_CONNECTED:
            {
              try {
                await this.connector.connected().then(device => {
                  item.resolve(device);
                });
              } catch (error) {
                item.reject(error);
              }
            }
            break;

          case Query.TYPE_DISCONNECT:
            {
              // this.#disconnectQuery = new Query();

              try {
                await this.connector
                  .disconnect()
                  // .then(this.#disconnectQuery.promise)
                  .then(() => {
                    // this.#disconnectQuery = null;
                    item.resolve();
                  });
              } catch (error) {
                item.reject(error);
              }
            }
            break;

          case Query.TYPE_EXECUTE:
            {
              let payload = new Uint8Array(0xffff);
              let index = 0;

              payload.set(item.a, index);
              index += item.a.length;

              let executesInPayload = [item];

              // while there are items in the queue, and the next item is also TYPE_EXECUTE
              while (this.#queue.length && this.#queue[0].type == Query.TYPE_EXECUTE) {
                const next_item = this.#queue.shift();

                // then check if I have room to merge other payload bytes
                if (index + next_item.a.length <= CHUNK_SIZE) {
                  payload.set(next_item.a, index);
                  index += next_item.a.length;
                  executesInPayload.push(next_item);
                }

                // if not, then return the item back into the queue
                else {
                  this.#queue.unshift(next_item);
                  break;
                }
              }

              const data = payload.slice(0, index);
              const timeout = item.c;

              logging.debug("EXECUTE", uint8ArrayToHexString(data));

              this.emit("wasm_execute", data);
              this.spectoda.execute(data, 0x00);

              try {
                await this.connector.deliver(data, timeout).then(() => {
                  executesInPayload.forEach(element => element.resolve());
                });
              } catch (error) {
                executesInPayload.forEach(element => element.reject(error));
              }
            }
            break;

          case Query.TYPE_REQUEST:
            {
              // TODO process in internal Interface

              logging.debug("REQUEST", uint8ArrayToHexString(item.a));

              this.emit("wasm_request", item.a);
              this.spectoda.request(item.a, 0x00);

              try {
                await this.connector.request(item.a, item.b, item.c).then(response => {
                  item.resolve(response);
                });
              } catch (error) {
                item.reject(error);
              }
            }
            break;

          case Query.TYPE_SET_CLOCK:
            {
              this.emit("wasm_clock", item.a.millis());
              this.spectoda.setClock(item.a.millis());

              try {
                await this.connector.setClock(item.a).then(response => {
                  item.resolve(response);
                });
              } catch (error) {
                item.reject(error);
              }
            }
            break;

          case Query.TYPE_GET_CLOCK:
            {
              try {
                await this.connector.getClock().then(clock => {
                  // this.emit("wasm_clock", clock.millis());
                  // this.spectoda.setClock(clock.millis());

                  item.resolve(clock);
                });
              } catch (error) {
                item.reject(error);
              }
            }
            break;

          case Query.TYPE_FIRMWARE_UPDATE:
            {
              try {
                await this.requestWakeLock();
              } catch { }

              try {
                await this.connector.updateFW(item.a).then(response => {
                  item.resolve(response);
                });
              } catch (error) {
                item.reject(error);
              }

              try {
                this.releaseWakeLock();
              } catch { }
            }
            break;

          case Query.TYPE_DESTROY:
            {
              // this.#reconection = false;
              try {
                // await this.connector
                //   .request([COMMAND_FLAGS.FLAG_DEVICE_DISCONNECT_REQUEST], false)
                //   .catch(() => { })
                //   .then(() => {
                await this.connector.disconnect();
                // })
                // .then(() => {
                await this.connector.destroy();
                // })

                // .catch(error => {
                //   //logging.warn(error);
                //   this.connector = null;
                //   item.reject(error);
                // });
              } catch (error) {
                logging.warn("Error while destroying connector:", error);
              } finally {
                this.connector = null;
                item.resolve();
              }
            }
            break;

          default:
            {
              logging.error("ERROR");
            }
            break;
        }
      }
    } catch (e) {
      logging.error("Runtime::#process() ERROR", item, ":", e);
    } finally {
      this.#processing = false;
    }
  }

  // starts a "thread" that is processing the commands from queue
  #runProcessTask() {

    // ensure that only one process task is running at a time
    if (this.#processing) {
      return;
    }
    this.#processing = true;

    // start the process task
    processTask();
  }

  #process(item) {

    if (item) {
      this.#queue.push(item);
    }

    this.#runProcessTask(); // run the process task
  }


}