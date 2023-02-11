import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

// Your web app's Firebase configuration
export const firebaseConfig = {
  apiKey: "AIzaSyCnAfdv909gThutnCKwsoiNaSrHbqRUJv0",
  authDomain: "tangle-49512.firebaseapp.com",
  databaseURL: "https://tangle-49512-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "tangle-49512",
  storageBucket: "tangle-49512.appspot.com",
  messagingSenderId: "707203240184",
  appId: "1:707203240184:web:d634fdd4b4c5fa2379eb0d",
  measurementId: "G-EJCQSBZ6YJ",
};

const app = initializeApp(firebaseConfig);
export const database = getDatabase(app);
