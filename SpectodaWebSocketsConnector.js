import { io } from "socket.io-client";
// import { TimeTrack } from "./TimeTrack.js";
// import { logging } from "./logging";

import customParser from "socket.io-msgpack-parser";
import { TimeTrack } from "./TimeTrack";
import { createNanoEvents } from "./functions";
import { logging } from "./logging";

// TODO rewrite this to initiate connect only when needed

// const WEBSOCKET_URL = "https://tangle-remote-control.glitch.me/"
export const WEBSOCKET_URL = "http://localhost:4000";

const eventStream = createNanoEvents();

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
          console.log("re/connected to websocket server", networkJoinParams);
          eventStream.emit("connected-websockets");
        })
        .catch(err => {
          console.log("error connecting to websocket server", err);
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

            const result = await this.sendThroughWebsocket(payload);

            if (result.status === "success") {
              return result?.data?.[0].result;
            } else {
              return result?.error;
            }
          };
        },
      });
    }

    async sendThroughWebsocket(data) {
      const result = await socket.emitWithAck("func", data);

      console.log("received result", result);

      return result;
    }
  }

  return new SpectodaVirtualProxy();
}
