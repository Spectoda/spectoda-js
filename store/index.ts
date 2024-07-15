import { createStore, StateCreator } from "zustand/vanilla";
import { SpectodaConnectionMethods, SpectodaStoreState } from "./types";

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
 *
 *
 *
 */

const state = {
  controller: {
    configString: "ahoj",
    fwVersion: "ahoj",
    mac: "ahoj",
    name: "ahoj",
  },
} satisfies SpectodaStoreState;

const methods: (...params: Parameters<StateCreator<SpectodaStore>>) => SpectodaConnectionMethods = (set, get) => {
  return {
    loadData: async () => {
      set({
        controller: {
          ...get().controller,
          fwVersion: "0.10-12",
        },
      });
      return;
    },
  };
};

type SpectodaStore = SpectodaStoreState & SpectodaConnectionMethods;
const spectodaStore = createStore<SpectodaStore>()((set, get, rest) => ({
  ...methods(set, get, rest),
  ...state,
}));

export { spectodaStore };
