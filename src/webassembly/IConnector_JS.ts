import { logging } from "../logging";

import { Uint8Vector, IConnector_WASM } from "./webassembly";
import { SpectodaWasm } from "./SpectodaWasm";

// ! manually derived from generated 'interface IConnector_WASM'
interface IConnector_IMPL {
    _process(): void;
    _disconnect(_0: number): boolean;
    _sendExecute(_0: Uint8Vector, _1: number): void;
    _sendRequest(_0: number, _1: Uint8Vector, _2: number): boolean;
    _sendResponse(_0: number, _1: number, _2: Uint8Vector, _3: number): boolean;
    _scan(_0: ArrayBuffer | Uint8Array | Uint8ClampedArray | Int8Array | string, _1: number, _2: any): boolean;
    _userConnect(_0: ArrayBuffer | Uint8Array | Uint8ClampedArray | Int8Array | string, _1: number, _2: any): boolean;
    _autoConnect(_0: ArrayBuffer | Uint8Array | Uint8ClampedArray | Int8Array | string, _1: number, _2: number, _3: any): boolean;
    _sendSynchronize(_0: any, _1: number): void;
}

export class IConnector_JS {

    #instance: IConnector_WASM | null = null;

    // JavaScript implementation of the IConnector_WASM C++ class
    constructor() {
    }

    construct(implementation: IConnector_IMPL) {
        return SpectodaWasm.access().then(runtime => {
            this.#instance = runtime.IConnector_WASM.implement(implementation);
        });
    }

}

export class BluetoothConnector_JS extends IConnector_JS {

    // Default JavaScript implementation of the IConnector_WASM C++ class 
    #implementation: IConnector_IMPL = {

        /* Constructor function is optional */
        // __construct: function () {
        //   this.__parent.__construct.call(this);
        // },

        /* Destructor function is optional */
        // __destruct: function () {
        //   this.__parent.__destruct.call(this);
        // },

        // void _process() override
        _process: () => {
            // logging.verbose(`_process`);

            return;
        },

        _scan: (criteria: string, scan_period: number, result_out: { scanned_criteria: string }) => {
            logging.verbose(`_scan: criteria=${criteria}, scan_period=${scan_period}`);

            result_out.scanned_criteria = `[{"name":"Controller"}]`;

            return true;
        },

        _autoConnect: (criteria: string, scan_period: number, timeout: number, result_out: { connection_handle: number }) => {
            logging.verbose(`_autoConnect: criteria=${criteria}, scan_period=${scan_period}, timeout=${timeout}`);

            return true;
        },

        _userConnect: (criteria: string, timeout: number, result_out: { connection_handle: number }) => {
            logging.verbose(`_userConnect: criteria=${criteria}, timeout=${timeout}`);

            return true;
        },

        _disconnect: (connection_handle: number) => {
            logging.verbose(`_disconnect: connection_handle=${connection_handle}`);

            return true;
        },

        // void _sendExecute(const std::vector<uint8_t>& command_bytes, const double source_connection_handle) override
        _sendExecute: (command_bytes: Uint8Vector, source_connection_handle: number) => {
            logging.verbose(`_sendExecute: command_bytes=${command_bytes}, source_connection_handle=${source_connection_handle}`);

            return;
        },
        // bool _sendRequest(const int32_t request_ticket_number, std::vector<uint8_t>& request_bytecode, const double destination_connection_handle) override
        _sendRequest: (request_ticket_number: number, request_bytecode: Uint8Vector, destination_connection_handle: number) => {
            logging.verbose(`_sendRequest: request_ticket_number=${request_ticket_number}, request_bytecode=${request_bytecode}, destination_connection_handle=${destination_connection_handle}`);

            return false;
        },
        // bool _sendResponse(const int32_t request_ticket_number, const int32_t request_result, std::vector<uint8_t>& response_bytecode, const double destination_connection_handle) override
        _sendResponse: (request_ticket_number: number, request_result: number, response_bytecode: Uint8Vector, destination_connection_handle: number) => {
            logging.verbose(`_sendResponse: request_ticket_number=${request_ticket_number}, request_result=${request_result}, response_bytecode=${response_bytecode}, destination_connection_handle=${destination_connection_handle}`);

            return false;
        },
        // void _sendSynchronize(const val& synchronization_object, const double source_connection_handle) override
        _sendSynchronize: (synchronization_object: any, source_connection_handle: number) => {
            logging.verbose(`_sendSynchronize: synchronization_object=${synchronization_object}, source_connection_handle=${source_connection_handle}`);

            return;
        }
    }

    constructor() {
        super()
    }

    construct() {
        return super.construct(this.#implementation);
    }

    public connect() {
        logging.info("Connecting to bluetooth device...");
    }

    public disconnect() {
        logging.info("Disconnecting from bluetooth device...");
    }
}