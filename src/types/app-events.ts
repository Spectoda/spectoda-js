import {
  CONNECTION_STATUS,
  ConnectionStatus,
  WEBSOCKET_CONNECTION_STATE,
  WebsocketConnectionState,
} from './connect'
import { ControllerError, ControllerWarning } from './messages'
import { SpectodaEvent } from './event'
import { SpectodaTypes } from './primitives'

type WebsocketConnectionStateProps = {
  [K in WebsocketConnectionState]: undefined
}

type ConnectionStatusProps = {
  [K in ConnectionStatus]: undefined
}

type SpectodaAppEventType<T extends string = string> = {
  [K in Uppercase<T>]: T
}

export const SpectodaAppEvents = {
  ...CONNECTION_STATUS,

  SCAN_RESULTS: 'scan_results',

  REMOTE_CONTROL_CONNECTING: WEBSOCKET_CONNECTION_STATE.CONNECTING,
  REMOTE_CONTROL_CONNECTED: WEBSOCKET_CONNECTION_STATE.CONNECTED,
  REMOTE_CONTROL_DISCONNECTING: WEBSOCKET_CONNECTION_STATE.DISCONNECTING,
  REMOTE_CONTROL_DISCONNECTED: WEBSOCKET_CONNECTION_STATE.DISCONNECTED,

  PEER_CONNECTED: 'peer_connected',
  PEER_DISCONNECTED: 'peer_disconnected',

  OTA_STATUS: 'ota_status',
  OTA_PROGRESS: 'ota_progress',
  OTA_TIMELEFT: 'ota_timeleft',

  TNGL_UPDATE: 'tngl_update',

  EMITTED_EVENTS: 'emittedevents',
  EVENT_STATE_UPDATES: 'eventstateupdates',

  NETWORK_ERROR: 'networkerror',
  NETWORK_WARNING: 'networkwarning',

  /** @private for spectoda-js internal use only */
  PRIVATE_CONNECTED: '#connected',
  /** @private for spectoda-js internal use only */
  PRIVATE_DISCONNECTED: '#disconnected',
  /** @private for spectoda-js internal use only */
  PRIVATE_WASM_CLOCK: '#wasm_clock',
  /** @private for spectoda-js internal use only */
  PRIVATE_WASM_REQUEST: '#wasm_request',
  /** @private for spectoda-js internal use only */
  PRIVATE_WASM_EXECUTE: '#wasm_execute',
  
} as const satisfies SpectodaAppEventType

type PropsMap = WebsocketConnectionStateProps &
  ConnectionStatusProps & {

    // TODO for future payload key: `json`
    [SpectodaAppEvents.SCAN_RESULTS]: string

    // TODO for future payload key: `mac`
    [SpectodaAppEvents.PEER_CONNECTED]: string

    // TODO for future payload key: `mac`
    [SpectodaAppEvents.PEER_DISCONNECTED]: string

    // TODO for future payload key: `status`
    [SpectodaAppEvents.OTA_STATUS]: 'begin' | 'success' | 'fail'

    // TODO for future payload key: `percentageProgress`
    [SpectodaAppEvents.OTA_PROGRESS]: number

    // TODO for future payload key: `timeleftSeconds`
    [SpectodaAppEvents.OTA_TIMELEFT]: number

    [SpectodaAppEvents.TNGL_UPDATE]: {
      tngl_bytes: SpectodaTypes.TnglBytes
      used_ids: SpectodaTypes.UsedIds
    }

    /** @private event */
    '#connected': undefined

    /** @private event */
    '#disconnected': undefined

    // TODO for future payload key: `events`
    [SpectodaAppEvents.EVENT_STATE_UPDATES]: SpectodaEvent[]

    // TODO for future payload key: `events`
    [SpectodaAppEvents.EMITTED_EVENTS]: SpectodaEvent[]

    [SpectodaAppEvents.NETWORK_ERROR]: ControllerError
    [SpectodaAppEvents.NETWORK_WARNING]: ControllerWarning
  }

export type SpectodaAppEventName =
  (typeof SpectodaAppEvents)[keyof typeof SpectodaAppEvents]

export type SpectodaAppEventMap = {
  [K in SpectodaAppEventName]: PropsMap[K]
}

export const SPECTODA_APP_EVENTS = Object.freeze(SpectodaAppEvents)
