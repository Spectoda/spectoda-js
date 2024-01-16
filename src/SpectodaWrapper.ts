import { ConnectionState, Spectoda } from "./Spectoda";
import { TimeTrack } from "./TimeTrack";
import { createRemoteSpectodaInstance } from "./remote-control";

const isRemoteSpectodaInstance = (instance: Spectoda | SpectodaWrapper): instance is SpectodaWrapper => {
  return instance instanceof SpectodaWrapper;
};

export class SpectodaWrapper {
  #spectoda: Spectoda | ReturnType<typeof createRemoteSpectodaInstance>;
  timeline: TimeTrack;

  connectionState: ConnectionState;

  connectedMacs: string[];
  disconnectedMacs: string[];

  constructor({ isRemote = false, signature }: { isRemote?: boolean; signature: string }) {
    this.timeline = new TimeTrack();
    this.#spectoda = isRemote
      ? createRemoteSpectodaInstance({ signature })
      : new Spectoda({
          timeline: this.timeline,
          signature,
        });

    // Connection states
    this.connectionState = "disconnected";
    // this.#spectoda.on("connected", async () => (this.connectionState = "connected"));
    // this.#spectoda.on("connecting", () => (this.connectionState = "connecting"));
    // this.#spectoda.on("disconnecting", () => (this.connectionState = "disconnecting"));
    // this.#spectoda.on("disconnected", () => (this.connectionState = "disconnected"));

    // Handling connected and disconnected peers
    this.connectedMacs = [];
    this.disconnectedMacs = [];

    // this.#spectoda.on("peer_connected", (peer: string) => {
    //   this.connectedMacs = [...this.connectedMacs, peer];
    //   this.disconnectedMacs = this.disconnectedMacs.filter(v => v !== peer);
    // });

    // this.#spectoda.on("peer_disconnected", (peer: string) => {
    //   this.connectedMacs = this.connectedMacs.filter(v => v !== peer);
    //   if (!this.disconnectedMacs.find(p => p === peer)) {
    //     this.disconnectedMacs = [...this.disconnectedMacs, peer];
    //   }
    // });

    return new Proxy(this, {
      get: (target, prop, receiver) => {
        if (Reflect.has(target, prop)) {
          return Reflect.get(target, prop, receiver);
        } else {
          return Reflect.get(this.#spectoda, prop, receiver);
        }
      },
    });
  }
}
