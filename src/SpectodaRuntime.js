import { Interface } from "./SpectodaInterface.js";

class AppInterface extends Interface {
  sendExecute() {
    // TODO implement sending execute to other Interfaces
  }

  sendRequest() {
    // TODO implement sending request to other Interfaces
  }
}

export class SpectodaRuntime {
  constructor() {
    this.interface = new AppInterface();
  }
}