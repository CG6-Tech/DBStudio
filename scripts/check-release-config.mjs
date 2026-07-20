import { loadEnv } from "vite";

const configuration = { ...loadEnv("production", process.cwd(), ""), ...process.env };
const required = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_APP_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_FUNCTIONS_REGION",
  "VITE_FIREBASE_HOSTED_AUTH_URL",
  "VITE_UPDATE_ENDPOINT",
];

const missing = required.filter((key) => !configuration[key]?.trim());
if (missing.length) throw new Error(`Missing release configuration: ${missing.join(", ")}`);

for (const key of ["VITE_FIREBASE_HOSTED_AUTH_URL", "VITE_UPDATE_ENDPOINT"]) {
  const value = configuration[key];
  if (!value?.startsWith("https://")) throw new Error(`${key} must use HTTPS.`);
}

const forbidden = Object.keys(configuration).filter((key) => key.startsWith("VITE_") && /(SERVICE_ACCOUNT|PRIVATE_KEY|SIGNING|PASSWORD|SECRET)/i.test(key));
if (forbidden.length) throw new Error(`Privileged values must not use the VITE_ prefix: ${forbidden.join(", ")}`);

console.log("Release configuration verified.");
