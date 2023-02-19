import { Interface } from "./SpectodaInterface.js";

class SimulationInterface extends Interface {
   // send executes to all interfaces available to this interface in Javascript
  sendExecute(commands, connection_handle) {
    // TODO implement sending execute to other Interfaces
  }

   // send executes to all interfaces available to this interface in Javascript
  sendRequest(commands, connection_handle) {
    // TODO implement sending request to other Interfaces
  }
}

// Runtime runs single Interface only.
export class SpectodaRuntime {

#interface;

  /**
   * @param {Interface} interface
   */
  constructor(interface) {
    this.#interface = interface;
  }

  /**
   * @return {Promise<null>}
   */
  begin(label, mac_address, id_offset) {

  }


};