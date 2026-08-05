import { IS_BETA } from "./releaseIdentity";

export const BETA_EXPIRES_AT = new Date(2026, 8, 1, 0, 0, 0, 0);

export function isBetaExpired(now = new Date()): boolean {
  return IS_BETA && now.getTime() >= BETA_EXPIRES_AT.getTime();
}

export function betaExpiryLabel(): string {
  return "September 1, 2026";
}
