import { z } from 'zod'

import { VALUE_TYPES } from '../constants/values'

import { IDSchema } from './primitives'
import { NumberSchema, LabelSchema } from './values'
import {
  TimestampSchema,
  PercentageSchema,
  ColorSchema,
  PixelsSchema,
  BooleanSchema,
  NullSchema,
  UndefinedSchema,
} from './values'

const EventBaseSchema = z.object({
  /** Readonly string with more information about the event value */
  debug: z.string(),
  label: LabelSchema,
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
    type: z.literal(VALUE_TYPES.PERCENTAGE),
    value: PercentageSchema,
  }),
  EventBaseSchema.extend({
    type: z.literal(VALUE_TYPES.TIMESTAMP),
    value: TimestampSchema,
  }),
  EventBaseSchema.extend({
    type: z.literal(VALUE_TYPES.COLOR),
    value: ColorSchema,
  }),
  EventBaseSchema.extend({
    type: z.literal(VALUE_TYPES.PIXELS),
    value: PixelsSchema,
  }),
  EventBaseSchema.extend({
    type: z.literal(VALUE_TYPES.BOOLEAN),
    value: BooleanSchema,
  }),
  EventBaseSchema.extend({
    type: z.literal(VALUE_TYPES.NULL),
    value: NullSchema,
  }),
  EventBaseSchema.extend({
    type: z.literal(VALUE_TYPES.UNDEFINED),
    value: UndefinedSchema,
  }),
])

export const AnyEventValueSchema = z.union([
  NumberSchema,
  LabelSchema,
  PercentageSchema,
  TimestampSchema,
  ColorSchema,
  PixelsSchema,
  BooleanSchema,
  NullSchema,
  UndefinedSchema,
])

export const AnyEventSchema = EventBaseSchema.extend({
  value: AnyEventValueSchema,
})

export const EventInputSchema = AnyEventSchema.omit({
  debug: true,
  timestamp: true,
})
