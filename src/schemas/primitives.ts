import { z } from 'zod'

import { LABEL_MAX_LENGTH, MAX_ID, MAX_PCB_CODE, MAX_PRODUCT_CODE, MAX_TNGL_BANK } from '../constants'
import { JS_EVENT_VALUE_LIMITS } from '../constants/limits'

/**
 * Whole integer number value. Range: -1000000000 to 1000000000
 *
 * @example 42
 * @example -1000
 * @example 999999999
 */
export const NumberSchema = z.number().int().min(JS_EVENT_VALUE_LIMITS.NUMBER_MIN).max(JS_EVENT_VALUE_LIMITS.NUMBER_MAX)

/**
 * String of max 5 alphanumeric chars and underscores ([a-zA-Z0-9_]).
 *
 * @example "toggl"
 * @example "brigh"
 * @example "color"
 * @example "P_ena"
 * @example "LIGHT"
 */
export const LabelSchema = z
  .string()
  .regex(/^[a-zA-Z0-9_]*$/)
  .max(LABEL_MAX_LENGTH)

/**
 * Controller name. Same type as LabelSchema.
 *
 * @example "SC_1"
 * @example "SCI01"
 */
export const ControllerNameSchema = LabelSchema

/**
 * Timestamp in milliseconds. Range: -86400000 to 86400000
 *
 * @example 0
 * @example 86400000
 * @example -86400000
 * @example 1000
 */
export const TimestampSchema = z
  .number()
  .min(JS_EVENT_VALUE_LIMITS.TIMESTAMP_MIN)
  .max(JS_EVENT_VALUE_LIMITS.TIMESTAMP_MAX)

/**
 * Percentage value with 6 decimal places. Range: -100.000000 to 100.000000
 *
 * @example 100
 * @example -100
 * @example 50.5
 * @example 0
 */
export const PercentageSchema = z
  .number()
  .min(JS_EVENT_VALUE_LIMITS.PERCENTAGE_MINUS_MAX)
  .max(JS_EVENT_VALUE_LIMITS.PERCENTAGE_MAX)

/**
 * Date string in ISO 8601 format.
 *
 * @example "2024-01-01"
 * @example "2023-12-31"
 */
export const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

/**
 * Color string in hexadecimal format, where the # is optional.
 *
 * @example "FF0000"
 * @example "#00FF00"
 * @example "0000FF"
 */
export const ColorSchema = z.string().regex(/#?[\dA-Fa-f]{6}/g)

/**
 * Pixels value. Range: -32768 to 32767
 *
 * @example 100
 * @example -100
 * @example 32767
 */
export const PixelsSchema = z.number().int().min(JS_EVENT_VALUE_LIMITS.PIXELS_MIN).max(JS_EVENT_VALUE_LIMITS.PIXELS_MAX)

/**
 * Boolean value.
 *
 * @example true
 * @example false
 */
export const BooleanSchema = z.boolean()

/**
 * Null value.
 *
 * @example null
 */
export const NullSchema = z.null()

/**
 * Undefined value.
 *
 * @example undefined
 */
export const UndefinedSchema = z.undefined()

/**
 * ID of an event or segment.
 * Range: 0 - 255
 *
 * @example 0
 * @example 42
 * @example 255
 */
export const IDSchema = z.number().min(0).max(MAX_ID)

/**
 * Network signature as 32-character lowercase hexadecimal string.
 *
 * @example "34567890123456789012345678901234"
 * @example "14fe7f8214fe7f8214fe7f8214fe7f82"
 */
export const NetworkSignatureSchema = z.string().regex(/^[a-f0-9]{32}$/)

/**
 * Network key as 32-character hexadecimal string.
 *
 * @example "34567890123456789012345678901234"
 */
export const NetworkKeySchema = z.string().regex(/^[a-f0-9]{32}$/)

/**
 * MAC address in format "XX:XX:XX:XX:XX:XX".
 *
 * @example "12:43:ab:8d:ff:04"
 * @example "01:23:45:56:ab:cd"
 */
export const MacAddressSchema = z.string().regex(/^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/)

/**
 * PCB (Printed Circuit Board) code.
 * Range: 0 - 16535
 *
 * @example 32
 */
export const PcbCodeSchema = z.number().int().min(0).max(MAX_PCB_CODE)

/**
 * Product code for specific models.
 * Range: 0 - 16535
 *
 * @example 24
 */
export const ProductCodeSchema = z.number().int().min(0).max(MAX_PRODUCT_CODE)

/**
 * Firmware version in format "X.Y.Z" or "!X.Y.Z".
 *
 * @example "0.12.2"
 * @example "!1.0.0"
 */
export const FirmwareVersionSchema = z.string().regex(/^!?\d+\.\d+\.\d+$/)

/**
 * Full firmware version string.
 * Format: PREFIX_X.Y.Z_YYYYMMDD
 *
 * @example "UNIVERSAL_0.12.2_20250208"
 * @example "FW_0.12.1_20241117"
 */
export const FirmwareVersionFullSchema = z.string().regex(/^[A-Z_]+\d+\.\d+\.\d+_\d{8}$/)

/**
 * Fingerprint as 32-character hexadecimal string.
 * Used for TNGL, event store, and config fingerprints.
 *
 * @example "839dfa03839dfa03839dfa03839dfa03"
 * @example "4629fade4629fade4629fade4629fade"
 */
export const FingerprintSchema = z.string().regex(/^[a-f0-9]{32}$/)

/**
 * TNGL bank identifier.
 * Range: 0 - 255
 *
 * @example 42
 */
export const TnglBankSchema = z.number().int().min(0).max(MAX_TNGL_BANK)

/**
 * Baudrate for serial communication.
 * Common values: 9600, 19200, 38400, 57600, 115200, etc.
 *
 * @example 9600
 * @example 115200
 */
export const BaudrateSchema = z.number().int().positive()

/**
 * File system path string.
 * Can be absolute or relative path.
 *
 * TODO @immakermatty add example
 */
export const PathSchema = z.string()
