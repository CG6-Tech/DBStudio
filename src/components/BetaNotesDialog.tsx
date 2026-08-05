import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import { betaExpiryLabel } from "../platform/betaExpiry";
import { APP_VERSION } from "../platform/releaseIdentity";

interface BetaNotesDialogProps {
  onClose: () => void;
}

export function BetaNotesDialog({ onClose }: BetaNotesDialogProps) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="release-notes-dialog" role="dialog" aria-modal="true" aria-labelledby="beta-notes-title">
        <header>
          <div>
            <span><AlertTriangle size={18} /></span>
            <div>
              <h2 id="beta-notes-title">DBStudio beta notes</h2>
              <p>Release {APP_VERSION}</p>
            </div>
          </div>
          <button aria-label="Close beta notes" onClick={onClose}><X size={17} /></button>
        </header>
        <div className="release-notes-body">
          <article>
            <CheckCircle2 size={16} />
            <div><strong>Supported now</strong><p>Open PostgreSQL or MySQL schema SQL files/folders, inspect tables, relationships, routines, and migration plans.</p></div>
          </article>
          <article>
            <CheckCircle2 size={16} />
            <div><strong>Private feedback</strong><p>Use the Feedback button or profile menu to send beta feedback directly from the app.</p></div>
          </article>
          <article>
            <AlertTriangle size={16} />
            <div><strong>Beta limitation</strong><p>Review generated SQL before applying it to any database. DBStudio does not modify production databases automatically.</p></div>
          </article>
          <article>
            <AlertTriangle size={16} />
            <div><strong>Expiry</strong><p>This beta build runs until {betaExpiryLabel()}. Install the latest release after that date.</p></div>
          </article>
        </div>
      </section>
    </div>
  );
}
