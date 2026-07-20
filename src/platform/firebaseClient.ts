import { getApp, getApps, initializeApp } from "firebase/app";
import { browserLocalPersistence, getAuth, setPersistence, signInAnonymously, type User } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDBBTpuBUhD6THIwr52N7_TpUEBwvV_XEU",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "mydb-studio.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "mydb-studio",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:37334176472:web:c7cfb8ede338b1e824fdad",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "mydb-studio.firebasestorage.app",
};

function app() { return getApps().length ? getApp() : initializeApp(config); }

export const feedbackFirestore = () => getFirestore(app());

export async function anonymousFeedbackUser(): Promise<User> {
  const auth = getAuth(app());
  await setPersistence(auth, browserLocalPersistence);
  if (auth.currentUser) return auth.currentUser;
  return (await signInAnonymously(auth)).user;
}
