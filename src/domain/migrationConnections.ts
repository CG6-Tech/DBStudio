import { invoke, isTauri } from "@tauri-apps/api/core";
import type { SqlDialect } from "./types";

export type MigrationEnvironment = "development" | "staging" | "production" | "custom";

export interface MigrationConnectionProfile {
  id: string;
  name: string;
  environment: MigrationEnvironment;
  dialect: SqlDialect;
  host: string;
  port: number;
  database: string;
  username: string;
  tls: boolean;
}

export interface IntrospectedDatabase {
  dialect: SqlDialect;
  source: string;
  engineVersion: string;
  sourceLabel: string;
}

const storageKey = "dbstudio.migration.connectionProfiles.v1";

export function loadConnectionProfiles(): MigrationConnectionProfile[] {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) ?? "[]") as unknown;
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is MigrationConnectionProfile => Boolean(item && typeof item === "object" && "id" in item && "dialect" in item));
  } catch { return []; }
}

export async function saveConnectionProfile(profile: MigrationConnectionProfile, password?: string): Promise<void> {
  const profiles = loadConnectionProfiles();
  const next = [...profiles.filter((item) => item.id !== profile.id), profile].sort((left, right) => left.name.localeCompare(right.name));
  localStorage.setItem(storageKey, JSON.stringify(next));
  if (password && isTauri()) await invoke("save_connection_secret", { profileId: profile.id, password });
}

export async function deleteConnectionProfile(profileId: string): Promise<void> {
  localStorage.setItem(storageKey, JSON.stringify(loadConnectionProfiles().filter((profile) => profile.id !== profileId)));
  if (isTauri()) await invoke("delete_connection_secret", { profileId });
}

export async function introspectDatabase(profile: MigrationConnectionProfile, password?: string): Promise<IntrospectedDatabase> {
  if (!isTauri()) throw new Error("Live database comparison is available in the DBStudio macOS app.");
  return invoke<IntrospectedDatabase>("introspect_database", { profile, password: password || null });
}
