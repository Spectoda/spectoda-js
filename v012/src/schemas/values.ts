import { z } from 'zod/lib/external'

import { JS_EVENT_VALUE_LIMITS } from '../constants/limits'
import { LABEL_MAX_LENGTH } from '../constants'

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
  .min(JS_EVENT_VALUE_LIMITS.PERCENTAGE_MIN)
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
