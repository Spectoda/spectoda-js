import { getColorString, toUint8Array, hexStringToNumberArray } from "./functions.js";
import Module from "./wasm/spectoda-wasm.js";


Module._

// 

const PORT_NUMBER = 8;
const PIXEL_COUNT = 144;
const FPS = 30;

var portBuffers = [];

var initilized = false;


const HEAPU32_PTR = function (ptr) {
    return ptr / 4;
}


function createPorts() {

    if(!initilized) {
        return;
    }

    Module._setClock(0);
    // Module._setTimeline(0, false);

    for (let i = 0; i < PORT_NUMBER; i++) {

        let portChar = String.fromCharCode("A".charCodeAt(0) + i);
        let portIdOffset = 0;
        let portReversed = false; // WIP

        // const char* device_label_str, const char port_char, const size_t port_size, uint8_t port_id_offset, bool port_reversed
        const portBufferPtr = Module._createPort(portChar.charCodeAt(0), PIXEL_COUNT, portIdOffset, portReversed);
        portBuffers.push(new Uint8Array(Module.HEAPU8.buffer, portBufferPtr, PIXEL_COUNT * 3));

    }
}

function setClock() {

    if(!initilized) {
        return;
    }

    const clock_timestamp = document.getElementById("clock_timestamp").value;

    Module._setClock(clock_timestamp);
}

function execute() {

    if(!initilized) {
        return;
    }

    const command_hexstring = document.getElementById("execute_bytecode").value;
    const command_bytes = toUint8Array(hexStringToNumberArray(command_hexstring));

    // console.log("command_bytes", command_bytes);

    const command_bytes_size = command_bytes.length;
    const command_bytes_ptr = Module._malloc(command_bytes_size); // Allocate memory for the array
    Module.HEAPU8.set(command_bytes, command_bytes_ptr); // Copy the array data into the WASM memory

    // console.log("command_bytes_size", command_bytes_size);
    // console.log("command_bytes_ptr", command_bytes_ptr);

    Module._execute(command_bytes_ptr, command_bytes_size, 0xffff);

    Module._free(command_bytes_ptr); // Free the memory when you're done with it
}

function request() {

    if(!initilized) {
        return;
    }

    const request_hexstring = document.getElementById("execute_bytecode").value;
    const request_bytes = toUint8Array(hexStringToNumberArray(request_hexstring));

    // console.log("request_bytes", request_bytes);

    const request_bytes_size = request_bytes.length;
    const request_bytes_ptr = Module._malloc(request_bytes_size); // Allocate memory for the array
    Module.HEAPU8.set(request_bytes, request_bytes_ptr); // Copy the array data into the WASM memory

    // console.log("request_bytes_size", request_bytes_size);
    // console.log("request_bytes_ptr", request_bytes_ptr);

    // typedef struct {
    //     uint8_t* response_bytecode_hp;
    //     uint32_t response_bytecode_size;
    //     uint32_t request_evaluate_result;
    // } request_result_t;

    const response_result_ptr = Module._malloc(12);

    // console.log("response_result_ptr", response_result_ptr);

    // INTERFACE RequestResult request(const uint8_t* const request_bytecode, const size_t request_bytecode_size, const connection_handle_t source_connection)
    const success = Module._request(request_bytes_ptr, request_bytes_size, 0xffff, response_result_ptr);

    const response_bytecode_ptr = Module.HEAPU32[HEAPU32_PTR(response_result_ptr)];
    const response_bytecode_size = Module.HEAPU32[HEAPU32_PTR(response_result_ptr) + 1];
    const request_evaluate_result = Module.HEAPU32[HEAPU32_PTR(response_result_ptr) + 2];

    // console.log("response_bytecode_ptr", response_bytecode_ptr);
    // console.log("response_bytecode_size", response_bytecode_size);
    // console.log("request_evaluate_result", request_evaluate_result);

    const response_bytes = HEAPU8.subarray(response_bytecode_ptr, response_bytecode_ptr + response_bytecode_size);
    // console.log("response_bytes", response_bytes);

    Module._free(request_bytes_ptr);
    Module._free(response_bytecode_ptr);
    Module._free(response_result_ptr);
}

const renderer_dom = document.querySelector('#render');

function show() {

    if(!initilized) {
        return;
    }

    Module._render();

    renderer_dom.innerHTML = "";

    for (var i = 0; i < PORT_NUMBER; i++) {
        // Create a div to hold the column of cubes
        var column = document.createElement('div');
        column.className = 'column';
        column.innerHTML = `$con1 ${String.fromCharCode("A".charCodeAt(0) + i)}:`;
        renderer_dom.appendChild(column);

        for (var j = PIXEL_COUNT - 1; j >= 0; j--) {

            var cube = document.createElement('div');
            cube.className = 'cube';
            cube.style.backgroundColor = getColorString(portBuffers[i][j * 3 + 0], portBuffers[i][j * 3 + 1], portBuffers[i][j * 3 + 2]);
            column.appendChild(cube);
        }
    }
}

Module.onRuntimeInitialized = () => {

    Module._initilize();

    initilized = true;

    createPorts();

    setClock();
    execute();
    request();

    setInterval(() => {
        show();
    }, 1000 / FPS);

}

window.addEventListener("message", event => {
    console.log("Received message from parent:", event.data);
    const data = JSON.parse(event.data);

    if (data.shouldReload) {
        location.reload();
    } else if (data.js_eval) {
        eval(data.js_eval)
    } else if (data.execute_bytecode) {
        document.querySelector("#execute_bytecode").value = data.execute_bytecode;
        execute();
    } else if (data.request_bytecode) {
        document.querySelector("#request_bytecode").value = data.request_bytecode;
        request();
    } else if (data.clock_timestamp) {
        document.querySelector("#clock_timestamp").value = data.clock_timestamp;
        setClock();
    }
});