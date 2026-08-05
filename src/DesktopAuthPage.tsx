import { useMemo, useState } from "react";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { BrandLogo } from "./components/BrandLogo";
import { desktopAuth } from "./platform/firebaseClient";

function validLoopbackRedirect(value: string | null): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" && url.hostname === "127.0.0.1" && url.pathname === "/auth/callback";
  } catch {
    return false;
  }
}

function postCredentialToDesktop(redirect: string, payload: { state: string; idToken?: string | null; accessToken?: string | null }) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = redirect;
  form.target = "_self";
  form.style.display = "none";

  for (const [name, value] of Object.entries(payload)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value ?? "";
    form.appendChild(input);
  }

  document.body.appendChild(form);
  form.submit();
}

export function DesktopAuthPage() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const state = params.get("state") ?? "";
  const redirect = params.get("redirect");
  const [phase, setPhase] = useState<"ready" | "working" | "done" | "failed">("ready");
  const [error, setError] = useState<string | null>(null);
  const valid = Boolean(state) && validLoopbackRedirect(redirect);

  const signIn = async () => {
    if (!valid || !redirect) return;
    setPhase("working");
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const result = await signInWithPopup(desktopAuth(), provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (!credential?.idToken && !credential?.accessToken) throw new Error("Google did not return a desktop credential.");
      postCredentialToDesktop(redirect, { state, idToken: credential.idToken, accessToken: credential.accessToken });
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Google sign-in could not be completed.";
      setError(message === "Load failed" || message === "Failed to fetch" ? "DBStudio could not receive the browser sign-in callback. Keep DBStudio open, start sign-in again, and allow the browser to connect to the local callback if prompted." : message);
      setPhase("failed");
    }
  };

  return (
    <main className="desktop-auth-page">
      <section>
        <div className="desktop-auth-brand"><BrandLogo /><strong>DBStudio</strong></div>
        <h1>Sign in to DBStudio</h1>
        {!valid && <p className="desktop-auth-error">This sign-in link is invalid or expired. Start sign-in again from DBStudio.</p>}
        {valid && phase === "ready" && <><p>Continue with Google in your browser. DBStudio will finish sign-in automatically.</p><button onClick={() => void signIn()}>Continue with Google</button></>}
        {phase === "working" && <p>Completing Google sign-in…</p>}
        {phase === "done" && <p>Sign-in complete. You can return to DBStudio.</p>}
        {phase === "failed" && <><p className="desktop-auth-error">{error}</p><button onClick={() => void signIn()}>Try again</button></>}
      </section>
    </main>
  );
}
