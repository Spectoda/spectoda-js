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

type SpectodaNumberEvent = SpectodaEventBase & {
  type: typeof VALUE_TYPE.NUMBER
  value: SpectodaTypes.Number
}

type SpectodaLabelEvent = SpectodaEventBase & {
  type: typeof VALUE_TYPE.LABEL
  value: SpectodaTypes.Label
}

type SpectodaPercentageEvent = SpectodaEventBase & {
  type: typeof VALUE_TYPE.PERCENTAGE
  value: SpectodaTypes.Percentage
}

type SpectodaTimestampEvent = SpectodaEventBase & {
  type: typeof VALUE_TYPE.TIME
  value: SpectodaTypes.Timestamp
}

type SpectodaColorEvent = SpectodaEventBase & {
  type: typeof VALUE_TYPE.COLOR
  value: SpectodaTypes.Color
}

type SpectodaPixelsEvent = SpectodaEventBase & {
  type: typeof VALUE_TYPE.PIXELS
  value: SpectodaTypes.Pixels
}

type SpectodaBooleanEvent = SpectodaEventBase & {
  type: typeof VALUE_TYPE.BOOLEAN
  value: SpectodaTypes.Boolean
}

type SpectodaNullEvent = SpectodaEventBase & {
  type: typeof VALUE_TYPE.NULL
  value: SpectodaTypes.Null
}

type SpectodaUndefinedEvent = SpectodaEventBase & {
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
