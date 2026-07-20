import { APP_VERSION, RELEASE_CHANNEL } from "./releaseIdentity";

export interface DiagnosticContext {
  os: string;
  architecture: string;
  desktop: boolean;
  recentErrorCodes?: string[];
}

export interface SafeDiagnostics {
  version: string;
  channel: string;
  os: string;
  architecture: string;
  runtime: "desktop" | "browser-preview";
  recentErrorCodes: string[];
}

const SAFE_CODE = /^[a-z0-9][a-z0-9_.-]{0,39}$/;

function safeLabel(value: string, fallback: string): string {
  const normalized = value.trim().toLowerCase();
  return SAFE_CODE.test(normalized) ? normalized : fallback;
}

export function buildSafeDiagnostics(context: DiagnosticContext): SafeDiagnostics {
  return {
    version: APP_VERSION,
    channel: RELEASE_CHANNEL,
    os: safeLabel(context.os, "unknown"),
    architecture: safeLabel(context.architecture, "unknown"),
    runtime: context.desktop ? "desktop" : "browser-preview",
    recentErrorCodes: (context.recentErrorCodes ?? []).slice(-20).map((code) => safeLabel(code, "unknown")),
  };
}
