import { describe, expect, it } from "vitest";
import { parseRuntimeConfig } from "./runtimeConfig";

const complete = {
  VITE_FIREBASE_API_KEY: "public-api-key",
  VITE_FIREBASE_AUTH_DOMAIN: "dbstudio-beta.firebaseapp.com",
  VITE_FIREBASE_PROJECT_ID: "dbstudio-beta",
  VITE_FIREBASE_APP_ID: "1:123:web:abc",
  VITE_FIREBASE_STORAGE_BUCKET: "dbstudio-beta.firebasestorage.app",
  VITE_FIREBASE_FUNCTIONS_REGION: "us-central1",
  VITE_FIREBASE_HOSTED_AUTH_URL: "https://dbstudio-beta.web.app/desktop-auth",
  VITE_UPDATE_ENDPOINT: "https://us-central1-dbstudio-beta.cloudfunctions.net/checkUpdate",
};

describe("runtime configuration", () => {
  it("keeps Firebase services disabled when no values are supplied", () => {
    expect(parseRuntimeConfig({})).toBeNull();
  });

  it("rejects partial configuration", () => {
    expect(() => parseRuntimeConfig({ VITE_FIREBASE_API_KEY: "key" })).toThrow(/partially configured/);
  });

  it("requires HTTPS service endpoints in production", () => {
    expect(() => parseRuntimeConfig({ ...complete, VITE_UPDATE_ENDPOINT: "http://localhost/update" }, true)).toThrow(/HTTPS/);
  });

  it("accepts complete public release configuration", () => {
    expect(parseRuntimeConfig(complete, true)?.firebase.projectId).toBe("dbstudio-beta");
  });
});
