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

export var logging = {
  LOGGING_LEVEL_NONE: 0,
  LOGGING_LEVEL_ERROR: 1,
  LOGGING_LEVEL_WARN: 2,
  LOGGING_LEVEL_INFO: 3,
  LOGGING_LEVEL_DEBUG: 4,
  LOGGING_LEVEL_VERBOSE: 5,

  level: 3,

  setLoggingLevel: (level: number) => {
    if (level !== undefined && level !== null && level >= 0 && level <= 5) {
      logging.level = level;
    }
    logging.error = logging.level >= 1 ? console.error : function (...msg) { };
    logging.warn = logging.level >= 2 ? console.warn : function (...msg) { };
    logging.info = logging.level >= 3 ? console.log : function (...msg) { };
    logging.debug = logging.level >= 4 ? console.log : function (...msg) { };
    logging.verbose = logging.level >= 5 ? console.log : function (...msg) { };
  },

  routeLoggingElswhere: (callback, level: number) => {
    if (level !== undefined && level !== null && level >= 0 && level <= 5) {
      logging.level = level;
    }
    logging.error = logging.level >= 1 ? callback : function (...msg) { };
    logging.warn = logging.level >= 2 ? callback : function (...msg) { };
    logging.info = logging.level >= 3 ? callback : function (...msg) { };
    logging.debug = logging.level >= 4 ? callback : function (...msg) { };
    logging.verbose = logging.level >= 5 ? callback : function (...msg) { };
  },

  error: console.error,
  warn: console.warn,
  info: console.log,
  debug: function (...msg: any) { },
  verbose: function (...msg: any) { },
};

// ! deprecated use logging.setLoggingLevel
export function setLoggingLevel(level: number) {
  return logging.setLoggingLevel(level);
}

// ! deprecated use logging.routeLoggingElswhere
export function routeLoggingElswhere(callback, level: number = 3) {
  return logging.routeLoggingElswhere(callback, level);
}

if (typeof window !== "undefined") {
  window.logging = logging;

  // ! deprecated use logging.LOGGING_LEVEL_NONE
  window.DEBUG_LEVEL_NONE = DEBUG_LEVEL_NONE;
  // ! deprecated use logging.LOGGING_LEVEL_ERROR
  window.DEBUG_LEVEL_ERROR = DEBUG_LEVEL_ERROR;
  // ! deprecated use logging.LOGGING_LEVEL_WARN
  window.DEBUG_LEVEL_WARN = DEBUG_LEVEL_WARN;
  // ! deprecated use logging.LOGGING_LEVEL_INFO
  window.DEBUG_LEVEL_INFO = DEBUG_LEVEL_INFO;
  // ! deprecated use logging.LOGGING_LEVEL_DEBUG
  window.DEBUG_LEVEL_DEBUG = DEBUG_LEVEL_DEBUG;
  // ! deprecated use logging.LOGGING_LEVEL_VERBOSE
  window.DEBUG_LEVEL_VERBOSE = DEBUG_LEVEL_VERBOSE;

  // ! deprecated use logging.setLoggingLevel
  window.setLoggingLevel = logging.setLoggingLevel;
  // ! deprecated use logging.routeLoggingElswhere
  window.routeLoggingElswhere = logging.routeLoggingElswhere;
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
