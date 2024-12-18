import { CONNECTION_STATUS, ConnectionStatus, WEBSOCKET_CONNECTION_STATE, WebsocketConnectionState } from "./connect";
import { Event } from "./event";
import { SpectodaTypes } from "./primitives";

type WebsocketConnectionStateProps = {
  [K in WebsocketConnectionState]: undefined;
};

type ConnectionStatusProps = {
  [K in ConnectionStatus]: undefined;
};

type PropsMap = WebsocketConnectionStateProps &
  ConnectionStatusProps & {
    connected: undefined;
    disconnected: undefined;
    connecting: undefined;
    disconnecting: undefined;

    peer_connected: [mac: string];
    peer_disconnected: [mac: string];

    ota_status: ["begin" | "success" | "fail"];
    ota_progress: [percentageProgress: number];
    ota_timeleft: [timeleftSeconds: number];

    tngl_update: { tngl_bytes: SpectodaTypes.TnglBytes; used_ids: SpectodaTypes.UsedIds };

    // Private events
    "#connected": undefined;
    "#disconnected": undefined;

    // TODO deprecate @immakermatty
    emitted_events: [events: Event[]];

    // TODO deprecate @immakermatty
    event_state_updates: [events: Event[]];

    emittedevents: [events: Event[]];
    eventstateupdates: [events: Event[]];

    // TODO deprecate @immakermatty
    wasm_execute: [commands: any];

    // TODO deprecate @immakermatty
    wasm_clock: [clock: number];

    // TODO deprecate @immakermatty
    "controller-log": [log: string];
  };

export const SpectodaJsEvents = {
  ...CONNECTION_STATUS,

  "CONNECTING-WEBSOCKETS": WEBSOCKET_CONNECTION_STATE.CONNECTING,
  "CONNECTED-WEBSOCKETS": WEBSOCKET_CONNECTION_STATE.CONNECTED,
  "DISCONNECTING-WEBSOCKETS": WEBSOCKET_CONNECTION_STATE.DISCONNECTING,
  "DISCONNECTED-WEBSOCKETS": WEBSOCKET_CONNECTION_STATE.DISCONNECTED,

  PEER_CONNECTED: "peer_connected",
  PEER_DISCONNECTED: "peer_disconnected",

  OTA_STATUS: "ota_status",
  OTA_PROGRESS: "ota_progress",
  OTA_TIMELEFT: "ota_timeleft",

  TNGL_UPDATE: "tngl_update",

  EMITTED_EVENTS: "emitted_events",
  EMITTEDEVENTS: "emittedevents",
  EVENT_STATE_UPDATES: "event_state_updates",
  EVENTSTATEUPDATES: "eventstateupdates",

  WASM_EXECUTE: "wasm_execute",
  WASM_CLOCK: "wasm_clock",

  "#CONNECTED": "#connected",
  "#DISCONNECTED": "#disconnected",
  "CONTROLLER-LOG": "controller-log",
} as const;

export type SpectodaJsEventName = (typeof SpectodaJsEvents)[keyof typeof SpectodaJsEvents];

export type SpectodaJsEventMap = {
  [K in SpectodaJsEventName]: PropsMap[K];
};

export const SPECTODA_JS_EVENTS = Object.freeze(SpectodaJsEvents);
