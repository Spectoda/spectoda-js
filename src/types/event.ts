import { VALUE_TYPE } from '../constants'

import { SpectodaTypes } from './primitives'

type Keys = keyof typeof VALUE_TYPE
type Values = (typeof VALUE_TYPE)[Keys]

type SpectodaEventBase = {
  /** Readonly string with more information about the event value */
  debug: string

  label: SpectodaTypes.Label

  type: Values
  value: unknown

  /** When was event emitted */
  timestamp: SpectodaTypes.Timestamp

  id: SpectodaTypes.ID
}

export type SpectodaNumberEvent = SpectodaEventBase & {
  type: typeof VALUE_TYPE.NUMBER
  value: SpectodaTypes.Number
}

export type SpectodaLabelEvent = SpectodaEventBase & {
  type: typeof VALUE_TYPE.LABEL
  value: SpectodaTypes.Label
}

export type SpectodaPercentageEvent = SpectodaEventBase & {
  type: typeof VALUE_TYPE.PERCENTAGE
  value: SpectodaTypes.Percentage
}

export type SpectodaTimestampEvent = SpectodaEventBase & {
  type: typeof VALUE_TYPE.TIME
  value: SpectodaTypes.Timestamp
}

export type SpectodaColorEvent = SpectodaEventBase & {
  type: typeof VALUE_TYPE.COLOR
  value: SpectodaTypes.Color
}

export type SpectodaPixelsEvent = SpectodaEventBase & {
  type: typeof VALUE_TYPE.PIXELS
  value: SpectodaTypes.Pixels
}

export type SpectodaBooleanEvent = SpectodaEventBase & {
  type: typeof VALUE_TYPE.BOOLEAN
  value: SpectodaTypes.Boolean
}

export type SpectodaNullEvent = SpectodaEventBase & {
  type: typeof VALUE_TYPE.NULL
  value: SpectodaTypes.Null
}

export type SpectodaUndefinedEvent = SpectodaEventBase & {
  type: typeof VALUE_TYPE.UNDEFINED
  value: SpectodaTypes.Undefined
}

export type SpectodaEvent =
  | SpectodaNumberEvent
  | SpectodaLabelEvent
  | SpectodaPercentageEvent
  | SpectodaTimestampEvent
  | SpectodaColorEvent
  | SpectodaPixelsEvent
  | SpectodaBooleanEvent
  | SpectodaNullEvent
  | SpectodaUndefinedEvent

/**
 * SpectodaEventStateValue type is equivalent to SpectodaEvent
 *
 * @alias SpectodaEvent
 */
export type SpectodaEventStateValue = SpectodaEvent
