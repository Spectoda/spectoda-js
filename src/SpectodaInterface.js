// import { logging } from "../Logging.js";
// import { SpectodaWasm } from "./SpectodaWasm.js";
// import { createNanoEvents } from "../functions.js";

// // Implements SpectodaInterface in javascript

// // We can make many objects of SpectodaInterface if we desire (for simulation purposes for example)

// // InterfaceWrapper
// export class Interface {

//   #instance;

//   #eventEmitter;

//   constructor() {
//     this.#instance = null;

//     this.#eventEmitter = createNanoEvents();
//   }

//   /**
//    * @param {string} label
//    * @param {string} mac_address
//    * @param {number} id_offset
//    * @return {Promise<null>}
//    */
//   construct(label, mac_address, id_offset) {
//     if (this.#instance) {
//       throw "AlreadyContructed";
//     }

//     return SpectodaWasm.waitForInitilize().then(() => {
//       const WasmInterfaceImplementation = {
//         /* Constructor function is optional */
//         // __construct: function () {
//         //   this.__parent.__construct.call(this);
//         // },

//         /* Destructor function is optional */
//         // __destruct: function () {
//         //   this.__parent.__destruct.call(this);
//         // },

//         _handle: event_array => {
//           logging.debug("_handle", event_array);

//           this.#eventEmitter.emit("events", event_array);

//           return undefined;
//         },

//         _onExecute: (commands_bytecode_vector, source_connection) => {
//           logging.debug("_onExecute", commands_bytecode_vector, source_connection);

//           try {
//             // dont know how to make Uint8Array in C++ yet. So I am forced to give data out in C++ std::vector
//             const commands_bytecode = SpectodaWasm.convertNumberVectorToJSArray(commands_bytecode_vector);

//             console.log("commands_bytecode", commands_bytecode);

//             // TODO IMPLEMENT SENDING TO OTHER INTERFACES
//           } catch {
//             return Module.send_result_t.SEND_ERROR;
//           }

//           return Module.send_result_t.SEND_OK;
//         },

//         _handlePeerConnected: peer_mac => {
//           logging.debug("_handlePeerConnected", peer_mac);

//           this.#eventEmitter.emit("peer_connected", peer_mac);

//           return Module.interface_error_t.SUCCESS;
//         },

//         _handlePeerDisconnected: peer_mac => {
//           logging.debug("_handlePeerDisconnected", peer_mac);

//           this.#eventEmitter.emit("peer_disconnected", peer_mac);

//           return Module.interface_error_t.SUCCESS;
//         },

//         // virtual interface_error_t _handleTimelineManipulation(const int32_t timeline_timestamp, const bool timeline_paused, const double clock_timestamp) = 0;
//         _handleTimelineManipulation: (timeline_timestamp, timeline_paused, clock_timestamp) => {
//           logging.debug("_handleTimelineManipulation", timeline_timestamp, timeline_paused, clock_timestamp);

//           return Module.interface_error_t.SUCCESS;
//         },
//       };

//       this.#instance = SpectodaWasm.WasmInterface.implement(WasmInterfaceImplementation);
//       this.#instance.begin(label, mac_address, id_offset);
//     });
//   }

//   destruct() {
//     if (!this.#instance) {
//       throw "AlreadyDestructed";
//     }

//     this.#instance.end(); // end the spectoda stuff
//     this.#instance.delete(); // delete (free) C++ object
//     this.#instance = null; // remove javascript reference
//   }

//   /**
//    * @param {number} clock_timestamp
//    * @return {Uint8Vector}
//    */
//   makePort(port_char = "A", port_size = 144, port_brightness = 255, port_power = 255, port_visible = true, port_reversed = false) {
//     if (!this.#instance) {
//       throw "NotConstructed";
//     }

//     // const std::vector<uint8_t>& _makePort(const std::string& port_char, const uint32_t port_size, const uint8_t port_brightness, const uint8_t port_power, bool port_visible, bool port_reversed)
//     return this.#instance.makePort(port_char, port_size, port_brightness, port_power, port_visible, port_reversed);
//   }

//   /**
//    * @param {number} clock_timestamp
//    * @return {null}
//    */
//   setClock(clock_timestamp) {
//     if (!this.#instance) {
//       throw "NotConstructed";
//     }

//     this.#instance.setClockTimestamp(clock_timestamp);
//   }

//   /**
//    * @return {number}
//    */
//   getClock() {
//     if (!this.#instance) {
//       throw "NotConstructed";
//     }

//     return this.#instance.getClockTimestamp();
//   }

//   /**
//    * @param {Uint8Array} execute_bytecode
//    * @return {}
//    */
//   execute(execute_bytecode, connection_handle) {
//     if (!this.#instance) {
//       throw "NotConstructed";
//     }

//     const evaluate_result = this.#instance.execute(Emval.toHandle(execute_bytecode), connection_handle);

//     if (evaluate_result != SpectodaWasm.evaluate_result_t.COMMAND_SUCCESS) {
//       throw "EvaluateError";
//     }
//   }

//   /**
//    * If request_evaluate_result is not SUCCESS the promise is rejected with an exception
//    * @param {Uint8Array} request_bytecode
//    * @return {Uint8Array}
//    */
//   request(request_bytecode, connection_handle) {
//     if (!this.#instance) {
//       throw "NotConstructed";
//     }

//     let response_bytecode_vector = new SpectodaWasm.Uint8Vector();

//     try {
//       const evaluate_result = this.#instance.request(Emval.toHandle(request_bytecode), response_bytecode_vector, connection_handle);

//       if (evaluate_result != SpectodaWasm.evaluate_result_t.COMMAND_SUCCESS) {
//         throw "EvaluateError";
//       }

//       return SpectodaWasm.convertNumberVectorToJSArray(response_bytecode_vector);
//     } finally {
//       response_bytecode_vector.delete();
//     }
//   }

//   compute() {
//     if (!this.#instance) {
//       throw "NotConstructed";
//     }

//     this.#instance.compute();
//   }

//   render() {
//     if (!this.#instance) {
//       throw "NotConstructed";
//     }

//     this.#instance.render();
//   }
// }

// if (typeof window !== "undefined") {
//   window.Interface = Interface;

//   window.test_wasm = function () {
//     window.instance = new Interface();
//     window.instance.construct("con1", "ff:ff:ff:ff:ff:ff", 0).then(() => {
//       console.log(window.instance.makePort("A", 144, 255, 255, true, false));
//       window.instance.execute([0x69, 0xaf, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x10, 0x68, 0xaf, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0xff], 0xffff);
//       window.instance.execute([0x72, 0xff, 0xff, 0xff, 0x0f, 0x65, 0x76, 0x74, 0x00, 0x00, 0x6e, 0x40, 0x00, 0x00, 0x00, 0x00, 0xff], 0xffff);
//       window.instance.compute();
//     });
//   };
// }

export {};