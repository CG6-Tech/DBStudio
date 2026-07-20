export const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const UPDATE_DEFERRAL_MS = 24 * 60 * 60 * 1000;

interface VersionParts { core: number[]; prerelease: Array<number | string>; }

function parseVersion(input: string): VersionParts | null {
  const match = input.trim().replace(/^v/, "").match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
  if (!match) return null;
  return { core: [Number(match[1]), Number(match[2]), Number(match[3])], prerelease: match[4]?.split(".").map((part) => /^\d+$/.test(part) ? Number(part) : part) ?? [] };
}

export function compareVersions(left: string, right: string): number | null {
  const a = parseVersion(left); const b = parseVersion(right);
  if (!a || !b) return null;
  for (let index = 0; index < 3; index += 1) if (a.core[index] !== b.core[index]) return a.core[index] < b.core[index] ? -1 : 1;
  if (!a.prerelease.length || !b.prerelease.length) return a.prerelease.length === b.prerelease.length ? 0 : a.prerelease.length ? -1 : 1;
  const length = Math.max(a.prerelease.length, b.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const av = a.prerelease[index]; const bv = b.prerelease[index];
    if (av === undefined || bv === undefined) return av === bv ? 0 : av === undefined ? -1 : 1;
    if (av === bv) continue;
    if (typeof av === "number" && typeof bv === "string") return -1;
    if (typeof av === "string" && typeof bv === "number") return 1;
    return av < bv ? -1 : 1;
  }
  return 0;
}

export interface UpdateMetadata {
  version: string;
  channel: string;
  mandatory?: boolean;
  minimumSupportedVersion?: string;
}

export type UpdateDecision = { kind: "invalid" | "current" | "wrong-channel" | "downgrade" } | { kind: "available"; mandatory: boolean };

export function evaluateUpdate(currentVersion: string, metadata: UpdateMetadata): UpdateDecision {
  if (metadata.channel !== "beta") return { kind: "wrong-channel" };
  const order = compareVersions(currentVersion, metadata.version);
  if (order === null) return { kind: "invalid" };
  if (order === 0) return { kind: "current" };
  if (order > 0) return { kind: "downgrade" };
  let mandatory = metadata.mandatory === true;
  if (metadata.minimumSupportedVersion) {
    const supported = compareVersions(currentVersion, metadata.minimumSupportedVersion);
    if (supported === null) return { kind: "invalid" };
    mandatory ||= supported < 0;
  }
  return { kind: "available", mandatory };
}

export function shouldCheckForUpdate(now: number, lastCheckedAt: number | null, manual = false): boolean {
  return manual || lastCheckedAt === null || now - lastCheckedAt >= UPDATE_CHECK_INTERVAL_MS;
}

export function isUpdateDeferred(version: string, now: number, deferred: { version: string; at: number } | null, manual = false): boolean {
  return !manual && deferred?.version === version && now - deferred.at < UPDATE_DEFERRAL_MS;
}
