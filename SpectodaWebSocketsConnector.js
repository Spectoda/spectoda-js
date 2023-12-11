import { io } from "socket.io-client";
// import { TimeTrack } from "./TimeTrack.js";
// import { logging } from "./logging";

import customParser from "socket.io-msgpack-parser";
import { TimeTrack } from "./TimeTrack";
import { createNanoEvents } from "./functions";
import { logging } from "./logging";

// TODO rewrite this to initiate connect only when needed

// const WEBSOCKET_URL = "https://tangle-remote-control.glitch.me/"
export const WEBSOCKET_URL = "https://ceet.cloud.host.spectoda.com/";

const eventStream = createNanoEvents();

eventStream.on("controller-log", line => {
  logging.info(line);
});

if (typeof window !== "undefined") {
  window.sockets = [];
}
/////////////////////////////////////////////////////////////////////////////////////

export function createSpectodaWebsocket() {
  const timeline = new TimeTrack();

  // todo sync timeline

  const socket = io(WEBSOCKET_URL, {
    parser: customParser,
  });

  window.sockets.push(socket);

  if (typeof window !== "undefined") window.socket = socket;

  socket.on("event", data => {
    eventStream.emit(data.name, ...data.args);
  });

  let networkJoinParams = [];

  socket.on("connect", () => {
    if (networkJoinParams) {
      eventStream.emit("connecting-websockets");

      socket
        .emitWithAck("join", networkJoinParams)
        .then(() => {
          logging.info("re/connected to websocket server", networkJoinParams);
          eventStream.emit("connected-websockets");
        })
        .catch(err => {
          logging.error("error connecting to websocket server", err);
        });
    }
  });

  socket.on("disconnect", () => {
    eventStream.emit("disconnected-websockets");
  });

  class SpectodaVirtualProxy {
    constructor() {
      return new Proxy(this, {
        get: (_, prop) => {
          if (prop === "on") {
            // Special handling for "on" method
            return (eventName, callback) => {
              logging.verbose("Subscribing to event", eventName);

              const unsub = eventStream.on(eventName, callback);

              // nanoid subscribe to event stream

              // unsubscribe from previous event
              return unsub;
            };
          } else if (prop === "timeline") {
            return timeline;
          } else if (prop === "init") {
            // Expects [{key,sig}, ...] or {key,sig}
            return params => {
              if (!Array.isArray(params)) params = [params];

              for (let param of params) {
                param.type = "sender";
              }

              networkJoinParams = params;
              return socket.emitWithAck("join", params);
            };
          } else if (prop === "fetchClients") {
            return () => {
              return socket.emitWithAck("list-all-clients");
            };
          } else if (prop === "connectionState") {
            return websocketConnectionState;
          }

          // Always return an async function for any property
          return async (...args) => {
            const payload = {
              functionName: prop,
              arguments: args,
            };

            if (prop === "updateDeviceFirmware" || prop === "updateNetworkFirmware") {
              if (Array.isArray(args?.[0])) {
                args[0] = Uint8Array.from(args[0]).buffer;
              }
            }

            const result = await this.sendThroughWebsocket(payload);

            if (result.status === "success") {
              for (let res of result?.data) {
                if (res.status === "error") {
                  logging.error("[WEBSOCKET]", result);

                  throw new Error(res.error);
                }
              }

              logging.verbose("[WEBSOCKET]", result);

              return result?.data?.[0].result;
            } else {
              let error = new Error(result?.error);
              if (Array.isArray(result)) {
                error = new Error(result[0]);
              }
              logging.error("[WEBSOCKET]", error);

              throw new Error(result?.error);
            }
          };
        },
      });
    }

    async sendThroughWebsocket(data) {
      const result = await socket.emitWithAck("func", data);

      return result;
    }
  }

  return new SpectodaVirtualProxy();
}

// class SpectodaMultiInstanceWebsocketProxy {
//   // same but returns only the first result
//   get legacyCall() {
//     return new Proxy(
//       {},
//       {
//         get: (_, prop) => {
//           return async (...args) => {
//             const promises = this.proxies.map(proxy => {
//               if (typeof proxy[prop] === "function") {
//                 return proxy[prop](...args);
//               }
//               return Promise.reject(new Error(`Function ${prop} does not exist on proxy`));
//             });
//             const results = await Promise.race(promises);
//             return results?.[0];
//           };
//         },
//       },
//     );
//   }

//   get call() {
//     return new Proxy(
//       {},
//       {
//         get: (_, prop) => {
//           return async (...args) => {
//             console.log("calling", prop, args, this);

//             const promises = this.proxies.map(proxy => {
//               if (typeof proxy[prop] === "function") {
//                 return proxy[prop](...args);
//               }
//               return Promise.reject(new Error(`Function ${prop} does not exist on proxy`));
//             });
//             return Promise.all(promises);
//           };
//         },
//       },
//     );
//   }

//   to(targetSocketId) {
//     const targetProxy = this.proxies.find(proxy => proxy.socket.id === targetSocketId);
//     if (!targetProxy) {
//       throw new Error(`No proxy found for socket ID ${targetSocketId}`);
//     }

//     return new Proxy(
//       {},
//       {
//         get: (_, prop) => {
//           if (typeof targetProxy[prop] === "function") {
//             return (...args) => targetProxy[prop](...args);
//           }
//           throw new Error(`Function ${prop} does not exist on target proxy`);
//         },
//       },
//     );
//   }

//   constructor() {
//     /**
//      * @type {Proxy}
//      */
//     this.allProxies = []; // Stores all proxies
//     this.proxies = []; // Currently active proxies

//     this.command = new Proxy(
//       {},
//       {
//         get: (_, prop) => {
//           // Handle special cases if needed, e.g., 'init', 'createProxy'
//           if (prop === "init" || prop === "createProxy") {
//             // return this[prop].bind(this);
//             console.warn("Using init and createProxy is not available on multi-instance proxy");
//             return;
//           }

//           // For other properties, handle them as function calls
//           return async (...args) => {
//             const promises = this.proxies.map(proxy => {
//               if (typeof proxy[prop] === "function") {
//                 return proxy[prop](...args);
//               }
//               return Promise.reject(new Error(`Function ${prop} does not exist on proxy`));
//             });

//             return Promise.all(promises);
//           };
//         },
//       },
//     );
//   }

//   #addSpectoda(config) {
//     const socket = io(WEBSOCKET_URL, {
//       parser: customParser,
//       ...config,
//     });

//     const proxy = new SpectodaVirtualProxy(socket);
//     proxy.init(config);

//     this.allProxies.push(proxy);
//     return proxy;
//   }

//   #removeSpectoda(proxy) {
//     this.proxies = this.proxies.filter(p => p !== proxy);
//   }

//   select(criteria) {
//     this.proxies = this.allProxies;
//     // this.proxies = this.allProxies.filter(({ config }) => {
//     //   return criteria.some(criterion => {
//     //     return Object.entries(criterion).every(([key, value]) => config[key] === value);
//     //   });
//     // });
//   }

//   /**
//    *
//    * @param {{signature: string, key: string}} configs
//    * @returns
//    */
//   add(configs) {
//     if (!Array.isArray(configs)) configs = [configs];
//     return configs.map(config => this.#addSpectoda(config));
//   }
// }

// export function createSpectodaMultiInstanceWebsocketProxy() {
//   if (typeof window === "undefined") return;
//   window.spectodaM = new SpectodaMultiInstanceWebsocketProxy();
//   return spectodaM;
// }
// createSpectodaMultiInstanceWebsocketProxy();
