import { io } from 'socket.io-client';
// import { TimeTrack } from "./TimeTrack.js";
// import { logging } from "./logging";

import customParser from 'socket.io-msgpack-parser';

import { SpectodaAppEvents } from './src/types/app-events';

import { TimeTrack } from './TimeTrack';
import { createNanoEvents } from './functions';
import { logging } from './logging';

// TODO rewrite this to initiate connect only when needed

// const WEBSOCKET_URL = "https://tangle-remote-control.glitch.me/"
export const WEBSOCKET_URL = 'https://cloud.host.spectoda.com/';

const eventStream = createNanoEvents();

eventStream.on('log', (a, b, c, d) => {
  // TODO: if (typeof d !== "undefined") of if (d === undefined) something like that rather than checking for truthiness
  if (d) {
    console.log(a, b, c, d);
  } else if (c) {
    console.log(a, b, c);
  } else if (b) {
    console.log(a, b);
  } else {
    console.log(a);
  }
});

// TODO: .on("warn", (a, b, c, d) => {
eventStream.on('log-warn', (a, b, c, d) => {
  // TODO: if (typeof d !== "undefined") of if (d === undefined) something like that rather than checking for truthiness
  if (d) {
    console.log(a, b, c, d);
  } else if (c) {
    console.log(a, b, c);
  } else if (b) {
    console.log(a, b);
  } else {
    console.log(a);
  }
});

// TODO: .on("error", (a, b, c, d) => {
eventStream.on('log-error', (a, b, c, d) => {
  // TODO: if (typeof d !== "undefined") of if (d === undefined) something like that rather than checking for truthiness
  if (d) {
    console.log(a, b, c, d);
  } else if (c) {
    console.log(a, b, c);
  } else if (b) {
    console.log(a, b);
  } else {
    console.log(a);
  }
});

if (typeof window !== 'undefined') {
  window.sockets = [];
}
/////////////////////////////////////////////////////////////////////////////////////

export const isCurrentSpectodaInstanceLocal = () => {
  return typeof spectoda.init === 'undefined';
};

export function createSpectodaWebsocket() {
  const timeline = new TimeTrack();

  // todo sync timeline

  const socket = io(WEBSOCKET_URL, {
    parser: customParser,
  });

  if (typeof window !== 'undefined') {
    window.sockets.push(socket);
  }

  socket.on('event', (data) => {
    logging.verbose('event', data);

    // TODO delete this useless event
    if (data.name === SpectodaAppEvents.PRIVATE_WASM_EXECUTE) {
      eventStream.emit(SpectodaAppEvents.PRIVATE_WASM_EXECUTE, data.args[0][1]);
      return;
    }

    eventStream.emit(data.name, ...data.args);
  });

  let networkJoinParams = [];

  socket.on('connect', () => {
    if (networkJoinParams) {
      eventStream.emit(SpectodaAppEvents.REMOTE_CONTROL_CONNECTING);

      socket
        .emitWithAck('join', networkJoinParams)
        .then(() => {
          logging.info('re/connected to websocket server', networkJoinParams);
          eventStream.emit(SpectodaAppEvents.REMOTE_CONTROL_CONNECTED);
        })
        .catch((err) => {
          logging.error('error connecting to websocket server', err);
        });
    }
  });

  socket.on('disconnect', () => {
    eventStream.emit(SpectodaAppEvents.REMOTE_CONTROL_DISCONNECTED);
  });

  class SpectodaVirtualProxy {
    constructor() {
      return new Proxy(this, {
        get: (_, prop) => {
          if (prop === 'on') {
            // Special handling for "on" method
            return (eventName, callback) => {
              logging.verbose('Subscribing to event', eventName);

              const unsub = eventStream.on(eventName, callback);

              // nanoid subscribe to event stream

              // unsubscribe from previous event
              return unsub;
            };
          } else if (prop === 'timeline') {
            return timeline;
          } else if (prop === 'init') {
            // TODO rename init()
            // Expects [{key,sig}, ...] or {key,sig}
            return (params) => {
              if (!Array.isArray(params) && !params?.sessionOnly) {
                params = [params];
                for (let param of params) {
                  param.type = 'sender';
                }
              } else {
                params.type = 'sender';
              }

              networkJoinParams = params;

              if (params?.sessionOnly) {
                return socket.emitWithAck('join-session', params?.roomNumber).then((response) => {
                  if (response.status === 'success') {
                    logging.info('Remote joined session', response.roomNumber);
                  } else {
                    throw new Error(response.error);
                  }
                });
              } else {
                return socket.emitWithAck('join', params).then((response) => {
                  if (response.status === 'success') {
                    logging.info('Remote joined network', response.roomNumber);

                    //** Added by @immakermatty to automatically connect the sender app if the receiver is connected */
                    //* if receiver is connected, emit the connected event on the sender
                    if (typeof window !== 'undefined' && window.spectoda) {
                      window.spectoda.connected().then((receiverConnectedCriteria) => {
                        logging.info('Spectoda_JS on the other side connected to ', receiverConnectedCriteria);

                        //* if the receiver is connected, emit the connected event on the sender
                        if (receiverConnectedCriteria) {
                          //* emit the connected event to the sender app
                          window.spectoda.emit(SpectodaAppEvents.REMOTE_CONTROL_CONNECTED);
                        } else {
                          //* emit the disconnected event to the sender app
                          window.spectoda.emit(SpectodaAppEvents.REMOTE_CONTROL_DISCONNECTED);
                        }
                      }).catch((err) => {
                        logging.error('error connecting to websocket server', err);
                      });
                    }

                  
                  } else {
                    throw new Error(response.error);
                  }
                });
              }
            };
          } else if (prop === 'fetchClients') {
            return () => {
              return socket.emitWithAck('list-clients');
            };
          } else if (prop === 'connectionState') {
            return websocketConnectionState;
          }

          // Always return an async function for any property
          return async (...args) => {
            const payload = {
              functionName: prop,
              arguments: args,
            };

            if (prop === 'updateDeviceFirmware' || prop === 'updateNetworkFirmware') {
              if (Array.isArray(args?.[0])) {
                args[0] = Uint8Array.from(args[0]).buffer;
              }
            }

            const result = await this.sendThroughWebsocket(payload);

            if (result.status === 'success') {
              for (let res of result?.data) {
                if (res.status === 'error') {
                  logging.error(result);
                  // logging.error("[WEBSOCKET]", result);
                  throw new Error(res.error);
                }
              }

              // logging.verbose("[WEBSOCKET]", result);

              return result?.data?.[0].result;
            } else {
              logging.error('[WEBSOCKET]', result);

              if (Array.isArray(result)) {
                throw new Error(result[0]);
              } else {
                throw new Error(result?.error);
              }
            }
          };
        },
      });
    }

    async sendThroughWebsocket(data) {
      const result = await socket.emitWithAck('func', data);

      return result;
    }
  }

  return new SpectodaVirtualProxy();
}
