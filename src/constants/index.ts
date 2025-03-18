import { SpectodaTypes } from '../types/primitives'

/** @deprecated use `VALUE_TYPE` from `spectoda-js/constants/values` instead. */
export const VALUE_TYPE = Object.freeze({
  NUMBER: 29,
  LABEL: 31,
  TIMESTAMP: 32,
  PERCENTAGE: 30,
  DATE: 28,
  REAL: 27,
  COLOR: 26,
  PIXELS: 19,
  BOOLEAN: 2,
  NULL: 1,
  UNDEFINED: 0,
})

/** @deprecated Use `VALUE_LIMITS` from `spectoda-js/constants/valueLimits` instead. */
export const VALUE_LIMITS = Object.freeze({
  NUMBER_MAX: 1000000000,
  NUMBER_MIN: -100000000000,
  TIMESTAMP_MAX: 86400000,
  TIMESTAMP_MIN: -86400000,

  PERCENTAGE_100: 100000000,
  PERCENTAGE_0: 0,
  PERCENTAGE_MINUS_100: -100000000,
})

export const BROADCAST_ID = 255
export const LABEL_MAX_LENGTH = 5
export const MAX_ID = 255
export const MAX_PRODUCT_CODE = 0xffff
export const MAX_PCB_CODE = 0xffff
export const MAX_TNGL_BANK = 255

export const CONNECTORS = Object.freeze({
  NONE: 'none',
  DEFAULT: 'default',

  BLUETOOTH: 'bluetooth',
  WEBSOCKETS: 'websockets',
  SERIAL: 'serial',

  SIMULATED: 'simulated',
  DUMMY: 'dummy',
})

export const DEFAULT_CONNECTOR = CONNECTORS.DEFAULT

/**
 * No Network Signature
 * @deprecated Use criteria.commissionable = true instead
 */
export const NO_NETWORK_SIGNATURE: SpectodaTypes.NetworkSignature = '00000000000000000000000000000000'

/**
 * No Network Key
 * @deprecated Use criteria.commissionable = true instead
 */
export const NO_NETWORK_KEY: SpectodaTypes.NetworkKey = '00000000000000000000000000000000'

/** Default MAC address for the app */
export const APP_MAC_ADDRESS: SpectodaTypes.MacAddress = '00:00:12:34:56:78'

/** TODO: ADD description */
export const USE_ALL_CONNECTIONS = ['*/ff:ff:ff:ff:ff:ff']

/** TODO: ADD description */
export const DEFAULT_TIMEOUT = null

/** TODO: ADD description */
export const TNGL_SIZE_CONSIDERED_BIG = 12288

