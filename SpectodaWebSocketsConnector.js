import { io } from "socket.io-client";
// import { TimeTrack } from "./TimeTrack.js";
// import { logging } from "./logging";

import customParser from "socket.io-msgpack-parser";
import { TimeTrack } from "./TimeTrack";
import { createNanoEvents } from "./functions";
import { logging } from "./logging";

// TODO rewrite this to initiate connect only when needed

// const WEBSOCKET_URL = "https://tangle-remote-control.glitch.me/"
export const WEBSOCKET_URL = "http://localhost:4001";
// export const WEBSOCKET_URL = "https://ceet.cloud.host.spectoda.com/";

/////////////////////////////////////////////////////////////////////////////////////

export function createSpectodaWebsocket() {
  const eventStream = createNanoEvents();

  const timeline = new TimeTrack();

  const socket = io(WEBSOCKET_URL, {
    parser: customParser,
  });

  if (typeof window !== "undefined") window.socket = socket;

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
    // public networks:{signature:string,key:string}[];

    constructor() {
      return new Proxy(this, {
        get: (_, prop) => {
          if (prop === "on") {
            // Special handling for "on" method
            return (eventName, callback) => {
              const unsub = eventStream.on(eventName, callback);

              return unsub;
            };
          } else if (prop === "timeline") {
            return timeline;
          } else if (prop === "emit") {
            return (eventName, ...args) => {
              eventStream.emit(eventName, ...args);
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

            const results = await this.sendThroughWebsocket(payload);
          };
        },
      });
    }
  }

  // eventStream.on("controller-log", line => {
  //   logging.info(line);
  // });

  return new SpectodaVirtualProxy();
}
