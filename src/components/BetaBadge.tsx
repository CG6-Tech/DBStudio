import { APP_VERSION } from "../platform/releaseIdentity";

export function BetaBadge() {
  return <span className="beta-badge" aria-label={`DBStudio beta version ${APP_VERSION}`} title={`DBStudio ${APP_VERSION}`}>Beta</span>;
}
