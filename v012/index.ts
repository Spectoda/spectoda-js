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
  SpectodaEventStateValue,
} from './src/types/event'

export { CONNECTORS, BROADCAST_ID, NO_NETWORK_SIGNATURE, JS_VALUE_LIMITS } from './src/constants'

export { VALUE_TYPES } from './src/constants/values'

export { CONNECTION_STATUS, ConnectorType, ConnectionStatus } from './src/types/connect'

export { ControllerError, ControllerWarning, SpectodaMessage } from './src/types/messages'

export { deactivateDebugMode, enableDebugMode, uint8ArrayToHexString } from './functions'

export { isCurrentSpectodaInstanceLocal, createSpectodaWebsocket } from './SpectodaWebSocketsConnector'

export { EventSchema, EventInputSchema } from './src/schemas/event'
export {
  FirmwareVersionSchema,
  FirmwareVersionFullSchema,
  ProductCodeSchema,
  NetworkSignatureSchema,
  MacAddressSchema,
  BaudrateSchema,
  ControllerNameSchema,
  SerialPathSchema,
  IDSchema,
  FingerprintSchema,
  FirmwareVersionCodeSchema,
  NetworkKeySchema,
  PcbCodeSchema,
  TnglBankSchema,
} from './src/schemas/primitives'
export {
  TimestampSchema,
  PercentageSchema,
  LabelSchema,
  NumberSchema,
  ColorSchema,
  PixelsSchema,
  BooleanSchema,
  NullSchema,
  DateSchema,
  UndefinedSchema,
} from './src/schemas/values'

export { mockScanResult } from './__mocks__/scan'
