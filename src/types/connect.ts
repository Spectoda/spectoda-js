import { CONNECTORS } from "../constants";
import { SpectodaTypes } from "./primitives";

export type ConnectorType = (typeof CONNECTORS)[keyof typeof CONNECTORS];

export type ConnectorCriteria = SpectodaTypes.Criteria;
