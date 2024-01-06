/**
 * @module SpectodaController
 * @description SpectodaController is a class that represents a single Spectoda controller. It is used to control the controller and to communicate with it.
 */

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
import { logging, setLoggingLevel } from "./logging";
import { COMMAND_FLAGS } from "./webassembly/Spectoda_JS";

import { Spectoda } from "./Spectoda";

// should not create more than one object!
// the destruction of the Spectoda is not well implemented

// TODO - kdyz zavolam spectoda.connect(), kdyz jsem pripojeny, tak nechci aby se do interfacu poslal select
// TODO - kdyz zavolam funkci connect a uz jsem pripojeny, tak vyslu event connected, pokud si myslim ze nejsem pripojeny.
// TODO - "watchdog timer" pro resolve/reject z TC

export class SpectodaController {

    #spectoda: Spectoda; // reference to the "root" Spectoda object through which this controller is accessed
    #connection: string[]; // connection string of the controller

    /**
     * 
     * @param appSpectodaReferece Reference to the "root" Spectoda object through which this controller is accessed
     * @param controllerConnection Connections needed to get from the root Spectoda object to this controller
     */
    constructor(appSpectodaReferece: Spectoda, controllerConnections: string[]) {
        this.#spectoda = appSpectodaReferece;
        this.#connection = controllerConnections;
    }

