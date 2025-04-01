import { z } from 'zod'

import { VALUE_TYPE } from '../constants'
import { VALUE_TYPES } from '../constants/values'

import {
  NumberSchema,
  LabelSchema,
  TimestampSchema,
  PercentageSchema,
  ColorSchema,
  PixelsSchema,
  BooleanSchema,
  NullSchema,
  UndefinedSchema,
  IDSchema,
} from './primitives'

const EventBaseSchema = z.object({
  /** Readonly string with more information about the event value */
  debug: z.string(),
  label: LabelSchema,
  type: z.nativeEnum(VALUE_TYPE),
  timestamp: z.number(),
  id: IDSchema,
})

export const EventSchema = z.discriminatedUnion('type', [
  EventBaseSchema.extend({
    type: z.literal(VALUE_TYPES.NUMBER),
    value: NumberSchema,
  }),
  EventBaseSchema.extend({
    type: z.literal(VALUE_TYPES.LABEL),
    value: LabelSchema,
  }),
  EventBaseSchema.extend({
    type: z.literal(VALUE_TYPE.PERCENTAGE),
    value: PercentageSchema,
  }),
  EventBaseSchema.extend({
    type: z.literal(VALUE_TYPE.TIMESTAMP),
    value: TimestampSchema,
  }),
  EventBaseSchema.extend({
    type: z.literal(VALUE_TYPE.COLOR),
    value: ColorSchema,
  }),
  EventBaseSchema.extend({
    type: z.literal(VALUE_TYPE.PIXELS),
    value: PixelsSchema,
  }),
  EventBaseSchema.extend({
    type: z.literal(VALUE_TYPE.BOOLEAN),
    value: BooleanSchema,
  }),
  EventBaseSchema.extend({
    type: z.literal(VALUE_TYPE.NULL),
    value: NullSchema,
  }),
  EventBaseSchema.extend({
    type: z.literal(VALUE_TYPE.UNDEFINED),
    value: UndefinedSchema,
  }),
])
