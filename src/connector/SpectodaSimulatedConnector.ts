import { logging } from "../../logging";
import { sleep } from "../../functions";
import { TimeTrack } from "../../TimeTrack";
import { APP_MAC_ADDRESS, COMMAND_FLAGS } from "../Spectoda_JS";
import { SpectodaRuntime } from "../SpectodaRuntime";
import { TnglReader } from "../../TnglReader";
import { TnglWriter } from "../../TnglWriter";
import { PreviewController } from "../PreviewController";
import { SpectodaWasm } from "../SpectodaWasm";

/////////////////////////////////////////////////////////////////////////////////////

// Connector connects the application with one Spectoda Device, that is then in a
// position of a controller for other Spectoda Devices
export class SpectodaSimulatedConnector {
  #runtimeReference;
  #selected: boolean;
  #connected: boolean;

  #clock: TimeTrack;

  #processIntervalHandle: NodeJS.Timeout | null;
  #renderIntervalHandle: NodeJS.Timeout | null;

  #ups;
  #fps;

  type: string;
  controllers: PreviewController[];

  constructor(runtimeReference: SpectodaRuntime) {
    this.type = "simulated";

    this.#runtimeReference = runtimeReference;

    this.#processIntervalHandle = null;
    this.#renderIntervalHandle = null;

    this.#ups = 0;
    this.#fps = 0;

    this.#selected = false;
    this.#connected = false;

    this.#clock = new TimeTrack(0, false);
    this.controllers = [];
  }

  // declare TS type

