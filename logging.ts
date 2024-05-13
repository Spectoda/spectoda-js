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

export const defaultLoggingCallBacks = Object.freeze({
  log: console.log,
  warn: console.warn,
  error: console.error,
});

// Logging configuration object
export const logging = {
  LOGGING_LEVEL_NONE: 0,
  LOGGING_LEVEL_ERROR: 1,
  LOGGING_LEVEL_WARN: 2,
  LOGGING_LEVEL_INFO: 3,
  LOGGING_LEVEL_DEBUG: 4,
  LOGGING_LEVEL_VERBOSE: 5,

  level: 3,

  logCallback: defaultLoggingCallBacks.log,
  warnCallback: defaultLoggingCallBacks.warn,
  errorCallback: defaultLoggingCallBacks.error,

  setLoggingLevel: (level: number) => {
    if (level >= 0 && level <= 5) {
      logging.level = level;
    }
    logging.error = logging.level >= 1 ? logging.errorCallback : () => {};
    logging.warn = logging.level >= 2 ? logging.warnCallback : () => {};
    logging.info = logging.level >= 3 ? logging.logCallback : () => {};
    logging.debug = logging.level >= 4 ? logging.logCallback : () => {};
    logging.verbose = logging.level >= 5 ? logging.logCallback : () => {};
  },

  setLogCallback(callback: (...msg: any) => void) {
    logging.logCallback = callback;
  },

  setWarnCallback(callback: (...msg: any) => void) {
    logging.warnCallback = callback;
  },

  setErrorCallback(callback: (...msg: any) => void) {
    logging.errorCallback = callback;
  },

  error: (...msg: any) => logging.errorCallback(...msg),
  warn: (...msg: any) => logging.warnCallback(...msg),
  info: (...msg: any) => logging.logCallback(...msg),
  debug: (...msg: any) => logging.logCallback(...msg),
  verbose: (...msg: any) => logging.logCallback(...msg),
};
logging.setLoggingLevel(3);
