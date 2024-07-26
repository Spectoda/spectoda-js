import { io } from "socket.io-client";
// import { TimeTrack } from "./TimeTrack.js";
// import { logging } from "./logging";

import customParser from "socket.io-msgpack-parser";
import { TimeTrack } from "./TimeTrack";
import { createNanoEvents } from "./functions";
import { logging } from "./logging";

// TODO rewrite this to initiate connect only when needed

// const WEBSOCKET_URL = "https://tangle-remote-control.glitch.me/"
export const WEBSOCKET_URL = "http://10.0.18.106:4001";
console.log("REMOTE WEBSOCKET_URL", WEBSOCKET_URL);

const eventStream = createNanoEvents();

eventStream.on("log", (a, b, c, d) => {
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

eventStream.on("log-warn", (a, b, c, d) => {
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

eventStream.on("log-error", (a, b, c, d) => {
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

  if (typeof window !== "undefined") window.socket = socket;

  socket.on("event", data => {
    logging.verbose("event", data);

    if (data.name === "wasm_execute") {
      eventStream.emit("wasm_execute", data.args[0][1]);
    }

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
              if (!Array.isArray(params) && !params?.sessionOnly) {
                params = [params];
                for (let param of params) {
                  param.type = "sender";
                }
              } else {
                params.type = "sender";
              }

              networkJoinParams = params;

              if (params?.sessionOnly) {
                return socket.emitWithAck("join-session", params?.roomNumber).then(response => {
                  if (response.status === "success") {
                    logging.info("Remote joined session", response.roomNumber);
                  } else {
                    throw new Error(response.error);
                  }
                });
              } else {
                return socket.emitWithAck("join", params).then(response => {
                  if (response.status === "success") {
                    logging.info("Remote joined network", response.roomNumber);
                  } else {
                    throw new Error(response.error);
                  }
                });
              }
            };
          } else if (prop === "fetchClients") {
            return () => {
              return socket.emitWithAck("list-clients");
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
