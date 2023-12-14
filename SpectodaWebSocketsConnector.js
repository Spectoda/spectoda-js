import { io } from "socket.io-client";
// import { TimeTrack } from "./TimeTrack.js";
// import { logging } from "./logging";

import customParser from "socket.io-msgpack-parser";
import { TimeTrack } from "./TimeTrack";
import { createNanoEvents } from "./functions";
import { logging } from "./logging";

// TODO rewrite this to initiate connect only when needed

// const WEBSOCKET_URL = "https://tangle-remote-control.glitch.me/"
// export const WEBSOCKET_URL = "http://localhost:4001";
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

  socket.on("r-event", data => {
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
    // public networks:{signature:string,key:string}[];

    constructor() {
      this.networks = new Map();

      return new Proxy(this, {
        get: (_, prop) => {
          if (prop === "on") {
            // Special handling for "on" method
            return (eventName, callback) => {
              // logging.verbose("Subscribing to event", eventName);

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
              for (let param of params) {
                this.networks.set(param.signature, param);
              }
              return socket.emitWithAck("join", params);
            };
          } else if (prop === "fetchClients") {
            return () => {
              return socket.emitWithAck("list-all-clients");
            };
          } else if (prop === "connectionState") {
            return websocketConnectionState;
          } else if (prop === "selectTarget") {
            return this.selectTarget;
          } else if (prop === "removeTarget") {
            return (signature, socketId) => {
              const network = this.networks.get(signature);

              if (!network) {
                throw new Error(`No network found with signature ${signature}`);
              }

              this.networks.set(signature, {
                ...network,
                socketId: null,
              });

              return socket.emitWithAck("unsubscribe-event", signature, null);
            };
          } else if (prop === "resetTargets") {
            return this.resetTargets;
          } else if (prop === "autoSelectTargetsInNetworks") {
            // TODO resolve with promise
            this.resetTargets();

            return async networks => {
              const results = [];
              for (let network of networks) {
                const result = await this.selectTarget(network.signature, null);
                results.push(result);
              }
              return Promise.allSettled(results);
            };
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

            // return result;

            // find fist result with status success and set it as result
            const result = results.find(r => r.status === "fulfilled")?.value;

            if (!result) return null;

            // logging.verbose("[WEBSOCKET]", result);

            if (result.status === "success") {
              for (let res of result?.data) {
                if (res.status === "error") {
                  // logging.error("[WEBSOCKET]", result);

                  throw new Error(res.error);
                }
              }

              // logging.verbose("[WEBSOCKET]", result);

              return result?.data?.[0].result;
            } else {
              let error = new Error(result?.error);
              if (Array.isArray(result)) {
                error = new Error(result[0]);
              }
              // logging.error("[WEBSOCKET]", error);

              throw new Error(result?.error);
            }
          };
        },
      });
    }

    async sendThroughWebsocket(data) {
      // go through selected targets and send to each
      let results = [];
      for (let network of this.networks.values()) {
        if (network.socketId) {
          // console.log("sending to", network.socketId, network.signature, data);
          const result = await socket.emitWithAck("d-func", network.signature, network.socketId, data);
          results.push(result);
        }
      }

      return await Promise.allSettled(results);
    }

    async selectTarget(signature, socketId) {
      const network = this.networks.get(signature);

      if (!socketId) {
        const requestedSocketIdResponse = await socket.emitWithAck("get-socket-id-for-network", signature);

        if (!requestedSocketIdResponse) throw new Error(`No socketId found for network ${signature}`);

        socketId = requestedSocketIdResponse;
      }

      if (!socketId) {
        return null;
        throw new Error(`Error subscribing to network ${signature} with socketId ${socketId}`);
      }

      if (!network) {
        throw new Error(`No network found with signature ${signature}`);
      }

      this.networks.set(signature, {
        ...network,
        socketId,
      });

      return socket
        .emitWithAck("subscribe-event", signature, socketId)
        .then(() => {
          return socketId;
        })
        .catch(err => {
          throw new Error(`Error subscribing to network ${signature} with socketId ${socketId}`);
        });
    }

    async resetTargets() {
      for (let network of this.networks.values()) {
        // console.log("resetting", network);
        this.networks.set(network.signature, {
          ...network,
          socketId: null,
        });
        socket.emitWithAck("unsubscribe-event", network.signature, null);
      }
    }
  }

  return new SpectodaVirtualProxy();
}
