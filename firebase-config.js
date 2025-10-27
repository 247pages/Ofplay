import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.1/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  setPersistence,
  browserLocalPersistence,
  onAuthStateChanged,
  signInWithPopup,
  signOut
} from "https://www.gstatic.com/firebasejs/10.11.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  collection,
  addDoc,
  query,
  where,
  getDocs,
  deleteDoc,
  serverTimestamp,
  writeBatch,
  updateDoc,
  arrayUnion,
  arrayRemove,
  increment // ADD THIS IMPORT
} from "https://www.gstatic.com/firebasejs/10.11.1/firebase-firestore.js";
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAGw5Y5CnJhrGjTqEAF2FuLGx3HPMUBqBA",
  authDomain: "mugicly.firebaseapp.com",
  projectId: "mugicly",
  storageBucket: "mugicly.firebasestorage.app",
  messagingSenderId: "584733177648",
  appId: "1:584733177648:web:b56af6836e1acc04597af5",
  measurementId: "G-GLYN6Q1G12"
};
// Initialize Firebase
// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

export {
  auth,
  provider,
  db,
  doc,
  setDoc,
  getDoc,
  collection,
  addDoc,
  query,
  where,
  getDocs,
  deleteDoc,
  serverTimestamp,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  writeBatch,
  updateDoc,
  arrayUnion,
  arrayRemove,
  increment // ADD THIS EXPORT
};