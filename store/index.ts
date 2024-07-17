import { z } from "zod";
import { createStore } from "zustand/vanilla";

import { spectoda } from "@spectoda/spectoda-utils";
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
 *     - Udělat funkci loadData
 *     - Vystavit FW, MAC, name, config ve statu
 *     - Umět tyto informace vyčíst z Storu
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

// export type SpectodaConnectionMethods = {
//   // getdata: () => Promise<void>;
//   //   fwVersion: () => Promise<SpectodaStoreState["fwVersion"]>;
//   //   peersAndMacs: () => Promise<SpectodaStoreState["connectedMacs"]>;
//   //   name: () => Promise<SpectodaStoreState["name"]>;
//   // };
//   //   connect: (params?: ConnectOptions) => Promise<unknown>;
//   //   disconnect: () => Promise<void>;
//   //   upload: (tngl: string) => Promise<void>;
//   //   assignConnector: (mac: ConnectorType) => Promise<void>;
//   //   activateFakeDevice: (mac: string[]) => void;
//   //   isActiveMac: (mac: string | string[] | undefined) => boolean;
//   //   getAndSetPeers: () => Promise<void>;
//   //   getConnectedPeersInfo: () => Promise<unknown>;
//   //   setIsUploading: (isUploading: boolean) => void;
//   //   setFakeConnection: (fakeConnection: boolean) => void;
// };

// const methods = (set, get) => {
//   return {
//     // po write config musim invalidovat vsechny relevantni veci v cache
//     // tyhle data uz nejsou nejsou fresh?? odkud to fetchnout

//     // ?
//     // jak delat timeout pro posilani do DB - je to vubec potreba?

//     /**
//      *
//      */
//     getFwVersion: async () => {
//       const fwVersionData = await spectoda.getFwVersion();
//       const fwVersionValidation = FwVersionSchema.safeParse(fwVersionData);
//       if (!fwVersionValidation.success) {
//         console.error("getFwVersion failed due to validation error:", fwVersionValidation.error.errors[0]);
//         return null;
//       }

//       set({
//         ...get(),
//         fwVersion: fwVersionValidation.data,
//       });

//       return fwVersionValidation.data;
//     },

//     /**
//      *
//      */
//     getPeersAndMacs: async () => {
//       const peersData = await spectoda.getConnectedPeersInfo();
//       const peersValidation = z.array(MacObjectSchema).safeParse(peersData);
//       if (!peersValidation.success) {
//         console.error("getPeersAndMacs failed due to validation error:", peersValidation.error.errors[0]);
//         return [];
//       }

//       const peers = peersValidation.data;
//       const mac = peers[0].mac;

//       set({
//         ...get(),
//         connectedMacs: peers,
//         mac,
//       });

//       return peers;
//     },

//     /**
//      *
//      */
//     name: async () => {
//       data: "value";
//       isStale: false; // boolean value saying if cache is valid
//       get: () => {
//         // If isStale, will refetch
//         // otherwise return data
//       };
//       set: () => {
//         // Sets new data
//         // Calls invalidate + get
//       };
//       invalidate: () => {
//         // Turns cache to stale
//       };
//     },
//     getName: async () => {
//       const state = get();

//       if (state.name) {
//         return state.name;
//       }

//       const name = await spectoda.readControllerName();
//       const nameValidation = ControllerNameSchema.safeParse(name);

//       if (!nameValidation.success) {
//         console.error("getName failed due to validation error:", nameValidation.error.errors[0]);
//         return null;
//       }

//       set({
//         ...get(),
//         name: nameValidation.data,
//       });

//       return nameValidation.data;
//     },

//     invalidateName: () => {
//       set({
//         ...get(),
//         name: null,
//       });
//     },

//     /**
//      *
//      */
//     loadData: async () => {
//       try {
//         await Promise.all([
//           // get().getFwVersion(), get().getPeersAndMacs(),
//           get().getName(),
//         ]);
//         return;
//       } catch (error) {
//         if (error instanceof Error) {
//           console.error("Load data failed due. Reason:", error.message);
//         } else if (typeof error === "string") {
//           console.error(`Load data failed. Reason: ${error}`);
//         } else {
//           console.error(`Load data failed for unknown reason.`, error);
//         }
//       }
//     },
//   };
// };

