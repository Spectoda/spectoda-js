// import { devtools } from "zustand/middleware/devtools";
// import { immer } from "zustand/middleware/immer";
// import { subscribeWithSelector } from "zustand/middleware/subscribeWithSelector";
// import { createStore, StateCreator } from "zustand/vanilla";
// import { Spectoda } from "../Spectoda";

// const initialData = {
//   fishCount: 0,
// };

// const createStoreSlice: StateCreator<typeof initialData, [["zustand/immer", never], ["zustand/devtools", never], ["zustand/subscribeWithSelector", never]]> = (set, get) => {
//   return {
//     fishCount: 0,
//   };
// };

// const structure = {
//   rootObjects: {
//     signature1: {
//       // All controllers here, not only directly connected
//       controllers: [
//         {
//           mac: "mac1",
//           // ! Next version
//           //   path: "path/to/controller",
//           //   peers: [
//           //     { mac: "mac3", rssi: -50 },
//           //     { mac: "mac4", rssi: -60 },
//           //   ],
//           //   data: {
//           //     name: "SC_2",
//           //   },
//           //   isDataStale: {
//           //     name: true,
//           //   },
//         },
//         {
//           name: "SC_1",
//           mac: "mac2",
//           path: "another/path",
//         },
//       ],
//       instance: new Spectoda(),
//       signature: "signature1",
//       data: {
//         name: "SC_2",
//       },
//       isDataStale: {
//         name: true,
//       },
//     },
//   },

//   addRootObject: () => {},
//   removeRootObject: () => {},

//   getRootObject: (signature: string) => {
//     return {
//       setName: (name: string) => {
//         // set name
//       },
//     };
//   },

//   // SET METHODS
//   scan: ({ rootObjectSignature, controllerMac }: any) => {
//     // fills relevant data
//     // - controller for root object
//     // - refreshes paths for controllers
//     return Promise.resolve();
//   },
//   setName: ({ rootObjectSignature, controllerMac, name }: any) => {
//     // sets name
//     return Promise.resolve();
//   },
//   setConfig: () => {
//     // sets config
//   },

//   // GET METHODS
//   getVersion: ({ rootObjectSignature, controllerMac }: any) => {
//     // gets from cache or fetches based on isStale (and fills cache)
//     return Promise.resolve();
//   },
//   getData: ({ rootObjectSignature, controllerMac }: any) => {
//     // gets data from cache of fetches based on isStale (and fills cache)
//     return Promise.resolve();
//   },
// };

// const Component = () => {
//   const rootObjectActions = useSpectodaStore(state => state.getRootObject("root-id"));
//   rootObjectActions.setName("New Controller Name");
// };

// export const spectodaStoreV2 = createStore<typeof initialData>()(immer(devtools(subscribeWithSelector(createStoreSlice))));

// // For now - v1
// const store = {
//   rootObject: new Spectoda(),
//   data: {
//     controllers: [], // peers
//     mac: "mac",
//   },
//   isDataStale: {
//     controllers: true,
//     mac: false,
//   },
//   get: {
//     name: () => {},
//     config: () => {},
//     version: () => {},
//     mac: () => {},
//   },
//   set: {
//     name: () => {},
//     config: () => {},
//     version: () => {},
//     mac: () => {},
//   },
//   invalidate: {
//     name: () => {},
//     config: () => {},
//     version: () => {},
//     mac: () => {},
//   },
// };

// // v2 version
// const store2 = {
//   rootObject: new Spectoda(),
//   addRootObject: () => {},
//   removeRootObject: () => {},
//   getRootObject: (signature: string) => {
//     const createControllerActions = (mac: string) => {
//       return {
//         get: {
//           name: () => {},
//           config: () => {},
//           version: () => {},
//         },
//         set: {
//           name: () => {},
//           config: () => {},
//           version: () => {},
//         },
//         remove: () => {},
//         markStale: () => {},
//       };
//     };

//     return {
//       getController: (mac: string) => {
//         return createControllerActions(mac);
//       },
//       setName: (name: string) => {
//         // set name
//       },

//     };
//   },

//   staleData: {
//     name: true,
//     config: false,
//     controllers: {
//       ["12:e3:e2:e9"]: {
//         name: false,
//         config: false,
//         version: false,
//       },
//     },
//   },
// };
