import { Database, get, onValue, ref, update } from "firebase/database";
import { SpectodaEvent } from "../../hooks/useSpectodaDevice";
import { database } from "./firebase";

// Production home, cant be accessed without auth
// const getHomePrefix = (homeName: string) => `/home/${homeName}`;

// !Test home, no auth used
const getHomePrefix = (homeName: string) => `/t_home/${homeName}`;

const offsetRef = ref(database, ".info/serverTimeOffset");

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
    };

    return update(dbRef, eventData);
  }

  onEvent(label: string, device_id: number, callback: (data: any) => void) {
    const dbPath = `${this.#homePrefix}/events/${device_id}/${label}`;
    const dbRef = ref(this.#database, dbPath);

    return onValue(dbRef, snapshot => {
      const data = snapshot.val() as SpectodaEvent;
      callback(data);
    });
  }

  getLatestSavedEvent(label: string, device_id: number) {}

  // TODO: Must be somehow synchronous to work with useSyncExternalStore
  // getEvent(label: string, device_id: number) {
  //   const dbPath = `${this.#homePrefix}/events/${device_id}/${label}`;
  //   const dbRef = ref(this.#database, dbPath);

  //   return get(dbRef).then(snapshot => {
  //     const data = snapshot.val() as SpectodaEvent;
  //     return data;
  //   });
  // }
}

// @ts-ignore
window.SpectodaFirebaseSync = new SpectodaFirebaseSync("lukas");

export { SpectodaFirebaseSync };
