import { gt, valid } from "semver";

export const SUPPORTED_TARGETS = new Set([
  "darwin-aarch64",
  "darwin-x86_64",
  "windows-x86_64",
  "linux-x86_64",
]);

export interface ReleaseTarget {
  storagePath: string;
  signature: string;
  size: number;
}

export interface ActiveRelease {
  channel: "beta";
  version: string;
  published: boolean;
  mandatory?: boolean;
  minimumSupportedVersion?: string;
  notes?: string;
  publishedAt?: string;
  targets: Record<string, ReleaseTarget>;
}

export interface UpdateRequest {
  channel: string;
  target: string;
  arch: string;
  currentVersion: string;
}

export type ManifestDecision =
  | { kind: "bad-request"; message: string }
  | { kind: "current" }
  | { kind: "available"; release: ActiveRelease; target: ReleaseTarget; targetKey: string };

function validTarget(value: unknown): value is ReleaseTarget {
  if (!value || typeof value !== "object") return false;
  const target = value as Partial<ReleaseTarget>;
  return typeof target.storagePath === "string" && target.storagePath.startsWith("updates/beta/")
    && typeof target.signature === "string" && target.signature.length > 40
    && Number.isSafeInteger(target.size) && Number(target.size) > 0;
}

export function decideManifest(request: UpdateRequest, value: unknown): ManifestDecision {
  if (request.channel !== "beta") return { kind: "bad-request", message: "Unsupported release channel." };
  if (!valid(request.currentVersion)) return { kind: "bad-request", message: "Invalid current version." };
  const targetKey = `${request.target}-${request.arch}`;
  if (!SUPPORTED_TARGETS.has(targetKey)) return { kind: "bad-request", message: "Unsupported platform target." };
  if (!value || typeof value !== "object") return { kind: "current" };
  const release = value as ActiveRelease;
  if (release.channel !== "beta" || release.published !== true || !valid(release.version)) return { kind: "current" };
  if (!gt(release.version, request.currentVersion)) return { kind: "current" };
  const target = release.targets?.[targetKey];
  if (!validTarget(target)) return { kind: "current" };
  return { kind: "available", release, target, targetKey };
}

export function updaterJson(decision: Extract<ManifestDecision, { kind: "available" }>, url: string): Record<string, unknown> {
  const { release, target } = decision;
  return {
    version: release.version,
    notes: typeof release.notes === "string" ? release.notes.slice(0, 12_000) : "DBStudio beta update",
    ...(release.publishedAt ? { pub_date: release.publishedAt } : {}),
    url,
    signature: target.signature,
    channel: "beta",
    mandatory: release.mandatory === true,
    ...(release.minimumSupportedVersion ? { minimumSupportedVersion: release.minimumSupportedVersion } : {}),
    size: target.size,
  };
}
