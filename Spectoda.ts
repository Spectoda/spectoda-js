import { TnglCodeParser } from './SpectodaParser'
import { TimeTrack } from './TimeTrack'
import './TnglReader'
import { TnglReader } from './TnglReader'
import './TnglWriter'
import {
  cssColorToHex,
  detectNode,
  detectSpectodaConnect,
  fetchFirmware,
  hexStringToUint8Array,
  labelToBytes,
  numberToBytes,
  sleep,
  strMacToBytes,
  stringToBytes,
  uint8ArrayToHexString,
} from './functions'
import { logging } from './logging'
import { SpectodaWasm } from './src/SpectodaWasm'
import {
  COMMAND_FLAGS,
  CONNECTORS,
  DEFAULT_CONNECTOR,
  DEFAULT_TIMEOUT,
  NO_NETWORK_KEY,
  NO_NETWORK_SIGNATURE,
  TNGL_SIZE_CONSIDERED_BIG,
} from './src/constants'

import { io } from 'socket.io-client'
import customParser from 'socket.io-msgpack-parser'

import { WEBSOCKET_URL } from './SpectodaWebSocketsConnector'
import './TnglReader'
import './TnglWriter'
import { ConnectionStatus } from './deprecated_store/types'
import { SpectodaRuntime, allEventsEmitter } from './src/SpectodaRuntime'
import { VALUE_LIMITS, VALUE_TYPE } from './src/constants'
import { SpectodaAppEventMap, SpectodaAppEventName, SpectodaAppEvents } from './src/types/app-events'
import {
  CONNECTION_STATUS,
  ConnectorType,
  REMOTECONTROL_STATUS,
  RemoteControlConnectionStatus,
} from './src/types/connect'
import { SpectodaEvent } from './src/types/event'
import { SpectodaTypes } from './src/types/primitives'
import { SpectodaClass } from './src/types/spectodaClass'
import { fetchTnglFromApiById, sendTnglToApi } from './tnglapi'

const MIN_FIRMWARE_LENGTH = 10000
const DEFAULT_RECONNECTION_TIME = 2500
const DEFAULT_RECONNECTION_INTERVAL = 10000

// TODO - kdyz zavolam spectoda.connect(), kdyz jsem pripojeny, tak nechci aby se do interfacu poslal select
// TODO - kdyz zavolam funkci connect a uz jsem pripojeny, tak vyslu event connected, pokud si myslim ze nejsem pripojeny.
// TODO - "watchdog timer" pro resolve/reject z TC

export class Spectoda implements SpectodaClass {
  #parser: TnglCodeParser

  #uuidCounter: number
  #ownerSignature: SpectodaTypes.NetworkSignature
  #ownerKey: SpectodaTypes.NetworkKey
  #updating: boolean

  #connectionState: ConnectionStatus
  #remoteControlConnectionState: RemoteControlConnectionStatus

  #criteria: SpectodaTypes.Criteria
  #reconnecting: boolean
  #autonomousReconnection: boolean
  #wakeLock: WakeLockSentinel | null | undefined
  #isPrioritizedWakelock: boolean

  #reconnectionIntervalHandle: any

  // ? This is used for getEmittedEvents() to work properly
  #__events: any

  timeline: TimeTrack
  runtime: SpectodaRuntime

  socket: any

  constructor(connectorType: ConnectorType = DEFAULT_CONNECTOR, reconnecting = true) {
    this.#parser = new TnglCodeParser()

    this.#uuidCounter = Math.floor(Math.random() * 0xffffffff)

    this.#ownerSignature = NO_NETWORK_SIGNATURE
    this.#ownerKey = NO_NETWORK_KEY

    this.timeline = new TimeTrack(0, true)
    this.runtime = new SpectodaRuntime(this)
    this.socket = undefined

    if (connectorType !== CONNECTORS.NONE) {
      try {
        this.runtime.assignConnector(connectorType)
      } catch (e) {
        logging.error(e)
      }
    }

    this.#updating = false

    this.#reconnecting = reconnecting ? true : false
    this.#connectionState = CONNECTION_STATUS.DISCONNECTED
    this.#remoteControlConnectionState = REMOTECONTROL_STATUS.REMOTECONTROL_DISCONNECTED

    this.#isPrioritizedWakelock = false
    this.#autonomousReconnection = false
    this.#reconnectionIntervalHandle = undefined
    this.#criteria = []
    this.#__events = undefined

    this.runtime.onConnected = (event) => {
      logging.debug('> Runtime connected')

      this.#resetReconnectionInterval()
    }

    this.runtime.onDisconnected = (event) => {
      logging.debug('> Runtime disconnected')

      this.#resetReconnectionInterval()

      if (this.getConnectionState() === CONNECTION_STATUS.CONNECTED && this.#reconnecting) {
        logging.debug(`Reconnecting in ${DEFAULT_RECONNECTION_TIME}ms..`)
        this.#setConnectionState(CONNECTION_STATUS.CONNECTING)

        return sleep(DEFAULT_RECONNECTION_TIME)
          .then(() => {
            return this.#connect(true)
          })
          .then(() => {
            logging.info('Reconnection successful.')
            this.#setConnectionState(CONNECTION_STATUS.CONNECTED)
          })
          .catch((error) => {
            logging.warn('Reconnection failed:', error)
            this.#setConnectionState(CONNECTION_STATUS.DISCONNECTED)
          })
      } else {
        this.#setConnectionState(CONNECTION_STATUS.DISCONNECTED)
      }
    }

    this.#reconnectionIntervalHandle = undefined
    this.#resetReconnectionInterval()
  }

