import { SpectodaWasm } from "../wasm/SpectodaWasm.js";

// Implements SpectodaInterface in javascript

// We can make many objects of SpectodaInterface if we desire (for simulation purposes for example)
export class Interface {

  constructor() {
    // await this.initializeWasm()
    SpectodaWasm.makeInstance()
  }

  // async initializeWasm() {
  //   const Module = debug ? await import("./spectoda-wasm-debug.js") : await import("./spectoda-wasm-release.js");
    

  //   await new Promise((resolve, reject) => {
  //     Module.onRuntimeInitialized = () => {
  //       SpectodaWasm.initilized = true;
  //       resolve();
  //     };
  //   })

  //   if (typeof window !== "undefined") {
  //     window.Module = Module;
  //   }

    
  // }

  setClock(clock_timestamp) {
    SpectodaWasm.setClock(clock_timestamp);
  }

  getClock() {
    return SpectodaWasm.getClock();
  }

  execute(commands) {
    return SpectodaWasm.getClock();
  }

  request() {}

  sendExecute() {
    console.warn("Implement this method by extending this class");
  }

  sendRequest() {
    console.warn("Implement this method by extending this class");
  }
}


