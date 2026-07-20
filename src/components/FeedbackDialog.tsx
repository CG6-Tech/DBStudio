import { useMemo, useState } from "react";
import { MessageSquareText, X } from "lucide-react";
import { buildSafeDiagnostics } from "../platform/diagnostics";
import { submitFeedback, validateFeedback, type FeedbackCategory, type FeedbackSubmission } from "../platform/feedback";
import { desktopAvailable } from "../platform/desktop";

interface FeedbackDialogProps { onClose: () => void }

export function FeedbackDialog({ onClose }: FeedbackDialogProps) {
  const [category, setCategory] = useState<FeedbackCategory>("bug");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [includeDiagnostics, setIncludeDiagnostics] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const diagnostics = useMemo(() => buildSafeDiagnostics({ os: navigator.platform || "unknown", architecture: "unknown", desktop: desktopAvailable() }), []);
  const submission = { category, message, contactEmail: email || undefined, diagnostics: includeDiagnostics ? diagnostics : undefined } satisfies FeedbackSubmission;

  const send = async () => {
    const validation = validateFeedback(submission);
    if (validation) return setError(validation);
    setSending(true); setError(null);
    try { await submitFeedback(submission); setSent(true); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Feedback could not be sent."); }
    finally { setSending(false); }
  };

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !sending) onClose(); }}>
    <section className="feedback-dialog" role="dialog" aria-modal="true" aria-labelledby="feedback-title">
      <header><span><MessageSquareText size={18} /></span><div><h2 id="feedback-title">Send feedback</h2><p>Shared privately with the DBStudio team.</p></div><button className="icon-button" aria-label="Close" onClick={onClose}><X size={17} /></button></header>
      {sent ? <div className="feedback-success"><MessageSquareText size={28} /><strong>Thank you for the feedback.</strong><p>Your response was sent privately.</p><button className="primary-button" onClick={onClose}>Done</button></div> : <>
        <div className="feedback-fields">
          <label><span>Category</span><select value={category} onChange={(event) => setCategory(event.target.value as FeedbackCategory)}><option value="bug">Bug</option><option value="idea">Feature idea</option><option value="question">Question</option><option value="other">Other</option></select></label>
          <label><span>Message</span><textarea autoFocus maxLength={4000} rows={7} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Tell us what happened or what you would like to see…"/><small>{message.length} / 4000</small></label>
          <label><span>Contact email <em>optional</em></span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com"/></label>
          <label className="feedback-consent"><input type="checkbox" checked={includeDiagnostics} onChange={(event) => setIncludeDiagnostics(event.target.checked)}/><span>Include safe diagnostics</span></label>
          {includeDiagnostics && <details><summary>Preview diagnostics</summary><pre>{JSON.stringify(diagnostics, null, 2)}</pre></details>}
          <p className="feedback-privacy">DBStudio never includes your SQL, file paths, database details, passwords, or tokens.</p>
          {error && <p className="feedback-error" role="alert">{error}</p>}
        </div>
        <footer><button className="secondary-button" disabled={sending} onClick={onClose}>Cancel</button><button className="primary-button" disabled={sending} onClick={() => void send()}>{sending ? "Sending…" : "Send feedback"}</button></footer>
      </>}
    </section>
  </div>;
}
