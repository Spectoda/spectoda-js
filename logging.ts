import { emitHandler } from "./functions";

/**
 * @deprecated use logging.LOGGING_LEVEL_NONE */
export const DEBUG_LEVEL_NONE = 0;
/**
 * @deprecated use logging.LOGGING_LEVEL_ERROR */
export const DEBUG_LEVEL_ERROR = 1;
/**
 * @deprecated use logging.LOGGING_LEVEL_WARN */
export const DEBUG_LEVEL_WARN = 2;
/**
 * @deprecated use logging.LOGGING_LEVEL_INFO */
export const DEBUG_LEVEL_INFO = 3;
/**
 * @deprecated use logging.LOGGING_LEVEL_DEBUG */
export const DEBUG_LEVEL_DEBUG = 4;
/**
 * @deprecated use logging.LOGGING_LEVEL_VERBOSE */
export const DEBUG_LEVEL_VERBOSE = 5;

const logLevels: Record<number, string> = {
  0: "none",
  1: "error",
  2: "warn",
  3: "info",
  4: "debug",
  5: "verbose",
};

export const logWrapper = (level: number, ...msgs: any) => {
  const levelStr = logLevels[level] ?? "info";

  switch (level) {
    case 1:
      console.error(...msgs);
      break;
    case 2:
      console.warn(...msgs);
      break;
    case 3:
      console.log(...msgs);
      break;
    case 4:
      console.log(...msgs);
      break;
    case 5:
      console.log(...msgs);
      break;
  }

  emitHandler("log", { level, msgs });
};

// Logging configuration object
export const logging = {
  LOGGING_LEVEL_NONE: 0,
  LOGGING_LEVEL_ERROR: 1,
  LOGGING_LEVEL_WARN: 2,
  LOGGING_LEVEL_INFO: 3,
  LOGGING_LEVEL_DEBUG: 4,
  LOGGING_LEVEL_VERBOSE: 5,

  level: 3,

  setLoggingLevel: (level: number) => {
    if (level >= 0 && level <= 5) {
      logging.level = level;
    }
    logging.error = logging.level >= 1 ? (...msg) => logWrapper(1, ...msg) : () => {};
    logging.warn = logging.level >= 2 ? (...msg) => logWrapper(2, ...msg) : () => {};
    logging.info = logging.level >= 3 ? (...msg) => logWrapper(3, ...msg) : () => {};
    logging.debug = logging.level >= 4 ? (...msg) => logWrapper(4, ...msg) : () => {};
    logging.verbose = logging.level >= 5 ? (...msg) => logWrapper(5, ...msg) : () => {};
  },

  routeLoggingElsewhere: (callback: Function, level: number) => {
    if (level >= 0 && level <= 5) {
      logging.level = level;
    }
    logging.error = logging.level >= 1 ? (...msg) => callback(1, ...msg) : () => {};
    logging.warn = logging.level >= 2 ? (...msg) => callback(2, ...msg) : () => {};
    logging.info = logging.level >= 3 ? (...msg) => callback(3, ...msg) : () => {};
    logging.debug = logging.level >= 4 ? (...msg) => callback(4, ...msg) : () => {};
    logging.verbose = logging.level >= 5 ? (...msg) => callback(5, ...msg) : () => {};
  },

  error: (...msg: any) => logWrapper(1, ...msg),
  warn: (...msg: any) => logWrapper(2, ...msg),
  info: (...msg: any) => logWrapper(3, ...msg),
  debug: (...msg: any) => logWrapper(4, ...msg),
  verbose: (...msg: any) => logWrapper(5, ...msg),
};
setLoggingLevel(3);

// ! deprecated use logging.setLoggingLevel
export function setLoggingLevel(level: number) {
  return logging.setLoggingLevel(level);
}

// ! deprecated use logging.routeLoggingElswhere
export function routeLoggingElswhere(callback: Function, level: number = 3) {
  return logging.routeLoggingElsewhere(callback, level);
}

if (globalThis) {
  globalThis.logging = logging;

  // ! deprecated use logging.LOGGING_LEVEL_NONE
  globalThis.DEBUG_LEVEL_NONE = DEBUG_LEVEL_NONE;
  // ! deprecated use logging.LOGGING_LEVEL_ERROR
  globalThis.DEBUG_LEVEL_ERROR = DEBUG_LEVEL_ERROR;
  // ! deprecated use logging.LOGGING_LEVEL_WARN
  globalThis.DEBUG_LEVEL_WARN = DEBUG_LEVEL_WARN;
  // ! deprecated use logging.LOGGING_LEVEL_INFO
  globalThis.DEBUG_LEVEL_INFO = DEBUG_LEVEL_INFO;
  // ! deprecated use logging.LOGGING_LEVEL_DEBUG
  globalThis.DEBUG_LEVEL_DEBUG = DEBUG_LEVEL_DEBUG;
  // ! deprecated use logging.LOGGING_LEVEL_VERBOSE
  globalThis.DEBUG_LEVEL_VERBOSE = DEBUG_LEVEL_VERBOSE;

  // ! deprecated use logging.setLoggingLevel
  globalThis.setLoggingLevel = logging.setLoggingLevel;
  // ! deprecated use logging.routeLoggingElswhere
  globalThis.routeLoggingElswhere = logging.routeLoggingElswhere;
}
