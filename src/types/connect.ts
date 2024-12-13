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

export type ConnectionStatus = (typeof CONNECTION_STATUS)[keyof typeof CONNECTION_STATUS];

export const WEBSOCKET_CONNECTION_STATE = Object.freeze({
  CONNECTING: "connecting-websockets",
  CONNECTED: "connected-websockets",
  DISCONNECTING: "disconnecting-websockets",
  DISCONNECTED: "disconnected-websockets",
});

export type WebsocketConnectionState = (typeof WEBSOCKET_CONNECTION_STATE)[keyof typeof WEBSOCKET_CONNECTION_STATE];
