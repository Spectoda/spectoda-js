import { logging } from "./logging";
import { sleep, toBytes, detectSpectodaConnect, numberToBytes, detectAndroid } from "./functions";
import { TimeTrack } from "./TimeTrack.js";
import { TnglReader } from "./TnglReader.js";
import { NULL_VALUE, COMMAND_FLAGS, SpectodaInterfaceLegacy } from "./SpectodaInterfaceLegacy.js";

/////////////////////////////////////////////////////////////////////////////////////

var simulatedFails = false;

class FlutterConnection {
  constructor() {
    // @ts-ignore
    if (window.flutterConnection) {
      logging.verbose("> FlutterConnection already inited");
      return;
    }

    logging.verbose("> Initing FlutterConnection...");

    // @ts-ignore
    window.flutterConnection = {};

    // @ts-ignore
    window.flutterConnection.resolve = null;

    // @ts-ignore
    window.flutterConnection.reject = null;

    // @ts-ignore
    window.flutterConnection.emit = null;

    // ! This code historically was used to handle the opening of links in SpectodaConnect webview.
    // ! It is not used anymore, but I keep it here for historical reasons, if someone would be searching for 
    // ! a way to open links in a new tab in a webview.
    // // target="_blank" global handler
    // // @ts-ignore
    // window.flutterConnection.hasOwnProperty("open") &&
    //   /** @type {HTMLBodyElement} */ (document.querySelector("body")).addEventListener("click", function (e) {
    //     e.preventDefault();
    //     // @ts-ignore
    //     for (let el of e.path) {
    //       if (el.tagName === "A" && el.getAttribute("target") === "_blank") {
    //         e.preventDefault();
    //         const url = el.getAttribute("href");
    //         // console.log(url);
    //         // @ts-ignore
    //         window.flutterConnection.open(url);
    //         break;
    //       }
    //     }
    //   });

    if (this.available()) {
      window.addEventListener("#resolve", e => {
        // @ts-ignore
        const value = e.detail.value;
        logging.debug(`> Triggered #resolve: [${value}]`);

        // @ts-ignore
        window.flutterConnection.resolve(value);
      });

      window.addEventListener("#reject", e => {
        // @ts-ignore
        const value = e.detail.value;
        logging.debug(`> Triggered #reject: [${value}]`);

        // @ts-ignore
        window.flutterConnection.reject(value);
      });

      window.addEventListener("#emit", e => {
        // @ts-ignore
        const event = e.detail.value;
        logging.debug(`> Triggered #emit: ${event}`);

        // @ts-ignore
        window.flutterConnection.emit(event);
      });

      // ! deprecated
      window.addEventListener("#process", e => {
        // @ts-ignore
        const bytes = e.detail.value;
        logging.debug(`> Triggered #process: [${bytes}]`, bytes);

        // @ts-ignore
        window.flutterConnection.process(bytes);
      });

      window.addEventListener("#network", e => {
        // @ts-ignore
        const bytes = e.detail.value;
        logging.debug(`> Triggered #network: [${bytes}]`, bytes);

        // @ts-ignore
        window.flutterConnection.process(bytes);
      });

      window.addEventListener("#device", e => {
        // @ts-ignore
        const bytes = e.detail.value;
        logging.debug(`> Triggered #device: [${bytes}]`, bytes);
      });

      window.addEventListener("#clock", e => {
        // @ts-ignore
        const bytes = e.detail.value;
        logging.debug(`> Triggered #clock: [${bytes}]`, bytes);
      });

      logging.verbose("> FlutterConnection inited");

    } else {
      logging.debug("> Simulating FlutterConnection Functions...");

      var _connected = false;
      var _selected = false;

      function _fail(failChance) {
        if (simulatedFails) {
          return Math.random() < failChance;
        } else {
          return false;
        }
      }

      // @ts-ignore
      window.flutter_inappwebview = {};

      // @ts-ignore
      window.flutter_inappwebview.callHandler = async function (handler, a, b, c, d) {
        //
        switch (handler) {
          //
          case "userSelect": // params: (criteria_json, timeout_number)
            {
              // disconnect if already connected
              if (_connected) {
                // @ts-ignore
                await window.flutter_inappwebview.callHandler("disconnect");
              }
              await sleep(Math.random() * 5000); // do the userSelect task filtering devices by the criteria_json parameter
              if (_fail(0.5)) {
                // @ts-ignore
                window.flutterConnection.reject("UserCanceledSelection"); // reject with "UserCanceledSelection" message if user cancels selection
                return;
              }
              if (_fail(0.1)) {
                // @ts-ignore
                window.flutterConnection.reject("SelectionFailed");
                return;
              }
              _selected = true;
              // @ts-ignore
              window.flutterConnection.resolve('{"connector":"spectodaconnect"}');
            }
            break;

          case "autoSelect": // params: (criteria_json, scan_duration_number, timeout_number)
            {
              if (_connected) {
                // @ts-ignore
                await window.flutter_inappwebview.callHandler("disconnect"); // handle disconnection inside the flutter app
              }
              await sleep(Math.random() * 5000); // do the autoSelect task filtering devices by the criteria_json parameter and scanning minimum time scan_duration_number, maximum timeout_number
              if (_fail(0.1)) {
                // @ts-ignore
                window.flutterConnection.reject("SelectionFailed"); // if the selection fails, return "SelectionFailed"
                return;
              }
              _selected = true;
              // @ts-ignore
              window.flutterConnection.resolve('{"connector":"spectodaconnect"}'); // resolve with json containing the information about the connected device
            }
            break;

          case "selected":
            {
              // params: ()
              if (_selected) {
                // @ts-ignore
                window.flutterConnection.resolve('{"connector":"spectodaconnect"}'); // if the device is selected, return json
              } else {
                // @ts-ignore
                window.flutterConnection.resolve(); // if no device is selected resolve nothing
              }
            }
            break;

          case "unselect":
            {
              // params: ()
              if (_connected) {
                // @ts-ignore
                await window.flutterConnection.disconnect();
              }
              await sleep(10); // unselect logic
              _selected = false;
              // @ts-ignore
              window.flutterConnection.resolve();
            }
            break;

          case "scan": // params: (criteria_json, scan_duration_number)
            {
              if (_connected) {
                // @ts-ignore
                await window.flutter_inappwebview.callHandler("disconnect"); // handle disconnection inside the flutter app
              }
              await sleep(Math.random() * 5000); // do the autoSelect task filtering devices by the criteria_json parameter and scanning minimum time scan_duration_number, maximum timeout_number
              if (_fail(0.1)) {
                // @ts-ignore
                window.flutterConnection.reject("SelectionFailed"); // if the selection fails, return "SelectionFailed"
                return;
              }
              _selected = true;
              // @ts-ignore
              window.flutterConnection.resolve('{"connector":"spectodaconnect"}'); // resolve with json containing the information about the connected device
            }
            break;

          case "connect":
            {
              // params: (timeout_number)
              if (!_selected) {
                // @ts-ignore
                window.flutterConnection.reject("DeviceNotSelected");
                return;
              }
              await sleep(Math.random() * 5000); // connecting logic
              if (_fail(0.1)) {
                // @ts-ignore
                window.flutterConnection.reject("ConnectionFailed");
                return;
              }
              _connected = true;
              // @ts-ignore
              // @ts-ignore
              window.flutterConnection.resolve('{"connector":"spectodaconnect"}');
              // after connection the SpectodaConnect can any time emit #disconnect event.

              await sleep(1000); // unselect logic

              // @ts-ignore
              window.flutterConnection.emit("#connected");

              setTimeout(() => {
                // @ts-ignore
                window.flutterConnection.emit("#disconnected");
                //}, Math.random() * 60000);
                _connected = false;
              }, 60000);
            }
            break;

          case "disconnect":
            {
              // params: ()
              if (_connected) {
                await sleep(100); // disconnecting logic
                _connected = false;
                // @ts-ignore
                window.flutterConnection.emit("#disconnected");
              }
              // @ts-ignore
              window.flutterConnection.resolve(); // always resolves even if there are internal errors
            }
            break;

          case "connected":
            {
              // params: ()
              if (_connected) {
                // @ts-ignore
                window.flutterConnection.resolve('{"connector":"spectodaconnect"}');
              } else {
                // @ts-ignore
                window.flutterConnection.resolve();
              }
            }
            break;

          case "deliver":
            {
              // params: (payload_bytes)
              if (!_connected) {
                // @ts-ignore
                window.flutterConnection.reject("DeviceDisconnected");
                return;
              }
              await sleep(25); // delivering logic
              if (_fail(0.1)) {
                // @ts-ignore
                window.flutterConnection.reject("DeliverFailed");
                return;
              }
              // @ts-ignore
              window.flutterConnection.resolve();
            }
            break;

          case "transmit":
            {
              // params: (payload_bytes)
              if (!_connected) {
                // @ts-ignore
                window.flutterConnection.reject("DeviceDisconnected");
                return;
              }
              await sleep(10); // transmiting logic
              if (_fail(0.1)) {
                // @ts-ignore
                window.flutterConnection.reject("TransmitFailed");
                return;
              }
              // @ts-ignore
              window.flutterConnection.resolve();
            }
            break;

          case "request":
            {
              // params: (payload_bytes, read_response)
              if (!_connected) {
                // @ts-ignore
                window.flutterConnection.reject("DeviceDisconnected");
                return;
              }
              await sleep(50); // requesting logic
              if (_fail(0.1)) {
                // @ts-ignore
                window.flutterConnection.reject("RequestFailed");
                return;
              }

              // @ts-ignore
              window.flutterConnection.resolve([246, 1, 0, 0, 0, 188, 251, 18, 0, 212, 247, 18, 0, 0]); // returns data as an array of bytes: [0,255,123,89]
            }
            break;

          case "writeClock":
            {
              // params: (clock_bytes)
              if (!_connected) {
                // @ts-ignore
                window.flutterConnection.reject("DeviceDisconnected");
                return;
              }
              await sleep(10); // writing clock logic.
              if (_fail(0.1)) {
                // @ts-ignore
                window.flutterConnection.reject("ClockWriteFailed");
                return;
              }
              // @ts-ignore
              window.flutterConnection.resolve();
            }
            break;

          case "readClock":
            {
              // params: ()
              if (!_connected) {
                // @ts-ignore
                window.flutterConnection.reject("DeviceDisconnected");
                return;
              }
              await sleep(50); // reading clock logic.
              if (_fail(0.1)) {
                // @ts-ignore
                window.flutterConnection.reject("ClockReadFailed");
                return;
              }
              // @ts-ignore
              window.flutterConnection.resolve([0, 0, 0, 0]); // returns timestamp as an 32-bit signed number
            }
            break;

          case "updateFW":
            {
              // params: (bytes)
              if (!_connected) {
                // @ts-ignore
                window.flutterConnection.reject("DeviceDisconnected");
                return;
              }
              // @ts-ignore
              window.flutterConnection.emit("ota_status", "begin");
              await sleep(10000); // preparing FW logic.
              if (_fail(0.1)) {
                // @ts-ignore
                window.flutterConnection.emit("ota_status", "fail");
                // @ts-ignore
                window.flutterConnection.reject("UpdateFailed");
                return;
              }
              for (let i = 1; i <= 100; i++) {
                // @ts-ignore
                window.flutterConnection.emit("ota_progress", i);
                await sleep(25); // writing FW logic.
                if (_fail(0.01)) {
                  // @ts-ignore
                  window.flutterConnection.emit("ota_status", "fail");
                  // @ts-ignore
                  window.flutterConnection.reject("UpdateFailed");
                  return;
                }
              }
              await sleep(1000); // finishing FW logic.
              if (_fail(0.1)) {
                // @ts-ignore
                window.flutterConnection.emit("ota_status", "fail");
                // @ts-ignore
                window.flutterConnection.reject("UpdateFailed");
                return;
              }
              // @ts-ignore
              window.flutterConnection.emit("ota_status", "success");
              // @ts-ignore
              window.flutterConnection.resolve();
            }
            break;

          default:
            logging.error("Unknown handler");
            break;
        }
      };
    }
  }

