import { CONNECTORS } from "../constants";
import { SpectodaTypes } from "./primitives";

export type ConnectorType = (typeof CONNECTORS)[keyof typeof CONNECTORS];

export type ConnectorCriteria = SpectodaTypes.Criteria;

export const CONNECTION_STATUS = Object.freeze({
  CONNECTED: "connected",
  CONNECTING: "connecting",
  DISCONNECTED: "disconnected",
  DISCONNECTING: "disconnecting",
});
