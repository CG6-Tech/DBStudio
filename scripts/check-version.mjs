import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = async (path) => readFile(new URL(path, root), "utf8");
const packageJson = JSON.parse(await read("package.json"));
const tauriConfig = JSON.parse(await read("src-tauri/tauri.conf.json"));
const cargoToml = await read("src-tauri/Cargo.toml");
const cargoVersion = cargoToml.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
const versions = [packageJson.version, tauriConfig.version, cargoVersion];

if (versions.some((version) => typeof version !== "string") || new Set(versions).size !== 1) {
  throw new Error(`Release versions must match (npm=${versions[0]}, Tauri=${versions[1]}, Cargo=${versions[2] ?? "missing"}).`);
}

if (!/^\d+\.\d+\.\d+-beta\.\d+$/.test(versions[0])) {
  throw new Error(`Beta releases require a version like 0.1.0-beta.1; received ${versions[0]}.`);
}

console.log(`Release version verified: ${versions[0]}`);
