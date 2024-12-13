## Todo in readme:

- Define quickstart

### Explain

- "No network"
- general Spectoda concepts - controllers, networks
- connectors

spectoda-js

is a javascript library for interfacing a network of spectoda powered devices. It defines a SpectodaTerminal class. Configure the terminal to connect with your devices.

let spectoda = new SpectodaTerminal();

## How to translate

1. import `t` function into file
2. call your (static) string with t function, it will be used as a key
3. go into this folder and run `npm run extract`

## About the inner workings

Interface

Interface is Controller data processor. Interface keeps track of other connected Interfaces a.k.a controllers that it has access to. Interface builds, encrypts and decrypts packets send via Connections of Connectors. Interface is the keeper of the clock time. Messages are encrypted using timestamps.

interface.execute(command, grouping, timeout, ttl) // (Handles queue of execute commands. Merges togetner commands with the same grouping (spam protection). Merged commands one by one hands to connected interfaces over sendExecute()) interface.request(command, timeout) // (Handles queue of request commands. Commands one by one requests at the interface)

interface is connected to other interfaces via available Connectors. Access to another Interface though Connector is called Connection.

...

// execute is used for network shared commands that are backed by its own synchronize guarantee mechanizm (SMG). Execute relies on the SGM for delivery guarantee sendExecute(paylaod, size, timeout, ttl) // one way communication to all controllers without guarantee of delivery to all controllers. // request is used for controller specific commands that don't have its own synchnonize guarantee mechanizm (SMG). Request relies on acnoligements for delivery guarantee sendRequest(paylaod, size, timeout) // request only given interface, chain requests over interfaces via mac addresses, or recursive request over all detected interfaces (as scan does).

// handles for SCBLE connection, WEBUSB connection COM1, WEBUSB connection COM2 and so on (SCBLE and WEBUSB are Connectors)

let spectoda = new Spectoda(); // figure out unique MAC address for the "virtual" spectoda controller

let connection1 = spectoda.connect(...); // default connection let connection2 = spectoda.connect["webbluetooth"](...); // webbluetooth connection let connection3 = spectoda.connect.webbluetooth(...); // webbluetooth connection let connection4 = spectoda.connect["webserial"](...); // webserial connection let connection5 = spectoda.connect.webserial(...); // webserial connection

connection1.disconnect();

spectoda.readConfig("01:23:45:67:78:89");

## How to use WASM in your project

- you can use our CDN (this will be default behaviour)

## For Matty and other FW developers

- WASM active development WASM must be build in public/ folder, because most of the transpilers can't use WASM as a dependency
