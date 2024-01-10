import { ConnectionState, Spectoda, SpectodaObjectDummyPropertyList } from "./Spectoda";
import { TimeTrack } from "./TimeTrack";
import { SpectodaVirtualProxy } from "./remote-control/SpectodaVirtualProxy";

export class SpectodaWrapper extends SpectodaObjectDummyPropertyList {
  #spectoda: Spectoda | SpectodaVirtualProxy;
  timeline: TimeTrack;

  connectionState: ConnectionState;

  connectedMacs: string[];
  disconnectedMacs: string[];

  constructor(isRemote = false) {
    super();

    this.timeline = new TimeTrack();
    this.#spectoda = isRemote ? new SpectodaVirtualProxy(this.timeline) : new Spectoda(this.timeline);

    // Connection states
    this.connectionState = "disconnected";
    this.#spectoda.on("connected", async () => (this.connectionState = "connected"));
    this.#spectoda.on("connecting", () => (this.connectionState = "connecting"));
    this.#spectoda.on("disconnecting", () => (this.connectionState = "disconnecting"));
    this.#spectoda.on("disconnected", () => (this.connectionState = "disconnected"));

    // Handling connected and disconnected peers
    this.connectedMacs = [];
    this.disconnectedMacs = [];

    this.#spectoda.on("peer_connected", (peer: string) => {
      this.connectedMacs = [...this.connectedMacs, peer];
      this.disconnectedMacs = this.disconnectedMacs.filter(v => v !== peer);
    });

    this.#spectoda.on("peer_disconnected", (peer: string) => {
      this.connectedMacs = this.connectedMacs.filter(v => v !== peer);
      if (!this.disconnectedMacs.find(p => p === peer)) {
        this.disconnectedMacs = [...this.disconnectedMacs, peer];
      }
    });

    const proxy = new Proxy(this, {
      get: (target, prop, receiver) => {
        if (Reflect.has(target, prop)) {
          return Reflect.get(target, prop, receiver);
        } else {
          return Reflect.get(this.#spectoda, prop, receiver);
        }
      },
    });

    return proxy;
  }
}
