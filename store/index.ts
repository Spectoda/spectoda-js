import { z } from "zod";
import { createStore } from "zustand/vanilla";

import { safeJSONParse, spectoda } from "@spectoda/spectoda-utils";
import { MacObject } from "@spectoda/spectoda-utils/utils/SpectodaConnectionContext";
import { MacObjectSchema, TStringSchema } from "./types";

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

const SHOW_LOGS = false;

const log = (...args: any[]) => {
  if (SHOW_LOGS) {
    console.log(...args);
  }
};

type Query<T extends any = string, HasSet extends boolean = true> = {
  data: T;
  isStale: boolean;
  get: () => Promise<T | null>;
  invalidate: () => void;
} & (HasSet extends true ? { set: (newData: T) => Promise<void> } : {});

type CustomMethods = {
  loadData: () => Promise<void>;
};

type Queries = {
  name: Query;
  fwVersion: Query;
  signature: Query;

  codes: Query<
    {
      pcbCode: number | null;
      productCode: number | null;
    },
    false
  >;

  config: Query<
    {
      string: string | null;
      object: Record<string, any>;
    },
    false
  >;

  macs: Query<
    {
      this: string | null;
      connected: MacObject[];
    },
    false
  >;
};

type SpectodaStore = Queries &
  CustomMethods & {
    data: {
      [key in keyof Queries]: Queries[key]["data"];
    };
  };

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

  const setQueryItem = (key: keyof SpectodaStore, value: any) => {
    set(state => ({
      ...state,
      [key]: {
        ...state[key],
        isStale: false,
        data: value,
      },
      data: {
        ...state.data,
        [key]: value,
      },
    }));
  };

  const createQuery = <FetchedDataType, Key extends keyof Queries, DataType>({
    key,
    fetchFunction,
    FetchedDataSchema,
    dataTransform,
    DataSchema,
    setFunction,
    defaultReturn = null,
  }: {
    key: Key;
    defaultReturn?: DataType;
    fetchFunction: () => Promise<FetchedDataType>;
    FetchedDataSchema: z.ZodType<FetchedDataType>;
    setFunction?: (newData: DataType) => Promise<void>;
  } & (
    | {
        dataTransform: (fetchedData: FetchedDataType) => DataType;
        DataSchema: z.ZodType<DataType>;
      }
    | {
        // If DataSchema is not defined, DataSchema = FetchedDataSchema
        dataTransform?: undefined;
        DataSchema?: undefined;
      }
  )): Record<Key, Query<DataType, typeof setFunction extends undefined ? false : true>> => {
    const storeItem = {
      data: defaultReturn,
      isStale: true,
      get: async () => {
        const state = get();

        if (!state[key].isStale) {
          log(`✅ Got ${key} from cache`);
          return state[key].data as DataType;
        }

        log(`👀 Reading ${key}...`);

        const fetchedData = await fetchFunction();
        const fetchedDataValidation = FetchedDataSchema.safeParse(fetchedData);

        if (!fetchedDataValidation.success) {
          console.error(`Validating ${key} failed:`, fetchedDataValidation.error.errors[0]);
          return defaultReturn as DataType;
        }

        let output: DataType;

        if (typeof dataTransform === "function" && DataSchema) {
          const transformed = dataTransform(fetchedDataValidation.data);
          const transformedDataValidation = DataSchema.safeParse(transformed);

          if (!transformedDataValidation.success) {
            console.error(`Validating ${key} failed:`, transformedDataValidation.error.errors[0]);
            return defaultReturn as DataType;
          }

          output = transformedDataValidation.data;
        } else {
          output = fetchedDataValidation.data as unknown as DataType;
        }

        log(`✅ Got valid ${key} from controller + value set`, output);

        setQueryItem(key, output);

        return output as DataType;
      },
      set: async (newData: DataType) => {
        if (typeof setFunction === "function") {
          await setFunction(newData);
          log(`📝 Writing new ${key} to controller...`);
        }

        log(`📝 Setting ${key}`);

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

    return { [key]: storeItem } as Record<Key, typeof storeItem>;
  };

  const loadData = {
    loadData: async () => {
      try {
        await get().fwVersion.get();
        await get().macs.get();
        await get().name.get();
        await get().config.get();
        await get().signature.get();
        await get().codes.get();
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
      FetchedDataSchema: TStringSchema,

      fetchFunction: () => spectoda.readControllerName(),
      setFunction: (...args) => spectoda.writeControllerName(...args),
    }),

    ...createQuery({
      key: "fwVersion",
      FetchedDataSchema: TStringSchema,
      fetchFunction: () => spectoda.getFwVersion(),
    }),

    ...createQuery({
      key: "codes",
      defaultReturn: {
        pcbCode: null,
        productCode: null,
      },
      FetchedDataSchema: z.object({
        pcb_code: z.number().nullable(),
        product_code: z.number().nullable(),
      }),
      fetchFunction: () => spectoda.readControllerCodes(),
      DataSchema: z.object({
        pcbCode: z.number().nullable(),
        productCode: z.number().nullable(),
      }),
      dataTransform: (data: { pcb_code: number; product_code: number }) => {
        return {
          productCode: data.product_code,
          pcbCode: data.pcb_code,
        };
      },
    }),

    ...createQuery({
      key: "signature",
      FetchedDataSchema: TStringSchema,
      fetchFunction: () => spectoda.readNetworkSignature(),
    }),

    ...createQuery({
      key: "config",
      FetchedDataSchema: TStringSchema,
      DataSchema: z.object({
        string: z.string(),
        object: z.object({}).catchall(z.unknown()),
      }),
      fetchFunction: () => spectoda.readDeviceConfig(),
      dataTransform: (input: string) => {
        return {
          string: input,
          object: safeJSONParse(input),
        };
      },
    }),

    ...createQuery({
      key: "macs",
      FetchedDataSchema: z.array(MacObjectSchema),
      fetchFunction: () => spectoda.getConnectedPeersInfo(),
      DataSchema: z.object({
        this: z.string(),
        connected: z.array(MacObjectSchema),
      }),
      dataTransform: (input: MacObject[]) => {
        log(input);
        const thisMac = input[0].mac;
        const payload = {
          this: thisMac,
          connected: input,
        };

        return payload;
      },
    }),
    ...loadData,
  } satisfies SpectodaStore;
});

export { spectodaStore };
