import { validateTimestamp } from "./functions";

declare namespace nosleep {
  class NoSleep {
    constructor();

    get isEnabled(): boolean;
    enable(): Promise<any>;
    disable(): void;
    _addSourceToVideo(element: HTMLElement, type: string, dataURI: string): void;
  }
}

declare global {
  interface Window {
    NoSleep: typeof nosleep.NoSleep;
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

export interface Criterion {
  name?: string | undefined;
  namePrefix?: string | undefined;
  fwVersion?: string | undefined;
  ownerSignature?: string | undefined;
  productCode?: number | undefined;
  pcbCode?: number | undefined;
  adoptionFlag?: boolean | undefined;
}

export default nosleep.NoSleep;
