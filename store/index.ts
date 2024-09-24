import { z } from "zod";
import { devtools, subscribeWithSelector } from "zustand/middleware";
import { createStore } from "zustand/vanilla";

import { safeJSONParse, spectoda } from "@spectoda/spectoda-utils";
import { MacObjectSchema, TMacObject, TStringSchema } from "./types";

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
  data: T | null;
  isStale: boolean;
  get: () => Promise<T | null>;
  invalidate: () => void;
} & (HasSet extends true ? { set: (newData: T) => Promise<void> } : {});

type Queries = {
  name: Query<string, true>;
  fwVersion: Query<string, true>;
  signature: Query<string, true>;

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
      lastReadTime: Date | null;
    },
    false
  >;

  macs: Query<
    {
      this: string | null;
      connected: TMacObject[];
    },
    false
  >;
};

type SpectodaStore = Queries & CustomMethods & Record<"data", SpectodaDataObject>;

export type SpectodaDataObject = {
  [key in keyof Queries]: Queries[key]["data"] | null;
};

const spectodaStore = createStore<SpectodaStore>()(
  devtools(
    subscribeWithSelector((set, get) => {
      const invalidateItem = (key: keyof Queries) => () => {
        set(state => ({
          ...state,
          [key]: {
            ...state[key],
            isStale: true,
          },
        }));
      };

      const setQueryItem = (key: keyof Queries, value: any) => {
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

      const createQuery = <Key extends keyof Queries, FetchedType, DataType extends Queries[Key]["data"]>({
        key,
        fetchFunction,
        FetchedDataSchema,
        dataTransform,
        DataSchema,
        setFunction,
        defaultReturn = null as DataType,
      }: {
        key: Key;
        defaultReturn?: DataType;
        fetchFunction: () => Promise<FetchedType>;
        FetchedDataSchema: z.ZodType<FetchedType>;
        dataTransform?: (fetchedData: FetchedType) => DataType | null;
        DataSchema?: z.ZodType<DataType>;
        setFunction?: (newData: DataType) => Promise<void>;
      }): Record<Key, Query<DataType, typeof setFunction extends undefined ? false : true>> => {
        const storeItem: Query<DataType, typeof setFunction extends undefined ? false : true> = {
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
          invalidate: invalidateItem(key),
          set: async (newData: DataType) => {
            if (typeof setFunction === "function") {
              await setFunction(newData);
              log(`📝 Writing new ${key} to controller...`);
            }

            log(`📝 Setting ${key}`);

            setQueryItem(key, newData);
          },
        };

        return { [key]: storeItem } as Record<Key, typeof storeItem>;
      };

      const loadData = {
        loadData: async () => {
          get().startBatching();

          const results: SpectodaDataObject = {
            fwVersion: null,
            macs: null,
            name: null,
            config: null,
            signature: null,
            codes: null,
          };

          let resource;
          try {
            resource = "fwVersion";
            results.fwVersion = await get().fwVersion.get();

            resource = "macs";
            results.macs = await get().macs.get();

            resource = "name";
            results.name = await get().name.get();

            resource = "config";
            results.config = await get().config.get();

            resource = "signature";
            results.signature = await get().signature.get();

            resource = "codes";
            results.codes = await get().codes.get();
          } catch (error) {
            if (error instanceof Error) {
              console.error(`Load data failed while getting ${resource} due. Reason:`, error.message);
            } else if (typeof error === "string") {
              console.error(`Load data failed while getting ${resource}. Reason: ${error}`);
            } else {
              console.error(`Load data failed while getting ${resource} for unknown reason.`, error);
            }
          } finally {
            get().endBatching();
            return results;
          }
        },
      };

      const queries = {
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
            pcb_code: z.number(),
            product_code: z.number(),
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
          setFunction: () => Promise.resolve(),
        }),

        ...createQuery({
          key: "config",
          FetchedDataSchema: TStringSchema,
          DataSchema: z.object({
            string: z.string(),
            lastReadTime: z.date(),
            object: z.object({}).catchall(z.unknown()),
          }),
          fetchFunction: () => spectoda.readDeviceConfig(),
          dataTransform: (input: string) => {
            return {
              string: input,
              lastReadTime: new Date(),
              object: z.object({}).safeParse(safeJSONParse(input)).data ?? {},
            };
          },
        }),

        ...createQuery({
          key: "macs",
          FetchedDataSchema: z.array(MacObjectSchema),
          defaultReturn: {
            this: "",
            connected: [],
          },
          fetchFunction: () => spectoda.getConnectedPeersInfo(),
          DataSchema: z.object({
            this: z.string(),
            connected: z.array(MacObjectSchema),
          }),
          dataTransform: (input: TMacObject[]) => {
            log(input);
            const thisMac = input[0]?.mac ?? null;
            const payload = {
              this: thisMac,
              connected: input,
            };

            return payload;
          },
        }),
      };

      const defaultQueryValues = {
        data: Object.keys(queries).reduce(
          (acc, key) => {
            return {
              ...acc,
              [key]: queries[key as keyof typeof queries].data,
            };
          },
          {} as SpectodaStore["data"],
        ),
      };

      // ! TODO when Spectoda Runtime will have a way to cleanup listeners
      // const initializeSpectoda = (spectodaObject)=>{
      //   // initialize spectoda.on("connected" | "disconnected" | ...
      // }

      // const cleanupSpectoda = () => {
      //   // cleanup listeners
      // }

      const invalidateAll = () => {
        Object.keys(queries).forEach(key => {
          queries[key as keyof typeof queries].invalidate();
        });
      };

      return {
        invalidateAll,
        ...queries,
        ...defaultQueryValues,
        ...loadData,

        isBatching: false,
        startBatching: () => set({ isBatching: true }),
        endBatching: () => set({ isBatching: false }),
      } satisfies SpectodaStore;
    }),
    {
      name: "Spectoda object store v1",
    },
  ),
);

type CustomMethods = {
  invalidateAll: () => void;
  loadData: () => Promise<SpectodaDataObject>;
  // initializeSpectoda: ()=>void;
  // cleanupSpectoda: ()=>void;

  isBatching: boolean;
  startBatching: () => void;
  endBatching: () => void;
};

export { spectodaStore };