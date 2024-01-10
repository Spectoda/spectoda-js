import { ConnectionState, Spectoda } from "./Spectoda";
import { TimeTrack } from "./TimeTrack";
import { SpectodaVirtualProxy } from "./remote-control/SpectodaVirtualProxy";

// This object saves the current state of Spectoda instance

export class SpectodaWrapper {
  #spectoda: Spectoda | SpectodaVirtualProxy;
  timeline: TimeTrack;

  connectionState: ConnectionState;

  connectedMacs: string[];
  disconnectedMacs: string[];

  get spectoda() {
    return this.#spectoda;
  }

  constructor(isRemote = false) {
    this.timeline = new TimeTrack();
    const payload = this.timeline;

    this.#spectoda = isRemote ? new SpectodaVirtualProxy(payload) : new Spectoda(payload);

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
  }
}
