import { io } from "socket.io-client";
// import { TimeTrack } from "./TimeTrack.js";
// import { logging } from "./logging";

import customParser from "socket.io-msgpack-parser";
import { TimeTrack } from "./TimeTrack";
import { createNanoEvents } from "./functions";

// const WEBSOCKET_URL = "https://tangle-remote-control.glitch.me/"
export const WEBSOCKET_URL = "https://cloud.host.spectoda.com";

const eventStream = createNanoEvents();

// todo sync timeline
const timeline = new TimeTrack();

const socket = io(WEBSOCKET_URL, {
  parser: customParser,
});
if (typeof window !== "undefined") window.socket = socket;

socket.on("event", data => {
  eventStream.emit(data.name, ...data.args);
});
/////////////////////////////////////////////////////////////////////////////////////
class SpectodaVirtualProxy {
  constructor() {
    return new Proxy(this, {
      get: (_, prop) => {
        if (prop === "on") {
          // Special handling for "on" method
          return (eventName, callback) => {
            console.log("Subscribing to event", eventName);

            const unsub = eventStream.on(eventName, callback);

            // nanoid subscribe to event stream

            // unsubscribe from previous event
            return unsub;
          };
        } else if (prop === "timeline") {
          return timeline;
        } else if (prop === "init") {
          return () => socket.emitWithAck("join", { signature: "room1", key: "spektrum" });
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

export function createSpectodaWebsocket() {
  return new SpectodaVirtualProxy();
}
