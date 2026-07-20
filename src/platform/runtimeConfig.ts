export interface RuntimeConfig {
  firebase: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    appId: string;
    storageBucket: string;
    functionsRegion: string;
    hostedAuthUrl: string;
  };
  updateEndpoint: string;
}

type PublicEnvironment = Record<string, string | boolean | undefined>;

const keys = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_APP_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_FUNCTIONS_REGION",
  "VITE_FIREBASE_HOSTED_AUTH_URL",
  "VITE_UPDATE_ENDPOINT",
] as const;

export function parseRuntimeConfig(environment: PublicEnvironment, production = false): RuntimeConfig | null {
  const values = Object.fromEntries(keys.map((key) => [key, String(environment[key] ?? "").trim()])) as Record<(typeof keys)[number], string>;
  const configured = keys.filter((key) => values[key]);
  if (configured.length === 0) return null;
  const missing = keys.filter((key) => !values[key]);
  if (missing.length) throw new Error(`Firebase beta services are partially configured: ${missing.join(", ")}`);
  if (production) {
    for (const key of ["VITE_FIREBASE_HOSTED_AUTH_URL", "VITE_UPDATE_ENDPOINT"] as const) {
      if (!values[key].startsWith("https://")) throw new Error(`${key} must use HTTPS in production.`);
    }
  }
  return {
    firebase: {
      apiKey: values.VITE_FIREBASE_API_KEY,
      authDomain: values.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: values.VITE_FIREBASE_PROJECT_ID,
      appId: values.VITE_FIREBASE_APP_ID,
      storageBucket: values.VITE_FIREBASE_STORAGE_BUCKET,
      functionsRegion: values.VITE_FIREBASE_FUNCTIONS_REGION,
      hostedAuthUrl: values.VITE_FIREBASE_HOSTED_AUTH_URL,
    },
    updateEndpoint: values.VITE_UPDATE_ENDPOINT,
  };
}

export const runtimeConfig = parseRuntimeConfig(import.meta.env, import.meta.env.PROD);