/** TODO: ADD description */
export const COMMAND_FLAGS = Object.freeze({
  FLAG_UNSUPPORTED_COMMND_RESPONSE: 255, // TODO change FLAG_OTA_BEGIN to not be 255.

  // legacy FW update flags
  FLAG_OTA_BEGIN: 255, // legacy
  FLAG_OTA_WRITE: 0, // legacy // TODO change FLAG_OTA_WRITE to not be 0.
  FLAG_OTA_END: 254, // legacy
  FLAG_OTA_RESET: 253, // legacy

  FLAG_DEVICE_REBOOT_REQUEST: 5, // legacy
  FLAG_DEVICE_DISCONNECT_REQUEST: 6,

  FLAG_CONFIG_UPDATE_REQUEST: 10,
  FLAG_CONFIG_UPDATE_RESPONSE: 11,

  // Former CommandFlag begin
  // FLAG_RSSI_DATA:  100,
  FLAG_PEER_CONNECTED: 101,
  FLAG_PEER_DISCONNECTED: 102,

  // FLAG_CONF_BYTES:  103,
  FLAG_LOAD_TNGL: 104,
  FLAG_TIMELINE_WRITE: 105,

  FLAG_EMIT_NULL_EVENT: 117,
  FLAG_EMIT_BOOLEAN_EVENT: 118,
  FLAG_EMIT_VALUE_ADDRESS_EVENT: 119,
  FLAG_EMIT_PIXELS_EVENT: 120,
  FLAG_EMIT_COLOR_EVENT: 121,
  FLAG_EMIT_DATE_EVENT: 122,
  FLAG_EMIT_PERCENTAGE_EVENT: 123,
  FLAG_EMIT_TIMESTAMP_EVENT: 124,
  FLAG_EMIT_LABEL_EVENT: 125,
  FLAG_EMIT_NUMBER_EVENT: 126,
  FLAG_EMIT_NORMALIZED_EVENT: 127,

  // Former CommandFlag end

  // 0.12.4
  FLAG_WRITE_IO_MAPPING_REQUEST: 170,
  FLAG_WRITE_IO_MAPPING_RESPONSE: 171,
  FLAG_READ_IO_MAPPING_REQUEST: 172,
  FLAG_READ_IO_MAPPING_RESPONSE: 173,
  FLAG_WRITE_IO_VARIANT_REQUEST: 174,
  FLAG_WRITE_IO_VARIANT_RESPONSE: 175,
  FLAG_READ_IO_VARIANT_REQUEST: 176,
  FLAG_READ_IO_VARIANT_RESPONSE: 177,
  FLAG_READ_CONTROLLER_INFO_REQUEST: 178,
  FLAG_READ_CONTROLLER_INFO_RESPONSE: 179,

  // 0.12.1
  FLAG_READ_TNGL_BYTECODE_REQUEST: 180,
  FLAG_READ_TNGL_BYTECODE_RESPONSE: 181,
  FLAG_ERASE_TNGL_BYTECODE_REQUEST: 182,
  FLAG_ERASE_TNGL_BYTECODE_RESPONSE: 183,

  // 0.10.4
  FLAG_ERASE_TNGL_MEMORY_BANK_REQUEST: 184,
  FLAG_ERASE_TNGL_MEMORY_BANK_RESPONSE: 185,
  FLAG_SAVE_TNGL_MEMORY_BANK_REQUEST: 186,
  FLAG_SAVE_TNGL_MEMORY_BANK_RESPONSE: 187,
  FLAG_LOAD_TNGL_MEMORY_BANK_REQUEST: 188,
  FLAG_LOAD_TNGL_MEMORY_BANK_RESPONSE: 189,

  FLAG_READ_PORT_PIXELS_REQUEST: 190,
  FLAG_READ_PORT_PIXELS_RESPONSE: 191,
  FLAG_WRITE_PORT_PIXELS_REQUEST: 192,
  FLAG_WRITE_PORT_PIXELS_RESPONSE: 193,
  FLAG_EVALUATE_ON_CONTROLLER_REQUEST: 194,
  FLAG_EVALUATE_ON_CONTROLLER_RESPONSE: 195,

  FLAG_READ_CONTROLLER_CODES_REQUEST: 196,
  FLAG_READ_CONTROLLER_CODES_RESPONSE: 197,
  FLAG_WRITE_CONTROLLER_CODES_REQUEST: 198,
  FLAG_WRITE_CONTROLLER_CODES_RESPONSE: 199,
  FLAG_READ_OWNER_SIGNATURE_REQUEST: 200,
  FLAG_READ_OWNER_SIGNATURE_RESPONSE: 201,

  FLAG_WRITE_CONTROLLER_NAME_REQUEST: 202,
  FLAG_WRITE_CONTROLLER_NAME_RESPONSE: 203,
  FLAG_READ_CONTROLLER_NAME_REQUEST: 204,
  FLAG_READ_CONTROLLER_NAME_RESPONSE: 205,

  FLAG_MERGE_EVENT_HISTORY_REQUEST: 206,
  FLAG_MERGE_EVENT_HISTORY_RESPONSE: 207,
  FLAG_ERASE_EVENT_HISTORY_REQUEST: 208,
  FLAG_ERASE_EVENT_HISTORY_RESPONSE: 209,

  FLAG_REQUEST_PEER_REQUEST: 210,
  FLAG_REQUEST_PEER_RESPONSE: 211,

  FLAG_EVENT_HISTORY_BC_REQUEST: 212,
  FLAG_EVENT_HISTORY_BC_RESPONSE: 213,

  FLAG_VISIBLE_PEERS_REQUEST: 214,
  FLAG_VISIBLE_PEERS_RESPONSE: 215,

  FLAG_FW_UPDATE_PEER_REQUEST: 216,
  FLAG_FW_UPDATE_PEER_RESPONSE: 217,

  FLAG_SYNC_STATE_REQUEST: 218,
  FLAG_SYNC_STATE_RESPONSE: 219,

  FLAG_SAVE_STATE_REQUEST: 220,
  FLAG_SAVE_STATE_RESPONSE: 221,

  FLAG_SLEEP_REQUEST: 222,
  FLAG_SLEEP_RESPONSE: 223,
  FLAG_CONNECTED_PEERS_INFO_REQUEST: 224,
  FLAG_CONNECTED_PEERS_INFO_RESPONSE: 225,

  FLAG_DEVICE_CONFIG_REQUEST: 226,
  FLAG_DEVICE_CONFIG_RESPONSE: 227,
  FLAG_ROM_PHY_VDD33_REQUEST: 228,
  FLAG_ROM_PHY_VDD33_RESPONSE: 229,
  FLAG_VOLTAGE_ON_PIN_REQUEST: 230,
  FLAG_VOLTAGE_ON_PIN_RESPONSE: 231,

  FLAG_CHANGE_DATARATE_REQUEST: 232,
  FLAG_CHANGE_DATARATE_RESPONSE: 233,

  FLAG_FW_VERSION_REQUEST: 234,
  FLAG_FW_VERSION_RESPONSE: 235,
  FLAG_ERASE_NETWORK_REQUEST: 236,
  FLAG_ERASE_OWNER_RESPONSE: 237,

  FLAG_TNGL_FINGERPRINT_REQUEST: 242,
  FLAG_TNGL_FINGERPRINT_RESPONSE: 243,
  FLAG_TIMELINE_REQUEST: 244,
  FLAG_TIMELINE_RESPONSE: 245,

  FLAG_CONNECT_REQUEST: 238,
  FLAG_CONNECT_RESPONSE: 239,
  FLAG_ADOPT_REQUEST: 240,
  FLAG_ADOPT_RESPONSE: 241,
})

export { JS_EVENT_VALUE_LIMITS as JS_VALUE_LIMITS, CPP_EVENT_VALUE_LIMITS as CPP_VALUE_LIMITS } from './limits'
