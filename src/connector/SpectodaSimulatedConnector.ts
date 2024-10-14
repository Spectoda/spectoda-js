// TODO fix TSC in spectoda-js
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck

import { sleep } from "../../functions";
import { logging } from "../../logging";
import { TimeTrack } from "../../TimeTrack";
import { PreviewController } from "../PreviewController";
import { APP_MAC_ADDRESS } from "../Spectoda_JS";
import { SpectodaRuntime } from "../SpectodaRuntime";
import { Connection, SpectodaWasm, Synchronization, Uint8Vector } from "../SpectodaWasm";
import { IConnector_JS } from "./IConnector_JS";

export const SIMULATED_MAC_ADDRESS = "00:00:23:34:45:56";


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

    if (this.controllers.length > 0) {
      for (const controller of this.controllers) {
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
      const SimulatedControllerMacAddress = SIMULATED_MAC_ADDRESS;

      const SimulatedControllerConfig = {
        controller: { name: "SIMULATED" },
        console: { debug: 3 },

        io: {
          PIX1: { type: "NEOPIXEL", variant: "WS2812B" },
          PIX2: { type: "NEOPIXEL", variant: "WS2811", order: "RGB" },
          PWM: { type: "PWM", order: "W" },
          DALI: { type: "DALI" },
        },
      };

      const SimulatedConnectorImplementation = {
        _scan: (criteria_json: string, scan_period: number, result_out: any) => {
          return false;
        },
        _autoConnect: (criteria_json: string, scan_period: number, timeout: number, result_out: any) => {
          return false;
        },
        _userConnect: (criteria_json: string, timeout: number, result_out: any) => {
          return false;
        },
        _disconnect: (connection: Connection) => {
          return false;
        },
        _sendExecute: (command_bytecode: Uint8Vector, source_connection: Connection) => {
          logging.verbose(`SpectodaSimulatedConnector::_sendExecute(source_connection:${source_connection.address_string})`);

          const command_bytecode_array = SpectodaWasm.convertUint8VectorUint8Array(command_bytecode);

          if (source_connection.connector_type == SpectodaWasm.connector_type_t.CONNECTOR_SIMULATED) {
            logging.debug("SpectodaSimulatedConnector::_sendExecute() - source_connection is CONNECTOR_SIMULATED");
            return true;
          }

          // TODO! SOURCE_CONNECTION_THIS_CONTROLLER should have the actual mac address of the controller. Not 00:00:00:00:00:00

          try {
            if (source_connection.address_string == "00:00:00:00:00:00") {
              source_connection.address_string = SimulatedControllerMacAddress;

              this.#runtimeReference.spectoda.execute(command_bytecode_array, source_connection);
            }

            source_connection.connector_type = SpectodaWasm.connector_type_t.CONNECTOR_SIMULATED;
            this.#runtimeReference.sendExecute(command_bytecode_array, source_connection).catch(e => {
              logging.error(e);
              return false;
            });
          } catch (e) {
            logging.error(e);
            return false;
          }
        },
        _sendRequest: (request_ticket_number: number, request_bytecode: Uint8Vector, destination_connection: Connection) => {
          logging.verbose(`SpectodaSimulatedConnector::_sendRequest(destination_connection: ${destination_connection.address_string})`);

          return true;
        },
        _sendResponse: (request_ticket_number: number, request_result: number, response_bytecode: Uint8Vector, destination_connection: Connection) => {
          logging.verbose(`SpectodaSimulatedConnector::_sendResponse(destination_connection: ${destination_connection.address_string})`);

          return true;
        },
        _sendSynchronize: (synchronization: Synchronization, source_connection: Connection) => {
          logging.verbose(`SpectodaSimulatedConnector::_sendSynchronize(synchronization:${synchronization}, source_connection=${source_connection.address_string})`);

          if (source_connection.connector_type == SpectodaWasm.connector_type_t.CONNECTOR_SIMULATED) {
            logging.debug("SpectodaSimulatedConnector::_sendSynchronize() - source_connection is CONNECTOR_SIMULATED");
            return true;
          }

          try {
            // TODO! SOURCE_CONNECTION_THIS_CONTROLLER should have the actual mac address of the controller. Not 00:00:00:00:00:00
            if (source_connection.address_string == "00:00:00:00:00:00") {
              source_connection.address_string = SimulatedControllerMacAddress;
              this.#runtimeReference.spectoda.synchronize(synchronization, source_connection);
            }

            source_connection.connector_type = SpectodaWasm.connector_type_t.CONNECTOR_SIMULATED;
            this.#runtimeReference.sendSynchronize(synchronization, source_connection).catch(e => {
              logging.error(e);
              return false;
            });
          } catch (e) {
            logging.error(e);
            return false;
          }
        },
        _process: () => {},
      };

      const connector = new IConnector_JS();
      connector.construct(SimulatedConnectorImplementation, SpectodaWasm.connector_type_t.CONNECTOR_SIMULATED);
      const controller = new PreviewController(SimulatedControllerMacAddress);
      controller.construct(SimulatedControllerConfig, connector);

      this.controllers.push(controller);
    }

    // TODO! be able to create whole simulated network
    // else if (networkDefinition?.controllers) {
    //   for (let controllerDefinition of networkDefinition.controllers) {
    //     let SimulatedControllerConfig: any;
    //     let controller_mac_address: string;

    //     if (controllerDefinition.config) {
    //       SimulatedControllerConfig = controllerDefinition.config;
    //     } else {
    //       if (controllerDefinition.name) {
    //         SimulatedControllerConfig = { controller: { name: controllerDefinition.name } };
    //       }
    //     }

    //     if (controllerDefinition.mac) {
    //       controller_mac_address = controllerDefinition.mac;
    //     } else {
    //       // get a random "00:00:00:00:00:00" MAC address
    //       controller_mac_address = Array.from({ length: 6 }, () =>
    //         Math.floor(Math.random() * 256)
    //           .toString(16)
    //           .padStart(2, "0"),
    //       ).join(":");
    //     }

    //     const controller = new PreviewController(controller_mac_address);
    //     controller.construct(SimulatedControllerConfig, SimulatedConnectorImplementation);
    //     this.controllers.push(controller);
    //   }
    // }

    // ? This can be offloaded to different thread
    {
      this.#ups = 1;
      this.#fps = 2;

      const __process = async () => {
        for (let controller of this.controllers) {
          try {
            controller.process();
          } catch (e) {
            logging.error(e);
          }
        }
      };

      const __render = async () => {
        for (let controller of this.controllers) {
          try {
            controller.render();
          } catch (e) {
            logging.error(e);
          }
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

      for (const controller of this.controllers) {
        await controller.execute(new Uint8Array(payload), new SpectodaWasm.Connection(APP_MAC_ADDRESS, SpectodaWasm.connector_type_t.CONNECTOR_SIMULATED, SpectodaWasm.connection_rssi_t.RSSI_MAX));
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

      for (const controller of this.controllers) {
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

      const response = this.controllers.length > 0
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

      for (const controller of this.controllers) {
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

      const clock_timestamp = this.controllers.length > 0 ? this.controllers[0].getClock() : 0;
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
        if (this.controllers.length > 0) {
          for (const controller of this.controllers) {
            controller.destruct();
          }
          this.controllers = [];
        }
      });
  }

  // void _sendExecute(const std::vector<uint8_t>& command_bytes, const Connection& source_connection) = 0;

  sendExecute(command_bytes: Uint8Array, source_connection: Connection) {
    logging.verbose(`SpectodaSimulatedConnector::sendExecute(command_bytes=${command_bytes}, source_connection=${source_connection.address_string})`);

    if (source_connection.connector_type == SpectodaWasm.connector_type_t.CONNECTOR_SIMULATED) {
      logging.debug("SpectodaSimulatedConnector::sendExecute() - source_connection is CONNECTOR_SIMULATED");
      return Promise.resolve();
    }

    // TODO simulated connector needs the other side to receive the executed

    // ! This is a hack to make the simulated connector work with the preview controllers
    return new Promise(async (resolve, reject) => {
      //
      // TODO! SOURCE_CONNECTION_THIS_CONTROLLER should have the actual mac address of the controller. Not 00:00:00:00:00:00
      if (source_connection.address_string == "00:00:00:00:00:00") {
        source_connection.address_string = APP_MAC_ADDRESS;
      }

      for (const controller of this.controllers) {
        if (controller.mac != source_connection.address_string) {
          try {
            controller.execute(command_bytes, source_connection);
          } catch (e) {
            logging.error(e);
          }
        }
      }

      resolve(null);
    });
  }

  // bool _sendRequest(const int32_t request_ticket_number, std::vector<uint8_t>& request_bytecode, const Connection& destination_connection) = 0;

  sendRequest(request_ticket_number: number, request_bytecode: Uint8Array, destination_connection: Connection) {
    logging.verbose(`SpectodaSimulatedConnector::sendRequest(request_ticket_number=${request_ticket_number}, request_bytecode=${request_bytecode}, destination_connection=${destination_connection})`);

    // TODO simulated connector needs the other side to receive the request

    return Promise.reject("NotImplemented");
  }
  // bool _sendResponse(const int32_t request_ticket_number, const int32_t request_result, std::vector<uint8_t>& response_bytecode, const Connection& destination_connection) = 0;

  sendResponse(request_ticket_number: number, request_result: number, response_bytecode: Uint8Array, destination_connection: Connection) {
    logging.verbose(`SpectodaSimulatedConnector::sendResponse(request_ticket_number=${request_ticket_number}, request_result=${request_result}, response_bytecode=${response_bytecode}, destination_connection=${destination_connection})`);

    // TODO simulated connector needs the other side to receive the response

    return Promise.reject("NotImplemented");
  }

  // void _sendSynchronize(const Synchronization& synchronization, const Connection& source_connection) = 0;

  sendSynchronize(synchronization: Synchronization, source_connection: Connection) {
    logging.verbose(`SpectodaSimulatedConnector::sendSynchronize(synchronization=${synchronization.origin_address}, source_connection=${source_connection.address_string})`);

    if (source_connection.connector_type == SpectodaWasm.connector_type_t.CONNECTOR_SIMULATED) {
      logging.debug("SpectodaSimulatedConnector::sendSynchronize() - source_connection is CONNECTOR_SIMULATED");
      return Promise.resolve();
    }

    // TODO simulated connector needs the other side to receive the synchronizes

    // ! This is a hack to make the simulated connector work with the preview controllers
    return new Promise(async (resolve, reject) => {
      //
      source_connection.connector_type = SpectodaWasm.connector_type_t.CONNECTOR_SIMULATED;

      // TODO! SOURCE_CONNECTION_THIS_CONTROLLER should have the actual mac address of the controller. Not 00:00:00:00:00:00
      if (source_connection.address_string == "00:00:00:00:00:00") {
        source_connection.address_string = APP_MAC_ADDRESS;
      }

      for (const controller of this.controllers) {
        if (controller.mac != source_connection.address_string) {
          try {
            controller.synchronize(synchronization, source_connection);
          } catch (e) {
            logging.error(e);
          }
        }
      }

      resolve(null);
    });
  }
}
