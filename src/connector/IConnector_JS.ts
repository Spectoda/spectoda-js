// TODO fix TSC in spectoda-js
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck

import { logging } from "../../logging";
import { IConnector_WASM, SpectodaWasm, connector_type_t } from "../SpectodaWasm";

export class IConnector_JS {
  #instance: IConnector_WASM | undefined;

  constructor() {
    this.#instance = undefined;
  }
  construct(implementation: object, connector_type: connector_type_t) {
    logging.debug("construct(implementation=", implementation, ")");

    if (this.#instance) {
      throw "AlreadyContructed";
    }

    return SpectodaWasm.waitForInitilize().then(() => {
      this.#instance = SpectodaWasm.IConnector_WASM.implement(implementation);
      this.#instance?.init(connector_type);
    });
  }

  destruct() {
    if (!this.#instance) {
      throw "AlreadyDestructed";
    }

    this.#instance.delete(); // delete (free) C++ object
    this.#instance = undefined; // remove javascript reference
  }
}
