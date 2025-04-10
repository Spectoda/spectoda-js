export * from './Spectoda'
export * from './functions'
export * from './logging'
export * from './src/types/app-events'

export type { SpectodaTypes } from './src/types/primitives'
export type {
  SpectodaEvent,
  SpectodaNumberEvent,
  SpectodaLabelEvent,
  SpectodaPercentageEvent,
  SpectodaTimestampEvent,
  SpectodaColorEvent,
  SpectodaPixelsEvent,
  SpectodaBooleanEvent,
  SpectodaNullEvent,
  SpectodaUndefinedEvent,
} from './src/types/event'

export { EventSchema } from './src/schemas/event'
export {
  FirmwareVersionSchema,
  FirmwareVersionFullSchema,
  ProductCodeSchema,
  NetworkSignatureSchema,
  MacAddressSchema,
  BaudrateSchema,
  ControllerNameSchema,
  PathSchema,
  TimestampSchema,
  PercentageSchema,
  LabelSchema,
  NumberSchema,
  ColorSchema,
  PixelsSchema,
  BooleanSchema,
  NullSchema,
  UndefinedSchema,
} from './src/schemas/primitives'

export { mockScanResult } from './__mocks__/scan'
