export * from './Spectoda'
export * from './functions'
export * from './logging'
export * from './src/types/app-events'

export type { SpectodaTypes } from './src/types/primitives'
export type {
  EventState,
  EventStateInput,
  LabelEvent,
  PercentageEvent,
  TimestampEvent,
  ColorEvent,
  PixelsEvent,
  BooleanEvent,
  NullEvent,
  UndefinedEvent,

  /** @deprecated Use EventState instead */
  Event,

  /** @deprecated Use EventState instead */
  Event as SpectodaEvent,

  /** @deprecated Use EventState instead */
  EventState as SpectodaEventState,

  /** @deprecated Use EventStateInput instead */
  EventStateInput as SpectodaEventInput,
  NumberEvent,

  /** @deprecated Use NumberEvent instead */
  NumberEvent as SpectodaNumberEvent,

  /** @deprecated Use LabelEvent instead */
  LabelEvent as SpectodaLabelEvent,

  /** @deprecated Use PercentageEvent instead */
  PercentageEvent as SpectodaPercentageEvent,

  /** @deprecated Use TimestampEvent instead */
  TimestampEvent as SpectodaTimestampEvent,

  /** @deprecated Use ColorEvent instead */
  ColorEvent as SpectodaColorEvent,

  /** @deprecated Use PixelsEvent instead */
  PixelsEvent as SpectodaPixelsEvent,

  /** @deprecated Use BooleanEvent instead */
  BooleanEvent as SpectodaBooleanEvent,

  /** @deprecated Use NullEvent instead */
  NullEvent as SpectodaNullEvent,

  /** @deprecated Use UndefinedEvent instead */
  UndefinedEvent as SpectodaUndefinedEvent,
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
  /** @deprecated Use ControllerMessage instead */
  ControllerMessage as SpectodaMessage,
  /** @deprecated Use ControllerError instead */
  ControllerError as SpectodaError,
  /** @deprecated Use ControllerWarning instead */
  ControllerWarning as SpectodaWarning,
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

export { mockScanResult } from './__mocks__/scan'

export { isCurrentSpectodaInstanceLocal, createSpectodaWebsocket } from './SpectodaWebSocketsConnector'
