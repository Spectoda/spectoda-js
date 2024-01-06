import { TnglCodeParser } from "./SpectodaParser";
import { TimeTrack } from "./TimeTrack";
import "./TnglReader";
import { TnglReader } from "./TnglReader";
import "./TnglWriter";
import {
    colorToBytes,
    computeTnglFingerprint,
    cssColorToHex,
    detectNode,
    detectSpectodaConnect,
    hexStringToUint8Array,
    labelToBytes,
    numberToBytes,
    percentageToBytes,
    sleep,
    strMacToBytes,
    stringToBytes,
    uint8ArrayToHexString,
} from "./functions";
import { changeLanguage, t } from "../lib/i18n";
import { logging, setLoggingLevel } from "./logging";
import { COMMAND_FLAGS } from "./webassembly/Spectoda_JS";

import { io } from "socket.io-client";
import customParser from "socket.io-msgpack-parser";
import { WEBSOCKET_URL } from "./SpectodaWebSocketsConnector";
import { SpectodaRuntime, allEventsEmitter } from "./SpectodaRuntime";

let lastEvents = {};

// should not create more than one object!
// the destruction of the Spectoda is not well implemented

// TODO - kdyz zavolam spectoda.connect(), kdyz jsem pripojeny, tak nechci aby se do interfacu poslal select
// TODO - kdyz zavolam funkci connect a uz jsem pripojeny, tak vyslu event connected, pokud si myslim ze nejsem pripojeny.
// TODO - "watchdog timer" pro resolve/reject z TC

export class Spectoda {
    #parser;

    #uuidCounter;
    #ownerSignature;
    #ownerKey;
    #adopting;
    #updating;

    #saveStateTimeoutHandle;

    #connectionState;
    #websocketConnectionState;

    #criteria;
    #reconnecting;
    #autonomousConnection;
    #wakeLock;
    #isPrioritizedWakelock;
    #proxyEventsEmitterRefUnsub;

    #reconnectRC;

