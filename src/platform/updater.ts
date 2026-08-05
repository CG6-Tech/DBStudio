import type { DownloadEvent, Update } from "@tauri-apps/plugin-updater";
import { desktopAvailable } from "./desktop";
import { APP_VERSION } from "./releaseIdentity";
import { evaluateUpdate, type UpdateMetadata } from "./updatePolicy";

const CHECK_TIMEOUT_MS = 15_000;
const DOWNLOAD_TIMEOUT_MS = 15 * 60_000;

export interface AvailableUpdate {
  version: string;
  currentVersion: string;
  notes: string;
  publishedAt?: string;
  size?: number;
  mandatory: boolean;
}

export type AppUpdateCheck =
  | { kind: "unavailable" }
  | { kind: "current" }
  | { kind: "ignored" }
  | { kind: "available"; update: AvailableUpdate };

export type UpdateProgress = { downloaded: number; total?: number; percent?: number };

interface NativeUpdate {
  version: string;
  currentVersion: string;
  body?: string;
  date?: string;
  rawJson: Record<string, unknown>;
  downloadAndInstall: Update["downloadAndInstall"];
  close: Update["close"];
}

export interface UpdaterBoundary {
  check: (options: { timeout: number; allowDowngrades: boolean }) => Promise<NativeUpdate | null>;
  relaunch: () => Promise<void>;
  exit: (code?: number) => Promise<void>;
}

let pendingUpdate: NativeUpdate | null = null;

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalSize(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function metadataFor(update: NativeUpdate): UpdateMetadata {
  return {
    version: update.version,
    channel: optionalString(update.rawJson.channel) ?? "beta",
    mandatory: optionalBoolean(update.rawJson.mandatory),
    minimumSupportedVersion: optionalString(update.rawJson.minimumSupportedVersion),
  };
}

export function explainUpdateError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("valid release JSON") || message.includes("release JSON")) {
    return "Beta updates are not published yet. You can keep using this build and install the next beta manually when it is available.";
  }
  if (message.includes("Could not fetch") || message.includes("fetch")) {
    return "DBStudio could not reach the beta update service. Check the release endpoint and your network, then retry.";
  }
  if (message.includes("signature")) {
    return "The update signature could not be verified. Rebuild the updater artifact with the beta signing key.";
  }
  return message || "The update could not be completed. Your current installation was not changed.";
}

async function nativeBoundary(): Promise<UpdaterBoundary> {
  const [{ check }, { relaunch, exit }] = await Promise.all([
    import("@tauri-apps/plugin-updater"),
    import("@tauri-apps/plugin-process"),
  ]);
  return { check, relaunch, exit };
}

export async function checkForAppUpdate(boundary?: UpdaterBoundary): Promise<AppUpdateCheck> {
  if (!boundary && !desktopAvailable()) return { kind: "unavailable" };
  const native = boundary ?? await nativeBoundary();
  if (pendingUpdate) {
    await pendingUpdate.close().catch(() => undefined);
    pendingUpdate = null;
  }
  let update: NativeUpdate | null;
  try {
    update = await native.check({ timeout: CHECK_TIMEOUT_MS, allowDowngrades: false });
  } catch (error) {
    throw new Error(explainUpdateError(error));
  }
  if (!update) return { kind: "current" };
  const decision = evaluateUpdate(APP_VERSION, metadataFor(update));
  if (decision.kind !== "available") {
    await update.close().catch(() => undefined);
    return { kind: "ignored" };
  }
  pendingUpdate = update;
  return {
    kind: "available",
    update: {
      version: update.version,
      currentVersion: update.currentVersion,
      notes: update.body?.trim() || "This update includes improvements and fixes.",
      publishedAt: update.date,
      size: optionalSize(update.rawJson.size),
      mandatory: decision.mandatory,
    },
  };
}

export async function discardPendingUpdate(): Promise<void> {
  const update = pendingUpdate;
  pendingUpdate = null;
  if (update) await update.close().catch(() => undefined);
}

export async function installPendingUpdate(
  onProgress: (progress: UpdateProgress) => void,
  boundary?: Pick<UpdaterBoundary, "relaunch">,
): Promise<void> {
  const update = pendingUpdate;
  if (!update) throw new Error("The update is no longer available. Check again and retry.");
  let downloaded = 0;
  let total: number | undefined;
  const report = (event: DownloadEvent) => {
    if (event.event === "Started") total = event.data.contentLength;
    if (event.event === "Progress") downloaded += event.data.chunkLength;
    if (event.event === "Finished" && total !== undefined) downloaded = total;
    onProgress({ downloaded, total, percent: total ? Math.min(100, Math.round((downloaded / total) * 100)) : undefined });
  };
  await update.downloadAndInstall(report, { timeout: DOWNLOAD_TIMEOUT_MS });
  pendingUpdate = null;
  const process = boundary ?? await nativeBoundary();
  await process.relaunch();
}

export async function exitForMandatoryUpdate(boundary?: Pick<UpdaterBoundary, "exit">): Promise<void> {
  const process = boundary ?? await nativeBoundary();
  await process.exit(0);
}
