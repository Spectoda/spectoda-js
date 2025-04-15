export * from './Spectoda'
export * from './functions'
export * from './logging'
export * from './src/types/app-events'

export type { SpectodaTypes } from './src/types/primitives'
export type {
  SpectodaEvent,
  SpectodaEventState,
  /** @deprecated */
  SpectodaEventState as SpectodaEventStateValue,
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

export { CONNECTION_STATUS, REMOTECONTROL_STATUS, WEBSOCKET_CONNECTION_STATE } from './src/types/connect'
export type {
  ConnectionStatus,
  ConnectorType,
  ConnectorCriteria,
  RemoteControlConnectionStatus,
} from './src/types/connect'
export type {
  ControllerError,
  ControllerWarning,
  SpectodaMessage,
  SpectodaError,
  SpectodaWarning,
} from './src/types/messages'

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

export { CONNECTORS, NO_NETWORK_SIGNATURE, BROADCAST_ID, JS_VALUE_LIMITS } from './src/constants'
export { VALUE_TYPES } from './src/constants/values'
export type { StringValueType } from './src/constants/values'

export { mockScanResult } from './__mocks__/scan'

export { isCurrentSpectodaInstanceLocal, createSpectodaWebsocket } from './SpectodaWebSocketsConnector'
