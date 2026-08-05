import { AlertTriangle } from "lucide-react";
import { BrandLogo } from "./BrandLogo";
import { betaExpiryLabel } from "../platform/betaExpiry";
import { APP_VERSION } from "../platform/releaseIdentity";

export function BetaExpiredScreen() {
  return (
    <main className="beta-expired-page">
      <section>
        <div className="desktop-auth-brand"><BrandLogo /><strong>DBStudio</strong></div>
        <div className="beta-expired-icon"><AlertTriangle size={24} /></div>
        <h1>This DBStudio beta has expired</h1>
        <p>
          DBStudio {APP_VERSION} was available until {betaExpiryLabel()}. Install the latest release to keep using DBStudio.
        </p>
        <small>Your SQL files and workspace data were not changed.</small>
      </section>
    </main>
  );
}