  available() {
    return "flutter_inappwebview" in window;
  }
}

// Connector connects the application with one Spectoda Device, that is then in a
// position of a controller for other Spectoda Devices
export class FlutterConnector extends FlutterConnection {
  #interfaceReference;

  #promise;

  constructor(interfaceReference) {
    super();

    this.type = "spectodaconnect";

    this.#interfaceReference = interfaceReference;
    this.#promise = null;

    // @ts-ignore
    window.flutterConnection.emit = event => {
      this.#interfaceReference.emit(event, null);
    };

    // @ts-ignore
    window.flutterConnection.process = bytes => {
      this.#interfaceReference.process(new DataView(new Uint8Array(bytes).buffer));
    };
  }

  #applyTimeout(promise, timeout_number, message) {
    const handle = setTimeout(() => {
      // @ts-ignore
      window.flutterConnection.reject("FlutterSafeguardTimeout: " + message);
    }, timeout_number);
    return promise.finally(() => {
      clearTimeout(handle);
    });
  }

  async ping() {
    console.time("ping_measure");
    for (let i = 0; i < 1000; i++) {
      this.#promise = new Promise((resolve, reject) => {
        // @ts-ignore
        window.flutterConnection.resolve = resolve;
        // @ts-ignore
        window.flutterConnection.reject = reject;
      });

      // logging.debug("ping")
      // @ts-ignore
      window.flutterConnection.ping();
      await this.#promise;
      // logging.debug("pong")
    }
    //
    console.timeEnd("ping_measure");

    const FLUTTER_RESPONSE_TIMEOUT = 5000;
    return this.#applyTimeout(this.#promise, FLUTTER_RESPONSE_TIMEOUT, "ping");
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
  // all Devices that are named "NARA Aplha", are on 0.9.2 fw and are
  // adopted by the owner with "baf2398ff5e6a7b8c9d097d54a9f865f" signature.
  // Product code is 1 what means NARA Alpha, pcbCode 2 means NARA Controller
  {
    name: "NARA Alpha",
    fwVersion: "0.9.2",
    ownerSignature: "baf2398ff5e6a7b8c9d097d54a9f865f",
    productCode: 1
  },
  {
    namePrefix: "NARA",
    fwVersion: "!0.8.3",
    pcbCode: 2,
    adoptionFlag: true
  }
]

