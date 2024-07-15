import { DeviceConnectionCriteria } from "../types";

export const CONNECTION = {
  CONNECTED: "connected",
  CONNECTING: "connecting",
  DISCONNECTED: "disconnected",
  DISCONNECTING: "disconnecting",
} as const;

export type ConnectionStatus = (typeof CONNECTION)[keyof typeof CONNECTION];

export const CONNECTORS = [
  { key: "default", name: "Automatic", hidden: false },
  { key: "webbluetooth", name: "Bluetooth", hidden: false },
  { key: "webserial", name: "Web Serial", hidden: false },
  { key: "dummy", name: "Simulated", hidden: false },
  { key: "websockets", name: "Remote", hidden: true },
  { key: "flutter", name: "Flutter", hidden: true },
  { key: "tangleconnect", name: "Tangle Connect", hidden: true },
  { key: "edummy", name: "Dummy With Errors", hidden: true },
  { key: "vdummy", name: "Dummy With Version", hidden: true },
] as const;

export type ConnectorType = (typeof CONNECTORS)[number]["key"];

export interface MacObject {
  mac: string;
}

export type SpectodaConnectionMethods = {
  loadData: () => Promise<void>;
  //   connect: (params?: ConnectOptions) => Promise<unknown>;
  //   disconnect: () => Promise<void>;
  //   upload: (tngl: string) => Promise<void>;
  //   assignConnector: (mac: ConnectorType) => Promise<void>;
  //   activateFakeDevice: (mac: string[]) => void;
  //   isActiveMac: (mac: string | string[] | undefined) => boolean;
  //   getAndSetPeers: () => Promise<void>;
  //   getConnectedPeersInfo: () => Promise<unknown>;
  //   setIsUploading: (isUploading: boolean) => void;
  //   setFakeConnection: (fakeConnection: boolean) => void;
};

export type SpectodaStoreState = {
  controller: {
    fwVersion: string;
    mac: string;
    name: string;
    configString: string;
  };
  // network: {
  //     signature: string;
  // }
  //   connectionStatus: ConnectionStatus;
  //   connectedMacs: MacObject[];
  //   directlyConnectedMac: string;
  //   lastDirectlyConnectedMac: string;
  //   disconnectedMacs: MacObject[];
  //   connector: ConnectorType;

  //   isConnecting: boolean;
  //   isUploading: boolean;
  //   isConnected: boolean;

  //   version: string;
  //   fullVersion: string;
  //   versionAvailable: boolean;
  //   isLimitedMode: boolean;
  //   connectedName: string | undefined;
  //   connectedController: any;
  //   connectedNetworkSignature: string | undefined;
  //   isUnknownNetwork: boolean;
  //   fakeConnection: boolean;

  //   isWebsocketConnected: boolean;
  //   websocketConnectionStatus: ConnectionStatus;
  //   pcbCode: number;
  //   productCode: number;
  //   network: Network | null | undefined;
};

type ConnectOptions = {
  devices?: DeviceConnectionCriteria[] | null;
  autoConnect?: boolean;
  ownerSignature?: string | null;
  ownerKey?: string | null;
  connectAny?: boolean;
  fwVersion?: string;
};
