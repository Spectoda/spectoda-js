import { spectoda } from "@spectoda/spectoda-utils";
import { z } from "zod";
import { createStore } from "zustand/vanilla";
import { ControllerNameSchema, FwVersionSchema, MacObjectSchema } from "./types";

// type SpectodaStore = SpectodaStoreState & SpectodaConnectionMethods;
// type MethodsFunction = (...params: Parameters<StateCreator<SpectodaStore>>) => SpectodaConnectionMethods;

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

/** TOdo: co potřebuju?
 * - GOAL: mít cached informace o aktuálním FW, MAC, name, config
 *
 * 1. Po připojení nacachovat (vlastní funkcí)
 *       - Udělat funkci loadData
 *       - Vystavit FW, MAC, name, config ve statu
 *       - Umět tyto informace vyčíst z Storu
 * 2. Umět tyto informace mutovat
 * 3. Refactor Connection Contextu + Hooky
 */

// type SpectodaStoreState = typeof state;
// const state = {
//   queries: {},
//   connectedMacs: [] as TMacObject[],
//   disconnectedMacs: [] as TMacObject[],
//   configString: null as string | null,
//   fwVersion: null as TFwVersion | null,
//   mac: null as TMacObject["mac"] | null,
//   name: null as TControllerName | null,
// };

// at se zbytecne tahaji data ktere jsou irelevantni pro Appku
// napr getConnectedPeers jsou naprd
// data vytahuju v moment kdy je chci getnout, ne kdy je menim

export type SpectodaConnectionMethods = {
  // getdata: () => Promise<void>;
  //   fwVersion: () => Promise<SpectodaStoreState["fwVersion"]>;
  //   peersAndMacs: () => Promise<SpectodaStoreState["connectedMacs"]>;
  //   name: () => Promise<SpectodaStoreState["name"]>;
  // };
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

const methods = (set, get) => {
  return {
    // po write config musim invalidovat vsechny relevantni veci v cache
    // tyhle data uz nejsou nejsou fresh?? odkud to fetchnout

    // ?
    // jak delat timeout pro posilani do DB - je to vubec potreba?

    /**
     *
     */
    getFwVersion: async () => {
      const fwVersionData = await spectoda.getFwVersion();
      const fwVersionValidation = FwVersionSchema.safeParse(fwVersionData);
      if (!fwVersionValidation.success) {
        console.error("getFwVersion failed due to validation error:", fwVersionValidation.error.errors[0]);
        return null;
      }

      set({
        ...get(),
        fwVersion: fwVersionValidation.data,
      });

      return fwVersionValidation.data;
    },

    /**
     *
     */
    getPeersAndMacs: async () => {
      const peersData = await spectoda.getConnectedPeersInfo();
      const peersValidation = z.array(MacObjectSchema).safeParse(peersData);
      if (!peersValidation.success) {
        console.error("getPeersAndMacs failed due to validation error:", peersValidation.error.errors[0]);
        return [];
      }

      const peers = peersValidation.data;
      const mac = peers[0].mac;

      set({
        ...get(),
        connectedMacs: peers,
        mac,
      });

      return peers;
    },

    /**
     *
     */
    name: async () => {
      data: "value";
      isStale: false; // boolean value saying if cache is valid
      get: () => {
        // If isStale, will refetch
        // otherwise return data
      };
      set: () => {
        // Sets new data
        // Calls invalidate + get
      };
      invalidate: () => {
        // Turns cache to stale
      };
    },
    getName: async () => {
      const state = get();

      if (state.name) {
        return state.name;
      }

      const name = await spectoda.readControllerName();
      const nameValidation = ControllerNameSchema.safeParse(name);

      if (!nameValidation.success) {
        console.error("getName failed due to validation error:", nameValidation.error.errors[0]);
        return null;
      }

      set({
        ...get(),
        name: nameValidation.data,
      });

      return nameValidation.data;
    },

    invalidateName: () => {
      set({
        ...get(),
        name: null,
      });
    },

    /**
     *
     */
    loadData: async () => {
      try {
        await Promise.all([
          // get().getFwVersion(), get().getPeersAndMacs(),
          get().getName(),
        ]);
        return;
      } catch (error) {
        if (error instanceof Error) {
          console.error("Load data failed due. Reason:", error.message);
        } else if (typeof error === "string") {
          console.error(`Load data failed. Reason: ${error}`);
        } else {
          console.error(`Load data failed for unknown reason.`, error);
        }
      }
    },
  };
};

// const spectodaStore = createStore<SpectodaStore>()((set, get, rest) => ({
//   ...methods(set, get, rest),
//   ...state,
// }));

type SpectodaStore = {};

const spectodaStore = createStore<SpectodaStore>()((set, get) => ({
  name: {
    data: null,
    isStale: true,
    get: async () => {
      const state = get();

      if (!state.name.isStale) {
        console.log("✅ Got from cache");
        return state.name.data;
      }

      console.log("👀 Reading...");
      const name = await spectoda.readControllerName();
      const nameValidation = ControllerNameSchema.safeParse(name);

      if (!nameValidation.success) {
        console.error("getName failed due to validation error:", nameValidation.error.errors[0]);
        return null;
      }

      set({
        ...state,
        name: {
          ...state.name,
          isStale: false,
          data: nameValidation.data,
        },
      });

      console.log("🍋 Refreshed");
      return nameValidation.data;
    },
    set: async (newName: string) => {
      const state = get();
      await spectoda.writeControllerName(newName);

      // optimistic update
      set(state => ({
        ...state,
        name: {
          ...state.name,
          data: newName,
          isStale: true,
        },
      }));

      state.name.get();
    },
    invalidate: () => {
      set(state => ({
        ...state,
        name: {
          ...state.name,
          isStale: true,
        },
      }));
    },
  },
}));

export { spectodaStore };