  initilize(networkDefinition: any) {
    logging.verbose(`construct(networkDefinition=${networkDefinition})`);

    // let networkDefinition = JSON.parse(networkJsonDefinition);

    if (this.controllers.length) {
      for (let controller of this.controllers) {
        controller.destruct();
      }
      this.controllers = [];
    }

    if (this.#processIntervalHandle) {
      clearTimeout(this.#processIntervalHandle);
      this.#processIntervalHandle = null;
    }
    if (this.#renderIntervalHandle) {
      clearTimeout(this.#renderIntervalHandle);
      this.#renderIntervalHandle = null;
    }

    if (!networkDefinition) {
      const controller = new PreviewController("00:00:23:34:45:56");
      controller.construct({
        controller: { name: "SIMULATED" },
        console: { debug: 3 },
        ports: [
          { tag: "A", size: 100 },
          { tag: "B", size: 100 },
          { tag: "C", size: 100 },
          { tag: "D", size: 100 },
        ],
      });
      this.controllers.push(controller);
    }
    //
    else if (networkDefinition?.controllers) {
      for (let controllerDefinition of networkDefinition.controllers) {
        let configObject: any;
        let mac: string;

        if (controllerDefinition.config) {
          configObject = controllerDefinition.config;
        } else {
          if (controllerDefinition.name) {
            configObject = { controller: { name: controllerDefinition.name } };
          }
        }

        if (controllerDefinition.mac) {
          mac = controllerDefinition.mac;
        } else {
          // get a random "00:00:00:00:00:00" MAC address
          mac = Array.from({ length: 6 }, () =>
            Math.floor(Math.random() * 256)
              .toString(16)
              .padStart(2, "0"),
          ).join(":");
        }

        const controller = new PreviewController(mac);
        controller.construct(configObject);
        this.controllers.push(controller);
      }
    }

    // ? This can be offloaded to different thread
    {
      this.#ups = 1;
      this.#fps = 2;

      const __process = async () => {
        for (let controller of this.controllers) {
          controller.process();
        }
      };

      const __render = async () => {
        for (let controller of this.controllers) {
          controller.render();
        }
      };

      // TODO if the ups was set to 0 and then back to some value, then the render loop should be started again
      this.#processIntervalHandle = setInterval(__process, 1000 / this.#ups);
      // TODO if the fps was set to 0 and then back to some value, then the render loop should be started again
      this.#renderIntervalHandle = setInterval(__render, 1000 / this.#fps);
    }
  }
  /*
criteria: pole objektu, kde plati: [{ tohle and tamto and toto } or { tohle and tamto }]
možnosti:
  name: string
  namePrefix: string
  fwVersion: string
  ownerSignature: string
  productCode: number
  adoptionFlag: bool
criteria example:
[
  // all Devices that are named "NARA Aplha", are on 0.7.2 fw and are
  // adopted by the owner with "baf2398ff5e6a7b8c9d097d54a9f865f" signature.
  // Product code is 1 what means NARA Alpha
  {
    name:"NARA Alpha" 
    fwVersion:"0.7.2"
    ownerSignature:"baf2398ff5e6a7b8c9d097d54a9f865f"
    productCode:1
  },
  // all the devices with the name starting with "NARA", without the 0.7.3 FW and 
  // that are not adopted by anyone
  // Product code is 2 what means NARA Beta 
  {
    namePrefix:"NARA"
    fwVersion:"!0.7.3"
    productCode:2
    adoptionFlag:true
  }
]
*/
  // choose one Spectoda device (user chooses which device to connect to via a popup)
  // if no criteria are set, then show all Spectoda devices visible.
  // first bonds the BLE device with the PC/Phone/Tablet if it is needed.
  // Then selects the device
  userSelect(criteria: any) {
    logging.verbose("userSelect(criteria=", criteria, ")");

    return new Promise(async (resolve, reject) => {
      if (this.#connected) {
        await this.disconnect();
      }

      // TODO implement userSelect logic of choosing specific controller
      if (this.controllers.length === 0) {
        reject("SelectionFailed");
        return;
      }

      await sleep(Math.random() * 1000); // userSelect logic process delay

      this.#selected = true;

      resolve({ connector: this.type });
    });
  }

  // takes the criteria, scans for scan_period and automatically selects the device,
  // you can then connect to. This works only for BLE devices that are bond with the phone/PC/tablet
  // the app is running on OR doesnt need to be bonded in a special way.
  // if more devices are found matching the criteria, then the strongest signal wins
  // if no device is found within the timeout period, then it returns an error

  // if no criteria are provided, all Spectoda enabled devices (with all different FWs and Owners and such)
  // are eligible.

  autoSelect(criteria: any, scan_period: number, timeout: number) {
    logging.verbose("autoSelect(criteria=", criteria, ", scan_period=", scan_period, "timeout=", timeout, ")");
    // step 1. for the scan_period scan the surroundings for BLE devices.
    // step 2. if some devices matching the criteria are found, then select the one with
    //         the greatest signal strength. If no device is found until the timeout,
    //         then return error

    return new Promise(async (resolve, reject) => {
      if (this.#connected) {
        await this.disconnect();
      }

      // TODO implement userSelect logic of choosing specific controller
      if (this.controllers.length === 0) {
        reject("SelectionFailed");
        return;
      }

      await sleep(Math.random() * 1000); // autoSelect logic process delay

      this.#selected = true;
      resolve({ connector: this.type });
    });
  }

  selected() {
    logging.verbose(`selected()`);

    return new Promise(async (resolve, reject) => {
      if (this.#selected) {
        resolve({ connector: this.type });
      } else {
        resolve(null);
      }
    });
  }

  unselect() {
    logging.verbose(`unselect()`);

    return new Promise(async (resolve, reject) => {
      if (this.#connected) {
        await this.disconnect();
      }
      await sleep(10); // unselect logic
      this.#selected = false;
      resolve(null);
    });
  }

  scan(criteria: any, scan_period: number) {
    logging.verbose(`scan(criteria=${criteria}, scan_period=${scan_period})`);

    // TODO scan logic based on the controllers contructed and criteria

    return Promise.resolve("{}");
  }

  connect(timeout: number) {
    logging.verbose(`connect(timeout=${timeout})`);

    return new Promise(async (resolve, reject) => {
      if (!this.#selected) {
        reject("DeviceNotSelected");
        return;
      }

      await sleep(Math.random() * 1000); // connecting logic process delay

      this.#connected = true;
      this.#runtimeReference.emit("#connected");
      resolve({ connector: this.type });
    });
  }

  // disconnect Connector from the connected Spectoda Device. But keep it selected
  disconnect() {
    logging.verbose(`disconnect()`);

    return new Promise(async (resolve, reject) => {
      if (this.#connected) {
        await sleep(100); // disconnecting logic process delay

        this.#connected = false;
        this.#runtimeReference.emit("#disconnected");
      }
      resolve(null); // always resolves even if there are internal errors
    });
  }

  connected() {
    logging.verbose(`connected()`);

    return new Promise(async (resolve, reject) => {
      if (this.#connected) {
        resolve({ connector: this.type });
      } else {
        resolve(null);
      }
    });
  }

  // deliver handles the communication with the Spectoda network in a way
  // that the command is guaranteed to arrive
  deliver(payload: number[], timeout: number) {
    logging.verbose(`deliver(payload=${payload}, timeout=${timeout})`);

    return new Promise(async (resolve, reject) => {
      if (!this.#connected) {
        reject("DeviceDisconnected");
        return;
      }

      for (let controller of this.controllers) {
        await controller.execute(new Uint8Array(payload), new SpectodaWasm.Connection(APP_MAC_ADDRESS, SpectodaWasm.connector_type_t.CONNECTOR_UNDEFINED, SpectodaWasm.connection_rssi_t.RSSI_MAX));
      }

      await sleep(25); // delivering logic

      resolve(null);
    });
  }

  // transmit handles the communication with the Spectoda network in a way
  // that the command is NOT guaranteed to arrive
  transmit(payload: number[], timeout: number) {
    logging.verbose(`transmit(payload=${payload}, timeout=${timeout})`);

    return new Promise(async (resolve, reject) => {
      if (!this.#connected) {
        reject("DeviceDisconnected");
        return;
      }

      for (let controller of this.controllers) {
        await controller.execute(new Uint8Array(payload), new SpectodaWasm.Connection(APP_MAC_ADDRESS, SpectodaWasm.connector_type_t.CONNECTOR_UNDEFINED, SpectodaWasm.connection_rssi_t.RSSI_MAX));
      }

      await sleep(10); // transmiting logic

      resolve(null);
    });
  }

  // request handles the requests on the Spectoda network. The command request
  // is guaranteed to get a response
  request(payload: number[], read_response: boolean, timeout: number) {
    logging.verbose(`request(payload=${payload}, read_response=${read_response ? "true" : "false"}, timeout=${timeout})`);

    return new Promise(async (resolve, reject) => {
      if (!this.#connected) {
        reject("DeviceDisconnected");
        return;
      }

      // TODO choose the controller I am connected to choosen in userSelect() or autoSelect()

      const response = this.controllers.length
        ? this.controllers[0].request(new Uint8Array(payload), new SpectodaWasm.Connection(APP_MAC_ADDRESS, SpectodaWasm.connector_type_t.CONNECTOR_UNDEFINED, SpectodaWasm.connection_rssi_t.RSSI_MAX))
        : new Uint8Array();

      if (read_response) {
        await sleep(50); // requesting logic
        resolve(new DataView(response.buffer));
      } else {
        await sleep(25); // requesting logic
        resolve(null);
      }
    });
  }

  // synchronizes the device internal clock with the provided TimeTrack clock
  // of the application as precisely as possible
  setClock(clock: TimeTrack) {
    logging.verbose(`setClock(clock.millis()=${clock.millis()})`);

    return new Promise(async (resolve, reject) => {
      if (!this.#connected) {
        reject("DeviceDisconnected");
        return;
      }

      this.#clock.setMillis(clock.millis());

      for (let controller of this.controllers) {
        await controller.setClock(clock.millis());
      }

      await sleep(10); // writing clock logic.

      logging.verbose(`setClock() -> ${this.#clock.millis()}`);

      resolve(null);
    });
  }

  // returns a TimeTrack clock object that is synchronized with the internal clock
  // of the device as precisely as possible
  getClock() {
    logging.verbose(`getClock()`);

    return new Promise(async (resolve, reject) => {
      if (!this.#connected) {
        reject("DeviceDisconnected");
        return;
      }

      // TODO choose the controller I am connected to choosen in userSelect() or autoSelect()

      const clock_timestamp = this.controllers.length ? this.controllers[0].getClock() : 0;
      this.#clock.setMillis(clock_timestamp);

      await sleep(50); // reading clock logic.

      logging.verbose(`getClock() -> ${this.#clock.millis()}`);
      resolve(this.#clock);
    });
  }

  // handles the firmware updating. Sends "ota" events
  // to all handlers
  updateFW(firmware: Uint8Array) {
    logging.verbose(`updateFW(firmware=${firmware})`);

    return new Promise(async (resolve, reject) => {
      if (!this.#connected) {
        reject("DeviceDisconnected");
        return;
      }
      this.#runtimeReference.emit("ota_status", "begin");
      await sleep(4000); // preparing FW logic.

      for (let i = 1; i <= 100; i++) {
        this.#runtimeReference.emit("ota_progress", i);
        await sleep(25); // writing FW logic.
      }

      await sleep(1000); // finishing FW logic.

      this.#runtimeReference.emit("ota_status", "success");
      resolve(null);
    });
  }

  destroy() {
    logging.verbose(`destroy()`);

    return this.disconnect()
      .catch(() => {})
      .then(() => {
        return this.unselect();
      })
      .catch(() => {})
      .finally(() => {
        if (this.#processIntervalHandle) {
          clearTimeout(this.#processIntervalHandle);
          this.#processIntervalHandle = null;
        }
        if (this.#renderIntervalHandle) {
          clearTimeout(this.#renderIntervalHandle);
          this.#renderIntervalHandle = null;
        }
        if (this.controllers.length) {
          for (let controller of this.controllers) {
            controller.destruct();
          }
          this.controllers = [];
        }
      });
  }
}