    // TODO
    setDebugLevel(level: number) {
        setLoggingLevel(level);
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

    addEventListener(event: string, callback: Function) {
        logging.verbose(`SpectodaController::addEventListener(event=${event}, callback=${callback})`);

        // TODO
        logging.error("WIP - not implemented yet")
        throw "WorkInProgress";
    }
    /**
     * @alias this.addEventListener
     */
    on(event: string, callback: Function) {
        logging.verbose(`SpectodaController::on(event=${event}, callback=${callback})`);

        // TODO
        logging.error("WIP - not implemented yet")
        throw "WorkInProgress";
    }

    /**
     * @name scan
     * @param {string} connector
     * @param {Function} callback
     *
     * TODO define Criteria object in typescript
     * @returns {Criteria[]}
     */
    scan(connector: string, criteria = [{}], options = {}) {
        return this.#spectoda.scan(this.#connection, connector, criteria, options);
    }

    /**
     * Establishes a new connection to a controller based on given criteria
     */
    //! FUNCTION ROLE CHANGED
    //! PARAMETERS CHANGED
    connect(connector: string, criteria = {}, options = {}) {
        return this.#spectoda.connect(this.#connection, connector, criteria, options);
    }

    /**
     * Disconnects the connection
     */
    disconnect() {
        return this.#spectoda.disconnect(this.#connection);
    }

    /**
     * Checks if the connection is connected
     * @returns {boolean} true if connected, false if not connected
     */
    isConnected() {
        return this.#spectoda.isConnected(this.#connection);
    }

    //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    /**
     * Function changed!
      * Writes TNGL to the network from the controller
      */
    //! FUNCTION ROLE CHANGED
    //! PARAMETERS CHANGED
    syncTngl(connectionToSyncWith: string[] = ["*/ff:ff:ff:ff:ff:ff"]) {
        return this.#spectoda.syncTngl(this.#connection, connectionToSyncWith);
    }

    /**
      * Parameters changed!
      * Writes TNGL to the network from the currently used controller.
      * Pass TNGL code by string or object: { code: string or bytecode: uint8Array }
      * @param tngl choose written code or compiled bytecode
      * @param tngl.code
      * @param tngl.bytecode
      */
    //! PARAMETERS CHANGED
    writeTngl(tngl: { code: string | undefined, bytecode: Uint8Array | undefined }) {
        return this.#spectoda.writeTngl(this.#connection, tngl);
    }

    /**
     * Emits a event with no value to the network
     */
    emitEmptyEvent(eventLabel: string, eventId: number | number[] = 0xff, options = { forceDelivery: false }) {
        return this.#spectoda.emitEmptyEvent(this.#connection, eventLabel, eventId, options);
    }

    /**
     * Emits a event with a timestamp value to the network
     */
    emitTimestampEvent(eventLabel: string, eventTimestampValue: number, eventId: number | number[] = 0xff, options = { forceDelivery: false }) {
        return this.#spectoda.emitTimestampEvent(this.#connection, eventLabel, eventTimestampValue, eventId, options);
    }

    /**
     * Emits a event with a color value to the network
     */
    emitColorEvent(eventLabel: string, eventColorValue: string, eventId: number | number[] = 0xff, options = { forceDelivery: false }) {
        return this.#spectoda.emitColorEvent(this.#connection, eventLabel, eventColorValue, eventId, options);
    }

    /**
     * Emits a event with a percentage value to the network
     */
    emitPercentageEvent(eventLabel: string, eventPercentageValue: number, eventId: number | number[] = 0xff, options = { forceDelivery: false }) {
        return this.#spectoda.emitPercentageEvent(this.#connection, eventLabel, eventPercentageValue, eventId, options);
    }

    /**
     * Emits a event with a label value to the network
     */
    emitLabelEvent(eventLabel: string, eventLabelValue: string, eventId: number | number[] = 0xff, options = { forceDelivery: false }) {
        return this.#spectoda.emitLabelEvent(this.#connection, eventLabel, eventLabelValue, eventId, options);
    }

    /**
     * Synchronizes the timeline with another controller/s on the other side of the specified connection 
     */
    //! PARAMETERS UPDATED
    syncTimeline(connectionToSyncWith: string[] = ["*/ff:ff:ff:ff:ff:ff"]) {
        return this.#spectoda.syncTimeline(this.#connection, connectionToSyncWith);
    }

    /**
     * Sychronizes the clock timmestamp with another controller/s on the other side of the specified connection
     * @returns Promise<void>
     */
    //! PARAMETERS UPDATED
    syncClock(connectionToSyncWith: string[] = ["*/ff:ff:ff:ff:ff:ff"]) {
        return this.#spectoda.syncClock(this.#connection, connectionToSyncWith);
    }

    /**
     * Forces a state of some source ID to target IDs on the whole network
     */
    //! PARAMETERS UPDATED
    syncState(sourceId: number, targetId: number | number[] = 0xff, connectionToSyncWith: string[] = ["*/ff:ff:ff:ff:ff:ff"]) {
        return this.#spectoda.syncState(this.#connection, sourceId, targetId, connectionToSyncWith);
    }

    /**
     * Updates the firmware
     */
    writeFirmware(firmware: { path: string, url: string, bytes: Uint8Array }) {
        return this.#spectoda.writeFirmware(this.#connection, firmware);
    }

    /**
     * Synchonizes firmware stored on the controller to given connection
     * @todo should return an information about the firmware update result
     */
    syncFirmware(connectionToSyncWith: string[]) {
        return this.#spectoda.syncFirmware(this.#connection, connectionToSyncWith);
    }

    /** 
     * Reads config of currently used controller.
     */
    readConfig() {
        return this.#spectoda.readConfig(this.#connection);
    }

    /**
     * Writes spectoda config to the controller
     */
    writeConfig(config: JSON | string): Promise<void> {
        return this.#spectoda.writeConfig(this.#connection, config);
    }

    /**
     * Reads current timeline
     */
    readTimeline() {
        return this.#spectoda.readTimeline(this.#connection);
    }

    /**
     * This restarts the webassembly spectodas or reboots physical spectoda controllers
     */
    requestRestart() {
        return this.#spectoda.requestRestart(this.#connection);
    }

    /**
     * Removes spectoda network of the given controller
     */
    eraseNetwork() {
        return this.#spectoda.eraseNetwork(this.#connection);
    }

    /**
      * Gets a spectoda version
      */
    //! PARAMETERS UPDATED - now it returns an object with version info
    readVersion() {
        return this.#spectoda.readVersion(this.#connection);
    }

    /**
     * Reads TNGL fingerprint
     * @param connection 
     */
    readTnglFingerprint() {
        return this.#spectoda.readTnglFingerprint(this.#connection);
    }

    /**
     * Reads available connections 
     */
    readConnections() {
        return this.#spectoda.readConnections(this.#connection);
    }

    /**
     * Synchronizes event history of the used controller to the connection
     * @returns 
     */
    //! PARAMETERS UPDATED
    syncEventHistory(connectionToSyncWith: string[] = ["*/ff:ff:ff:ff:ff:ff"]) {
        return this.#spectoda.syncEventHistory(this.#connection, connectionToSyncWith);
    }

    /**
     * Erases event history on given controller
     */
    eraseEventHistory() {
        return this.#spectoda.eraseEventHistory(this.#connection);
    }

    /**
     * Sleeps the used controller
     */
    requestSleep() {
        return this.#spectoda.requestSleep(this.#connection);
    }


    /**
     * Saves the current variable state to the memory
     */
    requestSaveState() {
        return this.#spectoda.requestSaveState(this.#connection);
    }

    /**
     * Writes spectoda network
     */
    writeNetwork(network: { key: number[], signature: number[] }) {
        return this.#spectoda.writeNetwork(this.#connection, network);
    }

    /**
     * Reads the spectoda network 
     */
    readNetwork(options = { readSignature: true, readKey: false }) {
        return this.#spectoda.readNetwork(this.#connection, options);
    }

    /**
     * Writes spectoda name
     */
    whiteName(name: string): Promise<void> {
        return this.#spectoda.whiteName(this.#connection, name);
    }


    /**
     * Reads spectoda name
     */
    readName() {
        return this.#spectoda.readName(this.#connection);
    }

    /**
     * Reads a variable from the currently running TNGL code by its name
     * @todo specify returned variable value
     */
    readVariable(variableName: string, id: number) {
        return this.#spectoda.readVariable(this.#connection, variableName, id);
    }

    /**
     * Reads a variable from the currently running TNGL code by its address
     */
    readVariableAddress(variableAddress: number, id: number) {
        return this.#spectoda.readVariableAddress(this.#connection, variableAddress, id);
    }

    /**
     * Writes the controller properties into the controller
     */
    writeProperties(properties: { pcbCode: number, productCode: number }) {
        return this.#spectoda.writeProperties(this.#connection, properties);
    }

    /**
     * Reads the controller properties from the controller
     */
    readProperties() {
        return this.#spectoda.readProperties(this.#connection);
    }

    // ======================================================================================================================

    /**
     * @deprecated choose connector in the connect() function
     */
    //! DEPRECATED setConnector() -> connect(connectorType, ...)
    setConnector(connector_type: any) {
        logging.error("setConnector() is deprecated. Use connect(connectorType, ...) instead");
        throw "Deprecated";
    }

    /**
     * @alias this.setConnector
     * @deprecated choose connector in the connect() function
     */
    //! DEPRECATED assignConnector() -> connect(connectorType, ...)
    assignConnector(connector_type: any) {
        logging.error("assignConnector() is deprecated. Use connect(connectorType, ...) instead");
        throw "Deprecated";
    }

    /**
    * @deprecated use setNetwork() instead
    */
    //! DEPRECATED assignOwnerSignature() -> writeNetwork()
    assignOwnerSignature(ownerSignature: any) {
        logging.error("assignOwnerSignature() is deprecated. Use writeNetwork() instead");
        throw "Deprecated";
    }

    /**
    * @deprecated use setNetwork() instead
    */
    //! DEPRECATED setOwnerSignature() -> writeNetwork()
    setOwnerSignature(ownerSignature: any) {
        logging.error("setOwnerSignature() is deprecated. Use writeNetwork() instead");
        throw "Deprecated";
    }

    /**
     * @deprecated use getNetwork() instead
     */
    //! DEPRECATED getOwnerSignature() -> readNetwork()
    getOwnerSignature() {
        logging.error("getOwnerSignature() is deprecated. Use readNetwork() instead");
        throw "Deprecated";
    }

    /**
    * @deprecated use setNetwork() instead
    */
    //! DEPRECATED assignOwnerKey() -> writeNetwork()
    assignOwnerKey(ownerKey: any) {
        logging.error("assignOwnerKey() is deprecated. Use writeNetwork() instead");
        throw "Deprecated";
    }

    /**
    * @deprecated use setNetwork() instead
    */
    //! DEPRECATED assignOwnerKey() -> writeNetwork()
    setOwnerKey(ownerKey: any) {
        logging.error("setOwnerKey() is deprecated. Use writeNetwork() instead");
        throw "Deprecated";
    }

    /**
    * @deprecated use getNetwork() instead
    */
    //! DEPRECATED getOwnerKey() -> readNetwork()
    getOwnerKey() {
        logging.error("getOwnerKey() is deprecated. Use readNetwork() instead");
        throw "Deprecated";
    }

    /**
     * @deprecated use scan() followed by connect() followed by setNetwork()
     */
    //! DEPRECATED - use scan() followed by connect() followed by setNetwork()
    adopt(newDeviceName = null, newDeviceId = null, tnglCode = null, ownerSignature = null, ownerKey = null, autoSelect = false) {
        logging.error("adopt() is deprecated. Use scan() followed by connect() followed by setNetwork()");
        throw "Deprecated";
    }

    /**
     * @deprecated use isConnected()
     */
    //! DEPRECATED - use isConnected()
    connected() {
        logging.error("connected() is deprecated. Use isConnected()");
        throw "Deprecated";
    }

    /**
       *
       * @param {*} event_label
       * @param {number|number[]} device_ids
       * @param {*} force_delivery
    
       * @returns
       * @deprecated use emitEmptyEvent() instead
       */
    //! DEPRECATED emitEvent() -> emitEmptyEvent()
    emitEvent(event_label: any, device_ids = [0xff], force_delivery = true) {
        logging.error("emitEvent() is deprecated. Use emitEmptyEvent() instead");
        throw "Deprecated";
    }

    /**
    * @deprecated - is replaced by history merging and scenes
    */
    //! DEPRECATED - no equivalent. Replaced by history merging and scenes
    resendAll() {
        logging.error("resendAll() is deprecated");
        throw "Deprecated";
    }


    /**
      * Downloads firmware and calls updateDeviceFirmware()
      * @param {string} url - whole URL of the firmware file
      * @deprecated Use writeFirmware() instead
      */
    //! DEPRECATED fetchAndUpdateDeviceFirmware() -> writeFirmware()
    async fetchAndUpdateDeviceFirmware(url: any) {
        logging.error("fetchAndUpdateDeviceFirmware() is deprecated. Use writeFirmware() instead");
        throw "Deprecated";
    }

    /**
     * Downloads firmware and calls updateNetworkFirmware()
     * @param {string} url - whole URL of the firmware file
     * @deprecated Use writeFirmware() instead
     */
    //! DEPRECATED fetchAndUpdateNetworkFirmware() -> writeFirmware()
    async fetchAndUpdateNetworkFirmware(url: any) {
        logging.error("fetchAndUpdateNetworkFirmware() is deprecated. Use writeFirmware() instead");
        throw "Deprecated";
    }


    /**
     * @param {Uint8Array} firmware
     * @returns {Promise<void>}
     * @deprecated Use writeFirmware() instead
     */
    //! DEPRECATED updateDeviceFirmware() -> writeFirmware()
    updateDeviceFirmware(firmware: any) {
        logging.error("updateDeviceFirmware() is deprecated. Use writeFirmware() instead");
        throw "Deprecated";
    }

    /**
     * 
     * @param {Uint8Array} firmware 
     * @returns 
     * @deprecated Use spectoda.useBroadcast().writeFirmware() instead
     */
    //! DEPRECATED updateNetworkFirmware() -> writeFirmware()
    updateNetworkFirmware(firmware: any) {
        logging.error("updateNetworkFirmware() is deprecated. Use writeFirmware() instead");
        throw "Deprecated";
    }

    /**
     * 
     * @param {string} peer 
     * @returns {Promise<void>}
     * @deprecated Use syncFirmware() instead 
     */
    //! DEPRECATED updatePeerFirmware() -> syncFirmware()
    async updatePeerFirmware(peer: any) {
        logging.error("updatePeerFirmware() is deprecated. Use syncFirmware() instead");
        throw "Deprecated";
    }

    /**
     * @returns {Promise} config;
     * @deprecated use readConfig() instead
     */
    //! DEPRECATED readNetworkConfig() -> readConfig()
    readDeviceConfig(mac = "ee:33:fa:89:08:08") {
        logging.error("readDeviceConfig() is deprecated. Use readConfig() instead");
        throw "Deprecated";
    }

    /**
     * @param {string} config;
     * @deprecated use writeConfig() instead
     */
    //! DEPRECATED updateDeviceConfig() -> writeConfig()
    updateDeviceConfig(config_raw: any) {
        logging.error("updateDeviceConfig() is deprecated. Use writeConfig() instead");
        throw "Deprecated";
    }

    /**
     * @param {string} config;
     * @deprecated use spectoda.use(connection).useAllConnections().writeConfig() instead
     */
    //! DEPRECATED updateNetworkConfig() -> writeConfig()
    updateNetworkConfig(config: any) {
        logging.error("updateNetworkConfig() is deprecated. Use writeConfig() instead");
        throw "Deprecated";
    }

    /**
   * @returns {Promise<TimeTrack>}
   * @deprecated use readTimeline() instead 
   */
    //! DEPRECATED requestTimeline() -> readTimeline()
    requestTimeline() {
        logging.error("requestTimeline() is deprecated. Use readTimeline() instead");
        throw "Deprecated";
    }

    /**
     * @returns {Promise<void>}
     * @deprecated use spectoda.use(connection).useAllConnections().restart() instead
     */
    //! DEPRECATED rebootNetwork() -> requestRestart()
    rebootNetwork() {
        logging.error("rebootNetwork() is deprecated. Use requestRestart() instead");
        throw "Deprecated";
    }

    /**
     * @returns {Promise<void>}
     * @deprecated use spectoda.use(connection).requestRestart() instead
     */
    //! DEPRECATED rebootDevice() -> requestRestart()
    rebootDevice() {
        logging.error("rebootDevice() is deprecated. Use requestRestart() instead");
        throw "Deprecated";
    }

    /**
     * @returns {Promise<void>}
     * @deprecated use spectoda.use(connection).requestRestart() instead
     */
    //! DEPRECATED rebootAndDisconnectDevice() -> requestRestart() then disconnect()
    rebootAndDisconnectDevice() {
        logging.error("rebootAndDisconnectDevice() is deprecated. Use requestRestart() then disconnect() instead");
        throw "Deprecated";
    }

    /** 
     * @returns {Promise<string>}
     * @deprecated Use spectoda.use(connection).readVersion() instead
     */
    //! DEPRECATED getFwVersion() -> readVersion()
    getFwVersion() {
        logging.error("getFwVersion() is deprecated. Use readVersion() instead");
        throw "Deprecated";
    }

    /**
     * 
     * @deprecated Use readTnglFingerprint() instead
     */
    //! DEPRECATED getTnglFingerprint() -> readTnglFingerprint()
    getTnglFingerprint() {
        logging.error("getTnglFingerprint() is deprecated. Use readTnglFingerprint() instead");
        throw "Deprecated";
    }

    /**
     * 
     * @deprecated 
     */
    //! DEPRECATED - no equivalent
    setNetworkDatarate(datarate: any) {
        logging.error("setNetworkDatarate() is deprecated");
        throw "Deprecated";
    }

    /**
     * 
     * @deprecated 
     */
    //! DEPRECATED - no equivalent
    readRomPhyVdd33() {
        logging.error("readRomPhyVdd33() is deprecated");
        throw "Deprecated";
    }

    /**
       * 
       * @deprecated 
       */
    //! DEPRECATED - no equivalent
    readPinVoltage(pin: any) {
        logging.error("readPinVoltage() is deprecated");
        throw "Deprecated";
    }


    /**
     * 
     * @deprecated Use readConnectedPeers() instead
     */
    //! DEPRECATED - getConnectedPeersInfo() -> readConnections()
    getConnectedPeersInfo() {
        logging.error("getConnectedPeersInfo() is deprecated. Use readConnections() instead");
        throw "Deprecated";
    }

    /**
      * @deprecated use requestSleep() instead
      */
    //! DEPRECATED networkSleep() -> requestSleep()
    deviceSleep() {
        logging.error("deviceSleep() is deprecated. Use requestSleep() instead");
        throw "Deprecated";
    }

    /**
     * @deprecated use requestSleep() instead
     */
    //! DEPRECATED networkSleep() -> requestSleep()
    networkSleep() {
        logging.error("networkSleep() is deprecated. Use requestSleep() instead");
        throw "Deprecated";
    }

    /**
     * 
     */
    //! DEPRECATED saveState() -> requestSaveState()
    saveState() {
        logging.error("saveState() is deprecated. Use requestSaveState() instead");
        throw "Deprecated";
    }

    /**
     * @deprecated use readProperties() instead
     */
    //! DEPRECATED getControllerInfo() -> readProperties()
    getControllerInfo() {
        logging.error("getControllerInfo() is deprecated. Use readProperties() instead");
        throw "Deprecated";
    }

    /**
       * @deprecated use writeNetwork() instead
       */
    //! DEPRECATED writeOwner() -> writeNetwork()
    writeOwner(ownerSignature = "00000000000000000000000000000000", ownerKey = "00000000000000000000000000000000") {
        logging.error("writeOwner() is deprecated. Use writeNetwork() instead");
        throw "Deprecated";
    }

    /**
     * @deprecated use writeNetwork() instead
     */
    //! DEPRECATED writeNetworkOwner() -> writeNetwork()
    writeNetworkOwner(ownerSignature = "00000000000000000000000000000000", ownerKey = "00000000000000000000000000000000") {
        logging.error("writeNetworkOwner() is deprecated. Use writeNetwork() instead");
        throw "Deprecated";
    }

    /**
      * 
      * @param {*} name 
      * @returns 
      * @deprecated use writeName() instead
      */
    //! DEPRECATED writeControllerName() -> writeName()
    writeControllerName(name: any) {
        logging.error("writeControllerName() is deprecated. Use writeName() instead");
        throw "Deprecated";
    }

    /**
     *
     * @returns
     * @deprecated use readName() instead
     */
    //! DEPRECATED readControllerName() -> readName()
    readControllerName() {
        logging.error("readControllerName() is deprecated. Use readName() instead");
        throw "Deprecated";
    }

    /**
     * 
     * @returns 
     * @deprecated use readNetwork(options: { readSignature: true, readKey: false }) instead
     */
    //! DEPRECATED readNetworkSignature() -> readNetwork()
    readNetworkSignature() {
        logging.error("readNetworkSignature() is deprecated. Use readNetwork() instead");
        throw "Deprecated";
    }


    /**
    * 
    * @param {*} pcb_code 
    * @param {*} product_code 
    * @returns 
    * @deprecated use writeProperties() instead
    */
    //! DEPRECATED writeControllerCodes() -> writeProperties()
    writeControllerCodes(pcb_code: any, product_code: any) {
        logging.error("writeControllerCodes() is deprecated. Use writeProperties() instead");
        throw "Deprecated";
    }

    /**
      * 
      * @returns 
      * @deprecated use readProperties() instead
      */
    //! DEPRECATED readControllerCodes() -> readProperties()
    readControllerCodes() {
        logging.error("readControllerCodes() is deprecated. Use readProperties() instead");
        throw "Deprecated";
    }

}