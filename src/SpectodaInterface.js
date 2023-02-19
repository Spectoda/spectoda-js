import { SpectodaWasm } from "../wasm/SpectodaWasm.js";

// Implements SpectodaInterface in javascript

// We can make many objects of SpectodaInterface if we desire (for simulation purposes for example)
export class Interface {
  #instanceHandle;

  constructor() {
    this.#instanceHandle = 0;
  }

    /**
   * @param {number} clock_timestamp
   * @return {Promise<null>}
   */
  construct(label, mac_address, id_offset) {

    if(this.#instanceHandle) {
      throw "AlreadyContructed";
    }

    return SpectodaWasm.makeInstance(label, mac_address, id_offset).then(handle => {
      this.#instanceHandle = handle;
    });

   
  }

  destroy() {
    if(!this.#instanceHandle) {
      throw "AlreadyDestroied";
    }

    throw "NotImplemented";
  }

   /**
   * @param {number} clock_timestamp
   * @return {null}
   */
  setClock(clock_timestamp) {
    SpectodaWasm.setClock(this.#instanceHandle, clock_timestamp);
  }

   /**
   * @return {number}
   */
  getClock() {
    return SpectodaWasm.getClock(this.#instanceHandle);
  }

 /**
   * @param {Uint8Array} commands
   * @return {null}
   */
  execute(commands, connection_handle) {
    // execute only on me
    SpectodaWasm.execute(this.#instanceHandle, commands);
    
    this.sendExecute(commands, connection_handle);
  }

    /**
   * If request_evaluate_result is not SUCCESS the promise is rejected with an exception
   * @param {Uint8Array} command
   * @return {Uint8Array}
   */
  request(commands, connection_handle) {

    // TODO implement if the request is for me, and it not, send it to the friend it is for
    
    // request is for me 
    return SpectodaWasm.request(this.#instanceHandle, commands);
  }

  sendExecute() {
    console.warn("Implement this method by extending this class");
  }

  sendRequest() {
    console.warn("Implement this method by extending this class");
  }
}


