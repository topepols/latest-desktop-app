import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// --- UPDATED CONFIGURATION (JDGHUB) ---
// This connects the Desktop app to the same database as the Mobile app.
const firebaseConfig = {
  apiKey: "AIzaSyB8O8xLHhI7Rslo2ukdj2iS0LK8BczyLTU",
  authDomain: "jdghub.firebaseapp.com",
  projectId: "jdghub",
  storageBucket: "jdghub.firebasestorage.app",
  messagingSenderId: "20812849661",
  appId: "1:20812849661:web:6cfb135e6dc2f375213994",
  measurementId: "G-65ERZW6077"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db };