// SULLANA CONTEXT - Configuración de Firebase
// Pega aquí la configuración que te entrega Firebase Console.
// La configuración web de Firebase NO debe confundirse con una contraseña.

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "TU_API_KEY",
  authDomain: "TU_PROYECTO.firebaseapp.com",
  projectId: "TU_PROJECT_ID",
  storageBucket: "TU_PROYECTO.firebasestorage.app",
  messagingSenderId: "TU_MESSAGING_SENDER_ID",
  appId: "TU_APP_ID"
};

const firebaseConfigCompleta = Object.values(firebaseConfig).every(
  value => value && !String(value).startsWith("TU_")
);

let app = null;
let db = null;
let storage = null;

if (firebaseConfigCompleta) {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  storage = getStorage(app);
}

export { app, db, storage, firebaseConfig, firebaseConfigCompleta };
