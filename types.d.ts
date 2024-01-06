import { validateTimestamp } from "./src/functions";

declare global {
  interface Window {
    DEBUG_LEVEL_NONE: number;
    DEBUG_LEVEL_ERROR: number;
    DEBUG_LEVEL_WARN: number;
    DEBUG_LEVEL_INFO: number;
    DEBUG_LEVEL_DEBUG: number;
    DEBUG_LEVEL_VERBOSE: number;
    setLoggingLevel: (level: number) => void;

    socket: unknown;
    sockets: Array<unknown>;

    MSStream: unknown;
    validateTimestamp: typeof validateTimestamp;
    mapValue: (x: unknown, in_min: unknown, in_max: unknown, out_min: unknown, out_max: unknown) => unknown;
    eruda: unknown;
  }
}