// const spectodaStore = createStore<SpectodaStore>()((set, get, rest) => ({
//   ...methods(set, get, rest),
//   ...state,
// }));

type Query<T extends any = string, HasSet extends boolean = true> = {
  data: T | null;
  isStale: boolean;
  get: () => Promise<T | null>;
  invalidate: () => void;
} & (HasSet extends true ? { set: (newData: T) => Promise<void> } : {});

type Queries = {
  name: Query;
  fwVersion: Query;
  macs: Query<
    {
      this: string | null;
      connected: string[];
    },
    false
  >;

  // todo: config
};

type Methods = {
  loadData: () => Promise<void>;
};

type SpectodaStore = Queries & Methods;

// ?? How to use this with different spectoda objects?

const spectodaStore = createStore<SpectodaStore>()((set, get) => {
  const invalidateItem = (key: keyof SpectodaStore) => () => {
    set(state => ({
      ...state,
      [key]: {
        ...state[key],
        isStale: true,
      },
    }));
  };

  const createQuery = <T, K extends keyof Queries>({
    key,
    getFunction,
    dataSchema: DataSchema,
    setFunction,
  }: {
    key: K;
    getFunction: () => Promise<T>;
    dataSchema: z.Schema<T>;
    setFunction?: (newData: T) => Promise<void>;
  }): Record<K, Query<T, typeof setFunction extends undefined ? false : true>> => {
    const storeItem = {
      data: null,
      isStale: true,
      get: async () => {
        const state = get();

        if (!state[key].isStale) {
          console.log(`✅ Got ${key} from cache`);
          return state[key].data as T;
        }

        console.log(`👀 Reading ${key}...`);
        const data = await getFunction();
        const dataValidation = DataSchema.safeParse(data);

        if (!dataValidation.success) {
          console.error(`Validating ${key} failed:`, dataValidation.error.errors[0]);
          return null as T;
        }

        console.log(`✅ Got valid ${key} from controller + value set`);

        set({
          ...state,
          [key]: {
            ...state[key],
            isStale: false,
            data: dataValidation.data,
          },
        });

        return dataValidation.data as T;
      },
      set: async (newData: T) => {
        console.log({ newData, a: typeof setFunction });

        if (typeof setFunction === "function") {
          await setFunction(newData);
          console.log(`📝 Writing new ${key} to controller...`);
        }

        console.log(`📝 Setting ${key}`);

        set(state => ({
          ...state,
          [key]: {
            ...state[key],
            isStale: false,
            data: newData,
          },
        }));
      },
      invalidate: invalidateItem(key),
    };

    return { [key]: storeItem } as Record<K, typeof storeItem>;
  };

  const peersAndMacs = {
    macs: {
      data: {
        this: null,
        connected: [],
      },
      isStale: true,
      get: async () => {
        const state = get();

        if (!state.macs.isStale) {
          console.log("✅ Got macs from cache");
          return state.macs.data;
        }

        console.log("👀 Reading peers...");
        const peers = await spectoda.getConnectedPeersInfo();
        const peersValidation = z.array(MacObjectSchema).safeParse(peers);

        if (!peersValidation.success) {
          console.error("Peers data validation failed:", peersValidation.error.errors[0]);
          return {
            this: null,
            connected: [],
          };
        }

        const thisMac = peersValidation.data[0].mac;
        const payload = {
          this: thisMac,
          connected: peersValidation.data.map(peer => peer.mac),
        };

        console.log("✅ Got valid macs from controller + value set", peersValidation.data);

        set({
          ...state,
          macs: {
            ...state.macs,
            isStale: false,
            data: payload,
          },
        });

        return payload;
      },
      invalidate: invalidateItem("macs"),
    },
  };

  const loadData = {
    loadData: async () => {
      try {
        await get().fwVersion.get();
        await get().macs.get();
        await get().name.get();
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

  return {
    ...createQuery({
      key: "name",
      dataSchema: ControllerNameSchema,
      getFunction: () => spectoda.readControllerName(),
      setFunction: (...args) => spectoda.writeControllerName(...args),
    }),
    ...createQuery({
      key: "fwVersion",
      dataSchema: FwVersionSchema,
      getFunction: () => spectoda.getFwVersion(),
    }),
    ...peersAndMacs,
    ...loadData,
  } satisfies SpectodaStore;
});

export { spectodaStore };
