import { logging } from "../logging";
import { sleep, toBytes, detectSpectodaConnect, numberToBytes, detectAndroid } from "../functions";
import { TimeTrack } from "../TimeTrack.js";
import { TnglReader } from "../TnglReader.js";
import { COMMAND_FLAGS } from "../webassembly/Spectoda_JS.js";

/////////////////////////////////////////////////////////////////////////////////////

class SimulatedConnection {
  constructor() {
  }
}

// Connector connects the application with one Spectoda Device, that is then in a
// position of a controller for other Spectoda Devices
export class SimulationConnector extends SimulatedConnection {
  #interfaceReference;

  constructor(interfaceReference) {
    super();

    this.type = "simulation";

    this.#interfaceReference = interfaceReference;
  }


  /*

criteria: JSON pole objektu, kde plati: [{ tohle AND tamto AND toto } OR { tohle AND tamto }]

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
  userSelect(criteria_object, timeout_number = 60000) {
    logging.debug(`userSelect(criteria=${JSON.stringify(criteria_object)}, timeout=${timeout_number})`);

    return Promise.reject("Not implemented");
  }

  // takes the criteria, scans for scan_period and automatically selects the device,
  // you can then connect to. This works only for BLE devices that are bond with the phone/PC/tablet
  // the app is running on OR doesnt need to be bonded in a special way.
  // if more devices are found matching the criteria, then the strongest signal wins
  // if no device is found within the timeout_number period, then it returns an error

  // if no criteria are provided, all Spectoda enabled devices (with all different FWs and Owners and such)
  // are eligible.

  autoSelect(criteria_object, scan_period_number = 1000, timeout_number = 10000) {
    // step 1. for the scan_period scan the surroundings for BLE devices.
    // step 2. if some devices matching the criteria are found, then select the one with
    //         the greatest signal strength. If no device is found until the timeout_number,
    //         then return error

    logging.debug(`autoSelect(criteria=${JSON.stringify(criteria_object)}, scan_period=${scan_period_number}, timeout=${timeout_number})`);

    return Promise.reject("Not implemented");
  }

  selected() {
    logging.debug(`selected()`);

    return Promise.reject("Not implemented");
  }

  unselect() {
    logging.debug(`unselect()`);

    return Promise.reject("Not implemented");
  }

  // takes the criteria, scans for scan_period and returns the scanning results
  // if no criteria are provided, all Spectoda enabled devices (with all different FWs and Owners and such)
  // are eligible.

  scan(criteria_object, scan_period_number = 5000) {
    // step 1. for the scan_period scan the surroundings for BLE devices.
    logging.debug(`scan(criteria=${JSON.stringify(criteria_object)}, scan_period=${scan_period_number})`);

    return Promise.reject("Not implemented");
  }

  /*

  timeout_number ms

  */
  connect(timeout_number = 10000) {
    logging.debug(`connect(timeout=${timeout_number})`);

    if (timeout_number <= 0) {
      return Promise.reject("ConnectionTimeout");
    }

    return Promise.reject("Not implemented");
  }

  // disconnect Connector from the connected Spectoda Device. But keep it selected
  disconnect() {
    logging.debug(`disconnect()`);

    return Promise.reject("Not implemented");
  }

  connected() {
    logging.debug(`connected()`);

    return Promise.reject("Not implemented");
  }

  // deliver handles the communication with the Spectoda Controller in a way
  // that the command is guaranteed to arrive
  deliver(payload_bytes, timeout_number = 5000) {
    logging.debug(`deliver(payload=[${payload_bytes}], timeout=${timeout_number})`);

    return Promise.reject("Not implemented");
  }

  // transmit handles the communication with the Spectoda Controller in a way
  // that the paylaod is NOT guaranteed to arrive
  transmit(payload_bytes, timeout_number = 1000) {
    logging.debug(`transmit(payload=[${payload_bytes}], timeout=${timeout_number})`);

    return Promise.reject("Not implemented");
  }

  // request handles the requests on the Spectoda Controller. The payload request
  // is guaranteed to get a response
  request(payload_bytes, read_response = true, timeout_number = 5000) {
    logging.debug(`request(payload=[${payload_bytes}], read_response=${read_response ? "true" : "false"}, timeout=${timeout_number})`);

    return Promise.reject("Not implemented");
  }

  // synchronizes the device internal clock with the provided TimeTrack clock
  // of the application as precisely as possible
  setClock(clock) {
    logging.debug("setClock()");

    return Promise.reject("Not implemented");
  }

  // returns a TimeTrack clock object that is synchronized with the internal clock
  // of the device as precisely as possible
  getClock() {
    logging.debug("getClock()");

    return Promise.reject("Not implemented");
  }

  // handles the firmware updating. Sends "ota" events
  // to all handlers

  // TODO - emit "ota_progress" events

  updateFW(firmware_bytes) {
    logging.debug(`updateFW(firmware_bytes.length=${firmware_bytes.length})`);

    return Promise.reject("Not implemented");
  }

  destroy() {
    //this.#interfaceReference = null; // dont know if I need to destroy this reference.. But I guess I dont need to?
    return this.disconnect()
      .catch(() => { })
      .then(() => {
        return this.unselect();
      })
      .catch(() => { });
  }
}
