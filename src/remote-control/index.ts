import { io } from "socket.io-client";
import customParser from "socket.io-msgpack-parser";
import { TimeTrack } from "../TimeTrack";
import { createNanoEvents } from "../functions";
import { logging } from "../logging";

// export const WEBSOCKET_URL = "https://ceet.cloud.host.spectoda.com/";
export const WEBSOCKET_URL = "http://localhost:4001";

type NetworkJoinParams = Array<unknown>;
type SocketId = string | null;

const eventStream = createNanoEvents();

eventStream.on("controller-log", (line: string) => {
  logging.info(line);
});

if (typeof window !== "undefined") {
  window.sockets = [];
}

interface Network {
  signature: string;
  socketId?: SocketId;
  lastResult?: unknown;
}

export function createRemoteSpectodaInstance({ signature }: { signature: string }) {
  const timeline = new TimeTrack();

  const socket = io(WEBSOCKET_URL + `/network-${signature}`, {
    parser: customParser,
  });

  // socket.on("r-event", data => {
  //   eventStream.emit(data.name, ...data.args);
  // });

  // if (typeof window !== "undefined") {
  //   window.socket = socket;
  //   window.sockets.push(socket);
  // }

  // socket.on("connect", async () => {
  //   if (!networkJoinParams) return;

  //   eventStream.emit("connecting-websockets");

  //   try {
  //     await socket.emitWithAck("join", networkJoinParams);
  //     logging.info("re/connected to websocket server", networkJoinParams);
  //     eventStream.emit("connected-websockets");
  //   } catch (e) {
  //     logging.error("error connecting to websocket server", e);
  //   }
  // });

  // socket.on("disconnect", () => {
  //   eventStream.emit("disconnected-websockets");
  // });

  // const allowedCommands = ["on", "timeline", "emit", "init", "fetchClients", "connectionState", "selectTarget", "removeTarget", "resetTargets", "autoSelectTargetsInNetworks"] as const;

  // type Command = (typeof allowedCommands)[number];

  // const isAllowedCommand = (command: string | symbol): command is Command => {
  //   return typeof command === "string" && allowedCommands.includes(command as Command);
  // };

  async function scanRemote(...args: unknown[]) {
    console.log("> scanRemote", args);
    const res = await socket.emitWithAck("scan", ...args);
    console.log(res);
  }

  function sendCommandToRemoteReceiver(...data) {
    // todo handle
    console.log("> Hey this functino is not remote specific", data);
  }

  function handleRemoteOnlyCommands(command: string | symbol) {
    console.log("command", command);

    switch (command) {
      case "scanRemote": {
        return scanRemote;
      }
    }

    return null;
  }

  class SpectodaVirtualProxy {
    networks: Map<string, Network>;

    constructor() {
      this.networks = new Map();

      return new Proxy(this, {
        get: (_, command) => {
          const remoteCommandHandler = handleRemoteOnlyCommands(command);
          const isCommandRemoteOnly = remoteCommandHandler !== null;

          if (isCommandRemoteOnly) return remoteCommandHandler;
          else return sendCommandToRemoteReceiver;

          return async (...args: Array<unknown>) => {
            const payload = {
              functionName: command,
              arguments: args,
            };

            if (command === "updateDeviceFirmware" || command === "updateNetworkFirmware") {
              if (Array.isArray(args?.[0])) {
                args[0] = Uint8Array.from(args[0]).buffer;
              }
            }

            const results = (await this.sendThroughWebsocket(payload)) || [];

            const fulfilledResult = results.find(r => r.status === "fulfilled")?.value;

            const networksArray = Array.from(this.networks.values());

            for (let networkIndex = 0; networkIndex < results.length; networkIndex++) {
              this.networks.set(networksArray[networkIndex].signature, {
                ...networksArray[networkIndex],
                lastResult: results[networkIndex],
              });
            }

            eventStream.emit("networks-statuses", networksArray);

            if (!fulfilledResult) return null;

            if (fulfilledResult.status === "success") {
              for (let res of fulfilledResult?.data) {
                if (res.status === "error") {
                  console.error(res.error);
                }
              }

              return fulfilledResult?.data?.[0]?.result;
            } else {
              if (Array.isArray(fulfilledResult)) {
                console.error(fulfilledResult[0]?.error);
              } else {
                console.error(fulfilledResult?.error);
              }
            }
          };
        },
      });
    }

    async sendThroughWebsocket(data: unknown) {
      type DFuncResponse = unknown; // {value?: unknown};

      let results = [];
      for (let network of this.networks.values()) {
        if (!network.socketId) return;

        const result: DFuncResponse = await socket.emitWithAck("d-func", network.signature, network.socketId, data);

        results.push(result);
      }

      return await Promise.allSettled(results);
    }

    // async selectTarget(signature: string, socketId: SocketId) {
    //   const network = this.networks.get(signature);

    //   if (!socketId) {
    //     const requestedSocketIdResponse = await socket.emitWithAck("get-socket-id-for-network", signature);

    //     if (!requestedSocketIdResponse) throw new Error(`No socketId found for network ${signature}`);

    //     socketId = requestedSocketIdResponse;
    //   }

    //   if (!socketId) {
    //     return null;
    //   }

    //   if (!network) {
    //     throw new Error(`No network found with signature ${signature}`);
    //   }

    //   this.networks.set(signature, {
    //     ...network,
    //     socketId,
    //   });

    //   try {
    //     await socket.emitWithAck("subscribe-event", signature, socketId);
    //     return socketId;
    //   } catch (error) {
    //     throw new Error(`Error subscribing to network ${signature} with socketId ${socketId}`);
    //   }
    // }

    // async resetTargets() {
    //   for (let network of this.networks.values()) {
    //     // console.log("resetting", network);
    //     this.networks.set(network.signature, {
    //       ...network,
    //       socketId: null,
    //     });
    //     socket.emitWithAck("unsubscribe-event", network.signature, null);
    //   }
    // }
  }

  return new SpectodaVirtualProxy();
}
