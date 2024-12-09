import { Event } from "./event";
import { SpectodaTypes } from "./primitives";

type WebsocketConnectionStateProps = {
  "connecting-websockets": undefined;
  "connected-websockets": undefined;
  "disconnecting-websockets": undefined;
  "disconnected-websockets": undefined;
};

export type WebsocketConnectionState = keyof WebsocketConnectionStateProps;

type PropsMap = WebsocketConnectionStateProps & {
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

  emitted_events: [events: Event[]];
  emittedevents: [events: Event[]];
  eventstateupdates: [events: Event[]];
  event_state_updates: [events: Event[]];

  wasm_execute: [command: string];
  wasm_clock: [clock: number];
  "#connected": undefined;
  "#disconnected": undefined;
  "controller-log": [log: string];
};

export const SpectodaJsEvents: {
  [K in Uppercase<keyof PropsMap>]: Lowercase<keyof PropsMap>;
} = {
  CONNECTED: "connected",
  DISCONNECTED: "disconnected",
  CONNECTING: "connecting",
  DISCONNECTING: "disconnecting",

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

  "CONNECTING-WEBSOCKETS": "connecting-websockets",
  "CONNECTED-WEBSOCKETS": "connected-websockets",
  "DISCONNECTING-WEBSOCKETS": "disconnecting-websockets",
  "DISCONNECTED-WEBSOCKETS": "disconnected-websockets",

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
