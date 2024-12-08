import { SpectodaEvent } from "../SpectodaWasm";
import { TnglBytes, UsedIds } from "./primitives";

type ConnectionEvents = { name: "connected" } | { name: "disconnected" } | { name: "connecting" } | { name: "disconnecting" };

type PeerEvents = { name: "peer_connected"; props: [mac: string] } | { name: "peer_disconnected"; props: [mac: string] };

type WebsocketEvents = { name: "connecting-websockets" } | { name: "connected-websockets" } | { name: "disconnecting-websockets" } | { name: "disconnected-websockets" };

type EventEvents = { name: "emittedevents"; props: [events: SpectodaEvent[]] } | { name: "eventstateupdates"; props: [events: SpectodaEvent[]] };

type OTAStatus = "begin" | "success" | "fail";

type OTAEvents = { name: "ota_status"; props: [status: OTAStatus] } | { name: "ota_progress"; props: [percentageProgress: number] } | { name: "ota_timeleft"; props: [timeleftSeconds: number] };

type TnglEvent = { name: "tngl_update"; props: { tngl_bytes: TnglBytes; used_ids: UsedIds } };

type SpectodaEvents = ConnectionEvents | PeerEvents | WebsocketEvents | EventEvents | OTAEvents | TnglEvent;

export type SpectodaEventsType = SpectodaEvents["name"];

export const connectors = {
  NONE: "none",
  DEFAULT: "default",
  BLUETOOTH: "bluetooth",
  SERIAL: "serial",
  WEBSOCKETS: "websockets",
  SIMULATED: "simulated",
  DUMMY: "dummy",
};
