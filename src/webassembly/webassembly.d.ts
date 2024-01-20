export interface interface_error_tValue<T extends number> {
  value: T;
}
export type interface_error_t = interface_error_tValue<0> | interface_error_tValue<255>;

export interface connector_type_tValue<T extends number> {
  value: T;
}
export type connector_type_t = connector_type_tValue<0> | connector_type_tValue<1> | connector_type_tValue<2> | connector_type_tValue<3> | connector_type_tValue<4> | connector_type_tValue<5> | connector_type_tValue<6>;

export interface connection_rssi_tValue<T extends number> {
  value: T;
}
export type connection_rssi_t = connection_rssi_tValue<127> | connection_rssi_tValue<-128>;

export interface connection_t {
  connector_type: connector_type_t;
  connection_rssi: connection_rssi_t;
  delete(): void;
}

export interface Uint8Vector {
  push_back(_0: number): void;
  resize(_0: number, _1: number): void;
  size(): number;
  set(_0: number, _1: number): boolean;
  get(_0: number): any;
  delete(): void;
}

export interface Spectoda_WASM {
  begin(): void;
  end(): void;
  compute(): void;
  render(): void;
  _onRequest(): boolean;
  getIdentifier(): number;
  _onExecute(_0: Uint8Vector, _1: number): boolean;
  _handleTimelineManipulation(_0: number, _1: boolean, _2: number): interface_error_t;
  setClockTimestamp(_0: number): void;
  getClockTimestamp(): number;
  execute(_0: number, _1: number): boolean;
  request(_0: number, _1: Uint8Vector, _2: number): boolean;
  synchronize(_0: number, _1: number): void;
  _handlePeerConnected(_0: ArrayBuffer | Uint8Array | Uint8ClampedArray | Int8Array | string): interface_error_t;
  _handlePeerDisconnected(_0: ArrayBuffer | Uint8Array | Uint8ClampedArray | Int8Array | string): interface_error_t;
  _onLog(_0: number, _1: ArrayBuffer | Uint8Array | Uint8ClampedArray | Int8Array | string, _2: ArrayBuffer | Uint8Array | Uint8ClampedArray | Int8Array | string): void;
  init(_0: ArrayBuffer | Uint8Array | Uint8ClampedArray | Int8Array | string, _1: ArrayBuffer | Uint8Array | Uint8ClampedArray | Int8Array | string): void;
  getLabel(): string;
  _onEvents(_0: any): void;
  _onLocalEvents(_0: any): void;
  _onSynchronize(_0: any, _1: number): boolean;
  makePort(_0: ArrayBuffer | Uint8Array | Uint8ClampedArray | Int8Array | string, _1: number, _2: number, _3: number, _4: boolean, _5: boolean): any;
  readVariableAddress(_0: number, _1: number): any;
  delete(): void;
}

export interface WrappedSpectoda_WASM extends Spectoda_WASM {
  notifyOnDestruction(): void;
  delete(): void;
}

export interface IConnector_WASM {
  _process(): void;
  construct(_0: connector_type_t): void;
  _disconnect(_0: connection_t): boolean;
  _sendExecute(_0: Uint8Vector, _1: number): void;
  _sendRequest(_0: number, _1: Uint8Vector, _2: number): boolean;
  _sendResponse(_0: number, _1: number, _2: Uint8Vector, _3: number): boolean;
  _scan(_0: ArrayBuffer | Uint8Array | Uint8ClampedArray | Int8Array | string, _1: number, _2: any): boolean;
  _userConnect(_0: ArrayBuffer | Uint8Array | Uint8ClampedArray | Int8Array | string, _1: number, _2: any): boolean;
  _autoConnect(_0: ArrayBuffer | Uint8Array | Uint8ClampedArray | Int8Array | string, _1: number, _2: number, _3: any): boolean;
  _sendSynchronize(_0: any, _1: number): void;
  delete(): void;
}

export interface WrappedConnector_WASM extends IConnector_WASM {
  notifyOnDestruction(): void;
  delete(): void;
}

export interface MainModule {
  interface_error_t: { SUCCESS: interface_error_tValue<0>, FAIL: interface_error_tValue<255> };
  connector_type_t: { CONNECTOR_UNDEFINED: connector_type_tValue<0>, CONNECTOR_ESPNOW: connector_type_tValue<1>, CONNECTOR_BLE: connector_type_tValue<2>, CONNECTOR_SERIAL: connector_type_tValue<3>, CONNECTOR_WEBSOCKETS: connector_type_tValue<4>, CONNECTOR_TWAI: connector_type_tValue<5>, CONNECTOR_MAX: connector_type_tValue<6> };
  connection_rssi_t: { RSSI_MAX: connection_rssi_tValue<127>, RSSI_MIN: connection_rssi_tValue<-128> };
  connection_t: { new(): connection_t };
  Uint8Vector: { new(): Uint8Vector };
  Spectoda_WASM: { implement(_0: any): WrappedSpectoda_WASM; extend(_0: ArrayBuffer | Uint8Array | Uint8ClampedArray | Int8Array | string, _1: any): any };
  WrappedSpectoda_WASM: {};
  IConnector_WASM: { implement(_0: any): WrappedConnector_WASM; extend(_0: ArrayBuffer | Uint8Array | Uint8ClampedArray | Int8Array | string, _1: any): any };
  WrappedConnector_WASM: {};
}
