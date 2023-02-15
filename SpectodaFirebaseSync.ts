import { Database, get, onValue, ref, update } from "firebase/database";
import { SpectodaEvent } from "../../hooks/useSpectodaDevice";
import { set as setObj } from "lodash";
import { get as getObj } from "lodash";
import { database } from "./firebase";

// Production home, cant be accessed without auth
// const getHomePrefix = (homeName: string) => `/home/${homeName}`;

// !Test home, no auth used
const getHomePrefix = (homeName: string) => `/t_home/${homeName}`;

const offsetRef = ref(database, ".info/serverTimeOffset");

class LocalFirebaseDataStore {
  #data: any;

  constructor() {
    this.#data = {};
  }

  get(path: string) {
    this.getLocalData();
    return getObj(this.#data, path.replaceAll("/", "."));
  }

  set(path: string, val: any) {
    setObj(this.#data, path.replaceAll("/", "."), val);
    this.saveLocalData();
  }

  saveLocalData() {
    localStorage.setItem("spectoda", JSON.stringify(this.#data));
  }

  getLocalData() {
    this.#data = JSON.parse(localStorage.getItem("spectoda") || "{}");
  }
}

export const localFirebaseDataStore = new LocalFirebaseDataStore();
// @ts-ignore
window.localFirebaseDataStore = localFirebaseDataStore;

class SpectodaFirebaseSync {
  #database: Database;
  #homePrefix: string;
  #timeOffset: number;

  constructor(homeName: string) {
    this.#database = database;
    this.#homePrefix = getHomePrefix(homeName);
    this.#timeOffset = 100;

    onValue(offsetRef, snap => {
      const offset = snap.val();
      this.#timeOffset = offset;
    });
  }

  emitEvent(event: SpectodaEvent) {
    const dbPath = `${this.#homePrefix}/events/${event.id}/${event.label}`;
    const dbRef = ref(this.#database, dbPath);

    const eventData = {
      value: event.value,
      timestamp: event.timestamp + this.#timeOffset,
      meta: event.meta,
    };

    localFirebaseDataStore.set(dbPath, eventData);
    return update(dbRef, eventData);
  }

  onEvent(label: string, device_id: number, callback: (data: any) => void) {
    const dbPath = `${this.#homePrefix}/events/${device_id}/${label}`;
    const dbRef = ref(this.#database, dbPath);

    let t = onValue(dbRef, snapshot => {
      const data = snapshot.val() as SpectodaEvent;
      if (localFirebaseDataStore.get(dbPath)?.timestamp < data.timestamp) {
        // this execs when the event is emitted externally
        callback(data);
        localFirebaseDataStore.set(dbPath, data);
      } else {
        // this execs when the event is emitted from this app
      }
    });

    return () => t();
  }

  getLatestSavedEvent(label: string, device_id: number) {
    const dbPath = `${this.#homePrefix}/events/${device_id}/${label}`;
    // const dbRef = ref(this.#database, dbPath);

    return localFirebaseDataStore.get(dbPath);
  }
}

// @ts-ignore

const spectodaFirebaseSync = new SpectodaFirebaseSync("lukas");
// @ts-ignore
window.spectodaFirebaseSync = spectodaFirebaseSync;

export { spectodaFirebaseSync };
