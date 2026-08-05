import { describe, expect, it } from "vitest";
import { desktopGoogleAuthUrl, explainFirebaseAuthError } from "./firebaseClient";

describe("Firebase auth errors", () => {
  it("turns internal desktop auth failures into setup guidance", () => {
    expect(explainFirebaseAuthError({ code: "auth/internal-error", message: "Firebase: Error (auth/internal-error)." })).toMatch(/desktop beta build/);
  });

  it("explains disabled Google provider setup", () => {
    expect(explainFirebaseAuthError({ code: "auth/operation-not-allowed" })).toMatch(/Enable the Google provider/);
  });
});

describe("desktop Google auth bridge", () => {
  it("builds a hosted auth URL with opaque state and desktop callback", () => {
    const url = new URL(desktopGoogleAuthUrl("state-123", "http://127.0.0.1:4321/auth/callback", "https://mydb-studio.firebaseapp.com/desktop-auth"));
    expect(url.origin).toBe("https://mydb-studio.firebaseapp.com");
    expect(url.pathname).toBe("/desktop-auth");
    expect(url.searchParams.get("state")).toBe("state-123");
    expect(url.searchParams.get("redirect")).toBe("http://127.0.0.1:4321/auth/callback");
  });

  it("rejects non-HTTPS hosted auth URLs", () => {
    expect(() => desktopGoogleAuthUrl("state-123", "dbstudio://auth/callback", "http://localhost/desktop-auth")).toThrow(/HTTPS/);
  });
});
