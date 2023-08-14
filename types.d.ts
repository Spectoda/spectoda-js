import { validateTimestamp } from "./functions";

declare global {
  interface Window {
    DEBUG_LEVEL_NONE: number;
    DEBUG_LEVEL_ERROR: number;
    DEBUG_LEVEL_WARN: number;
    DEBUG_LEVEL_INFO: number;
    DEBUG_LEVEL_DEBUG: number;
    DEBUG_LEVEL_VERBOSE: number;
    setLoggingLevel: (level: number) => void;

    MSStream: any;
    validateTimestamp: typeof validateTimestamp;
    mapValue: (x: any, in_min: any, in_max: any, out_min: any, out_max: any) => any;
    eruda: any;
  }
}

