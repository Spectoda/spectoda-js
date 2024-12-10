/** @deprecated TODO REMOVE THIS FILE */

// import { create } from 'zustand';
// import { immer } from 'zustand/middleware/immer';
// import { v4 as uuidv4 } from 'uuid';

// type ControllerData = {
//   fwVersion: string;
//   name: string;
//   mac: string;
//   config: any;
// };

// type Controller = {
//   data: ControllerData;
//   instance: SpectodaInstance;
// };

// type RootObjectData = {
//   fwVersion: string;
//   name: string;
//   mac: string;
//   config: any;
// };

// type RootObject = {
//   data: RootObjectData;
//   controllers: Record<string, Controller>;
//   instance: SpectodaInstance;
//   signature: string;
// };

// type StaleData = {
//   fwVersion: boolean;
//   config: boolean;
//   controllers: Record<string, { fwVersion: boolean; config: boolean }>;
// };

// type ControllerActions = {
//   setName: (name: string) => void;
//   setConfig: (config: any) => void;
//   setVersion: (version: string) => void;
//   remove: () => void;
//   markStale: (field: keyof Omit<StaleData, 'controllers'>) => void;
//   refreshStaleData: () => Promise<void>;
// };

// type RootObjectActions = {
//   setName: (name: string) => void;
//   setConfig: (config: any) => void;
//   setVersion: (version: string) => void;
//   addController: (mac: string, data: Partial<ControllerData>) => void;
//   removeController: (mac: string) => void;
//   getController: (mac: string) => ControllerActions | undefined;
//   markStale: (field: keyof Omit<StaleData, 'controllers'>) => void;
//   refreshStaleData: () => Promise<void>;
// };

// type SpectodaStore = {
//   rootObjects: Record<string, RootObject>;
//   staleData: Record<string, StaleData>;
//   addRootObject: (signature: string, data: RootObjectData) => string;
//   removeRootObject: (id: string) => void;
//   getRootObject: (id: string) => RootObjectActions | undefined;
// };

// export const useSpectodaStore = create<SpectodaStore>()(
//   immer((set, get) => ({
//     rootObjects: {},
//     staleData: {},

//     addRootObject: (signature, data) => {
//       const id = uuidv4();
//       set(state => {
//         state.rootObjects[id] = {
//           data,
//           controllers: {},
//           instance: new SpectodaInstance(),
//           signature,
//         };
//         state.staleData[id] = { fwVersion: false, config: false, controllers: {} };
//       });
//       return id;
//     },

//     removeRootObject: (id) => {
//       set(state => {
//         delete state.rootObjects[id];
//         delete state.staleData[id];
//       });
//     },

//     getRootObject: (id) => {
//       const rootObject = get().rootObjects[id];
//       if (!rootObject) return undefined;

//       const createControllerActions = (mac: string): ControllerActions => ({
//         setName: (name) => set(state => {
//           state.rootObjects[id].controllers[mac].data.name = name;
//         }),

//         setConfig: (config) => set(state => {
//           state.rootObjects[id].controllers[mac].data.config = config;
//         }),

//         setVersion: (version) => set(state => {
//           state.rootObjects[id].controllers[mac].data.fwVersion = version;
//         }),

//         remove: () => set(state => {
//           delete state.rootObjects[id].controllers[mac];
//           delete state.staleData[id].controllers[mac];
//         }),

//         markStale: (field) => set(state => {
//           state.staleData[id].controllers[mac][field] = true;
//         }),

//         refreshStaleData: async () => {
//           const staleData = get().staleData[id].controllers[mac];
//           const controller = rootObject.controllers[mac];
//           if (staleData.fwVersion) {
//             const newVersion = await controller.instance.getFirmwareVersion();
//             createControllerActions(mac).setVersion(newVersion);
//           }
//           if (staleData.config) {
//             const newConfig = await controller.instance.getConfig();
//             createControllerActions(mac).setConfig(newConfig);
//           }
//           set(state => {
//             state.staleData[id].controllers[mac] = { fwVersion: false, config: false };
//           });
//         }
//       });

//       const rootObjectActions: RootObjectActions = {
//         setName: (name) => set(state => {
//           state.rootObjects[id].data.name = name;
//         }),

//         setConfig: (config) => set(state => {
//           state.rootObjects[id].data.config = config;
//         }),

//         setVersion: (version) => set(state => {
//           state.rootObjects[id].data.fwVersion = version;
//         }),

//         addController: (mac, data) => set(state => {
//           state.rootObjects[id].controllers[mac] = {
//             data: {
//               fwVersion: '',
//               name: '',
//               mac,
//               config: {},
//               ...data
//             },
//             instance: new SpectodaInstance()
//           };
//           state.staleData[id].controllers[mac] = { fwVersion: false, config: false };
//         }),

//         removeController: (mac) => createControllerActions(mac).remove(),

//         getController: (mac) => {
//           if (!rootObject.controllers[mac]) return undefined;
//           return createControllerActions(mac);
//         },

//         markStale: (field) => set(state => {
//           state.staleData[id][field] = true;
//         }),

//         refreshStaleData: async () => {
//           const staleData = get().staleData[id];
//           if (staleData.fwVersion) {
//             const newVersion = await rootObject.instance.getFirmwareVersion();
//             rootObjectActions.setVersion(newVersion);
//           }
//           if (staleData.config) {
//             const newConfig = await rootObject.instance.getConfig();
//             rootObjectActions.setConfig(newConfig);
//           }
//           set(state => {
//             state.staleData[id].fwVersion = false;
//             state.staleData[id].config = false;
//           });
//         }
//       };

//       return rootObjectActions;
//     }
//   }))
// );
