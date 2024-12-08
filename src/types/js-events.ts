import { Event } from "./event";
import { SpectodaTypes } from "./primitives";

type ConnectionEvents = { name: "connected" } | { name: "disconnected" } | { name: "connecting" } | { name: "disconnecting" };

type PeerEvents = { name: "peer_connected"; props: [mac: string] } | { name: "peer_disconnected"; props: [mac: string] };

type WebsocketEvents = { name: "connecting-websockets" } | { name: "connected-websockets" } | { name: "disconnecting-websockets" } | { name: "disconnected-websockets" };

type EventEvents = { name: "emittedevents"; props: [events: Event[]] } | { name: "eventstateupdates"; props: [events: Event[]] };

type OTAStatus = "begin" | "success" | "fail";

type OTAEvents = { name: "ota_status"; props: [status: OTAStatus] } | { name: "ota_progress"; props: [percentageProgress: number] } | { name: "ota_timeleft"; props: [timeleftSeconds: number] };

type TnglEvent = { name: "tngl_update"; props: { tngl_bytes: SpectodaTypes.TnglBytes; used_ids: SpectodaTypes.UsedIds } };

type InternalEvents = { name: "#connected" } | { name: "#disconnected" } | { name: "controller-log" } | { name: "wasm_clock" } | { name: "wasm_execute" };

export type SpectodaJsEventsWithAttributes = ConnectionEvents | PeerEvents | WebsocketEvents | EventEvents | OTAEvents | TnglEvent | InternalEvents;

export type SpectodaJsEventName = SpectodaJsEventsWithAttributes["name"];

export type SpectodaJsEventMap = {
  [E in SpectodaJsEventsWithAttributes as E["name"]]: E extends { props: infer P } ? (P extends [infer Single] ? Single : P) : undefined;
};
