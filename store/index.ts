import { spectoda } from "@spectoda/spectoda-utils";
import { z } from "zod";
import { createStore, StateCreator } from "zustand/vanilla";
import { ControllerNameSchema, FwVersionSchema, MacObjectSchema, TMacObject } from "./types";

type SpectodaStore = SpectodaStoreState & SpectodaConnectionMethods;
type MethodsFunction = (...params: Parameters<StateCreator<SpectodaStore>>) => SpectodaConnectionMethods;

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

// export type SpectodaStoreState = {
//   controller: {
//     fwVersion: string;
//     mac: string;
//     name: string;
//     configString: string;
//   };
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
// };

/**
 * Caching rules: when !isConnected, data are stale
 */

/** TOdo: co potřebuju?
 * - GOAL: mít cached informace o aktuálním FW, MAC, name, config
 *
 * 1. Po připojení nacachovat (vlastní funkcí)
 *       - Udělat funkci loadData
 *       - Vystavit FW, MAC, name, config ve statu
 *       - Umět tyto informace vyčíst z Storu
 * 2. Umět tyto informace mutovat
 * 3. Refactor Connection Contextu + Hooky
 *
 *
 */

class ValidationError extends Error {
  details: any;

  constructor(message: string, details: any) {
    super(message);
    this.name = "ValidationError";
    this.details = details;
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export default ValidationError;

type SpectodaStoreState = typeof state;
const state = {
  connectedMacs: [] as TMacObject[],
  disconnectedMacs: [] as TMacObject[],
  controller: {
    configString: "",
    fwVersion: "",
    mac: "",
    name: "",
  },
};

const methods: MethodsFunction = (set, get) => {
  return {
    loadData: async () => {
      try {
        const fwVersion = await spectoda.getFwVersion();
        const fwVersionValidation = FwVersionSchema.safeParse(fwVersion);
        if (!fwVersionValidation.success) {
          throw new ValidationError("Invalid connected peers info", fwVersionValidation.error.errors[0]);
        }

        const peers = await spectoda.getConnectedPeersInfo();
        const peersValidation = z.array(MacObjectSchema).safeParse(peers);
        if (!peersValidation.success) {
          throw new ValidationError("Invalid connected peers info", peersValidation.error.errors[0]);
        }

        const disconnectedMacs = get().disconnectedMacs;
        const newDisconnectedMacs = disconnectedMacs.filter(v => peers.find(({ mac }) => mac !== v.mac));
        const mac = peers[0].mac;

        const name = await spectoda.readControllerName();
        const nameValidation = ControllerNameSchema.safeParse(name);
        if (!nameValidation.success) {
          throw new ValidationError("Invalid connected peers info", nameValidation.error.errors[0]);
        }

        set({
          disconnectedMacs: newDisconnectedMacs,
          controller: {
            ...get().controller,
            mac,
            fwVersion,
            name,
          },
        });

        return;
      } catch (error) {
        if (error instanceof ValidationError) {
          console.error("Load data failed due to validation error:", error.message, error.details);
        } else {
          console.error(`Load data failed. Reason: ${error}`);
        }
      }
    },
  };
};

const spectodaStore = createStore<SpectodaStore>()((set, get, rest) => ({
  ...methods(set, get, rest),
  ...state,
}));

export { spectodaStore };
