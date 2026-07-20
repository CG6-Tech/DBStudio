export const APP_VERSION = __APP_VERSION__;
export const RELEASE_CHANNEL = APP_VERSION.match(/-([0-9A-Za-z-]+)/)?.[1] ?? "stable";
export const IS_BETA = RELEASE_CHANNEL === "beta";
