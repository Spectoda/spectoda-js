import { validateTimestamp } from "./functions";
import { SpectodaWasm, MainModule } from "./src/SpectodaWasm";

declare global {
  interface Window {
    DEBUG_LEVEL_NONE: number;
    DEBUG_LEVEL_ERROR: number;
    DEBUG_LEVEL_WARN: number;
    DEBUG_LEVEL_INFO: number;
    DEBUG_LEVEL_DEBUG: number;
    DEBUG_LEVEL_VERBOSE: number;
    logging: typeof logging;

    MSStream: any;
    validateTimestamp: typeof validateTimestamp;
    mapValue: (x: any, in_min: any, in_max: any, out_min: any, out_max: any) => any;
    eruda: any;

    flutter_inappwebview: any;

    SpectodaWasm: typeof SpectodaWasm;
    Module: typeof MainModule;
    FS: any;
  }
}