    constructor(connectorType = "default", reconnecting = true) {
        this.#parser = new TnglCodeParser();

        this.timeline = new TimeTrack(0, true);

        this.#uuidCounter = Math.floor(Math.random() * 0xffffffff);

        this.#ownerSignature = "00000000000000000000000000000000";
        this.#ownerKey = "00000000000000000000000000000000";

        this.runtime = new SpectodaRuntime(this);

        if (connectorType) {
            this.runtime.assignConnector(connectorType);
        }

        this.#adopting = false;
        this.#updating = false;

        this.#reconnecting = reconnecting ? true : false;
        this.#connectionState = "disconnected";
        this.#websocketConnectionState = "disconnected";

        this.#proxyEventsEmitterRefUnsub = null;

        this.runtime.onConnected = event => {
            logging.debug("> Runtime connected");
        };

        this.runtime.onDisconnected = event => {
            logging.debug("> Runtime disconnected");

            const TIME = 2500;

            if (this.#getConnectionState() === "connected" && this.#reconnecting) {
                logging.debug(`Reconnecting in ${TIME}ms..`);
                this.#setConnectionState("connecting");

                return sleep(TIME)
                    .then(() => {
                        return this.#connect(true);
                    })
                    .then(() => {
                        logging.info("Reconnection successful.");
                        this.#setConnectionState("connected");
                    })
                    .catch(error => {
                        logging.warn("Reconnection failed:", error);
                        this.#setConnectionState("disconnected");
                    });
            } else {
                this.#setConnectionState("disconnected");
            }
        };

        // auto clock sync loop
        setInterval(() => {
            // TODO move this to runtime
            if (!this.#updating && this.runtime.connector) {
                // this.connected().then(connected => {
                //   if (connected) {
                //     this.syncClock().then(() => {
                //       return this.syncTimeline();
                //     }).catch(error => {
                //       logging.warn("Catched error:", error);
                //     });
                //   }
                // });

                if (this.#getConnectionState() === "connected") {
                    return (
                        this.syncClock()
                            // .then(() => {
                            //   return this.syncTimeline();
                            // })
                            // .then(() => {
                            //   return this.syncEventHistory(); //! this might slow down stuff for Bukanyr
                            // })
                            .catch(error => {
                                logging.warn(error);
                            })
                    );
                } else if (this.#getConnectionState() === "disconnected" && this.#autonomousConnection) {
                    return this.#connect(true).catch(error => {
                        logging.warn(error);
                    });
                }
            }
        }, 60000);
    }

    #setWebSocketConnectionState(websocketConnectionState) {
        switch (websocketConnectionState) {
            case "connecting":
                if (websocketConnectionState !== this.#websocketConnectionState) {
                    logging.warn("> Spectoda connecting");
                    this.#websocketConnectionState = websocketConnectionState;
                    this.runtime.emit("connecting-websockets");
                }
                break;
            case "connected":
                if (websocketConnectionState !== this.#websocketConnectionState) {
                    logging.warn("> Spectoda connected");
                    this.#websocketConnectionState = websocketConnectionState;
                    this.runtime.emit("connected-websockets");
                }
                break;
            case "disconnecting":
                if (websocketConnectionState !== this.#websocketConnectionState) {
                    logging.warn("> Spectoda disconnecting");
                    this.#connectionState = connectionState;
                    this.runtime.emit("disconnecting-websockets");
                }
                break;
            case "disconnected":
                if (websocketConnectionState !== this.#websocketConnectionState) {
                    logging.warn("> Spectoda disconnected");
                    this.#websocketConnectionState = websocketConnectionState;
                    this.runtime.emit("disconnected-websockets");
                }
                break;
            default:
                throw `InvalidState: ${websocketConnectionState}`;
        }
    }

    #setConnectionState(connectionState) {
        switch (connectionState) {
            case "connecting":
                if (connectionState !== this.#connectionState) {
                    logging.warn("> Spectoda connecting");
                    this.#connectionState = connectionState;
                    // TODO find out how to handle hacky instance return or other way so it will also work through websockets
                    this.runtime.emit("connecting" /*{ target: this }*/);
                }
                break;
            case "connected":
                if (connectionState !== this.#connectionState) {
                    logging.warn("> Spectoda connected");
                    this.#connectionState = connectionState;
                    // TODO find out how to handle hacky instance return or other way so it will also work through websockets
                    this.runtime.emit("connected" /*{ target: this }*/);
                }
                break;
            case "disconnecting":
                if (connectionState !== this.#connectionState) {
                    logging.warn("> Spectoda disconnecting");
                    this.#connectionState = connectionState;
                    // TODO find out how to handle hacky instance return or other way so it will also work through websockets
                    this.runtime.emit("disconnecting" /*{ target: this }*/);
                }
                break;
            case "disconnected":
                if (connectionState !== this.#connectionState) {
                    logging.warn("> Spectoda disconnected");
                    this.#connectionState = connectionState;
                    // TODO find out how to handle hacky instance return or other way so it will also work through websockets
                    this.runtime.emit("disconnected" /*{ target: this }*/);
                }
                break;
            default:
                logging.error("#setConnectionState(): InvalidState");
                throw "InvalidState";
        }
    }

    #getConnectionState() {
        return this.#connectionState;
    }

    #setOwnerSignature(ownerSignature) {
        const reg = ownerSignature.match(/([\dabcdefABCDEF]{32})/g);

        if (!reg[0]) {
            throw "InvalidSignature";
        }

        this.#ownerSignature = reg[0];
        return true;
    }

    #setOwnerKey(ownerKey) {
        const reg = ownerKey.match(/([\dabcdefABCDEF]{32})/g);

        if (!reg[0]) {
            throw "InvalidKey";
        }

        this.#ownerKey = reg[0];
        return true;
    }

    requestWakeLock(prioritized = false) {
        logging.debug("> Activating wakeLock...");

        if (prioritized) {
            this.#isPrioritizedWakelock = true;
        }

        try {
            if (detectNode()) {
                // NOP
            } else if (detectSpectodaConnect()) {
                window.flutter_inappwebview.callHandler("setWakeLock", true);
            } else {
                navigator.wakeLock
                    .request("screen")
                    .then(Wakelock => {
                        logging.info("Web Wakelock activated.");
                        this.#wakeLock = Wakelock;
                    })
                    .catch(() => {
                        logging.warn("Web Wakelock activation failed.");
                    });
            }
            return Promise.resolve();
        } catch (e) {
            return Promise.reject(e);
        }
    }

    releaseWakeLock(prioritized = false) {
        logging.debug("> Deactivating wakeLock...");

        if (prioritized) {
            this.#isPrioritizedWakelock = false;
        } else if (this.#isPrioritizedWakelock) {
            return Promise.resolve();
        }

        try {
            if (detectNode()) {
                // NOP
            } else if (detectSpectodaConnect()) {
                window.flutter_inappwebview.callHandler("setWakeLock", false);
            } else {
                this.#wakeLock
                    ?.release()
                    .then(() => {
                        logging.info("Web Wakelock deactivated.");
                        this.#wakeLock = null;
                    })
                    .catch(() => {
                        logging.warn("Web Wakelock deactivation failed.");
                    });
            }
            return Promise.resolve();
        } catch (e) {
            return Promise.reject(e);
        }
    }

    /**
     * @deprecated choose connector in the connect() function
     */
    //! DEPRECATED setConnector() -> connect(connectorType, ...)
    setConnector(connector_type) {
        logging.error("setConnector() is deprecated");

        return this.runtime.assignConnector(connector_type);
    }

    /**
     * @alias this.setConnector
     * @deprecated choose connector in the connect() function
     */
    //! DEPRECATED assignConnector() -> connect(connectorType, ...)
    assignConnector(connector_type) {
        logging.error("assignConnector() is deprecated");

        return this.setConnector(connector_type);
    }

    /**
    * @deprecated use setNetwork() instead
    */
    //! DEPRECATED assignOwnerSignature() -> writeNetwork()
    assignOwnerSignature(ownerSignature) {
        logging.error("assignOwnerSignature() is deprecated");

        return this.#setOwnerSignature(ownerSignature);
    }

    /**
    * @deprecated use setNetwork() instead
    */
    //! DEPRECATED setOwnerSignature() -> writeNetwork()
    setOwnerSignature(ownerSignature) {
        logging.error("setOwnerSignature() is deprecated");

        return this.#setOwnerSignature(ownerSignature);
    }

    /**
     * @deprecated use getNetwork() instead
     */
    //! DEPRECATED getOwnerSignature() -> readNetwork()
    getOwnerSignature() {
        logging.error("setOwnerSignature() is deprecated");

        return this.#ownerSignature;
    }

    /**
    * @deprecated use setNetwork() instead
    */
    //! DEPRECATED assignOwnerKey() -> writeNetwork()
    assignOwnerKey(ownerKey) {
        logging.error("assignOwnerKey() is deprecated");

        return this.#setOwnerKey(ownerKey);
    }

    /**
    * @deprecated use setNetwork() instead
    */
    //! DEPRECATED assignOwnerKey() -> writeNetwork()
    setOwnerKey(ownerKey) {
        logging.error("setOwnerKey() is deprecated");

        return this.#setOwnerKey(ownerKey);
    }

    /**
    * @deprecated use getNetwork() instead
    */
    //! DEPRECATED getOwnerKey() -> readNetwork()
    getOwnerKey() {
        logging.error("getOwnerKey() is deprecated");

        return this.#ownerKey;
    }

    //! please move this function elsewhere 
    fetchClients() {
        if (this.socket) return this.socket.emitWithAck("list-all-clients");
    }

    /**
     * @param {Object} options
     * @param {string?} options.signature - The network signature.
     * @param {string?} options.key - The network key.
     * @param {boolean?} [options.sessionOnly] - Whether to enable remote control for the current session only.
     * @param {{
     *   user?: {
     *     name?: string,
     *     email?: string,
     *     image?: string
     *   },
     *   app?: {
     *     name?: string,
     *     version?: string,
     *     commitHash?: string,
     *     url?: string
     *   },
     *   [key: string]: any
     * }} [options.meta] - Optional metadata about the user and the app.
     */
    async enableRemoteControl({ signature, key, sessionOnly, meta }) {
        logging.debug("> Connecting to Remote Control", { signature, key, sessionOnly });

        this.#proxyEventsEmitterRefUnsub && this.#proxyEventsEmitterRefUnsub();

        // Disconnect and clean up the previous socket if it exists
        if (this.socket) {
            this.socket.removeAllListeners(); // Removes all listeners attached to the socket
            this.socket.disconnect();
        }

        // Initialize a new socket connection
        this.socket = io(WEBSOCKET_URL, {
            parser: customParser,
        });

        this.socket.connect();
        this.requestWakeLock(true);

        const setConnectionSocketData = async () => {
            const peers = await this.getConnectedPeersInfo().catch(() => {
                return [];
            });
            logging.debug("peers", peers);
            this.socket.emit("set-connectedMacs-data", peers);
        };

        // Reset event listeners for 'connected' and 'disconnected'
        this.on("connected", async () => {
            setConnectionSocketData();
        });

        this.on("disconnected", () => {
            this.socket.emit("set-connectedMacs-data", null);
        });

        return await new Promise((resolve, reject) => {
            this.socket.on("disconnect", () => {
                this.#setWebSocketConnectionState("disconnected");
            });

            this.socket.on("connect", async () => {
                if (sessionOnly) {
                    // Handle session-only logic
                    const response = await this.socket.emitWithAck("join-session", null);
                    const roomNumber = response?.roomNumber;

                    if (response?.status === "success") {
                        this.#setWebSocketConnectionState("connected");
                        setConnectionSocketData();

                        logging.debug("Remote control session joined successfully", roomNumber);

                        resolve({ status: "success", roomNumber });
                    } else {
                        this.#setWebSocketConnectionState("disconnected");
                        logging.debug("Remote control session join failed, does not exist");
                    }
                } else if (signature) {
                    // Handle signature-based logic
                    this.#setWebSocketConnectionState("connecting");
                    await this.socket
                        .emitWithAck("join", { signature, key })
                        .then(e => {
                            this.#setWebSocketConnectionState("connected");
                            setConnectionSocketData();

                            logging.info("> Connected and joined network remotely");

                            resolve({ status: "success" });
                        })
                        .catch(e => {
                            this.#setWebSocketConnectionState("disconnected");
                        });
                }

                this.#setWebSocketConnectionState("connecting");
                await this.socket
                    .emitWithAck("join", { signature, key })
                    .then(e => {
                        this.#setWebSocketConnectionState("connected");
                        setConnectionSocketData();
                    })
                    .catch(e => {
                        this.#setWebSocketConnectionState("disconnected");
                    });

                logging.info("> Connected and joined network remotely");

                let deviceType = "browser";

                if (detectNode()) {
                    deviceType = "gateway";
                } else if (detectSpectodaConnect()) {
                    deviceType = "spectoda-connect";
                }

                this.socket.emit("set-device-info", { deviceType });

                this.socket.emit("set-meta-data", meta);

                resolve({ status: "success" });

                logging.info("> Listening for events", allEventsEmitter);
                globalThis.allEventsEmitter = allEventsEmitter;

                allEventsEmitter.on("on", ({ name, args }) => {
                    logging.verbose("on", name, args);
                    this.socket.emit("event", { name, args });
                });

                this.socket.on("func", async (payload, callback) => {
                    if (!callback) {
                        logging.error("No callback provided");
                        return;
                    }

                    let { functionName, arguments: args } = payload;

                    // call internal class function await this[functionName](...args)

                    // call internal class function
                    try {
                        if (functionName === "debug") {
                            logging.debug(...args);
                            return callback({ status: "success", message: "debug", payload: args });
                        }
                        if (functionName === "assignOwnerSignature" || functionName === "assignOwnerKey") {
                            return callback({ status: "success", message: "assign key/signature is ignored on remote." });
                        }

                        if (functionName === "updateDeviceFirmware" || functionName === "updateNetworkFirmware") {
                            if (Array.isArray(args?.[0])) {
                                args[0] = new Uint8Array(args[0]);
                            } else if (typeof args?.[0] === "object") {
                                const arr = Object.values(args[0]);
                                const uint8Array = new Uint8Array(arr);
                                args[0] = uint8Array;
                            }
                        }
                        const result = await this[functionName](...args);
                        callback({ status: "success", result });
                    } catch (e) {
                        logging.error(e);
                        callback({ status: "error", error: e });
                    }
                });
            });
        });
    }

    disableRemoteControl() {
        logging.debug("> Disonnecting from the Remote Control");

        this.releaseWakeLock(true);
        this.socket?.disconnect();
    }

    // valid UUIDs are in range [1..4294967295] (32-bit unsigned number)
    #getUUID() {
        if (this.#uuidCounter >= 4294967295) {
            this.#uuidCounter = 0;
        }

        return ++this.#uuidCounter;
    }

    /**
     * @name addEventListener
     * @param {string} event
     * @param {Function} callback
     *
     * events: "disconnected", "connected"
     *
     * all events: event.target === the sender object (SpectodaWebBluetoothConnector)
     * event "disconnected": event.reason has a string with a disconnect reason
     *
     * @returns {Function} unbind function
     */

    addEventListener(event, callback) {
        return this.runtime.addEventListener(event, callback);
    }
    /**
     * @alias this.addEventListener
     */
    on(event, callback) {
        return this.runtime.on(event, callback);
    }

    // každé spectoda zařízení může být spárováno pouze s jedním účtem. (jednim user_key)
    // jakmile je sparovana, pak ji nelze prepsat novým učtem.
    // filtr pro pripojovani k zarizeni je pak účet.

    // adopt != pair
    // adopt reprezentuje proces, kdy si webovka osvoji nove zarizeni. Tohle zarizeni, ale uz
    // muze byt spárováno s telefonem / SpectodaConnectem

    // pri adoptovani MUSI byt vsechny zarizeni ze skupiny zapnuty.
    // vsechny zarizeni totiz MUSI vedet o vsech.
    // adopt() {
    // const BLE_OPTIONS = {
    //   //acceptAllDevices: true,
    //   filters: [
    //     { services: [this.TRANSMITTER_SERVICE_UUID] },
    //     // {services: ['c48e6067-5295-48d3-8d5c-0395f61792b1']},
    //     // {name: 'ExampleName'},
    //   ],
    //   //optionalServices: [this.TRANSMITTER_SERVICE_UUID],
    // };
    // //
    // return this.connector
    //   .adopt(BLE_OPTIONS).then((device)=> {
    //     // ulozit device do local storage jako json
    //   })
    //   .catch((error) => {
    //     logging.warn(error);
    //   });
    // }

    scan(scan_criteria = [{}], scan_period = 5000) {
        logging.verbose(`scan(scan_criteria=${scan_criteria}, scan_period=${scan_period})`);

        logging.debug("> Scanning Spectoda Controllers...");
        return this.runtime.scan(scan_criteria, scan_period);
    }

    /**
     * @deprecated
     */
    //! DEPRECATED - use scan() followed by connect() followed by setNetwork()
    adopt(newDeviceName = null, newDeviceId = null, tnglCode = null, ownerSignature = null, ownerKey = null, autoSelect = false) {
        logging.verbose(`adopt(newDeviceName=${newDeviceName}, newDeviceId=${newDeviceId}, tnglCode=${tnglCode}, ownerSignature=${ownerSignature}, ownerKey=${ownerKey}, autoSelect=${autoSelect})`);

        logging.error("adopt() is deprecated");

        if (this.#adopting) {
            return Promise.reject("AdoptingInProgress");
        }

        this.#adopting = true;

        this.#setConnectionState("connecting");

        const criteria = /** @type {any} */ ([{ adoptionFlag: true }]);

        return (autoSelect ? this.runtime.autoSelect(criteria, 4000) : this.runtime.userSelect(criteria, 60000))
            .then(() => {
                return this.runtime.connect(10000, true);
            })
            .then(() => {
                const owner_signature_bytes = hexStringToUint8Array(this.#ownerSignature, 16);
                const owner_key_bytes = hexStringToUint8Array(this.#ownerKey, 16);

                logging.verbose("owner_signature_bytes", owner_signature_bytes);
                logging.verbose("owner_key_bytes", owner_key_bytes);

                const request_uuid = this.#getUUID();
                const bytes = [COMMAND_FLAGS.FLAG_ADOPT_REQUEST, ...numberToBytes(request_uuid, 4), ...owner_signature_bytes, ...owner_key_bytes /*, ...device_name_bytes, ...numberToBytes(device_id, 1)*/];

                logging.debug("> Adopting device...");
                logging.verbose(bytes);

                return this.runtime
                    .request(bytes, true)
                    .then(response => {
                        let reader = new TnglReader(response);

                        logging.verbose("response=", response);

                        if (reader.readFlag() !== COMMAND_FLAGS.FLAG_ADOPT_RESPONSE) {
                            throw "InvalidResponse";
                        }

                        const response_uuid = reader.readUint32();
                        if (response_uuid != request_uuid) {
                            throw "InvalidResponse";
                        }

                        const error_code = reader.readUint8();

                        let device_mac = "00:00:00:00:00:00";
                        if (error_code === 0) {
                            // error_code 0 is success
                            const device_mac_bytes = reader.readBytes(6);

                            device_mac = Array.from(device_mac_bytes, function (byte) {
                                return ("0" + (byte & 0xff).toString(16)).slice(-2);
                            }).join(":");
                        }

                        logging.verbose(`error_code=${error_code}, device_mac=${device_mac}`);

                        if (error_code === 0) {
                            logging.info(`Adopted ${device_mac} successfully`);

                            return {
                                mac: device_mac,
                                ownerSignature: this.#ownerSignature,
                                ownerKey: this.#ownerKey,
                                // name: newDeviceName,
                                // id: newDeviceId,
                            };
                        }

                        if (error_code !== 0) {
                            logging.warn("Adoption refused.");
                            window.alert(t("Zkuste to, prosím, znovu."), t("Přidání se nezdařilo"), { confirm: t("OK") });

                            throw "AdoptionRefused";
                        }
                    })
                    .catch(e => {
                        logging.error("Error during adopt():", e);
                        this.disconnect().finally(() => {
                            // @ts-ignore
                            throw "AdoptionFailed";
                        });
                    });
            })
            .catch(error => {
                logging.warn("Error during adopt:", error);
                if (error === "UserCanceledSelection") {
                    return this.connected().then(result => {
                        if (!result) throw "UserCanceledSelection";
                    });
                }
            })
            .finally(() => {
                this.#adopting = false;
                this.#setConnectionState("disconnected");
            });
    }

    // devices: [ {name:"Lampa 1", mac:"12:34:56:78:9a:bc"}, {name:"Lampa 2", mac:"12:34:56:78:9a:bc"} ]

    #connect(autoConnect) {
        logging.verbose(`#connect(autoConnect=${autoConnect})`);

        logging.debug("> Connecting Spectoda Controller");

        this.#setConnectionState("connecting");

        logging.debug("> Selecting controller...");
        return (autoConnect ? this.runtime.autoSelect(this.#criteria, 1000, 10000) : this.runtime.userSelect(this.#criteria))
            .then(() => {
                logging.debug("> Connecting controller...");
                return this.runtime.connect();
            })
            .then(connectedDeviceInfo => {
                logging.debug("> Synchronizing Network State...");
                return (this.timeline.paused() ? this.requestTimeline() : this.syncTimeline())
                    .catch(e => {
                        logging.error("Timeline sync after reconnection failed:", e);
                    })
                    .then(() => {
                        return this.syncEventHistory();
                    })
                    .catch(e => {
                        logging.error("History sync after reconnection failed:", e);
                    })
                    .then(() => {
                        return this.runtime.connected();
                    })
                    .then(connected => {
                        if (!connected) {
                            throw "ConnectionFailed";
                        }
                        this.#setConnectionState("connected");
                        return connectedDeviceInfo;
                    });
            })
            .catch(error => {
                logging.error("Error during connect():", error);

                this.#setConnectionState("disconnected");

                if (typeof error != "string") {
                    throw "ConnectionFailed";
                } else {
                    throw error;
                }
            });
    }

    //! FUNCTION ROLE CHANGED
    //! PARAMETERS CHANGED
    connect(criteria = null, autoConnect = true, ownerSignature = null, ownerKey = null, connectAny = false, fwVersion = "", autonomousConnection = false, overrideConnection = false) {
        logging.verbose(
            `connect(criteria=${criteria}, autoConnect=${autoConnect}, ownerSignature=${ownerSignature}, ownerKey=${ownerKey}, connectAny=${connectAny}, fwVersion=${fwVersion}, autonomousConnection=${autonomousConnection}, overrideConnection=${overrideConnection})`,
        );

        this.#autonomousConnection = autonomousConnection;

        if (!overrideConnection && this.#getConnectionState() === "connecting") {
            return Promise.reject("ConnectingInProgress");
        }

        if (ownerSignature) {
            this.#setOwnerSignature(ownerSignature);
        }

        if (ownerKey) {
            this.#setOwnerKey(ownerKey);
        }

        if (typeof criteria === "string") {
            criteria = JSON.parse(criteria);
        }

        // if criteria is object or array of obects
        if (criteria && typeof criteria === "object") {
            // if criteria is not an array, make it an array
            if (!Array.isArray(criteria)) {
                criteria = [criteria];
            }
        }
        //
        else {
            criteria = [{}];
        }

        if (!connectAny) {
            // add ownerSignature to each criteria
            for (let i = 0; i < criteria.length; i++) {
                criteria[i].ownerSignature = this.#ownerSignature;
            }
        }

        if (typeof fwVersion == "string" && fwVersion.match(/(!?)([\d]+).([\d]+).([\d]+)/)) {
            for (let i = 0; i < criteria.length; i++) {
                criteria[i].fwVersion = fwVersion;
            }
        }

        this.#criteria = criteria;

        return this.#connect(autoConnect);
    }

    disconnect() {
        this.#autonomousConnection = false;

        if (this.#getConnectionState() === "disconnected") {
            Promise.reject("DeviceAlreadyDisconnected");
        }

        logging.debug(`> Disconnecting controller...`);
        this.#setConnectionState("disconnecting");

        return this.runtime.disconnect().finally(() => {
            this.#setConnectionState("disconnected");
        });
    }

    connected() {
        return this.#getConnectionState() === "connected" ? this.runtime.connected() : Promise.resolve(null);
    }

    //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    //! this should be moved to a parser class
    async preprocessTngl(tngl_code) {
        logging.verbose(`preprocessTngl(tngl_code=${tngl_code})`);

        // 1st stage: preprocess the code

        let processed_tngl_code = tngl_code;

        const regexPUBLISH_TNGL_TO_API = /PUBLISH_TNGL_TO_API\s*\(\s*"([^"]*)"\s*,\s*`([^`]*)`\s*\);?/ms;
        const regexINJECT_TNGL_FROM_API = /INJECT_TNGL_FROM_API\s*\(\s*"([^"]*)"\s*\);?/ms;

        for (let requests = 0; requests < 64; requests++) {
            const match = regexPUBLISH_TNGL_TO_API.exec(processed_tngl_code);
            if (!match) {
                break;
            }

            logging.verbose(match);

            const name = match[1];
            const id = encodeURIComponent(name);
            const tngl = match[2];

            try {
                logging.verbose(`sendTnglToApi({ id=${id}, name=${name}, tngl=${tngl} })`);
                await sendTnglToApi({ id, name, tngl });
                processed_tngl_code = processed_tngl_code.replace(match[0], "");
            } catch (e) {
                logging.error(`Failed to send "${name}" to TNGL API`);
                throw "SendTnglToApiFailed";
            }
        }

        for (let requests = 0; requests < 64; requests++) {
            const match = regexINJECT_TNGL_FROM_API.exec(processed_tngl_code);
            if (!match) {
                break;
            }

            logging.verbose(match);

            const name = match[1];
            const id = encodeURIComponent(name);

            try {
                logging.verbose(`fetchTnglFromApiById({ id=${id} })`);
                const response = await fetchTnglFromApiById(id);
                processed_tngl_code = processed_tngl_code.replace(match[0], response.tngl);
            } catch (e) {
                logging.error(`Failed to fetch "${name}" from TNGL API`);
                throw "FetchTnglFromApiFailed";
            }
        }

        // var code = `// Publishing TNGL as "${text_tngl_api_name}":\n/*\n${statements_body}*/\n`;
        // var code = `// Loaded TNGL "${text_tngl_api_name}": \n ${tnglCodeToInject}\n`;

        logging.debug(processed_tngl_code);

        return processed_tngl_code;
    }

    /**
     * Function role changed!
      * Writes TNGL to the network from the currently used controller.
      * Pass TNGL code by string or object: { code: string or bytecode: uint8Array }
      * @param {object | string} tngl
      * @param {string | undefined} tngl.code string or undefined. choose code or bytecode
      * @param {uint8Array | undefined} tngl.bytecode uint8Array or undefined
      */
    //! FUNCTION ROLE CHANGED
    //! PARAMETERS CHANGED
    syncTngl(connection = "*/ff:ff:ff:ff:ff:ff") {
        logging.verbose(`syncTngl(tngl_code=${tngl_code}, tngl_bytes=${tngl_bytes})`);

        if (typeof connection !== "string") {
            logging.error("syncTngl() changed! Did you mean to call writeTngl()?");
        }

        logging.debug("> Syncing Tngl code...");

        if (tngl_code === null && tngl_bytes === null) {
            return Promise.reject("InvalidParameters");
        }

        if (tngl_bytes === null) {
            tngl_bytes = this.#parser.parseTnglCode(tngl_code);
        }

        const reinterpret_bytecode = [COMMAND_FLAGS.FLAG_REINTERPRET_TNGL, ...numberToBytes(this.runtime.clock.millis(), 6), 0, ...numberToBytes(tngl_bytes.length, 4), ...tngl_bytes];
        this.runtime.evaluate(reinterpret_bytecode);

        return this.getTnglFingerprint().then(device_fingerprint => {
            return computeTnglFingerprint(tngl_bytes, "fingerprint").then(new_fingerprint => {
                for (let i = 0; i < device_fingerprint.length; i++) {
                    if (device_fingerprint[i] !== new_fingerprint[i]) {
                        return this.writeTngl(null, tngl_bytes);
                    }
                }
            });
        });
    }

    /**
      * Parameters changed!
      * Writes TNGL to the network from the currently used controller.
      * Pass TNGL code by string or object: { code: string or bytecode: uint8Array }
      * @param {object | string} tngl
      * @param {string | undefined} tngl.code string or undefined. choose code or bytecode
      * @param {uint8Array | undefined} tngl.bytecode uint8Array or undefined
      */
    //! PARAMETERS CHANGED
    writeTngl(tngl) {
        logging.verbose(`writeTngl(tngl_code=${tngl_code}, tngl_bytes=${tngl_bytes})`);

        logging.debug(`> Writing Tngl code...`);

        if (tngl_code === null && tngl_bytes === null) {
            return Promise.reject("InvalidParameters");
        }

        if (tngl_bytes === null) {
            tngl_bytes = this.#parser.parseTnglCode(tngl_code);
        }

        const timeline_flags = this.timeline.paused() ? 0b00010000 : 0b00000000; // flags: [reserved,reserved,reserved,timeline_paused,reserved,reserved,reserved,reserved]
        const timeline_bytecode = [COMMAND_FLAGS.FLAG_SET_TIMELINE, ...numberToBytes(this.runtime.clock.millis(), 6), ...numberToBytes(this.timeline.millis(), 4), timeline_flags];

        const reinterpret_bytecode = [COMMAND_FLAGS.FLAG_REINTERPRET_TNGL, ...numberToBytes(this.runtime.clock.millis(), 6), 0, ...numberToBytes(tngl_bytes.length, 4), ...tngl_bytes];

        const payload = [...timeline_bytecode, ...reinterpret_bytecode];
        return this.runtime.execute(payload, "TNGL").then(() => {
            // logging.debug("Written");
        });
    }

    // event_label example: "evt1"
    // event_value example: 1000
    /**
     *
     * @param {*} event_label
     * @param {number|number[]} device_ids
     * @param {*} force_delivery
  
     * @returns
     */
    /**
     *
     * @param {*} event_label
     * @param {number|number[]} device_ids
     * @param {*} force_delivery
  
     * @returns
     * @deprecated use emitEmptyEvent() instead
     */
    //! DEPRECATED emitEvent() -> emitEmptyEvent()
    emitEvent(event_label, device_ids = [0xff], force_delivery = true) {
        logging.verbose(`emitEvent(label=${event_label},id=${device_ids},force=${force_delivery})`);
        lastEvents[event_label] = { value: null, type: "none" };

        logging.error("emitEvent() is deprecated. Use emitEmptyEvent() instead");

        // clearTimeout(this.#saveStateTimeoutHandle);
        // this.#saveStateTimeoutHandle = setTimeout(() => {
        //   this.saveState();
        // }, 5000);

        const func = device_id => {
            const payload = [COMMAND_FLAGS.FLAG_EMIT_EVENT, ...labelToBytes(event_label), ...numberToBytes(this.runtime.clock.millis() + 10, 6), numberToBytes(device_id, 1)];
            return this.runtime.execute(payload, force_delivery ? null : "E" + event_label + device_id);
        };

        if (typeof device_ids === "object") {
            let promises = device_ids.map(func);
            return Promise.all(promises);
        } else {
            return func(device_ids);
        }
    }

    /**
     * @param {string} event_label
     * @param {number|number[]} event_id
     * @returns {Promise<void>}
     */
    emitEmptyEvent(event_label, event_ids = [0xff]) {
        // TODO
    }

    /**
     * @deprecated - is replaced by history merging and scenes. This function will be removed in future versions
     */
    //! DEPRECATED - no equivalent. Replaced by history merging and scenes
    resendAll() {
        logging.error("resendAll() is deprecated");

        Object.keys(lastEvents).forEach(key => {
            switch (lastEvents[key].type) {
                case "percentage":
                    this.emitPercentageEvent(key, lastEvents[key].value);
                    break;
                case "timestamp":
                    this.emitTimestampEvent(key, lastEvents[key].value);
                    break;
                case "color":
                    this.emitColorEvent(key, lastEvents[key].value);
                    break;
                case "label":
                    this.emitLabelEvent(key, lastEvents[key].value);
                    break;
                case "none":
                    this.emitEvent(key);
                    break;
            }
        });
    }

    // event_label example: "evt1"
    // event_value example: 1000
    /**
     *
     * @param {*} event_label
     * @param {number|number[]} device_ids
     * @param {*} force_delivery 
  
     * @returns
     */
    emitTimestampEvent(event_label, event_value, device_ids = [0xff], force_delivery = false) {
        logging.verbose(`emitTimestampEvent(label=${event_label},value=${event_value},id=${device_ids},force=${force_delivery})`);
        lastEvents[event_label] = { value: event_value, type: "timestamp" };

        // clearTimeout(this.#saveStateTimeoutHandle);
        // this.#saveStateTimeoutHandle = setTimeout(() => {
        //   this.saveState();
        // }, 5000);

        if (event_value > 2147483647) {
            logging.error("Invalid event value");
            event_value = 2147483647;
        }

        if (event_value < -2147483648) {
            logging.error("Invalid event value");
            event_value = -2147483648;
        }

        const func = device_id => {
            const payload = [COMMAND_FLAGS.FLAG_EMIT_TIMESTAMP_EVENT, ...numberToBytes(event_value, 4), ...labelToBytes(event_label), ...numberToBytes(this.runtime.clock.millis() + 10, 6), numberToBytes(device_id, 1)];
            return this.runtime.execute(payload, force_delivery ? null : "E" + event_label + device_id);
        };

        if (typeof device_ids === "object") {
            let promises = device_ids.map(func);
            return Promise.all(promises);
        } else {
            return func(device_ids);
        }
    }

    // event_label example: "evt1"
    // event_value example: "#00aaff"
    /**
     *
     * @param {*} event_label
     * @param {*} event_value
     * @param {number|number[]} device_ids
     * @param {*} force_delivery
     * @returns
     */
    emitColorEvent(event_label, event_value, device_ids = [0xff], force_delivery = false) {
        logging.verbose(`emitColorEvent(label=${event_label},value=${event_value},id=${device_ids},force=${force_delivery})`);
        lastEvents[event_label] = { value: event_value, type: "color" };

        // clearTimeout(this.#saveStateTimeoutHandle);
        // this.#saveStateTimeoutHandle = setTimeout(() => {
        //   this.saveState();
        // }, 5000);

        event_value = cssColorToHex(event_value);

        if (!event_value || !event_value.match(/#[\dabcdefABCDEF]{6}/g)) {
            logging.error("Invalid event value. event_value=", event_value);
            event_value = "#000000";
        }

        const func = device_id => {
            const payload = [COMMAND_FLAGS.FLAG_EMIT_COLOR_EVENT, ...colorToBytes(event_value), ...labelToBytes(event_label), ...numberToBytes(this.runtime.clock.millis() + 10, 6), numberToBytes(device_id, 1)];
            return this.runtime.execute(payload, force_delivery ? null : "E" + event_label + device_id);
        };

        if (typeof device_ids === "object") {
            let promises = device_ids.map(func);
            return Promise.all(promises);
        } else {
            return func(device_ids);
        }
    }

    // event_label example: "evt1"
    // event_value example: 100.0
    /**
     *
     * @param {*} event_label
     * @param {*} event_value
     * @param {number|number[]} device_ids
     * @param {*} force_delivery
     * @returns
     */
    emitPercentageEvent(event_label, event_value, device_ids = [0xff], force_delivery = false) {
        logging.info(`emitPercentageEvent(label=${event_label},value=${event_value},id=${device_ids},force=${force_delivery})`);
        lastEvents[event_label] = { value: event_value, type: "percentage" };

        // clearTimeout(this.#saveStateTimeoutHandle);
        // this.#saveStateTimeoutHandle = setTimeout(() => {
        //   this.saveState();
        // }, 5000);

        if (event_value > 100.0) {
            logging.error("Invalid event value");
            event_value = 100.0;
        }

        if (event_value < -100.0) {
            logging.error("Invalid event value");
            event_value = -100.0;
        }

        const func = device_id => {
            const payload = [COMMAND_FLAGS.FLAG_EMIT_PERCENTAGE_EVENT, ...percentageToBytes(event_value), ...labelToBytes(event_label), ...numberToBytes(this.runtime.clock.millis() + 10, 6), numberToBytes(device_id, 1)];
            return this.runtime.execute(payload, force_delivery ? null : "E" + event_label + device_id);
        };

        if (typeof device_ids === "object") {
            let promises = device_ids.map(func);
            return Promise.all(promises);
        } else {
            return func(device_ids);
        }
    }

    // event_label example: "evt1"
    // event_value example: "label"
    /**
     *
     * @param {*} event_label
     * @param {*} event_value
     * @param {number|number[]} device_ids
     * @param {*} force_delivery
     * @returns 
     */
    emitLabelEvent(event_label, event_value, device_ids = [0xff], force_delivery = false) {
        logging.verbose(`emitLabelEvent(label=${event_label},value=${event_value},id=${device_ids},force=${force_delivery})`);
        lastEvents[event_label] = { value: event_value, type: "label" };

        // clearTimeout(this.#saveStateTimeoutHandle);
        // this.#saveStateTimeoutHandle = setTimeout(() => {
        //   this.saveState();
        // }, 5000);

        if (typeof event_value !== "string") {
            logging.error("Invalid event value");
            event_value = "";
        }

        if (event_value.length > 5) {
            logging.error("Invalid event value");
            event_value = event_value.slice(0, 5);
        }

        const func = device_id => {
            const payload = [COMMAND_FLAGS.FLAG_EMIT_LABEL_EVENT, ...labelToBytes(event_value), ...labelToBytes(event_label), ...numberToBytes(this.runtime.clock.millis() + 10, 6), numberToBytes(device_id, 1)];
            return this.runtime.execute(payload, force_delivery ? null : "E" + event_label + device_id);
        };

        if (typeof device_ids === "object") {
            let promises = device_ids.map(func);
            return Promise.all(promises);
        } else {
            return func(device_ids);
        }
    }

    /**
     * Forces timeline synchronization of the used controller to the network
     * @returns Promise<void>
     */
    //! PARAMETERS UPDATED
    syncTimeline(connection = "*/ff:ff:ff:ff:ff:ff") {
        logging.verbose("syncTimeline()");

        logging.debug(`> Synchronizing timeline to device`);

        const flags = this.timeline.paused() ? 0b00010000 : 0b00000000; // flags: [reserved,reserved,reserved,timeline_paused,reserved,reserved,reserved,reserved]
        const payload = [COMMAND_FLAGS.FLAG_SET_TIMELINE, ...numberToBytes(this.runtime.clock.millis(), 6), ...numberToBytes(this.timeline.millis(), 4), flags];
        return this.runtime.execute(payload, "TMLN");
    }

    /**
     * Forces clock timestamp of the used controller to the network
     * @returns Promise<void>
     */
    //! PARAMETERS UPDATED
    syncClock(connection = "*/ff:ff:ff:ff:ff:ff") {
        logging.debug("> Syncing clock from device");

        return this.runtime.syncClock().then(() => {
            logging.debug("> App clock synchronized");
        });
    }

    /**
     * Forces a state of some source ID to target IDs on the whole network
     * @param {number} sourceId 
     * @param {number|number[]} targetIds
     * @returns 
     */
    //! PARAMETERS UPDATED
    syncState(sourceId, targetIds = 0xff, connection = "*/ff:ff:ff:ff:ff:ff") {
        logging.error("syncState() is deprecated use applyState() instead");

        logging.debug("> Synchronizing state...");

        const request_uuid = this.#getUUID();
        const device_request = [COMMAND_FLAGS.FLAG_SYNC_STATE_REQUEST, ...numberToBytes(request_uuid, 4), deviceId];
        return this.runtime.request(device_request, false);
    }

    /**
     * Downloads firmware and calls updateDeviceFirmware()
     * @param {string} url - whole URL of the firmware file
     * @deprecated Use writeFirmware() instead
     */
    //! DEPRECATED fetchAndUpdateDeviceFirmware() -> writeFirmware()
    async fetchAndUpdateDeviceFirmware(url) {
        const fw = fetchFirmware(url);

        return this.updateDeviceFirmware(fw);
    }

    /**
     * Downloads firmware and calls updateNetworkFirmware()
     * @param {string} url - whole URL of the firmware file
     * @deprecated Use writeFirmware() instead
     */
    //! DEPRECATED fetchAndUpdateNetworkFirmware() -> writeFirmware()
    async fetchAndUpdateNetworkFirmware(url) {
        const fw = fetchFirmware(url);

        return this.updateNetworkFirmware(fw);
    }

    /**
     * @param {Uint8Array} firmware
     * @returns {Promise<void>}
     * @deprecated Use writeFirmware() instead
     */
    //! DEPRECATED updateDeviceFirmware() -> writeFirmware()
    updateDeviceFirmware(firmware) {
        logging.verbose(`updateDeviceFirmware(firmware.length=${firmware?.length})`);

        logging.debug(`> Updating Controller FW...`);

        if (!firmware || firmware.length < 10000) {
            logging.error("Invalid firmware");
            return Promise.reject("InvalidFirmware");
        }

        return Promise.resolve()
            .then(() => {
                return this.requestWakeLock().catch(e => {
                    logging.error("Failed to acquire wake lock", e);
                });
            })
            .then(() => {
                return this.runtime.updateFW(firmware).finally(() => {
                    return this.runtime.disconnect();
                });
            })
            .finally(() => {
                return this.releaseWakeLock().catch(e => {
                    logging.error("Failed to release wake lock", e);
                });
            });
    }

    /**
     * 
     * @param {Uint8Array} firmware 
     * @returns 
     * @deprecated Use writeFirmware() instead
     */
    //! DEPRECATED updateNetworkFirmware() -> writeFirmware()
    updateNetworkFirmware(firmware) {
        logging.verbose(`updateNetworkFirmware(firmware.length=${firmware?.length})`);

        logging.debug(`> Updating Network FW...`);

        if (!firmware || firmware.length < 10000) {
            logging.error("Invalid firmware");
            return Promise.reject("InvalidFirmware");
        }

        this.#updating = true;

        this.requestWakeLock().catch(e => {
            logging.error("Failed to acquire wake lock", e);
        });

        return new Promise(async (resolve, reject) => {
            // const chunk_size = detectAndroid() ? 480 : 3984; // must be modulo 16
            // const chunk_size = 992; // must be modulo 16
            const chunk_size = detectSpectodaConnect() ? 480 : 3984;

            let index_from = 0;
            let index_to = chunk_size;

            let written = 0;

            setLoggingLevel(logging.level - 1);

            logging.info("OTA UPDATE");
            logging.verbose(firmware);

            const start_timestamp = new Date().getTime();

            await sleep(100);

            try {
                this.runtime.emit("ota_status", "begin");

                {
                    //===========// RESET //===========//
                    logging.info("OTA RESET");

                    const command_bytes = [COMMAND_FLAGS.FLAG_OTA_RESET, 0x00, ...numberToBytes(0x00000000, 4)];
                    await this.runtime.execute(command_bytes, null);
                }

                await sleep(100);

                {
                    //===========// BEGIN //===========//
                    logging.info("OTA BEGIN");

                    const command_bytes = [COMMAND_FLAGS.FLAG_OTA_BEGIN, 0x00, ...numberToBytes(firmware.length, 4)];
                    await this.runtime.execute(command_bytes, null, 20000);
                }

                // TODO optimalize this begin by detecting when all controllers have erased its flash
                // TODO also, right now the gateway controller sends to other controlles to erase flash after it is done.
                // TODO that slows things down
                await sleep(10000);

                {
                    //===========// WRITE //===========//
                    logging.info("OTA WRITE");

                    while (written < firmware.length) {
                        if (index_to > firmware.length) {
                            index_to = firmware.length;
                        }

                        const command_bytes = [COMMAND_FLAGS.FLAG_OTA_WRITE, 0x00, ...numberToBytes(written, 4), ...firmware.slice(index_from, index_to)];
                        await this.runtime.execute(command_bytes, null, 20000);

                        written += index_to - index_from;

                        const percentage = Math.floor((written * 10000) / firmware.length) / 100;
                        logging.info(percentage + "%");
                        this.runtime.emit("ota_progress", percentage);

                        index_from += chunk_size;
                        index_to = index_from + chunk_size;
                    }
                }

                await sleep(1000);

                {
                    //===========// END //===========//
                    logging.info("OTA END");

                    const command_bytes = [COMMAND_FLAGS.FLAG_OTA_END, 0x00, ...numberToBytes(written, 4)];
                    await this.runtime.execute(command_bytes, null, 20000);
                }

                await sleep(3000);

                await this.rebootNetwork();

                logging.debug("> Firmware written in " + (new Date().getTime() - start_timestamp) / 1000 + " seconds");

                this.runtime.emit("ota_status", "success");

                resolve(null);
                return;
            } catch (e) {
                this.runtime.emit("ota_status", "fail");
                reject(e);
                return;
            }
        })
            .then(() => {
                return this.runtime.disconnect();
            })

            .finally(() => {
                this.releaseWakeLock().catch(e => {
                    logging.error("Failed to release wake lock", e);
                });
                this.#updating = false;

                setLoggingLevel(logging.level + 1);
            });
    }

    /**
     * @param {object} object
     * @param {string} object.path
     * @param {string} object.url
     * @param {Uint8Array} object.bytes
     * @returns {Promise<void>}
     */
    writeFirmware({ path, url, bytes }) {
        // TODO
    }


    /**
     * 
     * @param {string} peer 
     * @returns {Promise<void>}
     * @deprecated Use syncFirmware() instead 
     */
    //! DEPRECATED updatePeerFirmware() -> syncFirmware()
    async updatePeerFirmware(peer) {
        logging.verbose(`updatePeerFirmware(peer=${peer})`);

        logging.error("updatePeerFirmware() is deprecated. Use syncFirmware() instead");

        if (peer === null || peer === undefined) {
            // Prompt the user to enter a MAC address
            peer = await prompt("Please enter a valid MAC address:", "00:00:00:00:00:00");
        }

        // Validate the input to ensure it is a valid MAC address
        if (!/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/.test(peer)) {
            // If the input is invalid, display an error message and return null
            throw "InvalidMacAdress";
        }

        const request_uuid = this.#getUUID();
        const bytes = [COMMAND_FLAGS.FLAG_FW_UPDATE_PEER_REQUEST, ...numberToBytes(request_uuid, 4), ...strMacToBytes(peer)];

        return this.runtime.request(bytes, true).then(response => {
            let reader = new TnglReader(response);

            logging.verbose(`response.byteLength=${response.byteLength}`);

            if (reader.readFlag() !== COMMAND_FLAGS.FLAG_FW_UPDATE_PEER_RESPONSE) {
                throw "InvalidResponseFlag";
            }

            const response_uuid = reader.readUint32();

            if (response_uuid != request_uuid) {
                throw "InvalidResponseUuid";
            }

            const error_code = reader.readUint8();

            logging.verbose(`error_code=${error_code}`);

            if (error_code === 0) {
                logging.info(`Update sucessful`);
            } else {
                throw "Fail";
            }
        });
    }

    /**
     * Synchonizes firmware of the used controller to given connection
     * @param {string} connection
     * @returns {Promise<void>}
     */
    syncFirmware(connection) {
        // TODO
    }

    /**
     * @returns {Promise} config;
     * @deprecated use readConfig() instead
     */
    //! DEPRECATED readNetworkConfig() -> readConfig()
    readDeviceConfig(mac = "ee:33:fa:89:08:08") {
        logging.verbose(`readDeviceConfig(mac=${mac})`);

        logging.error("readDeviceConfig() is deprecated. Use readConfig() instead");

        logging.debug("> Reading device config...");

        const request_uuid = this.#getUUID();
        const bytes = [COMMAND_FLAGS.FLAG_DEVICE_CONFIG_REQUEST, ...numberToBytes(request_uuid, 4)];

        return this.runtime.request(bytes, true).then(response => {
            let reader = new TnglReader(response);

            logging.verbose(`response.byteLength=${response.byteLength}`);

            if (reader.readFlag() !== COMMAND_FLAGS.FLAG_DEVICE_CONFIG_RESPONSE) {
                throw "InvalidResponseFlag";
            }

            const response_uuid = reader.readUint32();

            if (response_uuid != request_uuid) {
                throw "InvalidResponseUuid";
            }

            const error_code = reader.readUint8();

            logging.verbose(`error_code=${error_code}`);

            if (error_code === 0) {
                const config_size = reader.readUint32();
                logging.verbose(`config_size=${config_size}`);

                const config_bytes = reader.readBytes(config_size);
                logging.verbose(`config_bytes=${config_bytes}`);

                const decoder = new TextDecoder();
                const config = decoder.decode(new Uint8Array(config_bytes));
                logging.verbose(`config=${config}`);

                if (config.charAt(config.length - 1) == "\0") {
                    logging.warn("NULL config character detected");
                    return config.slice(0, config.length - 1);
                }

                return config;
            } else {
                throw "Fail";
            }
        });
    }

    /** 
     * Reads config of currently used controller.
     * @returns {Promise<string>} config;
     */
    readConfig() {
        // TODO
    }

    /**
     * @param {string} config;
     * @deprecated use writeConfig() instead
     */
    //! DEPRECATED updateDeviceConfig() -> writeConfig()
    updateDeviceConfig(config_raw) {
        logging.verbose(`updateDeviceConfig(config_raw=${config_raw})`);

        logging.error("updateDeviceConfig() is deprecated. Use writeConfig() instead");

        logging.debug("> Updating config...");

        const condif_object = JSON.parse(config_raw);
        const config = JSON.stringify(condif_object);

        logging.verbose(`config=${config}`);

        const encoder = new TextEncoder();
        const config_bytes = encoder.encode(config);
        const config_bytes_size = config.length;

        // make config update request
        const request_uuid = this.#getUUID();
        const bytes = [COMMAND_FLAGS.FLAG_CONFIG_UPDATE_REQUEST, ...numberToBytes(request_uuid, 4), ...numberToBytes(config_bytes_size, 4), ...config_bytes];
        return this.runtime.request(bytes, true).then(response => {
            let reader = new TnglReader(response);

            logging.verbose(`response.byteLength=${response.byteLength}`);

            if (reader.readFlag() !== COMMAND_FLAGS.FLAG_CONFIG_UPDATE_RESPONSE) {
                throw "InvalidResponse";
            }

            const response_uuid = reader.readUint32();

            if (response_uuid != request_uuid) {
                throw "InvalidResponse";
            }

            const error_code = reader.readUint8();

            logging.verbose(`error_code=${error_code}`);

            if (error_code === 0) {
                logging.info("Write Config Success");
                // reboot device
                const payload = [COMMAND_FLAGS.FLAG_DEVICE_REBOOT_REQUEST];
                return this.runtime.request(payload, false);
            } else {
                throw "Fail";
            }
        });
    }

    // spectoda._writeConfig(["bluetooth/12:23:34:45:67:78", "*/ff:ff:ff:ff:ff:ff"], "{}");

    /**
     * @param {string} config;
     * @deprecated use spectoda.use(connection).useAllConnections().writeConfig() instead
     */
    //! DEPRECATED updateNetworkConfig() -> writeConfig()
    updateNetworkConfig(config) {
        logging.verbose(`updateNetworkConfig(config=${config})`);

        logging.error("updateNetworkConfig() is deprecated. Use writeConfig() instead");

        logging.debug("> Updating config of whole network...");

        const encoder = new TextEncoder();
        const config_bytes = encoder.encode(config);
        const config_bytes_size = config.length;

        // make config update request
        const request_uuid = this.#getUUID();
        const request_bytes = [COMMAND_FLAGS.FLAG_CONFIG_UPDATE_REQUEST, ...numberToBytes(request_uuid, 4), ...numberToBytes(config_bytes_size, 4), ...config_bytes];

        return this.runtime.execute(request_bytes, "CONF").then(() => {
            logging.debug("> Rebooting network...");
            const command_bytecode = [COMMAND_FLAGS.FLAG_DEVICE_REBOOT_REQUEST];
            return this.runtime.execute(command_bytecode, null);
        });
    }

    /**
     * writes spectoda config to the controller
     * @param {string} config
     * @returns {Promise<void>}
     */
    writeConfig(config) {
        // TODO
    }

    /**
     * @returns {Promise<TimeTrack>}
     * @deprecated use readTimeline() instead 
     */
    //! DEPRECATED requestTimeline() -> readTimeline()
    requestTimeline() {
        logging.verbose(`requestTimeline()`);

        logging.error("requestTimeline() is deprecated. Use readTimeline() instead");

        logging.debug("> Requesting timeline...");

        const request_uuid = this.#getUUID();
        const bytes = [COMMAND_FLAGS.FLAG_TIMELINE_REQUEST, ...numberToBytes(request_uuid, 4)];

        return this.runtime.request(bytes, true).then(response => {
            logging.verbose(`response.byteLength=${response.byteLength}`);

            let reader = new TnglReader(response);

            if (reader.readFlag() !== COMMAND_FLAGS.FLAG_TIMELINE_RESPONSE) {
                throw "InvalidResponseFlag";
            }

            const response_uuid = reader.readUint32();

            if (response_uuid != request_uuid) {
                throw "InvalidResponseUuid";
            }

            const error_code = reader.readUint8();

            const clock_timestamp = reader.readUint48();
            const timeline_timestamp = reader.readInt32();
            const timeline_paused = reader.readUint8();

            logging.verbose(`clock_timestamp=${clock_timestamp}, timeline_timestamp=${timeline_timestamp}, timeline_paused=${timeline_paused}`);

            if (timeline_paused) {
                this.timeline.setState(timeline_timestamp, true);
            } else {
                this.timeline.setState(timeline_timestamp + (this.runtime.clock.millis() - clock_timestamp), false);
            }
        });
    }

    /**
     * @returns {Promise<TimeTrack>}
     */
    readTimeline() {
        // TODO
    }

    /**
     * @returns {Promise<void>}
     * @deprecated use spectoda.use(connection).useAllConnections().restart() instead
     */
    //! DEPRECATED rebootNetwork() -> requestRestart()
    rebootNetwork() {
        logging.debug("> Rebooting network...");

        const payload = [COMMAND_FLAGS.FLAG_DEVICE_REBOOT_REQUEST];
        return this.runtime.execute(payload, null);
    }

    /**
     * @returns {Promise<void>}
     * @deprecated use spectoda.use(connection).requestRestart() instead
     */
    //! DEPRECATED rebootDevice() -> requestRestart()
    rebootDevice() {
        logging.debug("> Rebooting device...");

        const payload = [COMMAND_FLAGS.FLAG_DEVICE_REBOOT_REQUEST];
        return this.runtime.request(payload, false);
    }

    /**
     * @returns {Promise<void>}
     * @deprecated use spectoda.use(connection).requestRestart() instead
     */
    //! DEPRECATED rebootAndDisconnectDevice() -> requestRestart() then disconnect()
    rebootAndDisconnectDevice() {
        logging.debug("> Rebooting and disconnecting device...");

        const payload = [COMMAND_FLAGS.FLAG_DEVICE_REBOOT_REQUEST];
        return this.runtime.request(payload, false).then(() => {
            return this.disconnect();
        });
    }

    /**
     * This restarts the webassembly spectodas or reboots physical spectoda controllers
     * @returns {Promise<void>}
     */
    requestRestart() {
        // TODO
    }

    /**
     * @returns {Promise<void>}
     * @deprecated use spectoda.use(connection).eraseNetwork() instead
     */
    //! DEPRECATED removeOwner() -> eraseNetwork()
    removeOwner() {
        logging.debug("> Removing owner...");

        const request_uuid = this.#getUUID();
        const bytes = [COMMAND_FLAGS.FLAG_ERASE_OWNER_REQUEST, ...numberToBytes(request_uuid, 4)];

        return this.runtime.request(bytes, true).then(response => {
            let reader = new TnglReader(response);

            logging.verbose(`response.byteLength=${response.byteLength}`);

            if (reader.readFlag() !== COMMAND_FLAGS.FLAG_ERASE_OWNER_RESPONSE) {
                throw "InvalidResponseFlag";
            }

            const response_uuid = reader.readUint32();

            if (response_uuid != request_uuid) {
                throw "InvalidResponseUuid";
            }

            const error_code = reader.readUint8();

            logging.verbose(`error_code=${error_code}`);

            if (error_code !== 0) {
                throw "OwnerEraseFailed";
            }

            const removed_device_mac_bytes = reader.readBytes(6);

            return this.rebootDevice()
                .catch(() => { })
                .then(() => {
                    let removed_device_mac = "00:00:00:00:00:00";
                    if (removed_device_mac_bytes.length >= 6) {
                        removed_device_mac = Array.from(removed_device_mac_bytes, function (byte) {
                            return ("0" + (byte & 0xff).toString(16)).slice(-2);
                        }).join(":");
                    }
                    return {
                        mac: removed_device_mac !== "00:00:00:00:00:00" ? removed_device_mac : null,
                    };
                });
        });
    }

    /**
     * 
     * @returns {Promise<void>}
     * @deprecated use spectoda.use(connection).useAllConnections().eraseNetwork() instead
     */
    //! DEPRECATED removeNetworkOwner() -> eraseNetwork()
    removeNetworkOwner() {
        logging.debug("> Removing network owner...");

        const request_uuid = this.#getUUID();
        const bytes = [COMMAND_FLAGS.FLAG_ERASE_OWNER_REQUEST, ...numberToBytes(request_uuid, 4)];

        return this.runtime.execute(bytes, true).then(() => {
            return this.rebootNetwork();
        });
    }

    /**
     * Removes spectoda network of the given controller
     * @returns {Promise<void>}
     */
    eraseNetwork() {
        // TODO
    }

    /** 
     * @returns {Promise<string>}
     * @deprecated Use spectoda.use(connection).readVersion() instead
     */
    //! DEPRECATED getFwVersion() -> readVersion()
    getFwVersion() {
        logging.verbose(`getFwVersion()`);

        logging.error("getFwVersion() is deprecated. Use readVersion() instead");

        logging.debug("> Requesting fw version...");

        const request_uuid = this.#getUUID();
        const bytes = [COMMAND_FLAGS.FLAG_FW_VERSION_REQUEST, ...numberToBytes(request_uuid, 4)];

        return this.runtime.request(bytes, true).then(response => {
            let reader = new TnglReader(response);

            logging.verbose(`response.byteLength=${response.byteLength}`);

            if (reader.readFlag() !== COMMAND_FLAGS.FLAG_FW_VERSION_RESPONSE) {
                throw "InvalidResponseFlag";
            }

            const response_uuid = reader.readUint32();

            if (response_uuid != request_uuid) {
                throw "InvalidResponseUuid";
            }

            const error_code = reader.readUint8();

            logging.verbose(`error_code=${error_code}`);

            let version = null;

            if (error_code === 0) {
                version = reader.readString(32);
            } else {
                throw "Fail";
            }
            logging.verbose(`version=${version}`);

            logging.info(`FW Version: ${version}`);

            return version.trim();
        });
    }

    /**
     * Gets a spectoda version of given controller
     * @returns {Promise<string>}
     */
    readVersion() {
        // TODO
    }

    /**
     * 
     * @deprecated Use readTnglFingerprint() instead
     */
    //! DEPRECATED getTnglFingerprint() -> readTnglFingerprint()
    getTnglFingerprint() {
        logging.debug("> Getting TNGL fingerprint...");

        const request_uuid = this.#getUUID();
        const bytes = [COMMAND_FLAGS.FLAG_TNGL_FINGERPRINT_REQUEST, ...numberToBytes(request_uuid, 4), 0];

        return this.runtime.request(bytes, true).then(response => {
            let reader = new TnglReader(response);

            logging.verbose("response:", response);

            if (reader.readFlag() !== COMMAND_FLAGS.FLAG_TNGL_FINGERPRINT_RESPONSE) {
                throw "InvalidResponseFlag";
            }

            const response_uuid = reader.readUint32();

            if (response_uuid != request_uuid) {
                throw "InvalidResponseUuid";
            }

            const error_code = reader.readUint8();

            logging.verbose(`error_code=${error_code}`);

            let fingerprint = null;

            if (error_code === 0) {
                fingerprint = reader.readBytes(32);
            } else {
                throw "Fail";
            }

            logging.verbose(`fingerprint=${fingerprint}`);
            logging.verbose(
                `fingerprint=${Array.from(fingerprint)
                    .map(byte => ("0" + (byte & 0xff).toString(16)).slice(-2))
                    .join(",")}`,
            );

            logging.info("Controller TNGL Fingerprint: " + uint8ArrayToHexString(fingerprint));

            return new Uint8Array(fingerprint);
        });
    }

    readTnglFingerprint() {
        // TODO
    }

    /**
     * 
     * @deprecated 
     */
    //! DEPRECATED - no equivalent
    setNetworkDatarate(datarate) {
        logging.debug(`> Setting network datarate to ${datarate} bsp...`);

        const request_uuid = this.#getUUID();
        const payload = [COMMAND_FLAGS.FLAG_CHANGE_DATARATE_REQUEST, ...numberToBytes(request_uuid, 4), ...numberToBytes(datarate, 4)];

        return this.runtime.execute(payload, null);
    }

    /**
     * 
     * @deprecated 
     */
    //! DEPRECATED - no equivalent
    readRomPhyVdd33() {
        logging.debug("> Requesting rom_phy_vdd33...");

        const request_uuid = this.#getUUID();
        const bytes = [COMMAND_FLAGS.FLAG_ROM_PHY_VDD33_REQUEST, ...numberToBytes(request_uuid, 4)];

        return this.runtime.request(bytes, true).then(response => {
            let reader = new TnglReader(response);

            logging.verbose(`response.byteLength=${response.byteLength}`);

            if (reader.readFlag() !== COMMAND_FLAGS.FLAG_ROM_PHY_VDD33_RESPONSE) {
                throw "InvalidResponseFlag";
            }

            const response_uuid = reader.readUint32();

            if (response_uuid != request_uuid) {
                throw "InvalidResponseUuid";
            }

            const error_code = reader.readUint8();

            logging.verbose(`error_code=${error_code}`);

            let vdd_reading = null;

            if (error_code === 0) {
                vdd_reading = reader.readInt32();
            } else {
                throw "Fail";
            }
            logging.info(`vdd_reading=${vdd_reading}`);

            return vdd_reading;
        });
    }

    /**
     * 
     * @deprecated 
     */
    //! DEPRECATED - no equivalent
    readPinVoltage(pin) {
        logging.debug(`> Requesting pin ${pin} voltage ...`);

        const request_uuid = this.#getUUID();
        const bytes = [COMMAND_FLAGS.FLAG_VOLTAGE_ON_PIN_REQUEST, ...numberToBytes(request_uuid, 4), pin];

        return this.runtime.request(bytes, true).then(response => {
            let reader = new TnglReader(response);

            logging.verbose(`response.byteLength=${response.byteLength}`);

            if (reader.readFlag() !== COMMAND_FLAGS.FLAG_VOLTAGE_ON_PIN_RESPONSE) {
                throw "InvalidResponseFlag";
            }

            const response_uuid = reader.readUint32();

            if (response_uuid != request_uuid) {
                throw "InvalidResponseUuid";
            }

            const error_code = reader.readUint8();

            logging.verbose(`error_code=${error_code}`);

            let pin_reading = null;

            if (error_code === 0) {
                pin_reading = reader.readUint32();
            } else {
                throw "Fail";
            }
            logging.info(`pin_reading=${pin_reading}`);

            return pin_reading;
        });
    }

    /**
     * Change language for modals
     * @param {"en"|"cs"} lng
     */
    setLanguage(lng) {
        changeLanguage(lng);
    }

    setDebugLevel(level) {
        setLoggingLevel(level);
    }

    /**
     * 
     * @deprecated Use readConnectedPeers() instead
     */
    //! DEPRECATED - getConnectedPeersInfo() -> readConnections()
    getConnectedPeersInfo() {
        logging.verbose(`getConnectedPeersInfo()`);

        logging.error("getConnectedPeersInfo() is deprecated. Use readPeers() instead");

        logging.debug("> Requesting connected peers info...");

        const request_uuid = this.#getUUID();
        const bytes = [COMMAND_FLAGS.FLAG_CONNECTED_PEERS_INFO_REQUEST, ...numberToBytes(request_uuid, 4)];

        return this.runtime.request(bytes, true).then(response => {
            let reader = new TnglReader(response);

            logging.verbose(`response.byteLength=${response.byteLength}`);

            if (reader.readFlag() !== COMMAND_FLAGS.FLAG_CONNECTED_PEERS_INFO_RESPONSE) {
                throw "InvalidResponseFlag";
            }

            const response_uuid = reader.readUint32();

            if (response_uuid != request_uuid) {
                throw "InvalidResponseUuid";
            }

            const error_code = reader.readUint8();

            logging.verbose(`error_code=${error_code}`);

            let peers = [];

            if (error_code === 0) {
                let count = reader.readUint16();

                for (let index = 0; index < count; index++) {
                    const mac = reader
                        .readBytes(6)
                        .map(v => v.toString(16).padStart(2, "0"))
                        .join(":");
                    const rssi = reader.readUint16() / (65535.0 / 512.0) - 256.0;
                    peers.push({
                        mac: mac,
                        rssi: rssi,
                    });
                }

                // logging.info(`count=${count}, peers=`, peers);
                logging.info(`count=${count}, peers=\n${peers.map(x => `mac:${x.mac},rssi:${x.rssi}`).join("\n")}`);
                // this.runtime.eraseConnectedPeers();
                // this.runtime.setConnectedPeers(peers.map(x => x.mac));
                return peers;
            } else {
                throw "Fail";
            }
        });
    }

    /**
     * 
     */
    readConnections() {
        // TODO
    }

    /**
     * Synchronizes event history of the used controller to the connection
     * @returns 
     */
    //! PARAMETERS UPDATED
    syncEventHistory(connection = "*/ff:ff:ff:ff:ff:ff") {
        logging.verbose(`syncEventHistory()`);

        logging.debug("> Requesting event history bytecode...");

        const request_uuid = this.#getUUID();
        const bytes = [COMMAND_FLAGS.FLAG_EVENT_HISTORY_BC_REQUEST, ...numberToBytes(request_uuid, 4)];

        return this.runtime.request(bytes, true).then(response => {
            let reader = new TnglReader(response);

            logging.info(`response.byteLength=${response.byteLength}`);

            if (reader.readFlag() !== COMMAND_FLAGS.FLAG_EVENT_HISTORY_BC_RESPONSE) {
                logging.error("InvalidResponseFlag");
                throw "InvalidResponseFlag";
            }

            const response_uuid = reader.readUint32();

            if (response_uuid != request_uuid) {
                logging.error("InvalidResponseUuid");
                throw "InvalidResponseUuid";
            }

            const error_code = reader.readUint8();

            logging.verbose(`error_code=${error_code}`);

            if (error_code === 0) {
                const historic_events_bytecode_size = reader.readUint16();
                logging.verbose(`historic_events_bytecode_size=${historic_events_bytecode_size}`);

                const historic_events_bytecode = reader.readBytes(historic_events_bytecode_size);
                logging.verbose(`historic_events_bytecode=[${historic_events_bytecode}]`);

                this.runtime.evaluate(new Uint8Array(historic_events_bytecode), 0x01);
            } else {
                throw "Fail";
            }
        });
    }

    /**
     * Erases event history on given controller
     * @returns 
     */
    eraseEventHistory() {
        logging.verbose(`eraseEventHistory()`);

        logging.debug("> Erasing event history...");

        const request_uuid = this.#getUUID();
        const bytes = [COMMAND_FLAGS.FLAG_ERASE_EVENT_HISTORY_REQUEST, ...numberToBytes(request_uuid, 4)];

        return this.runtime.execute(bytes, true);
    }

    /**
     * @deprecated use requestSleep() instead
     */
    //! DEPRECATED networkSleep() -> requestSleep()
    deviceSleep() {
        logging.verbose(`deviceSleep()`);

        logging.error("deviceSleep() is deprecated. Use requestSleep() instead");

        logging.debug("> Sleep device...");

        const request_uuid = this.#getUUID();
        const payload = [COMMAND_FLAGS.FLAG_SLEEP_REQUEST, ...numberToBytes(request_uuid, 4)];
        return this.runtime.request(payload, false);
    }

    /**
     * @deprecated use requestSleep() instead
     */
    //! DEPRECATED networkSleep() -> requestSleep()
    networkSleep() {
        logging.debug("> Sleep network...");

        const request_uuid = this.#getUUID();
        const payload = [COMMAND_FLAGS.FLAG_SLEEP_REQUEST, ...numberToBytes(request_uuid, 4)];
        return this.runtime.execute(payload, null);
    }

    /**
     * Sleeps the used controller
     */
    requestSleep() {
        // TODO
    }

    /**
     * 
     */
    //! DEPRECATED saveState() -> requestSaveState()
    saveState() {
        logging.debug("> Saving state...");

        const request_uuid = this.#getUUID();
        const payload = [COMMAND_FLAGS.FLAG_SAVE_STATE_REQUEST, ...numberToBytes(request_uuid, 4)];
        return this.runtime.execute(payload, null);
    }

    requestSaveState() {
        // TODO
    }

    /**
     * @deprecated use readProperties() instead
     */
    //! DEPRECATED getControllerInfo() -> readProperties()
    getControllerInfo() {
        logging.verbose(`getControllerInfo()`);

        logging.error("getControllerInfo() is deprecated. Use readProperties() instead");

        logging.debug("> Requesting controller info...");

        const request_uuid = this.#getUUID();
        const bytes = [DEVICE_FLAGS.FLAG_CONTROLLER_INFO_REQUEST, ...numberToBytes(request_uuid, 4)];

        return this.runtime.request(bytes, true).then(response => {
            let reader = new TnglReader(response);

            logging.verbose("response=", response);

            if (reader.readFlag() !== DEVICE_FLAGS.FLAG_CONTROLLER_INFO_RESPONSE) {
                throw "InvalidResponseFlag";
            }

            const response_uuid = reader.readUint32();

            if (response_uuid != request_uuid) {
                throw "InvalidResponseUuid";
            }

            const error_code = reader.readUint8();

            logging.verbose(`error_code=${error_code}`);

            let pcb_code = null;
            let product_code = null;

            if (error_code === 0) {
                pcb_code = reader.readUint16();
                product_code = reader.readUint16();
            } else {
                throw "Fail";
            }

            logging.info(`pcb_code=${pcb_code}`);
            logging.info(`product_code=${product_code}`);

            return { pcb_code: pcb_code, product_code: product_code };
        });
    }

    /**
     * @deprecated use writeNetwork() instead
     */
    //! DEPRECATED writeOwner() -> writeNetwork()
    writeOwner(ownerSignature = "00000000000000000000000000000000", ownerKey = "00000000000000000000000000000000") {
        logging.verbose("writeOwner(ownerSignature=", ownerSignature, "ownerKey=", ownerKey, ")");

        logging.error("writeOwner() is deprecated. Use writeNetwork() instead");

        logging.debug("> Writing owner to device...");

        const owner_signature_bytes = hexStringToUint8Array(ownerSignature, 16);
        const owner_key_bytes = hexStringToUint8Array(ownerKey, 16);

        logging.verbose("owner_signature_bytes=", owner_signature_bytes);
        logging.verbose("owner_key_bytes=", owner_key_bytes);

        const request_uuid = this.#getUUID();
        const bytes = [COMMAND_FLAGS.FLAG_ADOPT_REQUEST, ...numberToBytes(request_uuid, 4), ...owner_signature_bytes, ...owner_key_bytes];

        logging.verbose(bytes);

        return this.runtime
            .request(bytes, true)
            .then(response => {
                let reader = new TnglReader(response);

                logging.verbose("response=", response);

                if (reader.readFlag() !== COMMAND_FLAGS.FLAG_ADOPT_RESPONSE) {
                    throw "InvalidResponse";
                }

                const response_uuid = reader.readUint32();

                if (response_uuid != request_uuid) {
                    throw "InvalidResponse";
                }

                let device_mac = "null";

                const error_code = reader.readUint8();

                // error_code 0 is success
                if (error_code === 0) {
                    const device_mac_bytes = reader.readBytes(6);

                    device_mac = Array.from(device_mac_bytes, function (byte) {
                        return ("0" + (byte & 0xff).toString(16)).slice(-2);
                    }).join(":");
                }

                logging.verbose(`error_code=${error_code}, device_mac=${device_mac}`);

                if (error_code === 0) {
                    logging.info(`Adopted ${device_mac} successfully`);
                    return {
                        mac: device_mac,
                        ownerSignature: this.#ownerSignature,
                        ownerKey: this.#ownerKey,
                        // name: newDeviceName,
                        // id: newDeviceId,
                    };
                } else {
                    logging.warn("Adoption refused by device.");
                    throw "AdoptionRefused";
                }
            })
            .catch(e => {
                logging.error("Error during writeOwner():", e);
                throw "AdoptionFailed";
            });
    }

    /**
     * @deprecated use writeNetwork() instead
     */
    //! DEPRECATED writeNetworkOwner() -> writeNetwork()
    writeNetworkOwner(ownerSignature = "00000000000000000000000000000000", ownerKey = "00000000000000000000000000000000") {
        logging.verbose("writeNetworkOwner(ownerSignature=", ownerSignature, "ownerKey=", ownerKey, ")");

        logging.error("writeNetworkOwner() is deprecated. Use writeNetwork() instead");

        logging.debug("> Writing owner to network...");

        const owner_signature_bytes = hexStringToUint8Array(ownerSignature, 16);
        const owner_key_bytes = hexStringToUint8Array(ownerKey, 16);

        logging.verbose("owner_signature_bytes", owner_signature_bytes);
        logging.verbose("owner_key_bytes", owner_key_bytes);

        const request_uuid = this.#getUUID();
        const bytes = [COMMAND_FLAGS.FLAG_ADOPT_REQUEST, ...numberToBytes(request_uuid, 4), ...owner_signature_bytes, ...owner_key_bytes];

        logging.verbose(bytes);

        return this.runtime.execute(bytes, true);
    }

    /**
     * 
     */
    writeNetwork({ key, signature }) {
        // TODO
    }

    /**
     * @returns { key, signature }
     */
    readNetwork() {
        // TODO
    }

    /**
     * 
     * @param {*} name 
     * @returns 
     * @deprecated use writeName() instead
     */
    //! DEPRECATED writeControllerName() -> writeName()
    writeControllerName(name) {
        logging.verbose(`writeControllerName(name=${name})`);

        logging.error("writeControllerName() is deprecated. Use writeName() instead");

        logging.debug("> Writing Controller Name...");

        const request_uuid = this.#getUUID();
        const payload = [COMMAND_FLAGS.FLAG_WRITE_CONTROLLER_NAME_REQUEST, ...numberToBytes(request_uuid, 4), ...stringToBytes(name, 16)];
        return this.runtime.request(payload, false);
    }

    whiteName(name) {
        // TODO
    }

    /**
     * 
     * @returns 
     * @deprecated use readName() instead
     */
    //! DEPRECATED readControllerName() -> readName()
    readControllerName() {
        logging.verbose(`readControllerName()`);

        logging.error("readControllerName() is deprecated. Use readName() instead");

        logging.debug("> Reading Controller Name...");

        const request_uuid = this.#getUUID();
        const bytes = [COMMAND_FLAGS.FLAG_READ_CONTROLLER_NAME_REQUEST, ...numberToBytes(request_uuid, 4)];

        return this.runtime.request(bytes, true).then(response => {
            let reader = new TnglReader(response);

            logging.verbose(`response.byteLength=${response.byteLength}`);

            if (reader.readFlag() !== COMMAND_FLAGS.FLAG_READ_CONTROLLER_NAME_RESPONSE) {
                throw "InvalidResponseFlag";
            }

            const response_uuid = reader.readUint32();

            if (response_uuid != request_uuid) {
                throw "InvalidResponseUuid";
            }

            const error_code = reader.readUint8();

            logging.verbose(`error_code=${error_code}`);

            let name = null;

            if (error_code === 0) {
                name = reader.readString(16);
            } else {
                throw "Fail";
            }

            logging.verbose(`name=${name}`);
            logging.debug(`> Controller Name: ${name}`);

            return name;
        });
    }

    /**
     * Reads spectoda name
     */
    readName() {

    }

    /**
     * @param {string} variable_name
     * @param {number} device_id
     */
    readVariable(variable_name, device_id) {
        logging.debug(`> Reading variable...`);

        const variable_declarations = this.#parser.getVariableDeclarations();
        logging.verbose(`variable_declarations=`, variable_declarations);

        let variable_address = undefined;

        // check if the variable is already declared
        // look for the latest variable address on the stack
        for (let i = 0; i < variable_declarations.length; i++) {
            const declaration = variable_declarations[i];
            if (declaration.name === variable_name) {
                variable_address = declaration.address;
                break;
            }
        }

        if (variable_address === undefined) {
            throw "VariableNotFound";
        }

        const variable_value = this.runtime.readVariableAddress(variable_address, device_id);
        logging.verbose(`variable_name=${variable_name}, device_id=${device_id}, variable_value=${variable_value.debug}`);

        return variable_value;
    }

    /**
   * @param {string} variable_address
   * @param {number} device_id
   */
    readVariableAddress(variable_address, device_id) {
        logging.debug("> Reading variable address...");

        if (this.#getConnectionState() !== "connected") {
            throw "DeviceDisconnected";
        }

        return this.runtime.readVariableAddress(variable_address, device_id);
    }

    //! Move this function to SpectodaConnect functions
    hideHomeButton() {
        logging.debug("> Hiding home button...");

        if (!detectSpectodaConnect()) {
            return Promise.reject("PlatformNotSupported");
        }

        return window.flutter_inappwebview.callHandler("hideHomeButton");
    }

    // option:
    //  0 = no restriction, 1 = portrait, 2 = landscape
    //! Move this function to SpectodaConnect functions
    setOrientation(option) {
        logging.debug("> Setting orientation...");

        if (!detectSpectodaConnect()) {
            return Promise.reject("PlatformNotSupported");
        }

        if (typeof option !== "number") {
            return Promise.reject("InvalidOption");
        }

        if (option < 0 || option > 2) {
            return Promise.reject("InvalidOption");
        }

        return window.flutter_inappwebview.callHandler("setOrientation", option);
    }

    // 0.9.4

    /**
     * 
     * @returns 
     */
    readNetworkSignature() {
        logging.debug("> Reading network signature...");

        const request_uuid = this.#getUUID();
        const bytes = [COMMAND_FLAGS.FLAG_READ_OWNER_SIGNATURE_REQUEST, ...numberToBytes(request_uuid, 4)];

        return this.runtime.request(bytes, true).then(response => {
            let reader = new TnglReader(response);

            logging.verbose(`response.byteLength=${response.byteLength}`);

            if (reader.readFlag() !== COMMAND_FLAGS.FLAG_READ_OWNER_SIGNATURE_RESPONSE) {
                throw "InvalidResponseFlag";
            }

            const response_uuid = reader.readUint32();

            if (response_uuid != request_uuid) {
                throw "InvalidResponseUuid";
            }

            const error_code = reader.readUint8();
            logging.verbose(`error_code=${error_code}`);

            if (error_code !== 0) {
                throw "Fail";
            }

            const signature_bytes = reader.readBytes(16);
            logging.debug(`signature_bytes=${signature_bytes}`);

            const signature_string = uint8ArrayToHexString(signature_bytes);
            logging.debug(`signature_string=${signature_string}`);

            logging.info(`> Network Signature: ${signature_string}`);

            return signature_string;
        });
    }

    /**
     * 
     * @param {*} pcb_code 
     * @param {*} product_code 
     * @returns 
     * @deprecated use writeProperties() instead
     */
    //! DEPRECATED writeControllerCodes() -> writeProperties()
    writeControllerCodes(pcb_code, product_code) {
        logging.verbose(`writeControllerCodes(pcb_code=${pcb_code}, product_code=${product_code})`);

        logging.error("writeControllerCodes() is deprecated. Use writeProperties() instead");

        logging.debug("> Writing controller codes...");

        const request_uuid = this.#getUUID();
        const bytes = [COMMAND_FLAGS.FLAG_WRITE_CONTROLLER_CODES_REQUEST, ...numberToBytes(request_uuid, 4), ...numberToBytes(pcb_code, 2), ...numberToBytes(product_code, 2)];

        return this.runtime.request(bytes, true).then(response => {
            let reader = new TnglReader(response);

            logging.verbose(`response.byteLength=${response.byteLength}`);

            if (reader.readFlag() !== COMMAND_FLAGS.FLAG_WRITE_CONTROLLER_CODES_RESPONSE) {
                throw "InvalidResponseFlag";
            }

            const response_uuid = reader.readUint32();

            if (response_uuid != request_uuid) {
                throw "InvalidResponseUuid";
            }

            const error_code = reader.readUint8();
            logging.verbose(`error_code=${error_code}`);

            if (error_code !== 0) {
                throw "Fail";
            }
        });
    }

    writeProperties({ pcbCode, productCode }) {
        // TODO
    }

    /**
     * 
     * @returns 
     * @deprecated use readProperties() instead
     */
    //! DEPRECATED readControllerCodes() -> readProperties()
    readControllerCodes() {
        logging.verbose(`readControllerCodes()`);

        logging.error("readControllerCodes() is deprecated. Use readProperties() instead");

        logging.debug("> Requesting controller codes ...");

        const request_uuid = this.#getUUID();
        const bytes = [COMMAND_FLAGS.FLAG_READ_CONTROLLER_CODES_REQUEST, ...numberToBytes(request_uuid, 4)];

        return this.runtime.request(bytes, true).then(response => {
            let reader = new TnglReader(response);

            logging.verbose("response=", response);

            if (reader.readFlag() !== COMMAND_FLAGS.FLAG_READ_CONTROLLER_CODES_RESPONSE) {
                throw "InvalidResponseFlag";
            }

            const response_uuid = reader.readUint32();

            if (response_uuid != request_uuid) {
                throw "InvalidResponseUuid";
            }

            const error_code = reader.readUint8();

            logging.verbose(`error_code=${error_code}`);

            if (error_code !== 0) {
                throw "Fail";
            }

            const pcb_code = reader.readUint16();
            const product_code = reader.readUint16();

            logging.debug(`pcb_code=${pcb_code}`);
            logging.debug(`product_code=${product_code}`);

            logging.info(`> Controller Codes: pcb_code=${pcb_code}, product_code=${product_code}`);

            return { pcb_code: pcb_code, product_code: product_code };
        });
    }

    readProperties() {
        // TODO
    }

}
