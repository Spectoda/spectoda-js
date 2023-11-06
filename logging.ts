export const DEBUG_LEVEL_NONE = 0;
export const DEBUG_LEVEL_ERROR = 1;
export const DEBUG_LEVEL_WARN = 2;
export const DEBUG_LEVEL_INFO = 3;
export const DEBUG_LEVEL_DEBUG = 4;
export const DEBUG_LEVEL_VERBOSE = 5;

export var logging = {
  level: 3,
  error: console.error,
  warn: console.warn,
  info: console.log,
  debug: console.log,
  verbose: console.log,
};

export function setLoggingLevel(level: number) {
  logging.level = level;
  console.warn("SETTING DEBUG LEVEL TO:", logging.level);
  logging.error = logging.level >= 1 ? console.error : function (...msg) { };
  logging.warn = logging.level >= 2 ? console.warn : function (...msg) { };
  logging.info = logging.level >= 3 ? console.log : function (...msg) { };
  logging.debug = logging.level >= 4 ? console.log : function (...msg) { };
  logging.verbose = logging.level >= 5 ? console.log : function (...msg) { };
}

export function routeLoggingElswhere(funcn: any) {
  logging.error = funcn;
  logging.warn = funcn;
  logging.info = funcn;
  logging.debug = funcn;
  logging.verbose = funcn;
}

if (typeof window !== "undefined") {
  // window.DEBUG_LEVEL_NONE = DEBUG_LEVEL_NONE;
  // window.DEBUG_LEVEL_ERROR = DEBUG_LEVEL_ERROR;
  // window.DEBUG_LEVEL_WARN = DEBUG_LEVEL_WARN;
  // window.DEBUG_LEVEL_INFO = DEBUG_LEVEL_INFO;
  // window.DEBUG_LEVEL_DEBUG = DEBUG_LEVEL_DEBUG;
  // window.DEBUG_LEVEL_VERBOSE = DEBUG_LEVEL_VERBOSE;

  // @ts-ignore
  window.setLoggingLevel = setLoggingLevel;
}

if (globalThis) {
  // globalThis.DEBUG_LEVEL_NONE = DEBUG_LEVEL_NONE;
  // globalThis.DEBUG_LEVEL_ERROR = DEBUG_LEVEL_ERROR;
  // globalThis.DEBUG_LEVEL_WARN = DEBUG_LEVEL_WARN;
  // globalThis.DEBUG_LEVEL_INFO = DEBUG_LEVEL_INFO;
  // globalThis.DEBUG_LEVEL_DEBUG = DEBUG_LEVEL_DEBUG;
  // globalThis.DEBUG_LEVEL_VERBOSE = DEBUG_LEVEL_VERBOSE;

  // @ts-ignore
  globalThis.setLoggingLevel = setLoggingLevel;
}