*/
  // choose one Spectoda device (user chooses which device to connect to via a popup)
  // if no criteria are set, then show all Spectoda devices visible.
  // first bonds the BLE device with the PC/Phone/Tablet if it is needed.
  // Then selects the device
  userSelect(criteria_object, timeout_number) {
    if (timeout_number === NULL_VALUE) { timeout_number = 30000; }

    const criteria_json = JSON.stringify(criteria_object);
    logging.debug(`userSelect(criteria=${criteria_json}, timeout=${timeout_number})`);

    this.#promise = new Promise((resolve, reject) => {
      // @ts-ignore
      window.flutterConnection.resolve = function (j) {
        //! [BUG] Flutter app on Android tends to return nulls as strings with a null character at the end. This is a workaround for that.
        j = j.replace(/\u0000/g, '');
        resolve(j ? JSON.parse(j) : null);
      };
      // @ts-ignore
      window.flutterConnection.reject = reject;
    });

    // @ts-ignore
    window.flutter_inappwebview.callHandler("userSelect", criteria_json, timeout_number);

    const FLUTTER_RESPONSE_TIMEOUT = timeout_number + 5000;
    return this.#applyTimeout(this.#promise, FLUTTER_RESPONSE_TIMEOUT, "userSelect");
  }

  // takes the criteria, scans for scan_duration and automatically selects the device,
  // you can then connect to. This works only for BLE devices that are bond with the phone/PC/tablet
  // the app is running on OR doesnt need to be bonded in a special way.
  // if more devices are found matching the criteria, then the strongest signal wins
  // if no device is found within the timeout_number period, then it returns an error

  // if no criteria are provided, all Spectoda enabled devices (with all different FWs and Owners and such)
  // are eligible.

  autoSelect(criteria_object, scan_duration_number, timeout_number) {
    if (scan_duration_number === NULL_VALUE) { scan_duration_number = 1200; } // 1200ms seems to be the minimum for the scan_duration if the controller is rebooted
    if (timeout_number === NULL_VALUE) { timeout_number = 5000; }
    // step 1. for the scan_duration scan the surroundings for BLE devices.
    // step 2. if some devices matching the criteria are found, then select the one with
    //         the greatest signal strength. If no device is found until the timeout_number,
    //         then return error

    const MINIMAL_AUTOSELECT_SCAN_DURATION = 1200;
    const MINIMAL_AUTOSELECT_TIMEOUT = 2000;

    const criteria_json = JSON.stringify(criteria_object);

    logging.debug(`autoSelect(criteria=${criteria_json}, scan_duration=${scan_duration_number}, timeout=${timeout_number})`);

    this.#promise = new Promise((resolve, reject) => {
      // @ts-ignore
      window.flutterConnection.resolve = function (j) {
        //! [BUG] Flutter app on Android tends to return nulls as strings with a null character at the end. This is a workaround for that.
        j = j.replace(/\u0000/g, '');
        resolve(j ? JSON.parse(j) : null);
      };

      // @ts-ignore
      window.flutterConnection.reject = function (e) { // on old Androids sometimes the first time you call autoSelect right after bluetooth is turned on, it rejects with a timeout
        logging.warn(e);

        // if the second attempt rejects again, then reject the promise
        window.flutterConnection.reject = reject;

        console.warn("autoSelect() with minimal timeout timeouted, trying it again with the full timeout...");
        // @ts-ignore
        window.flutter_inappwebview.callHandler("autoSelect", criteria_json, Math.max(MINIMAL_AUTOSELECT_SCAN_DURATION, scan_duration_number), Math.max(MINIMAL_AUTOSELECT_TIMEOUT, timeout_number));
      };
    });

    // @ts-ignore
    window.flutter_inappwebview.callHandler("autoSelect", criteria_json, Math.max(MINIMAL_AUTOSELECT_SCAN_DURATION, scan_duration_number), Math.max(MINIMAL_AUTOSELECT_TIMEOUT, scan_duration_number));

    //? Leaving this code here for possible benchmarking. Comment out .callHandler("connect" and uncomment this code to use it
    // setTimeout(() => {
    //   window.flutterConnection.reject("SimulatedError");
    // }, MINIMAL_AUTOSELECT_TIMEOUT);

    const FLUTTER_RESPONSE_TIMEOUT = Math.max(MINIMAL_AUTOSELECT_TIMEOUT, scan_duration_number) + Math.max(MINIMAL_AUTOSELECT_TIMEOUT, timeout_number) + 5000;
    return this.#applyTimeout(this.#promise, FLUTTER_RESPONSE_TIMEOUT, "autoSelect");
  }

  selected() {
    logging.debug(`selected()`);

    this.#promise = new Promise((resolve, reject) => {
      // @ts-ignore
      window.flutterConnection.resolve = function (j) {
        //! [BUG] Flutter app on Android tends to return nulls as strings with a null character at the end. This is a workaround for that.
        j = j.replace(/\u0000/g, '');
        resolve(j ? JSON.parse(j) : null);
      };
      // @ts-ignore
      window.flutterConnection.reject = reject;
    });

    // @ts-ignore
    window.flutter_inappwebview.callHandler("selected");

    const FLUTTER_RESPONSE_TIMEOUT = 1000;
    return this.#applyTimeout(this.#promise, FLUTTER_RESPONSE_TIMEOUT, "selected");
  }

  unselect() {
    logging.debug(`unselect()`);

    this.#promise = new Promise((resolve, reject) => {
      // @ts-ignore
      window.flutterConnection.resolve = resolve;
      // @ts-ignore
      window.flutterConnection.reject = reject;
    });

    // @ts-ignore
    window.flutter_inappwebview.callHandler("unselect");

    const FLUTTER_RESPONSE_TIMEOUT = 1000;
    return this.#applyTimeout(this.#promise, FLUTTER_RESPONSE_TIMEOUT, "unselect");
  }

  // takes the criteria, scans for scan_duration and returns the scanning results
  // if no criteria are provided, all Spectoda enabled devices (with all different FWs and Owners and such)
  // are eligible.

  scan(criteria_object, scan_duration_number) {
    if (scan_duration_number === NULL_VALUE) { scan_duration_number = 7000; }
    // step 1. for the scan_duration scan the surroundings for BLE devices.

    const criteria_json = JSON.stringify(criteria_object);

    logging.debug(`scan(criteria=${criteria_json}, scan_duration=${scan_duration_number})`);

    this.#promise = new Promise((resolve, reject) => {
      // @ts-ignore
      window.flutterConnection.resolve = function (j) {
        //! [BUG] Flutter app on Android tends to return nulls as strings with a null character at the end. This is a workaround for that.
        j = j.replace(/\u0000/g, '');
        resolve(j ? JSON.parse(j) : null);
      };
      // @ts-ignore
      window.flutterConnection.reject = reject;
    });

    // @ts-ignore
    window.flutter_inappwebview.callHandler("scan", criteria_json, scan_duration_number);

    const FLUTTER_RESPONSE_TIMEOUT = scan_duration_number + 5000;
    return this.#applyTimeout(this.#promise, FLUTTER_RESPONSE_TIMEOUT, "scan");
  }

  /*

  timeout_number ms

  */
  // timeout 20000ms for the old slow devices to be able to connect
  connect(timeout_number) {
    if (timeout_number === NULL_VALUE) { timeout_number = 20000; }
    logging.debug(`connect(timeout=${timeout_number})`);

    const MINIMAL_CONNECT_TIMEOUT = 5000;
    if (timeout_number <= MINIMAL_CONNECT_TIMEOUT) {
      return Promise.reject("InvalidTimeout");
    }

    //? I came across an olf Andoid device that needed a two calls of a connect for a successful connection.
    //? it always timeouted on the first call, but the second call was always successful.
    //? so I am trying to connect with a minimal timeout first and if it fails, then I try it again with the full timeout
    //? becouse other devices needs a long timeout for connection to be successful
    this.#promise = new Promise((resolve, reject) => {
      // @ts-ignore
      window.flutterConnection.resolve = function (j) {
        //! [BUG] Flutter app on Android tends to return nulls as strings with a null character at the end. This is a workaround for that.
        j = j.replace(/\u0000/g, '');
        resolve(j ? JSON.parse(j) : null);
      };
      // @ts-ignore
      window.flutterConnection.reject = function (e) {
        logging.warn(e);

        // if the second attempt rejects again, then reject the promise
        window.flutterConnection.reject = reject;

        console.warn("Connect with minimal timeout timeouted, trying it again with the full timeout...");
        // @ts-ignore
        window.flutter_inappwebview.callHandler("connect", Math.max(MINIMAL_CONNECT_TIMEOUT, timeout_number)); // on old Androids the minimal timeout is not enough
      };
    });

    // @ts-ignore 
    window.flutter_inappwebview.callHandler("connect", MINIMAL_CONNECT_TIMEOUT); // first try to connect with the minimal timeout

    //? Leaving this code here for possible benchmarking. Comment out .callHandler("connect" and uncomment this code to use it
    // setTimeout(() => {
    //   window.flutterConnection.reject("SimulatedError");
    // }, MINIMAL_CONNECT_TIMEOUT);

    // the timeout must be long enough to handle the slowest devices
    const FLUTTER_RESPONSE_TIMEOUT = MINIMAL_CONNECT_TIMEOUT + Math.max(MINIMAL_CONNECT_TIMEOUT, timeout_number) + 5000;
    return this.#applyTimeout(this.#promise, FLUTTER_RESPONSE_TIMEOUT, "connect").then(() => {
      logging.debug("Sleeping for 100ms after connect...");
      return sleep(100);
    });
  }

  // disconnect Connector from the connected Spectoda Device. But keep it selected
  disconnect() {
    logging.debug(`disconnect()`);

    this.#promise = new Promise((resolve, reject) => {
      // @ts-ignore
      window.flutterConnection.resolve = resolve;
      // @ts-ignore
      window.flutterConnection.reject = reject;
    });

    // @ts-ignore
    window.flutter_inappwebview.callHandler("disconnect");

    const FLUTTER_RESPONSE_TIMEOUT = 5000;
    return this.#applyTimeout(this.#promise, FLUTTER_RESPONSE_TIMEOUT, "disconnect");
  }

  connected() {
    logging.debug(`connected()`);

    this.#promise = new Promise((resolve, reject) => {
      // @ts-ignore
      window.flutterConnection.resolve = function (j) {
        //! [BUG] Flutter app on Android tends to return nulls as strings with a null character at the end. This is a workaround for that.
        j = j.replace(/\u0000/g, '');
        resolve(j ? JSON.parse(j) : null);
      };
      // @ts-ignore
      window.flutterConnection.reject = reject;
    });

    // @ts-ignore
    window.flutter_inappwebview.callHandler("connected");

    const FLUTTER_RESPONSE_TIMEOUT = 1000;
    return this.#applyTimeout(this.#promise, FLUTTER_RESPONSE_TIMEOUT, "connected");
  }

  // deliver handles the communication with the Spectoda Controller in a way
  // that the command is guaranteed to arrive
  deliver(payload_bytes, timeout_number) {
    if (timeout_number === NULL_VALUE) { timeout_number = 5000; }
    logging.debug(`deliver(payload=[${payload_bytes}], timeout=${timeout_number})`);

    this.#promise = new Promise((resolve, reject) => {
      // @ts-ignore
      window.flutterConnection.resolve = resolve;
      // @ts-ignore
      window.flutterConnection.reject = reject;
    });

    // @ts-ignore
    window.flutter_inappwebview.callHandler("deliver", payload_bytes, timeout_number);

    const FLUTTER_RESPONSE_TIMEOUT = timeout_number + 5000;
    return this.#applyTimeout(this.#promise, FLUTTER_RESPONSE_TIMEOUT, "deliver");
  }

  // transmit handles the communication with the Spectoda Controller in a way
  // that the paylaod is NOT guaranteed to arrive
  transmit(payload_bytes, timeout_number) {
    if (timeout_number === NULL_VALUE) { timeout_number = 1000; }
    logging.debug(`transmit(payload=[${payload_bytes}], timeout=${timeout_number})`);

    this.#promise = new Promise((resolve, reject) => {
      // @ts-ignore
      window.flutterConnection.resolve = resolve;
      // @ts-ignore
      window.flutterConnection.reject = reject;
    });

    // @ts-ignore
    window.flutter_inappwebview.callHandler("transmit", payload_bytes, timeout_number);

    const FLUTTER_RESPONSE_TIMEOUT = timeout_number + 5000;
    return this.#applyTimeout(this.#promise, FLUTTER_RESPONSE_TIMEOUT, "transmit");
  }

  // request handles the requests on the Spectoda Controller. The payload request
  // is guaranteed to get a response
  request(payload_bytes, read_response, timeout_number) {
    if (timeout_number === NULL_VALUE) { timeout_number = 5000; }
    logging.debug(`request(payload=[${payload_bytes}], read_response=${read_response ? "true" : "false"}, timeout=${timeout_number})`);

    this.#promise = new Promise((resolve, reject) => {
      // @ts-ignore
      window.flutterConnection.resolve = response => {
        resolve(new DataView(new Uint8Array(response).buffer));
      };
      // @ts-ignore
      window.flutterConnection.reject = reject;
    });

    // @ts-ignore
    window.flutter_inappwebview.callHandler("request", payload_bytes, read_response, timeout_number);

    const FLUTTER_RESPONSE_TIMEOUT = timeout_number + 5000;
    return this.#applyTimeout(this.#promise, FLUTTER_RESPONSE_TIMEOUT, "request");
  }

  // synchronizes the device internal clock with the provided TimeTrack clock
  // of the application as precisely as possible
  setClock(clock) {
    logging.debug("setClock()");

    return new Promise(async (resolve, reject) => {
      for (let tries = 0; tries < 3; tries++) {
        await sleep(100); // ! wait for the controller to be ready
        try {
          // tries to ASAP write a timestamp to the clock characteristics.
          // if the ASAP write fails, then try it once more

          this.#promise = new Promise((resolve, reject) => {
            // @ts-ignore
            window.flutterConnection.resolve = resolve;
            // @ts-ignore
            window.flutterConnection.reject = reject;
          });

          const timestamp = clock.millis();
          const clock_bytes = toBytes(timestamp, 8);
          // @ts-ignore
          window.flutter_inappwebview.callHandler("writeClock", clock_bytes);

          const FLUTTER_RESPONSE_TIMEOUT = 5000;
          await this.#applyTimeout(this.#promise, FLUTTER_RESPONSE_TIMEOUT, "writeClock");
          logging.debug("Clock write success:", timestamp);

          // @ts-ignore
          resolve();
          return;

        } catch (e) {
          logging.warn("Clock write failed: " + e);
        }
      }

      reject("Clock write failed");
      return;
    });
  }

  // returns a TimeTrack clock object that is synchronized with the internal clock
  // of the device as precisely as possible
  getClock() {
    logging.debug("getClock()");

    return new Promise(async (resolve, reject) => {
      for (let index = 0; index < 3; index++) {
        await sleep(100); // ! wait for the controller to be ready
        try {
          // tries to ASAP read a timestamp from the clock characteristics.
          // if the ASAP read fails, then try it once more

          this.#promise = new Promise((resolve, reject) => {
            // @ts-ignore
            window.flutterConnection.resolve = resolve;
            // @ts-ignore
            window.flutterConnection.reject = reject;
          });

          // @ts-ignore
          window.flutter_inappwebview.callHandler("readClock");

          const FLUTTER_RESPONSE_TIMEOUT = 5000;
          const bytes = await this.#applyTimeout(this.#promise, FLUTTER_RESPONSE_TIMEOUT, "readClock");

          const reader = new TnglReader(new DataView(new Uint8Array(bytes).buffer));
          const timestamp = reader.readUint64();

          // const timestamp = await this.#promise;
          logging.debug("Clock read success:", timestamp);

          resolve(new TimeTrack(timestamp));
          return;
        } catch (e) {
          logging.warn("Clock read failed:", e);
        }
      }

      reject("Clock read failed");
      return;
    });
  }

  // handles the firmware updating. Sends "ota" events
  // to all handlers

  // TODO - emit "ota_progress" events

  updateFW(firmware_bytes) {
    logging.debug(`updateFW(firmware_bytes.length=${firmware_bytes.length})`);

    // this.#promise = new Promise((resolve, reject) => {
    //   // @ts-ignore
    //   window.flutterConnection.resolve = resolve;
    //   // @ts-ignore
    //   window.flutterConnection.reject = reject;
    // });

    // // @ts-ignore
    // window.flutter_inappwebview.callHandler("updateFW", firmware_bytes);

    // return this.#applyTimeout(this.#promise, 600000, "updateFW");

    // logging.error("Device update is not yet implemented.");
    // return Promise.reject("NotImplemented");

    this.#interfaceReference.requestWakeLock();

    return new Promise(async (resolve, reject) => {
      const chunk_size = detectAndroid() ? 480 : 3984; // must be modulo 16
      // const chunk_size = 992; // must be modulo 16

      let index_from = 0;
      let index_to = chunk_size;

      let written = 0;

      logging.info("OTA UPDATE");
      logging.verbose(firmware_bytes);

      const start_timestamp = new Date().getTime();

      await sleep(100);

      try {
        this.#interfaceReference.emit("ota_status", "begin");

        {
          //===========// RESET //===========//
          logging.info("OTA RESET");

          const device_bytes = [COMMAND_FLAGS.FLAG_OTA_RESET, 0x00, ...numberToBytes(0x00000000, 4)];
          await this.request(device_bytes, false);
        }

        await sleep(100);

        {
          //===========// BEGIN //===========//
          logging.info("OTA BEGIN");

          const device_bytes = [COMMAND_FLAGS.FLAG_OTA_BEGIN, 0x00, ...numberToBytes(firmware_bytes.length, 4)];
          await this.request(device_bytes, false, 20000);
        }

        await sleep(8000);

        {
          //===========// WRITE //===========//
          logging.info("OTA WRITE");

          while (written < firmware_bytes.length) {
            if (index_to > firmware_bytes.length) {
              index_to = firmware_bytes.length;
            }

            const device_bytes = [COMMAND_FLAGS.FLAG_OTA_WRITE, 0x00, ...numberToBytes(written, 4), ...firmware_bytes.slice(index_from, index_to)];
            await this.request(device_bytes, false);

            written += index_to - index_from;

            const percentage = Math.floor((written * 10000) / firmware_bytes.length) / 100;
            logging.debug(percentage + "%");
            this.#interfaceReference.emit("ota_progress", percentage);

            index_from += chunk_size;
            index_to = index_from + chunk_size;
          }
        }

        await sleep(100);

        {
          //===========// END //===========//
          logging.info("OTA END");

          const device_bytes = [COMMAND_FLAGS.FLAG_OTA_END, 0x00, ...numberToBytes(written, 4)];
          await this.request(device_bytes, false);
        }

        await sleep(100);

        logging.info("Rebooting device...");

        const device_bytes = [COMMAND_FLAGS.FLAG_DEVICE_REBOOT_REQUEST];
        await this.request(device_bytes, false);

        logging.debug("Firmware written in " + (new Date().getTime() - start_timestamp) / 1000 + " seconds");

        this.#interfaceReference.emit("ota_status", "success");

        resolve(null);
      } catch (e) {
        this.#interfaceReference.emit("ota_status", "fail");

        reject(e);
      }
    })
      .then(() => {
        return this.disconnect();
      })
      .finally(() => {
        this.#interfaceReference.releaseWakeLock();
      });
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
