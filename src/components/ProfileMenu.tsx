import { useEffect, useMemo, useRef, useState } from "react";
import { ClipboardList, FileText, LogIn, LogOut, MessageSquareText, UserRound } from "lucide-react";
import type { User } from "firebase/auth";

interface ProfileMenuProps {
  user: User | null;
  signingIn: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
  onFeedback: () => void;
  onBetaNotes: () => void;
  onCopyDiagnostics: () => void;
}

function initials(user: User): string {
  const source = user.displayName || user.email || "";
  const parts = source.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return user.isAnonymous ? "A" : "U";
}

function accountLabel(user: User | null): string {
  if (!user) return "Signed out";
  if (user.isAnonymous) return "Anonymous session";
  return user.displayName || user.email || "Signed in";
}

export function ProfileMenu({ user, signingIn, onSignIn, onSignOut, onFeedback, onBetaNotes, onCopyDiagnostics }: ProfileMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const label = accountLabel(user);
  const badge = useMemo(() => user ? initials(user) : null, [user]);
  const title = user?.isAnonymous ? "Anonymous session" : user ? "Account" : "Sign in";

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false); };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const signIn = () => {
    setOpen(false);
    onSignIn();
  };
  const signOut = () => {
    setOpen(false);
    onSignOut();
  };
  const action = (callback: () => void) => {
    setOpen(false);
    callback();
  };

  return (
    <div className="profile-menu" ref={ref}>
      <button className={`profile-button${user?.isAnonymous ? " anonymous" : ""}`} aria-label={title} aria-haspopup="menu" aria-expanded={open} title={title} onClick={() => setOpen((value) => !value)}>
        {badge ? <span className="profile-avatar">{badge}</span> : <UserRound size={15} />}
        {user?.isAnonymous && <span className="profile-status-dot" aria-hidden="true" />}
      </button>
      {open && <div className="profile-popover" role="menu" aria-label="Profile">
        <div className="profile-card">
          <span className={`profile-avatar large${user?.isAnonymous ? " anonymous" : ""}`}>{badge ?? <UserRound size={17} />}</span>
          <div>
            <strong>{label}</strong>
            {user && !user.isAnonymous && user.email && <small>{user.email}</small>}
            {user?.isAnonymous && <small>Private beta feedback identity</small>}
            {!user && <small>Use another account for DBStudio</small>}
          </div>
        </div>
        <button role="menuitem" onClick={() => action(onFeedback)}><MessageSquareText size={14} /> Send feedback</button>
        <button role="menuitem" onClick={() => action(onBetaNotes)}><FileText size={14} /> Beta notes</button>
        <button role="menuitem" onClick={() => action(onCopyDiagnostics)}><ClipboardList size={14} /> Copy diagnostics</button>
        <button role="menuitem" disabled={signingIn} onClick={signIn}><LogIn size={14} /> {user && !user.isAnonymous ? "Switch account" : "Sign in with other account"}</button>
        {user && !user.isAnonymous && <button role="menuitem" onClick={signOut}><LogOut size={14} /> Sign out</button>}
      </div>}
    </div>
  );
}
