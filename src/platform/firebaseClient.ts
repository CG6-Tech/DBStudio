import { getApp, getApps, initializeApp } from "firebase/app";
import { browserLocalPersistence, getAuth, GoogleAuthProvider, onAuthStateChanged, setPersistence, signInAnonymously, signInWithCredential, signInWithPopup, signOut, type Unsubscribe, type User } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const DEFAULT_HOSTED_AUTH_URL = "https://mydb-studio.firebaseapp.com/desktop-auth";

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDBBTpuBUhD6THIwr52N7_TpUEBwvV_XEU",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "mydb-studio.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "mydb-studio",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:37334176472:web:c7cfb8ede338b1e824fdad",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "mydb-studio.firebasestorage.app",
};

function app() { return getApps().length ? getApp() : initializeApp(config); }
function auth() { return getAuth(app()); }

export const feedbackFirestore = () => getFirestore(app());
export const desktopAuth = auth;

export function observeFirebaseUser(listener: (user: User | null) => void): Unsubscribe {
  return onAuthStateChanged(auth(), listener);
}

export function createDesktopAuthState(): string {
  return crypto.randomUUID();
}

export function desktopGoogleAuthUrl(state: string, callbackUrl = "dbstudio://auth/callback", hostedAuthUrl = import.meta.env.VITE_FIREBASE_HOSTED_AUTH_URL || DEFAULT_HOSTED_AUTH_URL): string {
  const trimmed = hostedAuthUrl.trim();
  if (!trimmed) throw new Error("Google desktop sign-in needs a hosted auth bridge URL.");
  const url = new URL(trimmed);
  if (url.protocol !== "https:") throw new Error("Google desktop sign-in needs an HTTPS hosted auth bridge URL.");
  url.searchParams.set("state", state);
  url.searchParams.set("redirect", callbackUrl);
  return url.toString();
}

export function explainFirebaseAuthError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "";
  if (code === "auth/popup-closed-by-user") return "Sign in was cancelled.";
  if (code === "auth/popup-blocked") return "DBStudio could not open the Google sign-in window. Allow popups for this app and try again.";
  if (code === "auth/unauthorized-domain") return "Google sign-in is not enabled for this desktop app origin yet. Add the DBStudio desktop origin to Firebase Auth authorized domains.";
  if (code === "auth/operation-not-allowed") return "Google sign-in is not enabled in Firebase Auth yet. Enable the Google provider for the mydb-studio project.";
  if (code === "auth/internal-error" || message.includes("auth/internal-error")) return "Google sign-in is not ready for this desktop beta build yet. Check the Firebase Google provider and authorized domains, then try again.";
  return message || "Sign in could not be completed.";
}

export async function anonymousFeedbackUser(): Promise<User> {
  const firebaseAuth = auth();
  await setPersistence(firebaseAuth, browserLocalPersistence);
  if (firebaseAuth.currentUser) return firebaseAuth.currentUser;
  return (await signInAnonymously(firebaseAuth)).user;
}

export async function signInWithGoogleAccount(): Promise<User> {
  const firebaseAuth = auth();
  await setPersistence(firebaseAuth, browserLocalPersistence);
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try {
    return (await signInWithPopup(firebaseAuth, provider)).user;
  } catch (error) {
    throw new Error(explainFirebaseAuthError(error));
  }
}

export async function signInWithGoogleDesktopCredential(idToken?: string | null, accessToken?: string | null): Promise<User> {
  if (!idToken && !accessToken) throw new Error("Google desktop sign-in did not return a usable credential.");
  const firebaseAuth = auth();
  await setPersistence(firebaseAuth, browserLocalPersistence);
  const credential = GoogleAuthProvider.credential(idToken ?? null, accessToken ?? undefined);
  return (await signInWithCredential(firebaseAuth, credential)).user;
}

export async function signOutFirebaseUser(): Promise<void> {
  await signOut(auth());
}
