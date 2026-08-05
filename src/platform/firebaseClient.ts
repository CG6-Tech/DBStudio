import { getApp, getApps, initializeApp } from "firebase/app";
import { browserLocalPersistence, getAuth, GoogleAuthProvider, onAuthStateChanged, setPersistence, signInAnonymously, signInWithCredential, signInWithPopup, signOut, type Unsubscribe, type User } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { runtimeConfig, type RuntimeConfig } from "./runtimeConfig";

// Baked-in public identity of the reference `mydb-studio` project. These are the
// values Firebase treats as non-secret client identifiers, so shipping them lets a
// fresh `npm run dev` clone connect to the beta backend without a local `.env`.
// When `VITE_FIREBASE_*` env is supplied it is validated by runtimeConfig (all-or-
// nothing, HTTPS in production) and takes precedence over these defaults.
const DEFAULT_FIREBASE: RuntimeConfig["firebase"] = {
  apiKey: "AIzaSyDBBTpuBUhD6THIwr52N7_TpUEBwvV_XEU",
  authDomain: "mydb-studio.firebaseapp.com",
  projectId: "mydb-studio",
  appId: "1:37334176472:web:c7cfb8ede338b1e824fdad",
  storageBucket: "mydb-studio.firebasestorage.app",
  functionsRegion: "us-central1",
  hostedAuthUrl: "https://mydb-studio.firebaseapp.com/desktop-auth",
};

const firebase = runtimeConfig?.firebase ?? DEFAULT_FIREBASE;

const config = {
  apiKey: firebase.apiKey,
  authDomain: firebase.authDomain,
  projectId: firebase.projectId,
  appId: firebase.appId,
  storageBucket: firebase.storageBucket,
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

export function desktopGoogleAuthUrl(state: string, callbackUrl = "dbstudio://auth/callback", hostedAuthUrl = firebase.hostedAuthUrl): string {
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
