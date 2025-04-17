/* eslint-disable @typescript-eslint/ban-types */
// Because `Number` refers to our `NumberSchema` and
// `Boolean` refers to our `BooleanSchema`, we need to
// disable the ban on `Number` and `Boolean` types.

import { z } from 'zod'

import { VALUE_TYPES } from '../constants/values'
import { IDSchema } from '../schemas/primitives'
import {
  NumberSchema,
  LabelSchema,
  TimestampSchema,
  PercentageSchema,
  DateSchema,
  ColorSchema,
  PixelsSchema,
  BooleanSchema,
  NullSchema,
  UndefinedSchema,
} from '../schemas/values'

export type ValueType = (typeof VALUE_TYPES)[keyof typeof VALUE_TYPES]
export type Number = z.infer<typeof NumberSchema>
export type Label = z.infer<typeof LabelSchema>
export type Timestamp = z.infer<typeof TimestampSchema>
export type Percentage = z.infer<typeof PercentageSchema>
export type Date = z.infer<typeof DateSchema>
export type Color = z.infer<typeof ColorSchema>
export type Pixels = z.infer<typeof PixelsSchema>
export type Boolean = z.infer<typeof BooleanSchema>
export type Null = z.infer<typeof NullSchema>
export type Undefined = z.infer<typeof UndefinedSchema>
export type ID = z.infer<typeof IDSchema>
export type IDs = ID | ID[]

export type ValueTypes = {
  Number: Number
  Label: Label
  Timestamp: Timestamp
  Percentage: Percentage
  Date: Date
  Color: Color
  Pixels: Pixels
  Boolean: Boolean
  Null: Null
  Undefined: Undefined
  ID: ID
}
