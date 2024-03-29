export const DEBUG_LEVEL_NONE = 0;
export const DEBUG_LEVEL_ERROR = 1;
export const DEBUG_LEVEL_WARN = 2;
export const DEBUG_LEVEL_INFO = 3;
export const DEBUG_LEVEL_DEBUG = 4;
export const DEBUG_LEVEL_VERBOSE = 5;

export var logging = {
  error: console.error,
  warn: console.warn,
  info: console.log,
  debug: console.log,
  verbose: function (...msg) {},
};

export function setLoggingLevel(level) {
  logging.error = level >= 1 ? console.error : function (...msg) {};
  logging.warn = level >= 2 ? console.warn : function (...msg) {};
  logging.info = level >= 3 ? console.log : function (...msg) {};
  logging.debug = level >= 4 ? console.log : function (...msg) {};
  logging.verbose = level >= 5 ? console.log : function (...msg) {};
}

export function routeLoggingElswhere(funcn) {
  logging.error = funcn;
  logging.warn = funcn;
  logging.info = funcn;
  logging.debug = funcn;
  logging.verbose = funcn;
}

if (typeof window !== "undefined") {
  window.DEBUG_LEVEL_NONE = DEBUG_LEVEL_NONE;
  window.DEBUG_LEVEL_ERROR = DEBUG_LEVEL_ERROR;
  window.DEBUG_LEVEL_WARN = DEBUG_LEVEL_WARN;
  window.DEBUG_LEVEL_INFO = DEBUG_LEVEL_INFO;
  window.DEBUG_LEVEL_DEBUG = DEBUG_LEVEL_DEBUG;
  window.DEBUG_LEVEL_VERBOSE = DEBUG_LEVEL_VERBOSE;

  window.setLoggingLevel = setLoggingLevel;
}

if (globalThis) {
  globalThis.DEBUG_LEVEL_NONE = DEBUG_LEVEL_NONE;
  globalThis.DEBUG_LEVEL_ERROR = DEBUG_LEVEL_ERROR;
  globalThis.DEBUG_LEVEL_WARN = DEBUG_LEVEL_WARN;
  globalThis.DEBUG_LEVEL_INFO = DEBUG_LEVEL_INFO;
  globalThis.DEBUG_LEVEL_DEBUG = DEBUG_LEVEL_DEBUG;
  globalThis.DEBUG_LEVEL_VERBOSE = DEBUG_LEVEL_VERBOSE;

  globalThis.setLoggingLevel = setLoggingLevel;
}
