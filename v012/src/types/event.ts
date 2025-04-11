import { z } from 'zod'

import { EventSchema } from '../schemas/event'
import { VALUE_TYPES } from '../constants/values'

/** @alias SpectodaEvent */
export type SpectodaEventStateValue = SpectodaEvent
export type SpectodaEvent = z.infer<typeof EventSchema>

export type SpectodaNumberEvent = Extract<SpectodaEvent, { type: typeof VALUE_TYPES.NUMBER }>
export type SpectodaLabelEvent = Extract<SpectodaEvent, { type: typeof VALUE_TYPES.LABEL }>
export type SpectodaPercentageEvent = Extract<SpectodaEvent, { type: typeof VALUE_TYPES.PERCENTAGE }>
export type SpectodaTimestampEvent = Extract<SpectodaEvent, { type: typeof VALUE_TYPES.TIMESTAMP }>
export type SpectodaColorEvent = Extract<SpectodaEvent, { type: typeof VALUE_TYPES.COLOR }>
export type SpectodaPixelsEvent = Extract<SpectodaEvent, { type: typeof VALUE_TYPES.PIXELS }>
export type SpectodaBooleanEvent = Extract<SpectodaEvent, { type: typeof VALUE_TYPES.BOOLEAN }>
export type SpectodaNullEvent = Extract<SpectodaEvent, { type: typeof VALUE_TYPES.NULL }>
export type SpectodaUndefinedEvent = Extract<SpectodaEvent, { type: typeof VALUE_TYPES.UNDEFINED }>
