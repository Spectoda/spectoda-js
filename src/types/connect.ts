import { connectors } from "../constants";
import { SpectodaTypes } from "./primitives";

export type ConnectorType = (typeof connectors)[keyof typeof connectors];

export type ConnectorCriteria = SpectodaTypes.Criteria;