  #resetReconnectionInterval() {
    clearInterval(this.#reconnectionIntervalHandle)

    this.#reconnectionIntervalHandle = setInterval(() => {
      // TODO move this to runtime
      if (
        !this.#updating &&
        this.runtime.connector &&
        this.getConnectionState() === CONNECTION_STATUS.DISCONNECTED &&
        this.#autonomousReconnection
      ) {
        return this.#connect(true).catch((error) => {
          logging.warn(error)
        })
      }
    }, DEFAULT_RECONNECTION_INTERVAL)
  }

  #setRemoteControlConnectionState(remoteControlConnectionState: RemoteControlConnectionStatus) {
    switch (remoteControlConnectionState) {
      case REMOTECONTROL_STATUS.REMOTECONTROL_CONNECTING: {
        if (remoteControlConnectionState !== this.#remoteControlConnectionState) {
          logging.warn('> Spectoda websockets connecting')
          this.#remoteControlConnectionState = remoteControlConnectionState
          this.runtime.emit(SpectodaAppEvents.REMOTECONTROL_CONNECTING)
        }
        break
      }
      case REMOTECONTROL_STATUS.REMOTECONTROL_CONNECTED: {
        if (remoteControlConnectionState !== this.#remoteControlConnectionState) {
          logging.warn('> Spectoda websockets connected')
          this.#remoteControlConnectionState = remoteControlConnectionState
          this.runtime.emit(SpectodaAppEvents.REMOTECONTROL_CONNECTED)
        }
        break
      }
      case REMOTECONTROL_STATUS.REMOTECONTROL_DISCONNECTING: {
        if (remoteControlConnectionState !== this.#remoteControlConnectionState) {
          logging.warn('> Spectoda websockets disconnecting')
          this.#remoteControlConnectionState = remoteControlConnectionState
          this.runtime.emit(SpectodaAppEvents.REMOTECONTROL_DISCONNECTING)
        }
        break
      }
      case REMOTECONTROL_STATUS.REMOTECONTROL_DISCONNECTED: {
        if (remoteControlConnectionState !== this.#remoteControlConnectionState) {
          logging.warn('> Spectoda websockets disconnected')
          this.#remoteControlConnectionState = remoteControlConnectionState
          this.runtime.emit(SpectodaAppEvents.REMOTECONTROL_DISCONNECTED)
        }
        break
      }
      default: {
        throw `InvalidState: ${remoteControlConnectionState}`
      }
    }
  }

  getRemoteControlConnectionState() {
    return this.#remoteControlConnectionState
  }

  #setConnectionState(connectionState: ConnectionStatus) {
    switch (connectionState) {
      case CONNECTION_STATUS.CONNECTING: {
        if (connectionState !== this.#connectionState) {
          logging.warn('> Spectoda connecting')
          this.#connectionState = connectionState
          this.runtime.emit(SpectodaAppEvents.CONNECTING)
        }
        break
      }
      case CONNECTION_STATUS.CONNECTED: {
        if (connectionState !== this.#connectionState) {
          logging.warn('> Spectoda connected')
          this.#connectionState = connectionState
          this.runtime.emit(SpectodaAppEvents.CONNECTED)
        }
        break
      }
      case CONNECTION_STATUS.DISCONNECTING: {
        if (connectionState !== this.#connectionState) {
          logging.warn('> Spectoda disconnecting')
          this.#connectionState = connectionState
          this.runtime.emit(SpectodaAppEvents.DISCONNECTING)
        }
        break
      }
      case CONNECTION_STATUS.DISCONNECTED: {
        if (connectionState !== this.#connectionState) {
          logging.warn('> Spectoda disconnected')
          this.#connectionState = connectionState
          this.runtime.emit(SpectodaAppEvents.DISCONNECTED)
        }
        break
      }
      default: {
        logging.error('#setConnectionState(): InvalidState')
        throw 'InvalidState'
      }
    }
  }

  getConnectionState() {
    return this.#connectionState
  }

  #setOwnerSignature(ownerSignature: SpectodaTypes.NetworkSignature) {
    const reg = ownerSignature.match(/([\dA-Fa-f]{32})/g)

    if (!reg || reg.length === 0 || !reg[0]) {
      throw 'InvalidSignature'
    }

    this.#ownerSignature = reg[0]
    return true
  }

  #setOwnerKey(ownerKey: SpectodaTypes.NetworkKey) {
    const reg = ownerKey.match(/([\dA-Fa-f]{32})/g)

    if (!reg || reg.length === 0 || !reg[0]) {
      throw 'InvalidKey'
    }

    this.#ownerKey = reg[0]
    return true
  }

  /**
   * Calls WakeLock API to prevent the screen from turning off.
   * TODO: Move to different file. Not a spectoda.js concern.
   */
  requestWakeLock(prioritized = false) {
    logging.debug('> Activating wakeLock...')

    if (prioritized) {
      this.#isPrioritizedWakelock = true
    }

    try {
      if (detectNode()) {
        // NOP
      } else if (detectSpectodaConnect()) {
        window.flutter_inappwebview.callHandler('setWakeLock', true)
      } else {
        navigator.wakeLock
          .request('screen')
          .then((Wakelock) => {
            logging.info('Web Wakelock activated.')
            this.#wakeLock = Wakelock
          })
          .catch(() => {
            logging.warn('Web Wakelock activation failed.')
          })
      }
      return Promise.resolve()
    } catch (e) {
      return Promise.reject(e)
    }
  }

  /**
   * Calls WakeLock API to release the screen from being prevented from turning off.
   * TODO: Move to different file. Not a spectoda.js concern.
   */
  releaseWakeLock(prioritized = false) {
    logging.debug('> Deactivating wakeLock...')

    if (prioritized) {
      this.#isPrioritizedWakelock = false
    } else if (this.#isPrioritizedWakelock) {
      return Promise.resolve()
    }

    try {
      if (detectNode()) {
        // NOP
      } else if (detectSpectodaConnect()) {
        window.flutter_inappwebview.callHandler('setWakeLock', false)
      } else {
        this.#wakeLock
          ?.release()
          .then(() => {
            logging.info('Web Wakelock deactivated.')
            this.#wakeLock = null
          })
          .catch(() => {
            logging.warn('Web Wakelock deactivation failed.')
          })
      }
      return Promise.resolve()
    } catch (e) {
      return Promise.reject(e)
    }
  }

  /**
   * Alias for assignConnector
   * Assigns with which "connector" you want to `connect`. E.g. "webbluetooth", "serial", "websockets", "simulated".
   * The name `connector` legacy term, but we don't have a better name for it yer.
   * TODO: @immakermatty remove assignConnector and make it a parameter of connect()
   * For now this is handled via spectoda-core
   */
  setConnector(connector_type: ConnectorType, connector_param = null) {
    return this.runtime.assignConnector(connector_type, connector_param)
  }

  /**
   * ! Useful
   * TODO: @immakermatty remove assignConnector and make it a parameter of connect()
   * For now this is handled via spectoda-core
   * @alias this.setConnector
   */
  assignConnector(connector_type: ConnectorType, connector_param = null) {
    return this.setConnector(connector_type, connector_param)
  }

  /**
   * @alias this.setConnector
   */
  assignOwnerSignature(ownerSignature: SpectodaTypes.NetworkSignature) {
    return this.#setOwnerSignature(ownerSignature)
  }

  /**
   * @deprecated
   * Set the network `signature` (deprecated terminology "ownerSignature").
   */
  setOwnerSignature(ownerSignature: SpectodaTypes.NetworkSignature) {
    return this.#setOwnerSignature(ownerSignature)
  }

  /**
   * @deprecated
   * Get the network `signature` (deprecated terminology "ownerSignature").
   */
  getOwnerSignature(): SpectodaTypes.NetworkSignature {
    return this.#ownerSignature
  }

  /**
   * @alias this.setOwnerKey
   */
  assignOwnerKey(ownerKey: SpectodaTypes.NetworkKey) {
    return this.#setOwnerKey(ownerKey)
  }

  /**
   * Sets the network `key` (deprecated terminology "ownerKey").
   */
  setOwnerKey(ownerKey: SpectodaTypes.NetworkKey) {
    return this.#setOwnerKey(ownerKey)
  }

  /**
   * Get the network `key` (deprecated terminology "ownerKey").
   */
  getOwnerKey(): SpectodaTypes.NetworkKey {
    return this.#ownerKey
  }

  /**
   * ! Useful
   * Initializes Remote control (RC) receiving.
   * ! Remote control needs a complete refactor and needs to be moved from Spectoda.js to a different file. Remote control should not connect based on network signature and key.
   *
   * @param {Object} options
   * @param {string?} options.signature - The network signature.
   * @param {string?} options.key - The network key.
   * @param {Object} [options.meta] - info about the receiver
   * @param {boolean?} [options.sessionOnly] - Whether to enable remote control for the current session only.
   */
  async enableRemoteControl({
    signature,
    key,
    sessionOnly,
    meta,
  }: {
    signature: string
    key: string
    sessionOnly: boolean
    meta: object
  }) {
    logging.debug('> Connecting to Remote Control')

    //* Added by @immakermatty to automatically connect the sender app if the receiver is connected
    const postJoinActions = () => {
      {
        //* if the receiver is connected, emit the connected event on the sender
        //* so that sender will switch to connected state
        this.connected() ////
          .then((connectedCriteria) => {
            if (connectedCriteria) {
              //* emit the connected event to the sender app
              this.emit(SpectodaAppEvents.CONNECTED, null)
            } else {
              //* emit the disconnected event to the sender app
              this.emit(SpectodaAppEvents.DISCONNECTED, null)
            }
          })
          .then(() => {
            //* reload tngl to get all event state updates from the receiver
            this.reloadTngl()
          })
          .catch((err: any) => {
            logging.error('RC Receiver postJoinActions() error:', err)
          })
      }
    }

    if (this.socket) {
      this.socket.removeAllListeners() // Removes all listeners attached to the socket
      this.socket.disconnect()

      // @ts-ignore
      for (const listener of this.socket?.___SpectodaListeners) {
        listener()
      }
    }

    // @ts-ignore
    this.socket = io(WEBSOCKET_URL, {
      parser: customParser,
    })

    this.socket.connect()
    this.requestWakeLock(true)

    // TODO! remove this
    const setConnectionSocketData = async () => {
      // const peers = await this.getConnectedPeersInfo();
      // logging.debug("peers", peers);
      // this.socket.emit("set-connection-data", peers);
      this.socket.emit('set-meta-data', meta)
    }

    // @ts-ignore
    this.socket.___SpectodaListeners = [
      // TODO! remove this
      this.on(SpectodaAppEvents.CONNECTED, async () => {
        setConnectionSocketData()
      }),
      // TODO! remove this
      this.on(SpectodaAppEvents.DISCONNECTED, () => {
        this.socket.emit('set-connection-data', null)
      }),
      allEventsEmitter.on('on', ({ name, args }: { name: string; args: any[] }) => {
        try {
          logging.verbose('event', name, args)
          // circular json, function ... can be issues, that's why wrapped
          this.socket.emit('event', { name, args })
        } catch (err) {
          console.error(err)
        }
      }),
    ]

    // @ts-ignore
    globalThis.allEventsEmitter = allEventsEmitter

    this.socket.on('func', async (payload: any, callback: any) => {
      if (!callback) {
        logging.error('No callback provided')
        return
      }

      const { functionName, arguments: args } = payload

      // call internal class function await this[functionName](...args)

      // call internal class function
      try {
        if (functionName === 'debug') {
          logging.debug(...args)
          return callback({
            status: 'success',
            message: 'debug',
            payload: args,
          })
        }
        if (functionName === 'assignOwnerSignature' || functionName === 'assignOwnerKey') {
          return callback({
            status: 'success',
            message: 'assign key/signature is ignored on remote.',
          })
        }

        // TODO rename to updateControllerFirmware
        if (
          functionName === 'updateDeviceFirmware' ||
          functionName === 'updateNetworkFirmware'
        ) {
          if (Array.isArray(args?.[0])) {
            args[0] = new Uint8Array(args[0])
          } else if (typeof args?.[0] === 'object') {
            const arr: any = Object.values(args[0])
            const uint8Array = new Uint8Array(arr)

            args[0] = uint8Array
          }
        }
        // @ts-ignore
        const result = await this[functionName](...args)

        callback({ status: 'success', result })
      } catch (e) {
        logging.error(e)
        callback({ status: 'error', error: e })
      }
    })

    return await new Promise((resolve, reject) => {
      this.socket.on('disconnect', () => {
        logging.log('> RC Receiver disconnected')

        this.#setRemoteControlConnectionState(REMOTECONTROL_STATUS.REMOTECONTROL_DISCONNECTED)
      })

      this.socket.on('connect', async () => {
        logging.log('> RC Receiver connected')

        logging.setLogCallback((...e) => {
          console.log(...e)
          this.socket.emit('event', { name: 'log', args: e })
        })

        logging.setWarnCallback((...e) => {
          console.warn(...e)
          this.socket.emit('event', { name: 'log-warn', args: e })
        })

        logging.setErrorCallback((...e) => {
          console.error(...e)
          this.socket.emit('event', { name: 'log-error', args: e })
        })

        if (sessionOnly) {
          // Handle session-only logic
          const response = await this.socket.emitWithAck('join-session', null)
          const roomNumber = response?.roomNumber

          if (response?.status === 'success') {
            this.#setRemoteControlConnectionState(REMOTECONTROL_STATUS.REMOTECONTROL_CONNECTED)
            setConnectionSocketData()

            logging.debug('Remote control session joined successfully', roomNumber)

            resolve({ status: 'success', roomNumber })
          } else {
            this.#setRemoteControlConnectionState(REMOTECONTROL_STATUS.REMOTECONTROL_DISCONNECTED)
            logging.debug('Remote control session join failed, does not exist')
          }
        } else if (signature) {
          // Handle signature-based logic
          this.#setRemoteControlConnectionState(REMOTECONTROL_STATUS.REMOTECONTROL_CONNECTING)

          await this.socket
            .emitWithAck('join', { signature, key })
            .then((e: any) => {
              logging.log('> RC Receiver joined')
              this.#setRemoteControlConnectionState(REMOTECONTROL_STATUS.REMOTECONTROL_CONNECTED)
              postJoinActions()

              // TODO! remove this
              setConnectionSocketData()

              resolve({ status: 'success' })
            })
            .catch((e: any) => {
              this.#setRemoteControlConnectionState(REMOTECONTROL_STATUS.REMOTECONTROL_DISCONNECTED)
              reject(e)
            })
        }
      })
    })
  }

  /**
   * ! Useful
   * Disconnects Remote Control receiving. More info about remote control in `enableRemoteControl`.
   */
  disableRemoteControl() {
    logging.setLogCallback(console.log)
    logging.setWarnCallback(console.warn)
    logging.setErrorCallback(console.error)

    logging.debug('> Disconnecting from the Remote Control')

    this.releaseWakeLock(true)
    this.socket?.disconnect()
  }

  // valid UUIDs are in range [1..4294967295] (32-bit unsigned number)
  #getUUID() {
    if (this.#uuidCounter >= 4294967295) {
      this.#uuidCounter = 0
    }

    return ++this.#uuidCounter
  }

  /**
   * ! Useful
   * @name addEventListener
   * @param {string} event
   * @param {Function} callback
   *
   * events: "disconnected", "connected"
   *
   * all events: event.target === the sender object (SpectodaWebBluetoothConnector)
   * event "disconnected": event.reason has a string with a disconnect reason
   *
   * TODO I think this should expose an "off" method to remove the listener
   * @returns {Function} unbind function
   */
  addEventListener<K extends keyof SpectodaAppEventMap>(event: K, callback: (props: SpectodaAppEventMap[K]) => void) {
    return this.runtime.addEventListener(event, callback)
  }

  /**
   * @alias this.addEventListener
   */
  on<K extends keyof SpectodaAppEventMap>(event: K, callback: (props: SpectodaAppEventMap[K]) => void) {
    return this.runtime.on(event, callback)
  }

  /**
   * ! Useful
   * Scans for controllers that match the given criteria around the user.
  
    *
    * TODO: Fix types!!! Returned value should be in format:
    * Array<{
    *   commissionable: boolean;
    *   fw: string;
    *   name: string;
    *   network: string;
    *   product: number;
    *   rssi: number;
    * }>
    *

  */
  scan(scan_criteria: object[] = [{}], scan_period: number | typeof DEFAULT_TIMEOUT = DEFAULT_TIMEOUT) {
    logging.verbose(`scan(scan_criteria=${scan_criteria}, scan_period=${scan_period})`)

    logging.debug('> Scanning Spectoda Controllers...')
    return this.runtime.scan(scan_criteria, scan_period)
  }

  #connect(
    autoConnect: boolean,
    scanPeriod: number | typeof DEFAULT_TIMEOUT = DEFAULT_TIMEOUT,
    scanTimeout: number | typeof DEFAULT_TIMEOUT = DEFAULT_TIMEOUT,
  ) {
    logging.verbose(`#connect(autoConnect=${autoConnect})`)

    logging.debug('> Connecting Spectoda Controller')

    this.#setConnectionState(CONNECTION_STATUS.CONNECTING)

    logging.debug('> Selecting controller...')
    return (
      autoConnect
        ? this.runtime.autoSelect(this.#criteria, scanPeriod, scanTimeout)
        : this.runtime.userSelect(this.#criteria, scanTimeout)
    )
      .then(() => {
        logging.debug('> Connecting controller...')

        // ? eraseTimeline to discard Timeline from the previous session
        this.runtime.spectoda_js.eraseTimeline()

        return this.runtime.connect()
      })
      .then((connectedDeviceInfo) => {
        // TODO rename to connectedControllerInfo
        logging.debug('> Synchronizing Network State...')

        // return this.requestTimeline()
        //   .catch(e => {
        //     logging.info("Timeline sync after reconnection failed:", e);
        //     // ! This is only temporary until @immakermatty figures out how to implement decentralized synchronizing of RTC time
        //     logging.info("Setting timeline to day time");
        //     return this.syncTimelineToDayTime().catch(e => {
        //       logging.error("Setting timeline to daytime failed:", e);
        //     });
        //   })
        // ! For now on every connection, force sync timeline to day time
        return this.syncTimelineToDayTime()
          .then(() => {
            return this.readControllerInfo()
              .then(async (info) => {
                // 0.12.4 and up implements readControllerInfo() which give a hash (fingerprint) of
                // TNGL and EventStore on the Controller. If the TNGL and EventStore
                // FP cashed in localstorage are equal, then the app does not need to
                // "fetch" the TNGL and EventStore from Controller.

                const tnglFingerprint = this.runtime.spectoda_js.getTnglFingerprint()
                const eventStoreFingerprint = this.runtime.spectoda_js.getEventStoreFingerprint()

                // First erase in localstorage
                if (info.tnglFingerprint != tnglFingerprint) {
                  this.runtime.spectoda_js.eraseTngl()
                }

                if (info.eventStoreFingerprint != eventStoreFingerprint) {
                  this.runtime.spectoda_js.eraseHistory()
                }

                // Then read from Controller
                if (info.tnglFingerprint != tnglFingerprint) {
                  // "fetch" the TNGL from Controller to App localstorage
                  await this.syncTngl().catch((e) => {
                    logging.error('TNGL sync after connection failed:', e)
                  })
                }

                if (info.eventStoreFingerprint != eventStoreFingerprint) {
                  // "fetch" the EventStore from Controller to App localstorage
                  await this.syncEventHistory().catch((e) => {
                    logging.error('EventStore sync after connection failed:', e)
                  })
                }
              }) //
              .catch(async (e) => {
                logging.error('Reading controller info after connection failed:', e)

                // App connected to FW that does not support readControllerInfo(),
                // so remove cashed TNGL and EventStore (EventHistory) from localstogare
                // and read it from the Controller

                // first clean all
                this.runtime.spectoda_js.eraseTngl()
                this.runtime.spectoda_js.eraseHistory()

                // "fetch" the TNGL from Controller to App localstorage
                await this.syncTngl().catch((e) => {
                  logging.error('TNGL sync after connection failed:', e)
                })

                // "fetch" the EventStore from Controller to App localstorage
                await this.syncEventHistory().catch((e) => {
                  logging.error('EventStore sync after connection failed:', e)
                })
              }) //
              .then(() => {
                return this.runtime.connected()
              })
          }) //
          .then((connected) => {
            if (!connected) {
              throw 'ConnectionFailed'
            }
            this.#setConnectionState(CONNECTION_STATUS.CONNECTED)
            return connectedDeviceInfo
          })
      })
      .catch((error) => {
        logging.error('Error during connect():', error)

        this.#setConnectionState(CONNECTION_STATUS.DISCONNECTED)

        if (typeof error == 'string') {
          throw error
        } else {
          throw 'ConnectionFailed'
        }
      })
  }

  /**
   * ! Useful
   * Connects to a controller that matches the given criteria.
   * In web environment, this launches the "Select Device" dialog.
   *
   * To connect to ANY controller, use `spectoda.connect({}, true, null, null, true)`
   * The option to connect to ANY controller will be deprecated in Spectoda FW V1, you should only be able to connect to a controller whose `signature` and `key` you enter.
   *
   * TODO REFACTOR to use only one criteria object instead of this param madness
   */
  connect(
    criteria: SpectodaTypes.Criteria,
    autoConnect = true,
    ownerSignature: SpectodaTypes.NetworkSignature = '',
    ownerKey: SpectodaTypes.NetworkKey = '',
    connectAny = false,
    fwVersion = '',
    autonomousReconnection = false,
    overrideConnection = false,
  ) {
    logging.verbose(
      `connect(criteria=${criteria}, autoConnect=${autoConnect}, ownerSignature=${ownerSignature}, ownerKey=${ownerKey}, connectAny=${connectAny}, fwVersion=${fwVersion}, autonomousReconnection=${autonomousReconnection}, overrideConnection=${overrideConnection})`,
    )

    this.#autonomousReconnection = autonomousReconnection

    if (!overrideConnection && this.getConnectionState() === CONNECTION_STATUS.CONNECTING) {
      return Promise.reject('ConnectingInProgress')
    }

    if (ownerSignature) {
      this.#setOwnerSignature(ownerSignature)
    }

    if (ownerKey) {
      this.#setOwnerKey(ownerKey)
    }

    if (typeof criteria === 'string') {
      criteria = JSON.parse(criteria)
    }

    // if criteria is object or array of obects
    if (criteria && typeof criteria === 'object') {
      // if criteria is not an array, make it an array
      if (!Array.isArray(criteria)) {
        criteria = [criteria]
      }
    }
    //
    else {
      criteria = [{}]
    }

    if (!connectAny) {
      // add ownerSignature to each criteria
      for (const criterion of criteria) {
        criterion.network = this.#ownerSignature
      }
    }

    if (typeof fwVersion == 'string' && /(!?)(\d+).(\d+).(\d+)/.test(fwVersion)) {
      for (const criterion of criteria) {
        criterion.fw = fwVersion
      }
    }

    this.#criteria = criteria

    return this.#connect(autoConnect)
  }

  /**
   * ! Useful
   * Disconnects from the connected controller.
   */
  disconnect() {
    this.#autonomousReconnection = false

    logging.debug('> Disconnecting controller...')

    if (this.getConnectionState() === CONNECTION_STATUS.DISCONNECTED) {
      logging.warn('> Controller already disconnected')
      return Promise.resolve()
    }

    this.#setConnectionState(CONNECTION_STATUS.DISCONNECTING)

    return this.runtime.disconnect().finally(() => {})
  }

  /**
   * Used only for debugging
   * TODO: @immakermatty rename to isConnected()
   * TODO: @immakermatty shoudl return Promise<boolean>
   */
  connected() {
    return this.getConnectionState() === CONNECTION_STATUS.CONNECTED ? this.runtime.connected() : Promise.resolve(null)
  }

  /**
   * ! Useful
   * Cancels the current connect or scan operation.
   */
  cancel() {
    logging.verbose('cancel()')

    return this.runtime.cancel()
  }

  //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

  /**
   * ! Useful
   * Preprocesses TNGL code by handling API injections, removing comments, minifying BERRY code, replacing specific patterns within BERRY code, and handling #define statements.
   * Happens
   *
   * @param {string} tngl_code - The TNGL code as a string.
   * @returns {string} - The preprocessed TNGL code.
   */
  async preprocessTngl(tngl_code: string) {
    logging.verbose(`preprocessTngl(tngl_code=${tngl_code})`)

    /**
     * Helper function to parse timestamp strings and convert them to total milliseconds/tics.
     *
     * @param {string} value - The timestamp string (e.g., "1.2d+9h2m7.2s-123t").
     * @returns {number} - The total time in milliseconds/tics.
     */
    function computeTimestamp(value: string): number {
      if (!value) {
        return 0 // Equivalent to CONST_TIMESTAMP_0
      }

      value = value.trim()

      const timestampRegex = /([+-]?(\d+\.\d+|\d+|\.\d+))\s*(d|h|m(?!s)|s|ms|t)/gi
      let match
      let total = 0

      while ((match = timestampRegex.exec(value)) !== null) {
        const number = parseFloat(match[1])
        const unit = match[3].toLowerCase()

        switch (unit) {
          case 'd': {
            total += number * 86400000 // 24*60*60*1000
            break
          }
          case 'h': {
            total += number * 3600000 // 60*60*1000
            break
          }
          case 'm': {
            total += number * 60000 // 60*1000
            break
          }
          case 's': {
            total += number * 1000 // 1000
            break
          }
          case 'ms':
          case 't': {
            total += number
            break
          }
          default: {
            logging.error('Error while parsing timestamp: Unknown unit', unit)
            break
          }
        }
      }

      if (total >= VALUE_LIMITS.TIMESTAMP_MAX) {
        return VALUE_LIMITS.TIMESTAMP_MAX // Equivalent to CONST_TIMESTAMP_INFINITY
      } else if (total <= VALUE_LIMITS.TIMESTAMP_MIN) {
        return VALUE_LIMITS.TIMESTAMP_MIN // Equivalent to CONST_TIMESTAMP_MINUS_INFINITY
      } else if (total === 0) {
        return 0 // Equivalent to CONST_TIMESTAMP_0
      } else {
        return Math.round(total) // Ensure it's an integer (int32_t)
      }
    }

    /**
     * Helper function to minify BERRY code by removing # comments, specific patterns, and unnecessary whitespace.
     *
     * @param {string} berryCode - The BERRY code to minify.
     * @returns {string} - The minified BERRY code.
     */
    function minifyBerryCode(berryCode: string): string {
      let minified = berryCode

      // Step 0: Determine flags

      let flag_no_minify = false

      if (minified.includes('@no-minify')) {
        minified = minified.replace('@no-minify', '')
        flag_no_minify = true
      }

      // Step 1: Replace specific patterns A, B, C, D

      // Pattern A: Hex Color Codes - /#[0-9a-f]{6}/i
      const colorRegex = /#([\da-f]{6})/gi

      minified = minified.replace(colorRegex, (match, p1) => {
        return `Value.Color("${p1.toLowerCase()}")`
      })

      // Pattern B: Timestamps - /([+-]?(\d+\.\d+|\d+|\.\d+))(d|h|m(?!s)|s|ms|t)\b/gi
      const timestampRegex = /([+-]?(\d+\.\d+|\d+|\.\d+))(d|h|m(?!s)|s|ms|t)\b/gi

      minified = minified.replace(timestampRegex, (match, p1, p2, unit) => {
        const miliseconds = computeTimestamp(match)

        return `Value.Timestamp(${miliseconds})`
      })

      // Pattern C: Labels - /\$[\w]+/
      const labelRegex = /\$(\w+)/g

      minified = minified.replace(labelRegex, (match, p1) => {
        return `Value.Label("${p1}")`
      })

      // Pattern D: Percentages - /[+-]?\d+(\.\d+)?%/
      const percentageRegex = /([+-]?\d+(\.\d+)?)%/g

      minified = minified.replace(percentageRegex, (match, p1) => {
        return `Value.Percentage(${parseFloat(p1)})`
      })

      // Pattern E: IDs (0 to 255)
      const idRegex = /\bID(0|[1-9]\d?|1\d\d|2[0-4]\d|25[0-5])\b/g

      minified = minified.replace(idRegex, (match, p1) => {
        return `${p1}`
      })

      // Step 2: Remove BERRY-specific comments
      // First remove multiline comments (#- ... -#)
      // Match #- followed by any characters (including newlines) until -#
      // Ignore lines starting with dash/hyphen within the comment
      const berryMultilineCommentRegex = /#-[\s\S]*?-#/g

      minified = minified.replace(berryMultilineCommentRegex, '')

      // Then remove single line comments (# ...)
      const berryCommentRegex = /#.*$/gm

      minified = minified.replace(berryCommentRegex, '')

      // Step 3: Remove unnecessary semicolons (if BerryLang allows)
      minified = minified.replace(/;+/g, ' ')

      // Step 4: Remove leading and trailing whitespace from each line
      minified = minified
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0) // Remove empty lines
        .join('\n') // Preserve line breaks

      if (!flag_no_minify) {
        // Step 6: Remove spaces before and after specific characters
        const charsToRemoveSpaceAround = [
          ';',
          ',',
          '{',
          '}',
          '(',
          ')',
          '=',
          '<',
          '>',
          '+',
          '-',
          '*',
          '/',
          '%',
          '&',
          '|',
          '!',
          ':',
          '?',
        ]

        for (const char of charsToRemoveSpaceAround) {
          // Remove space before the character
          const beforeRegex = new RegExp(`\\s+\\${char}`, 'g')

          minified = minified.replace(beforeRegex, char)

          // Remove space after the character
          const afterRegex = new RegExp(`\\${char}\\s+`, 'g')

          minified = minified.replace(afterRegex, char)
        }
      }

      return minified
    }

    /**
     * Helper function to remove single-line (// ...) and multi-line () comments
     * from non-BERRY code segments.
     *
     * @param {string} code - The code segment to clean.
     * @returns {string} - The code without // and  comments.
     */
    function removeNonBerryComments(code: string): string {
      const commentRegex = /\/\/.*|\/\*[\S\s]*?\*\//g

      return code.replace(commentRegex, '')
    }

    // Regular expressions for API handling
    const regexPUBLISH_TNGL_TO_API = /PUBLISH_TNGL_TO_API\s*\(\s*"([^"]*)"\s*,\s*`([^`]*)`\s*\);?/ms
    const regexINJECT_TNGL_FROM_API = /INJECT_TNGL_FROM_API\s*\(\s*"([^"]*)"\s*\);?/ms

    // Handle PUBLISH_TNGL_TO_API
    for (let requests = 0; requests < 64; requests++) {
      const match = regexPUBLISH_TNGL_TO_API.exec(tngl_code)

      if (!match) {
        break
      }

      logging.verbose(match)

      const name = match[1]
      const id = encodeURIComponent(name)
      const tngl = match[2]

      try {
        logging.verbose(`sendTnglToApi({ id=${id}, name=${name}, tngl=${tngl} })`)
        await sendTnglToApi({ id, name, tngl })
        tngl_code = tngl_code.replace(match[0], '')
      } catch {
        logging.error(`Failed to send "${name}" to TNGL API`)
        throw 'SendTnglToApiFailed'
      }
    }

    // Handle INJECT_TNGL_FROM_API
    for (let requests = 0; requests < 64; requests++) {
      const match = regexINJECT_TNGL_FROM_API.exec(tngl_code)

      if (!match) {
        break
      }

      logging.verbose(match)

      const name = match[1]
      const id = encodeURIComponent(name)

      try {
        logging.verbose(`fetchTnglFromApiById({ id=${id} })`)
        const response = await fetchTnglFromApiById(id)

        tngl_code = tngl_code.replace(match[0], response.tngl)
      } catch (e) {
        logging.error(`Failed to fetch "${name}" from TNGL API`, e)
        throw 'FetchTnglFromApiFailed'
      }
    }

    // Handle #define replacing
    {
      const regexDEFINE = /#define\s+(\w+)(?:\s+(.*))?/g

      // List all defines [{name: "NAME", value: "VALUE"}, ...]
      let match
      const defines = []

      while ((match = regexDEFINE.exec(tngl_code)) !== null) {
        defines.push({ name: match[1], value: match[2] })
      }

      // Remove all #define statements from the code
      tngl_code = tngl_code.replace(regexDEFINE, '')

      // Replace all defined names with their corresponding values
      for (const define of defines) {
        if (define.value === null || define.value === undefined) {
          continue
        } // Skip if no value is provided
        // Use word boundaries to avoid partial replacements
        const defineRegex = new RegExp(`\\b${define.name}\\b`, 'g')

        tngl_code = tngl_code.replace(defineRegex, define.value)
      }
    }

    // Handle BERRY code minification and syntax sugar
    {
      // Regular expression to find all BERRY(``) segments
      const regexBERRY = /BERRY\(`([\S\s]*?)`\)/g
      let match

      // Initialize variables to reconstruct the processed code
      let processedCode = ''
      let lastIndex = 0

      while ((match = regexBERRY.exec(tngl_code)) !== null) {
        const fullMatch = match[0] // e.g., BERRY(`...`)
        const berryCode = match[1] // The code inside the backticks

        const start = match.index
        const end = regexBERRY.lastIndex

        // Process the non-BERRY segment before the current BERRY segment
        const nonBerrySegment = tngl_code.slice(lastIndex, start)
        const cleanedNonBerry = removeNonBerryComments(nonBerrySegment)

        processedCode += cleanedNonBerry

        // Process the BERRY segment
        const minifiedBerry = minifyBerryCode(berryCode)

        processedCode += `BERRY(\`${minifiedBerry}\`)`

        // Update lastIndex to the end of the current BERRY segment
        lastIndex = end
      }

      // Process any remaining non-BERRY segment after the last BERRY segment
      const remainingNonBerry = tngl_code.slice(lastIndex)
      const cleanedRemainingNonBerry = removeNonBerryComments(remainingNonBerry)

      processedCode += cleanedRemainingNonBerry

      tngl_code = processedCode
    }

    // Clean up the whitespaces in TNGL code
    {
      tngl_code = tngl_code
        // Remove empty lines with only whitespace
        .replace(/^\s*[\n\r]/gm, '')

        // Remove multiple consecutive empty lines
        .replace(/[\n\r]{3,}/g, '\n\n')

        // Remove trailing whitespace at end of lines
        .replace(/[\t ]+$/gm, '')

        // Remove multiple spaces between words/tokens (preserving indentation)
        .replace(/([^\t\n\r ])[\t ]{2,}([^\t\n\r ])/g, '$1 $2')

        // Standardize line endings to \n
        .replace(/\r\n|\r/g, '\n')

        // Remove spaces before commas and semicolons
        .replace(/\s+([,;])/g, '$1')

        // Remove multiple spaces after commas (but preserve line indentation)
        .replace(/([,;])[\t ]{2,}/g, '$1 ')

        // Remove spaces around parentheses while preserving indentation
        .replace(/\(\s+/g, '(')
        .replace(/\s+\)/g, ')')

        // Remove extra spaces around operators while preserving indentation
        .replace(/(\S)[\t ]{2,}([%*+/<=>\-])/g, '$1 $2')
        .replace(/([%*+/<=>\-])[\t ]{2,}(\S)/g, '$1 $2')

        // Remove duplicate spaces after line indentation
        .replace(/^([\t ]*?)[\t ]{2,}/gm, '$1')

        // Remove extra whitespace at the start and end of the file
        .trim()
    }

    logging.debug(tngl_code)

    return tngl_code
  }

  /**
   * Gets the TNGL code from the controller to the WASM runtime.
   */
  syncTngl() {
    logging.verbose('syncTngl()')

    logging.info('> Requesting TNGL bytecode...')

    const request_uuid = this.#getUUID()
    const command_bytes = [COMMAND_FLAGS.FLAG_READ_TNGL_BYTECODE_REQUEST, ...numberToBytes(request_uuid, 4)]

    return this.runtime.request(command_bytes, true).then((response) => {
      if (response === null) {
        throw 'NoResponseReceived'
      }

      const reader = new TnglReader(response)

      logging.verbose(`response.byteLength=${response.byteLength}`)

      const flag = reader.readFlag()

      logging.verbose(`flag=${flag}`)
      if (flag !== COMMAND_FLAGS.FLAG_READ_TNGL_BYTECODE_RESPONSE) {
        // logging.error("ERROR ds9a8f07");
        throw 'InvalidResponseFlag'
      }

      const response_uuid = reader.readUint32()

      logging.verbose(`response_uuid=${response_uuid}`)
      if (response_uuid !== request_uuid) {
        // logging.error("ERROR fd0s987");
        throw 'InvalidResponseUuid'
      }

      const error_code = reader.readUint8()

      logging.verbose(`error_code=${error_code}`)

      if (error_code === 0) {
        const tngl_bytecode_size = reader.readUint16()

        logging.debug(`tngl_bytecode_size=${tngl_bytecode_size}`)

        const tngl_bytecode = reader.readBytes(tngl_bytecode_size)

        logging.debug(`tngl_bytecode=[${tngl_bytecode}]`)

        const DUMMY_CONNECTION = SpectodaWasm.Connection.make(
          '00:00:00:00:00:00',
          SpectodaWasm.connector_type_t.CONNECTOR_UNDEFINED,
          SpectodaWasm.connection_rssi_t.RSSI_MAX,
        )

        this.runtime.spectoda_js.request(new Uint8Array(tngl_bytecode), DUMMY_CONNECTION)
      } else {
        // maybe no TNGL in the controller
        logging.error('ERROR asdf8079: Failed to synchronize TNGL')
        throw 'FailedToSynchronizeTngl'
      }
    })
  }

  /**
   * ! Useful
   * Writes the given TNGL code to the controller.
   * Controller synchronize their TNGL. Which means the TNLG you upload to one controller will be synchronized to all controllers (within a few minutes, based on the TNGL file size)
   * @immakermatty refactor suggestion to `loadTngl` (???)
   */
  writeTngl(tngl_code: string | null, tngl_bytes: Uint8Array | null) {
    logging.verbose(`writeTngl(tngl_code=${tngl_code}, tngl_bytes=${tngl_bytes})`)

    logging.info('> Writing Tngl code...')

    if ((tngl_code === null || tngl_code === undefined) && (tngl_bytes === null || tngl_bytes === undefined)) {
      return Promise.reject('InvalidParameters')
    }

    if (tngl_bytes === null || tngl_bytes === undefined) {
      tngl_bytes = this.#parser.parseTnglCode(tngl_code)
    }

    const reinterpret_bytecode = [
      COMMAND_FLAGS.FLAG_LOAD_TNGL,
      ...numberToBytes(this.runtime.clock.millis(), 6),
      0,
      ...numberToBytes(tngl_bytes.length, 4),
      ...tngl_bytes,
    ]

    if (tngl_bytes.length >= TNGL_SIZE_CONSIDERED_BIG) {
      const erase_tngl_uuid = this.#getUUID()
      const erase_tngl_bytecode = [COMMAND_FLAGS.FLAG_ERASE_TNGL_BYTECODE_REQUEST, ...numberToBytes(erase_tngl_uuid, 4)]

      return this.runtime.execute(erase_tngl_bytecode, undefined).then(() => {
        return this.runtime.execute(reinterpret_bytecode, 'TNGL')
      })
    } else {
      return this.runtime.execute(reinterpret_bytecode, 'TNGL')
    }
  }

  /**
   * ! Useful
   * Emits Spectoda Event with null value.
   */
  emitEvent(
    event_label: SpectodaTypes.Label,
    // TODO rename to spectodaIds
    device_ids: SpectodaTypes.IDs = 255,
    force_delivery = true,
  ) {
    logging.verbose(
      `emitEvent(event_label=${event_label},device_ids=${device_ids},force_delivery=${force_delivery})`,
    )

    const func = (id: SpectodaTypes.ID) => {
      if (!this.runtime.spectoda_js.emitNull(event_label, id)) {
        return Promise.reject('EventEmitFailed')
      }
      return Promise.resolve()
    }

    if (typeof device_ids === 'object') {
      const promises = device_ids.map(func)

      return Promise.all(promises)
    } else {
      return func(device_ids)
    }
  }

  /**
   * @deprecated Use emitEvent() instead to match the function names with BerryLang codebase
   */
  emitNullEvent = this.emitEvent

  /**
   * @deprecated Use emitEvent() instead to match the function names with BerryLang codebase
   */
  emitNull = this.emitEvent

  /**
   * ! Useful
   * Emits Spectoda Event with timestamp value.
   * Timestamp value range is (-86400000, 86400000)
   */
  emitTimestamp(
    event_label: SpectodaTypes.Label,
    event_value: SpectodaTypes.Timestamp,
    device_ids: SpectodaTypes.IDs = 255,
  ) {
    logging.verbose(`emitTimestamp(label=${event_label},value=${event_value},id=${device_ids})`)

    if (event_value > 86400000) {
      logging.error('Invalid event value')
      event_value = 86400000
    }

    if (event_value < -86400000) {
      logging.error('Invalid event value')
      event_value = -86400000
    }

    const func = (id: SpectodaTypes.ID) => {
      if (!this.runtime.spectoda_js.emitTimestamp(event_label, event_value, id)) {
        return Promise.reject('EventEmitFailed')
      }
      return Promise.resolve()
    }

    if (typeof device_ids === 'object') {
      const promises = device_ids.map(func)

      return Promise.all(promises)
    } else {
      return func(device_ids)
    }
  }

  /**
   * @deprecated Use emitTimestamp() instead to match the function names with BerryLang codebase
   */
  emitTimestampEvent = this.emitTimestamp

  /**
   * ! Useful
   * Emits Spectoda Event with color value.
   * Color value must be a string in hex format with or without "#" prefix.
   */
  emitColor(event_label: SpectodaTypes.Label, event_value: SpectodaTypes.Color, device_ids: SpectodaTypes.IDs = 255) {
    logging.verbose(`emitColor(label=${event_label},value=${event_value},id=${device_ids})`)

    event_value = cssColorToHex(event_value)

    if (!event_value || !/#?[\dA-Fa-f]{6}/g.test(event_value)) {
      logging.error('Invalid event value. event_value=', event_value)
      event_value = '#000000'
    }

    const func = (id: SpectodaTypes.ID) => {
      if (!this.runtime.spectoda_js.emitColor(event_label, event_value, id)) {
        return Promise.reject('EventEmitFailed')
      }
      return Promise.resolve()
    }

    if (typeof device_ids === 'object') {
      const promises = device_ids.map(func)

      return Promise.all(promises)
    } else {
      return func(device_ids)
    }
  }

  /**
   * @deprecated Use emitColor() instead to match the function names with BerryLang codebase
   */
  emitColorEvent = this.emitColor

  /**
   * ! Useful
   * Emits Spectoda Event with percentage value
   * value range is (-100,100)
   */
  emitPercentage(
    event_label: SpectodaTypes.Label,
    event_value: SpectodaTypes.Percentage,
    device_ids: SpectodaTypes.IDs = 255,
  ) {
    logging.verbose(`emitPercentage(label=${event_label},value=${event_value},id=${device_ids})`)

    if (event_value > 100) {
      logging.error('Invalid event value')
      event_value = 100
    }

    if (event_value < -100) {
      logging.error('Invalid event value')
      event_value = -100
    }

    const func = (id: SpectodaTypes.ID) => {
      if (!this.runtime.spectoda_js.emitPercentage(event_label, event_value, id)) {
        return Promise.reject('EventEmitFailed')
      }
      return Promise.resolve()
    }

    if (typeof device_ids === 'object') {
      const promises = device_ids.map(func)

      return Promise.all(promises)
    } else {
      return func(device_ids)
    }
  }

  /**
   * @deprecated Use emitPercentage() instead to match the function names with BerryLang codebase
   */
  emitPercentageEvent = this.emitPercentage

  /**
   * E.g. event "anima" to value "a_001"
   */
  emitLabel(event_label: SpectodaTypes.Label, event_value: SpectodaTypes.Label, device_ids: SpectodaTypes.IDs = 255) {
    logging.verbose(`emitLabel(label=${event_label},value=${event_value},id=${device_ids})`)

    if (typeof event_value !== 'string') {
      logging.error('Invalid event value')
      event_value = ''
    }

    if (event_value.length > 5) {
      logging.error('Invalid event value')
      event_value = event_value.slice(0, 5)
    }

    const func = (id: SpectodaTypes.ID) => {
      if (!this.runtime.spectoda_js.emitLabel(event_label, event_value, id)) {
        return Promise.reject('EventEmitFailed')
      }
      return Promise.resolve()
    }

    if (typeof device_ids === 'object') {
      const promises = device_ids.map(func)

      return Promise.all(promises)
    } else {
      return func(device_ids)
    }
  }

  /**
   * @deprecated Use emitLabel() instead to match the function names with BerryLang codebase
   */
  emitLabelEvent = this.emitLabel

  /**
   * Sets the timeline to the current time of the day and unpauses it.
   */
  syncTimelineToDayTime() {
    logging.verbose('syncTimelineToDayTime()')

    const now = new Date()

    const hours = now.getHours()
    const minutes = now.getMinutes()
    const seconds = now.getSeconds()
    const miliseconds = now.getMilliseconds()

    const time = hours * 60 * 60 * 1000 + minutes * 60 * 1000 + seconds * 1000 + miliseconds

    const day = String(now.getDate()).padStart(2, '0')
    const month = String(now.getMonth() + 1).padStart(2, '0') // getMonth() returns 0-based index
    const year = now.getFullYear()

    this.timeline.unpause()
    this.timeline.setMillis(time)
    this.timeline.setDate(`${day}-${month}-${year}`)

    return this.syncTimeline()
  }

  /**
   * Synchronizes timeline of the connected controller with the current time of the runtime.
   */
  syncTimeline(
    timestamp: SpectodaTypes.Timestamp | null = null,
    paused: boolean | null = null,
    date: SpectodaTypes.Date | null = null,
  ) {
    logging.verbose(`syncTimeline(timestamp=${timestamp}, paused=${paused})`)

    if (timestamp === null || timestamp === undefined) {
      timestamp = this.timeline.millis()
    }

    if (paused === null || paused === undefined) {
      paused = this.timeline.paused()
    }

    if (date === null || date === undefined) {
      date = this.timeline.getDate()
    }

    const clock_timestamp = this.runtime.clock.millis()

    logging.debug(
      `> Setting timeline to timestamp=${timestamp}, paused=${paused}, date=${date}, clock_timestamp=${clock_timestamp}`,
    )

    // from "DD-MM-YYYY" date erase "-" and convert to number YYYYMMDD:
    const date_number = parseInt(date.split('-').reverse().join(''))

    const flags = paused ? 0b00010000 : 0b00000000 // flags: [reserved,reserved,reserved,timeline_paused,reserved,reserved,reserved,reserved]
    const payload = [
      COMMAND_FLAGS.FLAG_TIMELINE_WRITE,
      ...numberToBytes(clock_timestamp, 6),
      ...numberToBytes(timestamp, 4),
      flags,
      ...numberToBytes(date_number, 4),
    ]

    return this.runtime.execute(payload, 'TMLN')
  }

  /**
   * Synchronizes TNGL variable state of given ID to all other IDs
   */
  syncState(deviceId: SpectodaTypes.ID) {
    logging.info('> Synchronizing state...')

    const request_uuid = this.#getUUID()
    const device_request = [COMMAND_FLAGS.FLAG_SYNC_STATE_REQUEST, ...numberToBytes(request_uuid, 4), deviceId]

    return this.runtime.request(device_request, false)
  }

  /**
   * downloads firmware and calls updateDeviceFirmware()
   * @param {string} url - whole URL of the firmware file
   */
  async fetchAndUpdateDeviceFirmware(url: string) {
    const fw = await fetchFirmware(url)

    return this.updateDeviceFirmware(fw)
  }

  /**
   * downloads firmware and calls updateNetworkFirmware()
   * @param {string} url - whole URL of the firmware file
   */
  async fetchAndUpdateNetworkFirmware(url: string) {
    const fw = await fetchFirmware(url)

    return this.updateNetworkFirmware(fw)
  }

  /**
   * ! Useful
   * Update the firmware of the connected controller.
   * @param {Uint8Array} firmware - The firmware to update the controller with.
   */
  // todo rename to updateControllerFirmware
  updateDeviceFirmware(firmware: Uint8Array) {
    logging.verbose(`updateDeviceFirmware(firmware.length=${firmware?.length})`)

    logging.debug('> Updating Controller FW...')

    if (!firmware || firmware.length < MIN_FIRMWARE_LENGTH) {
      logging.error('Invalid firmware')
      return Promise.reject('InvalidFirmware')
    }

    return Promise.resolve()
      .then(() => {
        return this.requestWakeLock().catch((e) => {
          logging.error('Failed to acquire wake lock', e)
        })
      })
      .then(() => {
        return this.runtime.updateFW(firmware).finally(() => {
          return this.runtime.disconnect()
        })
      })
      .finally(() => {
        return this.releaseWakeLock().catch((e) => {
          logging.error('Failed to release wake lock', e)
        })
      })
  }

  /**
   * ! Useful
   * Update the firmware of ALL CONNECTED CONTROLLERS in the network.
   * @param {Uint8Array} firmware - The firmware to update the controller with.
   */
  updateNetworkFirmware(firmware: Uint8Array) {
    logging.verbose(`updateNetworkFirmware(firmware.length=${firmware?.length})`)

    logging.debug('> Updating Network FW...')

    if (!firmware || firmware.length < 10000) {
      logging.error('Invalid firmware')
      return Promise.reject('InvalidFirmware')
    }

    this.#updating = true

    this.requestWakeLock().catch((e) => {
      logging.error('Failed to acquire wake lock', e)
    })

    return new Promise(async (resolve, reject) => {
      // const chunk_size = detectAndroid() ? 480 : 3984; // must be modulo 16
      // const chunk_size = 992; // must be modulo 16
      const chunk_size = detectSpectodaConnect() ? 480 : 3984

      let index_from = 0
      let index_to = chunk_size

      let written = 0

      // logging.setLoggingLevel(logging.level - 1);

      logging.info('OTA UPDATE')
      logging.verbose(firmware)

      const start_timestamp = Date.now()

      await sleep(100)

      try {
        this.runtime.emit(SpectodaAppEvents.OTA_STATUS, 'begin')

        {
          //===========// RESET //===========//
          logging.info('OTA RESET')

          const command_bytes = [COMMAND_FLAGS.FLAG_OTA_RESET, 0x00, ...numberToBytes(0x00000000, 4)]

          await this.runtime.execute(command_bytes, undefined)
        }

        await sleep(100)

        {
          //===========// BEGIN //===========//
          logging.info('OTA BEGIN')

          const command_bytes = [COMMAND_FLAGS.FLAG_OTA_BEGIN, 0x00, ...numberToBytes(firmware.length, 4)]

          await this.runtime.execute(command_bytes, undefined)
        }

        // TODO optimalize this begin by detecting when all controllers have erased its flash
        // TODO also, right now the gateway controller sends to other controlles to erase flash after it is done.
        // TODO that slows things down
        await sleep(8000) // ! keep this below 10 seconds to avoid connection timeout

        {
          //===========// WRITE //===========//
          logging.info('OTA WRITE')

          while (written < firmware.length) {
            if (index_to > firmware.length) {
              index_to = firmware.length
            }

            const command_bytes = [
              COMMAND_FLAGS.FLAG_OTA_WRITE,
              0x00,
              ...numberToBytes(written, 4),
              ...firmware.slice(index_from, index_to),
            ]

            await this.runtime.execute(command_bytes, undefined)

            written += index_to - index_from

            const percentage = Math.floor((written * 10000) / firmware.length) / 100

            logging.info(percentage + '%')
            this.runtime.emit(SpectodaAppEvents.OTA_PROGRESS, percentage)

            index_from += chunk_size
            index_to = index_from + chunk_size
          }
        }

        await sleep(1000)

        {
          //===========// END //===========//
          logging.info('OTA END')

          const command_bytes = [COMMAND_FLAGS.FLAG_OTA_END, 0x00, ...numberToBytes(written, 4)]

          await this.runtime.execute(command_bytes, undefined)
        }

        await sleep(3000)

        await this.rebootNetwork()

        logging.debug('> Firmware written in ' + (Date.now() - start_timestamp) / 1000 + ' seconds')

        this.runtime.emit(SpectodaAppEvents.OTA_STATUS, 'success')

        resolve(null)
        return
      } catch (e) {
        this.runtime.emit(SpectodaAppEvents.OTA_STATUS, 'fail')
        reject(e)
        return
      }
    })
      .then(() => {
        return this.runtime.disconnect()
      })

      .finally(() => {
        this.releaseWakeLock().catch((e) => {
          logging.error('Failed to release wake lock', e)
        })
        this.#updating = false

        // logging.setLoggingLevel(logging.level + 1);
      })
  }

  /**
   * Tells the connected controller to update a peer controller with its own firmware
   */
  async updatePeerFirmware(peer: string) {
    logging.verbose(`updatePeerFirmware(peer=${peer})`)

    // Validate the input to ensure it is a valid MAC address
    if (typeof peer !== 'string' || !/^([\dA-Fa-f]{2}[:-]){5}([\dA-Fa-f]{2})$/.test(peer)) {
      // If the input is invalid, display an error message and return null
      throw 'InvalidPeerMacAdress'
    }

    const request_uuid = this.#getUUID()
    const bytes = [COMMAND_FLAGS.FLAG_FW_UPDATE_PEER_REQUEST, ...numberToBytes(request_uuid, 4), ...strMacToBytes(peer)]

    return this.runtime.request(bytes, true).then((response) => {
      if (response === null) {
        throw 'NoResponseReceived'
      }

      const reader = new TnglReader(response)

      logging.verbose(`response.byteLength=${response.byteLength}`)

      if (reader.readFlag() !== COMMAND_FLAGS.FLAG_FW_UPDATE_PEER_RESPONSE) {
        throw 'InvalidResponseFlag'
      }

      const response_uuid = reader.readUint32()

      if (response_uuid != request_uuid) {
        throw 'InvalidResponseUuid'
      }

      const error_code = reader.readUint8()

      logging.verbose(`error_code=${error_code}`)

      if (error_code === 0) {
        logging.info('Update sucessful')
      } else {
        throw 'Fail'
      }
    })
  }

  /**
   * ! Useful
   * Get the JSON config of the connected controller.
   */
  // todo rename to readControllerConfig
  readDeviceConfig() {
    logging.debug('> Reading device config...')

    const request_uuid = this.#getUUID()
    const bytes = [COMMAND_FLAGS.FLAG_DEVICE_CONFIG_REQUEST, ...numberToBytes(request_uuid, 4)]

    return this.runtime.request(bytes, true).then((response) => {
      if (response === null) {
        throw 'NoResponseReceived'
      }

      const reader = new TnglReader(response)

      logging.verbose(`response.byteLength=${response.byteLength}`)

      if (reader.readFlag() !== COMMAND_FLAGS.FLAG_DEVICE_CONFIG_RESPONSE) {
        throw 'InvalidResponseFlag'
      }

      const response_uuid = reader.readUint32()

      if (response_uuid != request_uuid) {
        throw 'InvalidResponseUuid'
      }

      const error_code = reader.readUint8()

      logging.verbose(`error_code=${error_code}`)

      if (error_code === 0) {
        const config_size = reader.readUint32()

        logging.verbose(`config_size=${config_size}`)

        const config_bytes = reader.readBytes(config_size)

        logging.verbose(`config_bytes=${config_bytes}`)

        const decoder = new TextDecoder()
        const config = decoder.decode(new Uint8Array(config_bytes))

        logging.verbose(`config=${config}`)

        if (config.charAt(config.length - 1) == '\0') {
          logging.warn('NULL config character detected')
          return config.slice(0, -1)
        }

        return config
      } else {
        throw 'Fail'
      }
    })
  }

  /**
   * ! Useful
   * Updates the JSON config of the connected controller.
   */
  // todo rename to updateControllerConfig
  updateDeviceConfig(config_string: string) {
    logging.debug('> Updating config...')

    logging.verbose(`config_string=${config_string}`)

    const condif_object = JSON.parse(config_string)
    const config = JSON.stringify(condif_object)

    logging.verbose(`config=${config}`)

    const encoder = new TextEncoder()
    const config_bytes = encoder.encode(config)
    const config_bytes_size = config.length

    // make config update request
    const request_uuid = this.#getUUID()
    const bytes = [
      COMMAND_FLAGS.FLAG_CONFIG_UPDATE_REQUEST,
      ...numberToBytes(request_uuid, 4),
      ...numberToBytes(config_bytes_size, 4),
      ...config_bytes,
    ]

    return this.runtime.request(bytes, true).then((response) => {
      if (response === null) {
        throw 'NoResponseReceived'
      }

      const reader = new TnglReader(response)

      logging.verbose(`response.byteLength=${response.byteLength}`)

      if (reader.readFlag() !== COMMAND_FLAGS.FLAG_CONFIG_UPDATE_RESPONSE) {
        throw 'InvalidResponse'
      }

      const response_uuid = reader.readUint32()

      if (response_uuid != request_uuid) {
        throw 'InvalidResponse'
      }

      const error_code = reader.readUint8()

      logging.verbose(`error_code=${error_code}`)

      if (error_code === 0) {
        logging.info('Write Config Success')
        
        // todo rename to rebootController
        // reboot device
        const payload = [COMMAND_FLAGS.FLAG_DEVICE_REBOOT_REQUEST]

        return this.runtime.request(payload, false)
      } else {
        throw 'Fail'
      }
    })
  }

  /**
   * Updates the JSON config of ALL CONNECTED CONTROLLERS in the network.
   */
  updateNetworkConfig(config_string: string) {
    logging.debug('> Updating config of whole network...')

    const encoder = new TextEncoder()
    const config_bytes = encoder.encode(config_string)
    const config_bytes_size = config_string.length

    // make config update request
    const request_uuid = this.#getUUID()
    const request_bytes = [
      COMMAND_FLAGS.FLAG_CONFIG_UPDATE_REQUEST,
      ...numberToBytes(request_uuid, 4),
      ...numberToBytes(config_bytes_size, 4),
      ...config_bytes,
    ]

    return this.runtime.execute(request_bytes, 'CONF').then(() => {
      logging.debug('> Rebooting network...')
      const command_bytecode = [COMMAND_FLAGS.FLAG_DEVICE_REBOOT_REQUEST]

      return this.runtime.execute(command_bytecode, undefined)
    })
  }

  /**
   * Gets the timeline from connected controller to the runtime.
   */
  requestTimeline() {
    logging.verbose('requestTimeline()')

    logging.info('> Requesting timeline...')

    const request_uuid = this.#getUUID()
    const bytes = [COMMAND_FLAGS.FLAG_TIMELINE_REQUEST, ...numberToBytes(request_uuid, 4)]

    return this.runtime.request(bytes, true).then((response) => {
      if (response === null) {
        throw 'NoResponseReceived'
      }

      logging.verbose(`response.byteLength=${response.byteLength}`)

      const reader = new TnglReader(response)

      if (reader.readFlag() !== COMMAND_FLAGS.FLAG_TIMELINE_RESPONSE) {
        throw 'InvalidResponseFlag'
      }

      const response_uuid = reader.readUint32()

      if (response_uuid != request_uuid) {
        throw 'InvalidResponseUuid'
      }

      const error_code = reader.readUint8()

      if (error_code !== 0) {
        throw 'RequestTimelineFailed'
      }

      const clock_timestamp = reader.readUint48()
      const timeline_timestamp = reader.readInt32()
      const timeline_paused = reader.readUint8()
      const timeline_date_number = reader.available >= 4 ? reader.readUint32() : 0

      // Convert date number YYYYMMDD to DD-MM-YYYY format
      const timeline_date = timeline_date_number
        ? `${String(timeline_date_number % 100).padStart(2, '0')}-${String(
            Math.floor(timeline_date_number / 100) % 100,
          ).padStart(2, '0')}-${Math.floor(timeline_date_number / 10000)}`
        : '01-01-1970'

      logging.info(
        `clock_timestamp=${clock_timestamp}, timeline_timestamp=${timeline_timestamp}, timeline_paused=${timeline_paused}, timeline_date=${timeline_date}`,
      )

      const flags = timeline_paused ? 0b00010000 : 0b00000000 // flags: [reserved,reserved,reserved,timeline_paused,reserved,reserved,reserved,reserved]
      const payload = [
        COMMAND_FLAGS.FLAG_TIMELINE_WRITE,
        ...numberToBytes(clock_timestamp, 6),
        ...numberToBytes(timeline_timestamp, 4),
        flags,
        ...numberToBytes(timeline_date_number, 4),
      ]

      return this.runtime.execute(payload, 'TMLN')
    })
  }

  // Code.device.runtime.execute([240,1,0,0,0,5],null)
  /**
   * ! Useful
   * Reboots ALL CONNECTED CONTROLLERS in the network. This will temporarily disconnect the controller from the network. Spectoda.js will try to reconnect you back to the controller.
   */
  rebootNetwork() {
    logging.debug('> Rebooting network...')

    const payload = [COMMAND_FLAGS.FLAG_DEVICE_REBOOT_REQUEST]

    return this.runtime.execute(payload, undefined)
  }

  /**
   * ! Useful
   * Reboots the controller. This will temporarily disconnect the controller from the network. Spectoda.js will try to reconnect you back to the controller.
   */
  // todo rename to rebootController
  rebootDevice() {
    logging.debug('> Rebooting device...')

    const payload = [COMMAND_FLAGS.FLAG_DEVICE_REBOOT_REQUEST]

    return this.runtime.request(payload, false)
  }

  /**
   * ! Useful
   * Reboots the controller. This will temporarily disconnect the controller from the network. No automatic reconnection will be attempted.
   */
  // todo rename to disconnectController
  rebootAndDisconnectDevice() {
    logging.debug('> Rebooting and disconnecting device...')

    const payload = [COMMAND_FLAGS.FLAG_DEVICE_REBOOT_REQUEST]

    return this.runtime.request(payload, false).then(() => {
      return this.disconnect()
    })
  }

  /**
   * ! Useful
   * Puts currently connected controller into the DEFAULT network. More info at the top of this file.
   */
  removeOwner() {
    logging.debug('> Removing owner...')

    const request_uuid = this.#getUUID()
    const bytes = [COMMAND_FLAGS.FLAG_ERASE_NETWORK_REQUEST, ...numberToBytes(request_uuid, 4)]

    return this.runtime.request(bytes, true).then((response) => {
      if (response === null) {
        throw 'NoResponseReceived'
      }

      const reader = new TnglReader(response)

      logging.verbose(`response.byteLength=${response.byteLength}`)

      if (reader.readFlag() !== COMMAND_FLAGS.FLAG_ERASE_OWNER_RESPONSE) {
        throw 'InvalidResponseFlag'
      }

      const response_uuid = reader.readUint32()

      if (response_uuid != request_uuid) {
        throw 'InvalidResponseUuid'
      }

      const error_code = reader.readUint8()

      logging.verbose(`error_code=${error_code}`)

      if (error_code !== 0) {
        throw 'OwnerEraseFailed'
      }

      const removed_device_mac_bytes = reader.readBytes(6)

      return this.rebootDevice()
        .catch(() => {})
        .then(() => {
          let removed_device_mac = '00:00:00:00:00:00'

          if (removed_device_mac_bytes.length >= 6) {
            removed_device_mac = Array.from(removed_device_mac_bytes, function (byte) {
              return ('0' + (byte & 0xff).toString(16)).slice(-2)
            }).join(':')
          }
          return {
            mac: removed_device_mac === '00:00:00:00:00:00' ? null : removed_device_mac,
          }
        })
    })
  }

  /**
   * ! Useful
   * Removes ALL CONTROLLERS from their current network. More info at the top of this file.
   */
  removeNetworkOwner() {
    logging.debug('> Removing network owner...')

    const request_uuid = this.#getUUID()
    const bytes = [COMMAND_FLAGS.FLAG_ERASE_NETWORK_REQUEST, ...numberToBytes(request_uuid, 4)]

    return this.runtime.execute(bytes, undefined).then(() => {
      return this.rebootNetwork()
    })
  }

  /**
   * ! Useful
   * Get the firmware version of the controller in string format
   */
  getFwVersion() {
    logging.debug('> Requesting fw version...')

    const request_uuid = this.#getUUID()
    const bytes = [COMMAND_FLAGS.FLAG_FW_VERSION_REQUEST, ...numberToBytes(request_uuid, 4)]

    return this.runtime.request(bytes, true).then((response) => {
      if (response === null) {
        throw 'NoResponseReceived'
      }

      const reader = new TnglReader(response)

      logging.verbose(`response.byteLength=${response.byteLength}`)

      if (reader.readFlag() !== COMMAND_FLAGS.FLAG_FW_VERSION_RESPONSE) {
        throw 'InvalidResponseFlag'
      }

      const response_uuid = reader.readUint32()

      if (response_uuid != request_uuid) {
        throw 'InvalidResponseUuid'
      }

      const error_code = reader.readUint8()

      logging.verbose(`error_code=${error_code}`)

      let version = null

      if (error_code === 0) {
        version = reader.readString(32)
      } else {
        throw 'Fail'
      }
      logging.verbose(`version=${version}`)

      logging.info(`FW Version: ${version}`)

      return version.trim()
    })
  }

  /**
   * ! Useful
   * Get the fingerprint of a currently uploaded Tngl (via `writeTngl()`)
   * Tngl fingerprint is an identifier of the Tngl code that is currently running on the controller. It is used for checking if the controller has the correct Tngl code.
   */
  getTnglFingerprint() {
    logging.debug('> Getting TNGL fingerprint...')

    const request_uuid = this.#getUUID()
    const bytes = [COMMAND_FLAGS.FLAG_TNGL_FINGERPRINT_REQUEST, ...numberToBytes(request_uuid, 4)]

    return this.runtime.request(bytes, true).then((response) => {
      if (response === null) {
        throw 'NoResponseReceived'
      }

      const reader = new TnglReader(response)

      logging.verbose('response:', response)

      if (reader.readFlag() !== COMMAND_FLAGS.FLAG_TNGL_FINGERPRINT_RESPONSE) {
        throw 'InvalidResponseFlag'
      }

      const response_uuid = reader.readUint32()

      if (response_uuid != request_uuid) {
        throw 'InvalidResponseUuid'
      }

      const error_code = reader.readUint8()

      logging.verbose(`error_code=${error_code}`)

      let fingerprint = null

      if (error_code === 0) {
        fingerprint = reader.readBytes(32)
      } else {
        throw 'Fail'
      }

      logging.verbose(`fingerprint=${fingerprint}`)
      logging.verbose(
        `fingerprint=${[...fingerprint].map((byte) => ('0' + (byte & 0xff).toString(16)).slice(-2)).join(',')}`,
      )

      logging.info('Controller TNGL Fingerprint: ' + uint8ArrayToHexString(fingerprint))
      console.log('fingerprinting', fingerprint)
      return new Uint8Array(fingerprint)
    })
  }

  /**
   * For FW nerds
   */
  // datarate in bits per second
  setNetworkDatarate(datarate: number) {
    logging.debug(`> Setting network datarate to ${datarate} bsp...`)

    const request_uuid = this.#getUUID()
    const payload = [
      COMMAND_FLAGS.FLAG_CHANGE_DATARATE_REQUEST,
      ...numberToBytes(request_uuid, 4),
      ...numberToBytes(datarate, 4),
    ]

    return this.runtime.execute(payload, undefined)
  }

  /**
   * @deprecated
   */
  readRomPhyVdd33() {
    logging.debug('> Requesting rom_phy_vdd33...')

    const request_uuid = this.#getUUID()
    const bytes = [COMMAND_FLAGS.FLAG_ROM_PHY_VDD33_REQUEST, ...numberToBytes(request_uuid, 4)]

    return this.runtime.request(bytes, true).then((response) => {
      if (response === null) {
        throw 'NoResponseReceived'
      }

      const reader = new TnglReader(response)

      logging.verbose(`response.byteLength=${response.byteLength}`)

      if (reader.readFlag() !== COMMAND_FLAGS.FLAG_ROM_PHY_VDD33_RESPONSE) {
        throw 'InvalidResponseFlag'
      }

      const response_uuid = reader.readUint32()

      if (response_uuid != request_uuid) {
        throw 'InvalidResponseUuid'
      }

      const error_code = reader.readUint8()

      logging.verbose(`error_code=${error_code}`)

      let vdd_reading = null

      if (error_code === 0) {
        vdd_reading = reader.readInt32()
      } else {
        throw 'Fail'
      }
      logging.info(`vdd_reading=${vdd_reading}`)

      return vdd_reading
    })
  }

  /**
   * @deprecated Will be replaced in 0.12 by IO operations
   */
  readPinVoltage(pin: number) {
    logging.debug(`> Requesting pin ${pin} voltage ...`)

    const request_uuid = this.#getUUID()
    const bytes = [COMMAND_FLAGS.FLAG_VOLTAGE_ON_PIN_REQUEST, ...numberToBytes(request_uuid, 4), pin]

    return this.runtime.request(bytes, true).then((response) => {
      if (response === null) {
        throw 'NoResponseReceived'
      }

      const reader = new TnglReader(response)

      logging.verbose(`response.byteLength=${response.byteLength}`)

      if (reader.readFlag() !== COMMAND_FLAGS.FLAG_VOLTAGE_ON_PIN_RESPONSE) {
        throw 'InvalidResponseFlag'
      }

      const response_uuid = reader.readUint32()

      if (response_uuid != request_uuid) {
        throw 'InvalidResponseUuid'
      }

      const error_code = reader.readUint8()

      logging.verbose(`error_code=${error_code}`)

      let pin_reading = null

      if (error_code === 0) {
        pin_reading = reader.readUint32()
      } else {
        throw 'Fail'
      }
      logging.info(`pin_reading=${pin_reading}`)

      return pin_reading
    })
  }

  /**
   * @deprecated This is app-level functionality
   */
  setLanguage(lng: string) {
    logging.info('setLanguage is deprecated')
  }

  /**
   * Set the debug level of the Spectoda.js library
   */
  setDebugLevel(level: number) {
    logging.setLoggingLevel(level)
  }

  /**
   * ! Useful
   * Returns the MAC addresses of all nodes connected in the current network in real-time
   */
  getConnectedPeersInfo() {
    logging.debug('> Requesting connected peers info...')

    const request_uuid = this.#getUUID()
    const bytes = [COMMAND_FLAGS.FLAG_CONNECTED_PEERS_INFO_REQUEST, ...numberToBytes(request_uuid, 4)]

    return this.runtime.request(bytes, true).then((response) => {
      if (response === null) {
        throw 'NoResponseReceived'
      }

      const reader = new TnglReader(response)

      logging.verbose(`response.byteLength=${response.byteLength}`)

      if (reader.readFlag() !== COMMAND_FLAGS.FLAG_CONNECTED_PEERS_INFO_RESPONSE) {
        throw 'InvalidResponseFlag'
      }

      const response_uuid = reader.readUint32()

      if (response_uuid != request_uuid) {
        throw 'InvalidResponseUuid'
      }

      const error_code = reader.readUint8()

      logging.verbose(`error_code=${error_code}`)

      const peers = []

      if (error_code === 0) {
        const count = reader.readUint16()

        for (let index = 0; index < count; index++) {
          const mac = reader
            .readBytes(6)
            .map((v) => v.toString(16).padStart(2, '0'))
            .join(':')
          const rssi = reader.readUint16() / (65535 / 512) - 256

          peers.push({
            mac: mac,
            rssi: rssi,
          })
        }

        logging.info(`> Connected peers:\n${peers.map((x) => `  mac:${x.mac}, rssi:${x.rssi}`).join('\n')}`)

        return peers
      } else {
        throw 'Fail'
      }
    })
  }

  /**
   * Gets the EventHistory from the connected controller and loads it into the runtime.
   */
  syncEventHistory() {
    logging.info('> Requesting event history bytecode...')

    const request_uuid = this.#getUUID()
    const bytes = [COMMAND_FLAGS.FLAG_EVENT_HISTORY_BC_REQUEST, ...numberToBytes(request_uuid, 4)]

    return this.runtime.request(bytes, true).then((response) => {
      if (response === null) {
        throw 'NoResponseReceived'
      }

      const reader = new TnglReader(response)

      logging.verbose(`response.byteLength=${response.byteLength}`)

      if (reader.readFlag() !== COMMAND_FLAGS.FLAG_EVENT_HISTORY_BC_RESPONSE) {
        // logging.error("InvalidResponseFlag");
        throw 'InvalidResponseFlag'
      }

      const response_uuid = reader.readUint32()

      if (response_uuid != request_uuid) {
        // logging.error("InvalidResponseUuid");
        throw 'InvalidResponseUuid'
      }

      const error_code = reader.readUint8()

      logging.verbose(`error_code=${error_code}`)

      if (error_code === 0) {
        const historic_events_bytecode_size = reader.readUint16()

        logging.debug(`historic_events_bytecode_size=${historic_events_bytecode_size}`)

        const historic_events_bytecode = reader.readBytes(historic_events_bytecode_size)

        logging.debug(`historic_events_bytecode=[${historic_events_bytecode}]`)

        this.runtime.spectoda_js.eraseHistory()

        const DUMMY_CONNECTION = SpectodaWasm.Connection.make(
          '00:00:00:00:00:00',
          SpectodaWasm.connector_type_t.CONNECTOR_UNDEFINED,
          SpectodaWasm.connection_rssi_t.RSSI_MAX,
        )

        this.runtime.spectoda_js.request(new Uint8Array(historic_events_bytecode), DUMMY_CONNECTION)
      } else {
        logging.error('ERROR cxzv982io')
        throw 'FailedToSynchronizeEventHistory'
      }
    })
  }

  /**
   * ! Useful
   * Erases the event state history of ALL CONTROLLERS in the network Spectoda.js is `connect`ed to.
   * TODO This should be called `eraseEventStates`
   */
  eraseEventHistory() {
    logging.debug('> Erasing event history...')

    const request_uuid = this.#getUUID()
    const bytes = [COMMAND_FLAGS.FLAG_ERASE_EVENT_HISTORY_REQUEST, ...numberToBytes(request_uuid, 4)]

    return this.runtime.execute(bytes, undefined)
  }

  /**
   * ! Useful
   * Puts CONTROLLER Spectoda.js is `connect`ed to to sleep. To wake him up, power must be cycled by removing and reapplying it.
   
  * TODO rename to controllerSleep
   */
  deviceSleep() {
    logging.debug('> Sleep device...')

    const request_uuid = this.#getUUID()
    const payload = [COMMAND_FLAGS.FLAG_SLEEP_REQUEST, ...numberToBytes(request_uuid, 4)]

    return this.runtime.request(payload, false)
  }

  /**
   * ! Useful
   * Puts ALL CONTROLLERS in the network Spectoda.js is `connect`ed to to sleep. To wake them up, power must be cycled by removing and reapplying it.
   */
  networkSleep() {
    logging.debug('> Sleep network...')

    const request_uuid = this.#getUUID()
    const payload = [COMMAND_FLAGS.FLAG_SLEEP_REQUEST, ...numberToBytes(request_uuid, 4)]

    return this.runtime.execute(payload, undefined)
  }

  /**
   * Forces a TNGL variable state save on the connected controller. TNGL variable state is by default saved every 8 seconds atfer no event is emitted.
   */
  saveState() {
    logging.debug('> Saving state...')

    const request_uuid = this.#getUUID()
    const payload = [COMMAND_FLAGS.FLAG_SAVE_STATE_REQUEST, ...numberToBytes(request_uuid, 4)]

    return this.runtime.execute(payload, undefined)
  }

  /**
   * ! Useful
   * Changes the network of the controller Spectoda.js is `connect`ed to.
   */
  writeOwner(
    ownerSignature: SpectodaTypes.NetworkSignature = '00000000000000000000000000000000',
    ownerKey: SpectodaTypes.NetworkKey = '00000000000000000000000000000000',
  ) {
    logging.debug(`writeOwner(ownerSignature=${ownerSignature}, ownerKey=${ownerKey})`)

    logging.info('> Writing owner to controller...')

    if (!ownerSignature || !ownerKey) {
      throw 'InvalidParameters'
    }

    if (ownerSignature == '00000000000000000000000000000000' && ownerKey == '00000000000000000000000000000000') {
      logging.warn('> Removing owner instead of writing all zero owner')
      return this.removeOwner()
    }

    const owner_signature_bytes = hexStringToUint8Array(ownerSignature, 16)
    const owner_key_bytes = hexStringToUint8Array(ownerKey, 16)

    logging.verbose('owner_signature_bytes', owner_signature_bytes)
    logging.verbose('owner_key_bytes', owner_key_bytes)

    const request_uuid = this.#getUUID()
    const bytes = [
      COMMAND_FLAGS.FLAG_ADOPT_REQUEST,
      ...numberToBytes(request_uuid, 4),
      ...owner_signature_bytes,
      ...owner_key_bytes,
    ]

    logging.verbose(bytes)

    return this.runtime
      .request(bytes, true)
      .then((response) => {
        if (response === null) {
          throw 'NoResponseReceived'
        }

        const reader = new TnglReader(response)

        logging.verbose('response=', response)

        if (reader.readFlag() !== COMMAND_FLAGS.FLAG_ADOPT_RESPONSE) {
          throw 'InvalidResponse'
        }

        const response_uuid = reader.readUint32()

        if (response_uuid != request_uuid) {
          throw 'InvalidResponse'
        }

        // TODO rename to controllerMac
        let device_mac = 'null'

        const error_code = reader.readUint8()

        // error_code 0 is success
        if (error_code === 0) {
          const device_mac_bytes = reader.readBytes(6)

          device_mac = Array.from(device_mac_bytes, function (byte) {
            return ('0' + (byte & 0xff).toString(16)).slice(-2)
          }).join(':')
        }

        logging.verbose(`error_code=${error_code}, device_mac=${device_mac}`)

        if (error_code === 0) {
          logging.info(`Adopted ${device_mac} successfully`)
          return {
            mac: device_mac,
            ownerSignature: this.#ownerSignature,
            ownerKey: this.#ownerKey,
            // name: newDeviceName,
            // id: newDeviceId,
          }
        } else {
          logging.warn('Adoption refused by device.')
          throw 'AdoptionRefused'
        }
      })
      .catch((e) => {
        logging.error('Error during writeOwner():', e)
        throw 'AdoptionFailed'
      })
  }

  /**
   * ! Useful
   * Changes the network of ALL controllers in the network Spectoda.js is `connect`ed to.
   */
  writeNetworkOwner(
    ownerSignature: SpectodaTypes.NetworkSignature = '00000000000000000000000000000000',
    ownerKey: SpectodaTypes.NetworkKey = '00000000000000000000000000000000',
  ) {
    logging.debug(`writeNetworkOwner(ownerSignature=${ownerSignature}, ownerKey=${ownerKey})`)

    logging.info('> Writing owner to network...')

    if (!ownerSignature || !ownerKey) {
      throw 'InvalidParameters'
    }

    if (ownerSignature == '00000000000000000000000000000000' && ownerKey == '00000000000000000000000000000000') {
      logging.warn('> Removing owner instead of writing all zero owner')
      return this.removeNetworkOwner()
    }

    const owner_signature_bytes = hexStringToUint8Array(ownerSignature, 16)
    const owner_key_bytes = hexStringToUint8Array(ownerKey, 16)

    logging.verbose('owner_signature_bytes', owner_signature_bytes)
    logging.verbose('owner_key_bytes', owner_key_bytes)

    const request_uuid = this.#getUUID()
    const bytes = [
      COMMAND_FLAGS.FLAG_ADOPT_REQUEST,
      ...numberToBytes(request_uuid, 4),
      ...owner_signature_bytes,
      ...owner_key_bytes,
    ]

    logging.verbose(bytes)

    return this.runtime.execute(bytes, undefined)
  }

  /**
   * ! Useful
   */
  writeControllerName(label: SpectodaTypes.Label) {
    logging.debug('> Writing Controller Name...')

    const request_uuid = this.#getUUID()
    const payload = [
      COMMAND_FLAGS.FLAG_WRITE_CONTROLLER_NAME_REQUEST,
      ...numberToBytes(request_uuid, 4),
      ...stringToBytes(label, 16, false),
    ]

    return this.runtime.request(payload, false)
  }

  /**
   * ! Useful
   */
  readControllerName() {
    logging.debug('> Reading Controller Name...')

    const request_uuid = this.#getUUID()
    const bytes = [COMMAND_FLAGS.FLAG_READ_CONTROLLER_NAME_REQUEST, ...numberToBytes(request_uuid, 4)]

    return this.runtime.request(bytes, true).then((response) => {
      if (response === null) {
        throw 'NoResponseReceived'
      }

      const reader = new TnglReader(response)

      logging.verbose(`response.byteLength=${response.byteLength}`)

      if (reader.readFlag() !== COMMAND_FLAGS.FLAG_READ_CONTROLLER_NAME_RESPONSE) {
        throw 'InvalidResponseFlag'
      }

      const response_uuid = reader.readUint32()

      if (response_uuid != request_uuid) {
        throw 'InvalidResponseUuid'
      }

      const error_code = reader.readUint8()

      logging.verbose(`error_code=${error_code}`)

      let name = null

      if (error_code === 0) {
        name = reader.readString(16)
      } else {
        throw 'Fail'
      }

      logging.verbose(`name=${name}`)
      logging.debug(`> Controller Name: ${name}`)

      return name
    })
  }

  /**
   * ! Useful
   * Write IO variant for a specific IO label in the controller config
   * @param ioLabel - 5 character IO label (e.g. "BTN_1")
   * @param variant - variant name (max 16 characters)
   */
  writeControllerIoVariant(ioLabel: SpectodaTypes.Label, variant: string | null) {
    logging.debug('> Writing Controller IO Variant...')

    const request_uuid = this.#getUUID()
    const remove_io_variant = variant == null

    const payload = [
      COMMAND_FLAGS.FLAG_WRITE_IO_VARIANT_REQUEST,
      ...numberToBytes(request_uuid, 4),
      ...labelToBytes(ioLabel),
      ...(remove_io_variant ? [] : stringToBytes(variant, 16, false)),
    ]

    return this.runtime.request(payload, false)
  }

  /**
   * ! Useful
   * Write IO variant for a specific IO label in ALL CONNECTED CONTROLLERS in the network
   * @param ioLabel - 5 character IO label (e.g. "BTN_1")
   * @param variant - variant name (max 16 characters)
   */
  writeNetworkIoVariant(ioLabel: SpectodaTypes.Label, variant: string | null) {
    logging.debug('> Writing Network IO Variant...')

    const request_uuid = this.#getUUID()
    const remove_io_variant = variant == null

    const payload = [
      COMMAND_FLAGS.FLAG_WRITE_IO_VARIANT_REQUEST,
      ...numberToBytes(request_uuid, 4),
      ...labelToBytes(ioLabel),
      ...(remove_io_variant ? [] : stringToBytes(variant, 16, false)),
    ]

    return this.runtime.execute(payload, undefined)
  }

  /**
   * ! Useful
   * Read IO variant for a specific IO label from the controller config
   * @param ioLabel - 5 character IO label (e.g. "BTN_1")
   * @returns The variant name for the specified IO label
   */
  readControllerIoVariant(ioLabel: SpectodaTypes.Label) {
    logging.debug('> Reading Controller IO Variant...')

    const request_uuid = this.#getUUID()
    const bytes = [
      COMMAND_FLAGS.FLAG_READ_IO_VARIANT_REQUEST,
      ...numberToBytes(request_uuid, 4),
      ...labelToBytes(ioLabel),
    ]

    return this.runtime.request(bytes, true).then((response) => {
      if (response === null) {
        throw 'NoResponseReceived'
      }

      const reader = new TnglReader(response)

      logging.verbose(`response.byteLength=${response.byteLength}`)

      if (reader.readFlag() !== COMMAND_FLAGS.FLAG_READ_IO_VARIANT_RESPONSE) {
        throw 'InvalidResponseFlag'
      }

      const response_uuid = reader.readUint32()

      if (response_uuid != request_uuid) {
        throw 'InvalidResponseUuid'
      }

      const error_code = reader.readUint8()

      logging.verbose(`error_code=${error_code}`)

      let variant = null

      if (error_code === 0) {
        variant = reader.readString(16)
      } else {
        throw 'Fail'
      }

      logging.verbose(`variant=${variant}`)
      logging.debug(`> IO Variant for ${ioLabel}: ${variant}`)

      return variant
    })
  }

  writeControllerIoMapping(ioLabel: SpectodaTypes.Label, mapping: SpectodaTypes.Pixels[] | null) {
    logging.debug('> Writing Controller IO Mapping...')

    const request_uuid = this.#getUUID()
    const bytes = [
      COMMAND_FLAGS.FLAG_WRITE_IO_MAPPING_REQUEST,
      ...numberToBytes(request_uuid, 4),
      ...labelToBytes(ioLabel),
      ...(mapping ? numberToBytes(mapping.length, 2) : []), // size is uint16_t
      ...(mapping ? mapping.flatMap((num) => numberToBytes(num, 2)) : []), // each item is int16_t
    ]

    return this.runtime.request(bytes, false)
  }

  /**
   * ! Useful
   * Read IO mapping for a specific IO label from the controller config
   * @param ioLabel - 5 character IO label (e.g. "BTN_1")
   * @returns The mapping for the specified IO label
   */
  readControllerIoMapping(ioLabel: SpectodaTypes.Label): Promise<SpectodaTypes.Pixels[]> {
    logging.debug('> Reading Controller IO Mapping...')

    const request_uuid = this.#getUUID()
    const bytes = [
      COMMAND_FLAGS.FLAG_READ_IO_MAPPING_REQUEST,
      ...numberToBytes(request_uuid, 4),
      ...labelToBytes(ioLabel),
    ]

    return this.runtime.request(bytes, true).then((response) => {
      if (response === null) {
        throw 'NoResponseReceived'
      }

      const reader = new TnglReader(response)

      logging.verbose(`response.byteLength=${response.byteLength}`)

      if (reader.readFlag() !== COMMAND_FLAGS.FLAG_READ_IO_MAPPING_RESPONSE) {
        throw 'InvalidResponseFlag'
      }

      const response_uuid = reader.readUint32()

      if (response_uuid != request_uuid) {
        throw 'InvalidResponseUuid'
      }

      const error_code = reader.readUint8()

      logging.verbose(`error_code=${error_code}`)

      let mapping = null

      if (error_code === 0) {
        const mapping_size = reader.readUint16()

        mapping = []

        for (let i = 0; i < mapping_size; i++) {
          mapping.push(reader.readInt16())
        }
      } else {
        throw 'Fail'
      }

      logging.verbose(`mapping=${mapping}`)
      logging.debug(`> IO Mapping for ${ioLabel}: ${mapping}`)

      return mapping
    })
  }

  async WIP_emitTnglBytecode(bytecode: Uint8Array) {
    logging.debug('> Emitting TNGL Bytecode...')

    const connection = '/'
    const request = {
      args: {
        bytecode: bytecode,
      },
    }

    return this.runtime.spectoda_js.requestEmitTnglBytecode(connection, request)
  }

  //* WIP
  async WIP_writeIoVariant(ioLabel: SpectodaTypes.Label, variant: string | null): Promise<void> {
    logging.verbose(`writeIoVariant(ioLabel=${ioLabel}, variant=${variant})`)

    logging.info('> Writing IO Variant...')

    const connection = '/'
    const request = {
      args: {
        label: ioLabel,
        variant: variant ? variant : '',
        remove_io_variant: variant == null,
      },
    }

    if (!this.runtime.spectoda_js.requestWriteIoVariant(connection, request)) {
      throw 'RequestFailed'
    }
  }

  //* WIP
  async WIP_writeIoMapping(ioLabel: SpectodaTypes.Label, mapping: number[] | null): Promise<void> {
    logging.verbose(`writeIoMapping(ioLabel=${ioLabel}, mapping=${mapping})`)

    logging.info('> Writing IO Mapping...')

    const connection = '/'
    const request = {
      args: {
        label: ioLabel,
        mapping: mapping ? new Int16Array(mapping) : new Int16Array(0),
        remove_io_mapping: mapping == null,
      },
    }

    if (!this.runtime.spectoda_js.requestWriteIoMapping(connection, request)) {
      throw 'RequestFailed'
    }
  }

  /**
   * Reads the TNGL variable on given ID from App's WASM
   */
  readVariable(variable_name: string, id: SpectodaTypes.ID = 255) {
    logging.debug('> Reading variable...')

    const variable_declarations = this.#parser.getVariableDeclarations()

    logging.verbose('variable_declarations=', variable_declarations)

    let variable_address = undefined

    // check if the variable is already declared
    // look for the latest variable address on the stack
    for (const declaration of variable_declarations) {
      if (declaration.name === variable_name) {
        variable_address = declaration.address
        break
      }
    }

    if (variable_address === undefined) {
      throw 'VariableNotFound'
    }

    const variable_value = this.runtime.readVariableAddress(variable_address, id)

    logging.verbose(`variable_name=${variable_name}, id=${id}, variable_value=${variable_value.debug}`)

    return variable_value
  }

  /**
   * For FW nerds
   */
  readVariableAddress(variable_address: number, id: SpectodaTypes.ID = 255) {
    logging.debug('> Reading variable address...')

    const memory_stack = this.#parser.getMemoryStack()

    logging.verbose(`memory_stack=${memory_stack}`)

    logging.info(
      `Reading memory address ${variable_address} for ID${id} with description: "${memory_stack[variable_address]}" ...`,
    )

    return this.runtime.readVariableAddress(variable_address, id)
  }

  /**
   * Hides the home button on the Flutter Spectoda Connect:
   * TODO: This is not really a "FW communication feature", should be moved to another file ("FlutterBridge?""). Spectoda.JS should take care only of the communication with the device.
   */
  hideHomeButton() {
    return this.setHomeVisible(false)
  }

  /**
   * Shows the home button on the Flutter Spectoda Connect:
   * TODO: This is not really a "FW communication feature", should be moved to another file ("FlutterBridge?""). Spectoda.JS should take care only of the communication with the device.
   */
  showHomeButton() {
    return this.setHomeVisible(true)
  }

  /**
   * Shows or hides the home button on the Flutter Spectoda Connect:
   * TODO: This is not really a "FW communication feature", should be moved to another file ("FlutterBridge?""). Spectoda.JS should take care only of the communication with the device.
   */
  setHomeVisible(visible: boolean) {
    logging.debug('> Hiding home button...')

    if (!detectSpectodaConnect()) {
      return Promise.reject('PlatformNotSupported')
    }

    return window.flutter_inappwebview?.callHandler('setHomeVisible', visible)
  }

  /**
   * Goes to the home screen on the Flutter Spectoda Connect:
   * TODO: This is not really a "FW communication feature", should be moved to another file ("FlutterBridge?""). Spectoda.JS should take care only of the communication with the device.
   */
  goHome() {
    logging.debug('> Going home...')

    if (!detectSpectodaConnect()) {
      return Promise.reject('PlatformNotSupported')
    }

    return window.flutter_inappwebview?.callHandler('goHome')
  }

  /**
   * Sets orientation of the Flutter Spectoda Connect:
   * 0 = no restriction, 1 = portrait, 2 = landscape
   * TODO: This is not really a "FW communication feature", should be moved to another file ("FlutterBridge?""). Spectoda.JS should take care only of the communication with the device.
   */
  setOrientation(option: number) {
    logging.debug('> Setting orientation...')

    if (!detectSpectodaConnect()) {
      return Promise.reject('PlatformNotSupported')
    }

    if (typeof option !== 'number') {
      return Promise.reject('InvalidOption')
    }

    if (option < 0 || option > 2) {
      return Promise.reject('InvalidOption')
    }

    return window.flutter_inappwebview.callHandler('setOrientation', option)
  }

  // 0.9.4

  /**
   * ! Useful
   * Reads the network signature of the controller Spectoda.js is `connect`ed to.
   */
  readNetworkSignature() {
    logging.debug('> Reading network signature...')

    const request_uuid = this.#getUUID()
    const bytes = [COMMAND_FLAGS.FLAG_READ_OWNER_SIGNATURE_REQUEST, ...numberToBytes(request_uuid, 4)]

    return this.runtime.request(bytes, true).then((response) => {
      if (response === null) {
        throw 'NoResponseReceived'
      }

      const reader = new TnglReader(response)

      logging.verbose(`response.byteLength=${response.byteLength}`)

      if (reader.readFlag() !== COMMAND_FLAGS.FLAG_READ_OWNER_SIGNATURE_RESPONSE) {
        throw 'InvalidResponseFlag'
      }

      const response_uuid = reader.readUint32()

      if (response_uuid != request_uuid) {
        throw 'InvalidResponseUuid'
      }

      const error_code = reader.readUint8()

      logging.verbose(`error_code=${error_code}`)

      if (error_code !== 0) {
        throw 'Fail'
      }

      const signature_bytes = reader.readBytes(16)

      logging.debug(`signature_bytes=${signature_bytes}`)

      const signature_string = uint8ArrayToHexString(signature_bytes)

      logging.debug(`signature_string=${signature_string}`)

      logging.info(`> Network Signature: ${signature_string}`)

      return signature_string
    })
  }

  /**
   * Write PCB Code and Product Code. Used when manufacturing a controller
   *
   * PCB Code is a code of a specific PCB. A printed circuit of a special type. You can connect many inputs and many outputs to it. E.g. Spectoda Industry A6 controller.
   *
   * Product Code is a code of a specific product. A product is a defined, specific configuration of inputs and outputs that make up a whole product. E.g. NARA Lamp (two LED outputs of certain length and a touch button), Sunflow Lamp (three LED outputs, push button)
   */
  writeControllerCodes(pcb_code: SpectodaTypes.PcbCode, product_code: SpectodaTypes.ProductCode) {
    logging.debug('> Writing controller codes...')

    const request_uuid = this.#getUUID()
    const bytes = [
      COMMAND_FLAGS.FLAG_WRITE_CONTROLLER_CODES_REQUEST,
      ...numberToBytes(request_uuid, 4),
      ...numberToBytes(pcb_code, 2),
      ...numberToBytes(product_code, 2),
    ]

    return this.runtime.request(bytes, true).then((response) => {
      if (response === null) {
        throw 'NoResponseReceived'
      }

      const reader = new TnglReader(response)

      logging.verbose(`response.byteLength=${response.byteLength}`)

      if (reader.readFlag() !== COMMAND_FLAGS.FLAG_WRITE_CONTROLLER_CODES_RESPONSE) {
        throw 'InvalidResponseFlag'
      }

      const response_uuid = reader.readUint32()

      if (response_uuid != request_uuid) {
        throw 'InvalidResponseUuid'
      }

      const error_code = reader.readUint8()

      logging.verbose(`error_code=${error_code}`)

      if (error_code !== 0) {
        throw 'Fail'
      }
    })
  }

  /**
   * ! Useful
   * Get PCB Code and Product Code. For more information see `writeControllerCodes`
   */
  readControllerCodes() {
    logging.debug('> Requesting controller codes ...')

    const request_uuid = this.#getUUID()
    const bytes = [COMMAND_FLAGS.FLAG_READ_CONTROLLER_CODES_REQUEST, ...numberToBytes(request_uuid, 4)]

    return this.runtime.request(bytes, true).then((response) => {
      if (response === null) {
        throw 'NoResponseReceived'
      }

      const reader = new TnglReader(response)

      logging.verbose('response=', response)

      if (reader.readFlag() !== COMMAND_FLAGS.FLAG_READ_CONTROLLER_CODES_RESPONSE) {
        throw 'InvalidResponseFlag'
      }

      const response_uuid = reader.readUint32()

      if (response_uuid != request_uuid) {
        throw 'InvalidResponseUuid'
      }

      const error_code = reader.readUint8()

      logging.verbose(`error_code=${error_code}`)

      if (error_code !== 0) {
        throw 'Fail'
      }

      const pcb_code = reader.readUint16()
      const product_code = reader.readUint16()

      logging.debug(`pcb_code=${pcb_code}`)
      logging.debug(`product_code=${product_code}`)

      logging.info(`> Controller Codes: pcb_code=${pcb_code}, product_code=${product_code}`)

      return { pcb_code: pcb_code, product_code: product_code }
    })
  }

  /**
   * For FW nerds
   */
  execute(bytecode: number[]) {
    return this.runtime.execute(bytecode, undefined)
  }

  /**
   * Emits SpectodaAppEvents
   * TODO: should be private and renamed to `emitAppEvent` as SpectodaCore should not be able to emit AppEvents on Spectoda object
   * todo @immakermatty use the correct event-value pairing from PropMap, do not use any
   */
  emit(event: SpectodaAppEventName, value: any) {
    this.runtime.emit(event, value)
  }

  /**
   * Reloads the window or restarts node process. Useful when connected to the device via Remote control.
   * TODO: This is not really a "FW communication feature", should be moved to another function. Spectoda.JS should take care only of the communication with the device.
   */
  reload() {
    this.disconnect()

    setTimeout(() => {
      if (detectNode()) {
        process.exit(1)
      } else {
        if (window && window.location) {
          window.location.reload()
        }
      }
    }, 1000)

    return Promise.resolve()
  }

  /**
   * @deprecated
   * @todo @immakermatty remove this function
   */
  update() {
    // if (detectNode()) {
    //   // run git pull and git submodule update
    //   const { exec } = require("child_process");
    //   exec("git pull && git submodule update --init --recursive", (error, stdout, stderr) => {
    //     if (error) {
    //       console.error(`exec error: ${error}`);
    //       return;
    //     }
    //     console.log(`stdout: ${stdout}`);
    //     console.error(`stderr: ${stderr}`);
    //   });
    //   // run npm install
    //   exec("npm install", (error, stdout, stderr) => {
    //     if (error) {
    //       console.error(`exec error: ${error}`);
    //       return;
    //     }
    //     console.log(`stdout: ${stdout}`);
    //     console.error(`stderr: ${stderr}`);
    //   });
    //   process.exit(1);
    // }
  }

  /**
   * Reloads the TNGL in this APP Controller
   */
  reloadTngl() {
    logging.debug('> Reloading TNGL...')

    return this.runtime.spectoda_js.requestReloadTngl('/')
  }

  /**
   * Erase current TNGL of the whole network
   */
  eraseTngl() {
    logging.debug('> Erasing TNGL...')

    const request_uuid = this.#getUUID()
    const command_bytes = [COMMAND_FLAGS.FLAG_ERASE_TNGL_BYTECODE_REQUEST, ...numberToBytes(request_uuid, 4)]

    return this.runtime.execute(command_bytes, undefined)
  }

  /**
   * TNGL BANKS: A concept in which you can save Tngl to different memory banks, and then load them when you need. Used to speed up tngl synchronization in installations where all animations don't fit to one Tngl file
   */

  /**
   * Save the current uploaded Tngl (via `writeTngl) to the bank in parameter
   */
  saveTnglBank(tngl_bank: SpectodaTypes.TnglBank) {
    logging.debug(`> Saving TNGL to bank ${tngl_bank}...`)

    const request_uuid = this.#getUUID()
    const command_bytes = [
      COMMAND_FLAGS.FLAG_SAVE_TNGL_MEMORY_BANK_REQUEST,
      ...numberToBytes(request_uuid, 4),
      tngl_bank,
    ]

    return this.runtime.execute(command_bytes, undefined)
  }

  /**
   * Load the Tngl from the bank in parameter
   */
  loadTnglBank(tngl_bank: SpectodaTypes.TnglBank) {
    logging.debug(`> Loading TNGL from bank ${tngl_bank}...`)

    const request_uuid = this.#getUUID()
    const command_bytes = [
      COMMAND_FLAGS.FLAG_LOAD_TNGL_MEMORY_BANK_REQUEST,
      ...numberToBytes(request_uuid, 4),
      tngl_bank,
      ...numberToBytes(this.runtime.clock.millis(), 6),
    ]

    return this.runtime.execute(command_bytes, undefined)
  }

  /**
   * Erase the Tngl from the bank in parameter
   */
  eraseTnglBank(tngl_bank: SpectodaTypes.TnglBank) {
    logging.debug(`> Erasing TNGL bank ${tngl_bank}...`)

    const request_uuid = this.#getUUID()
    const command_bytes = [
      COMMAND_FLAGS.FLAG_ERASE_TNGL_MEMORY_BANK_REQUEST,
      ...numberToBytes(request_uuid, 4),
      tngl_bank,
    ]

    return this.runtime.execute(command_bytes, undefined)
  }

  getEventStates(event_state_label: SpectodaTypes.Label, event_state_ids: SpectodaTypes.IDs) {
    return this.runtime.getEventStates(event_state_label, event_state_ids)
  }

  getEventState(event_state_label: SpectodaTypes.Label, event_state_id: SpectodaTypes.ID) {
    return this.runtime.getEventState(event_state_label, event_state_id)
  }

  getDateTime() {
    return this.runtime.getDateTime()
  }

  /** Refactor suggestion by @mchlkucera registerIDContext */
  registerDeviceContexts(ids: SpectodaTypes.IDs) {
    return this.runtime.registerDeviceContexts(ids)
  }

  /** Refactor suggestion by @mchlkucera registerIDContext */
  registerDeviceContext(id: SpectodaTypes.ID) {
    return this.runtime.registerDeviceContext(id)
  }

  getEmittedEvents(ids: SpectodaTypes.IDs) {
    logging.verbose('getEmittedEvents(ids=', ids, ')')

    logging.info('> Getting emitted events...')

    // Check if ids is not an array and make it an array if necessary
    if (!Array.isArray(ids)) {
      ids = [ids]
    }

    // TODO refactor getting events from WASM
    this.#__events = {}
    for (let id = 0; id < 256; id++) {
      this.#__events[id] = {}
    }

    const unregisterListenerEmittedevents = this.runtime.on(
      SpectodaAppEvents.EMITTED_EVENTS,
      (events: SpectodaEvent[]) => {
        for (const event of events) {
          if (event.id === 255) {
            for (let id = 0; id < 256; id++) {
              if (!this.#__events[id][event.label]) {
                this.#__events[id][event.label] = {}
              }

              if (
                !this.#__events[id][event.label] ||
                !this.#__events[id][event.label].timestamp ||
                event.timestamp >= this.#__events[id][event.label].timestamp
              ) {
                this.#__events[id][event.label].type = event.type
                this.#__events[id][event.label].value = event.value
                this.#__events[id][event.label].id = id
                this.#__events[id][event.label].label = event.label
                this.#__events[id][event.label].timestamp = event.timestamp
              }
            }

            continue
          }

          if (!this.#__events[event.id][event.label]) {
            this.#__events[event.id][event.label] = {}
          }

          if (
            !this.#__events[event.id][event.label] ||
            !this.#__events[event.id][event.label].timestamp ||
            event.timestamp >= this.#__events[event.id][event.label].timestamp
          ) {
            this.#__events[event.id][event.label].type = event.type
            this.#__events[event.id][event.label].value = event.value
            this.#__events[event.id][event.label].id = event.id
            this.#__events[event.id][event.label].label = event.label
            this.#__events[event.id][event.label].timestamp = event.timestamp
          }
        }

        logging.warn('#__events', this.#__events)
      },
    )

    return this.syncEventHistory()
      .catch(() => {
        logging.warn('Failed to read event history')
      })
      .then(() => {
        return sleep(500)
      })
      .then(() => {
        const events = []

        for (const id of ids) {
          for (const event in this.#__events[id]) {
            events.push(this.#__events[id][event])
          }
        }

        // Step 2: Sort the events by timestamp
        events.sort((a, b) => a.timestamp - b.timestamp)

        return JSON.stringify(events) // need to stringify because of deleting references to objects
      })
      .finally(() => {
        unregisterListenerEmittedevents()
        this.#__events = {}
      })
  }

  emitEvents(
    events:
      | SpectodaEvent[]
      | {
        // TODO @immakermatty remove this generic event type, use only SpectodaEvent 
          label: SpectodaTypes.Label
          type: string | SpectodaTypes.ValueType
          value: null | string | number | boolean
          id: SpectodaTypes.ID
          timestamp: number
        }[],
  ) {
    logging.verbose('emitEvents(events=', events, ')')

    logging.info('> Emitting events...')

    if (typeof events === 'string') {
      events = JSON.parse(events)
    }

    // Check if events is not an array and make it an array if necessary
    if (!Array.isArray(events)) {
      events = [events]
    }

    // NUMBER: 29,
    // LABEL: 31,
    // TIME: 32,
    // PERCENTAGE: 30,
    // DATE: 28,
    // COLOR: 26,
    // PIXELS: 19,
    // BOOLEAN: 2,
    // NULL: 1,
    // UNDEFINED: 0,

    for (const event of events) {
      switch (event.type) {
        // case "number":
        // case VALUE_TYPE.NUMBER:
        //   this.emitNumber(event.label, event.value, event.id);
        //   break;
        case 'label':
        case VALUE_TYPE.LABEL: {
          // todo @immakermatty replace depreacted events
          this.emitLabel(event.label, event.value as string, event.id)
          break
        }
        case 'timestamp':
        case 'time':
        case VALUE_TYPE.TIME: {
          this.emitTimestamp(event.label, event.value as number, event.id)
          break
        }
        case 'percentage':
        case VALUE_TYPE.PERCENTAGE: {
          this.emitPercentage(event.label, event.value as number, event.id)
          break
        }
        // case VALUE_TYPE.DATE:
        //   this.emitDateEvent(event.label, event.value, event.id);
        //   break;
        case 'color':
        case VALUE_TYPE.COLOR: {
          this.emitColor(event.label, event.value as string, event.id)
          break
        }
        // case VALUE_TYPE.PIXELS:
        //   this.emitPixelsEvent(event.label, event.value, event.id);
        //   break;
        // case VALUE_TYPE.BOOLEAN:
        //   this.emitBoolEvent(event.label, event.value, event.id);
        //   break;
        case 'none':
        case VALUE_TYPE.NULL: {
          this.emitEvent(event.label, event.id)
          break
        }
        default: {
          logging.warn(`Unknown event type: ${event.type}`)
          break
        }
      }
    }
  }

  /**
   * Returns information object about the connected controller
   *
   * Implemented in FW 0.12.4
   */
  async readControllerInfo() {
    logging.info('> Requesting controller info...')

    const request_uuid = this.#getUUID()
    const bytes = [COMMAND_FLAGS.FLAG_READ_CONTROLLER_INFO_REQUEST, ...numberToBytes(request_uuid, 4)]

    return this.runtime.request(bytes, true).then((response) => {
      if (response === null) {
        logging.info('No response received from controller')
        throw 'NoResponseReceived'
      }

      const reader = new TnglReader(response)

      logging.verbose(`response.byteLength=${response.byteLength}`)

      const responseFlag = reader.readFlag()

      if (responseFlag !== COMMAND_FLAGS.FLAG_READ_CONTROLLER_INFO_RESPONSE) {
        logging.info(`Invalid response flag received: ${responseFlag}`)
        throw 'InvalidResponseFlag'
      }

      const response_uuid = reader.readUint32()

      if (response_uuid != request_uuid) {
        logging.info(`UUID mismatch - Request: ${request_uuid}, Response: ${response_uuid}`)
        throw 'InvalidResponseUuid'
      }

      const error_code = reader.readUint8()

      logging.verbose(`error_code=${error_code}`)

      if (error_code === 0) {
        // Read all the controller info fields in order matching interface.cpp
        const full_name = reader.readString(16).trim() // NAME_STRING_MAX_SIZE
        const label = reader.readString(6).trim() // 5 chars + null terminator
        const mac_bytes = reader.readBytes(6) // MAC_SIZE
        const controller_flags = reader.readUint8()

        reader.readUint8() // reserved for flags increase
        const pcb_code = reader.readUint16()
        const product_code = reader.readUint16()
        const fw_version_code = reader.readUint16()

        reader.readUint16() // reserved for another code
        const fw_compilation_unix_timestamp = reader.readUint64()

        reader.readUint64() // reserved
        const fw_version_full = reader.readString(32).trim() // FW_VERSION_STRING_MAX_SIZE
        const tngl_fingerprint = reader.readBytes(32) // TNGL_FINGERPRINT_SIZE
        const event_store_fingerprint = reader.readBytes(32) // HISTORY_FINGERPRINT_SIZE
        const config_fingerprint = reader.readBytes(32) // CONFIG_FINGERPRINT_SIZE
        const network_signature = reader.readBytes(16) // NETWORK_SIGNATURE_SIZE

        // fw version string from code
        const fw_version_short = `${Math.floor(fw_version_code / 10000)}.${Math.floor(
          (fw_version_code % 10000) / 100,
        )}.${fw_version_code % 100}`

        // get Commissionable flag
        const COMMISSIONABLE_FLAG_BIT_POSITION = 0
        const commissionable = !!(controller_flags & (1 << COMMISSIONABLE_FLAG_BIT_POSITION))

        // Format MAC address
        const mac_address = Array.from(mac_bytes, (byte) => byte.toString(16).padStart(2, '0')).join(':')

        // Format fingerprints and signature as hex strings
        const network_signature_hex = uint8ArrayToHexString(network_signature)
        const tngl_fingerprint_hex = uint8ArrayToHexString(tngl_fingerprint)
        const event_store_fingerprint_hex = uint8ArrayToHexString(event_store_fingerprint)
        const config_fingerprint_hex = uint8ArrayToHexString(config_fingerprint)

        // Mock data:
        // TODO @immakermatty move mock data to __mocks__ directory
        /* {
         *   connectionCriteria: {
         *     name: string = "SC_01",
         *     product: number = 2,
         *     mac: string = "01:23:45:56:ab:cd",
         *     fw: string = "0.12.4",
         *     network: string = "14fe7f8214fe7f8214fe7f8214fe7f82",
         *     commissionable: boolean = false
         *   }
         *   fullName: string = "SC_01",
         *   controllerLabel: string = "SC_01",
         *   commissionable: boolean = false,
         *   pcbCode: number = 1,
         *   productCode: number = 2,
         *   macAddress: string = "01:23:45:56:ab:cd",
         *   fwVersionFull: string = "FW_0.12.1_20241117",
         *   fwVersion: : string = "0.12.1",
         *   fwVersionCode: number = 1201,
         *   fwCompilationUnixTimestamp: number = 1743879238912,
         *   networkSignature: string = "14fe7f8214fe7f8214fe7f8214fe7f82",
         *   tnglFingerprint: string = "839dfa03839dfa03839dfa03839dfa03",
         *   eventStoreFingerprint: string = "4629fade4629fade4629fade4629fade",
         *   configFingerprint: string = "27390fa027390fa027390fa027390fa0"
         * }
         */

        const info = {
          // connection criteria
          controllerLabel: label,
          productCode: product_code,
          macAddress: mac_address,
          fwVersion: fw_version_short,
          networkSignature: network_signature_hex,
          commissionable: commissionable,

          fullName: full_name,
          pcbCode: pcb_code,
          fwVersionFull: fw_version_full,
          fwVersionCode: fw_version_code,
          fwCompilationUnixTimestamp: fw_compilation_unix_timestamp,
          tnglFingerprint: tngl_fingerprint_hex,
          eventStoreFingerprint: event_store_fingerprint_hex,
          configFingerprint: config_fingerprint_hex,
        } as SpectodaTypes.ControllerInfo

        logging.info('> Controller Info:', info)
        return info
      } else {
        logging.error(`Request failed with error code: ${error_code}`)
        throw 'Fail'
      }
    })
  }
}

// ====== NEW PARADIAGM FUNCTIONS ====== //
// todo @immakermatty what does new paradigm mean?

if (typeof window !== 'undefined') {
  // @ts-ignore
  window.Spectoda = Spectoda
}
