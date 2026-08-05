import { MessageSquareText, RefreshCw, Sparkles } from "lucide-react";
import type { User } from "firebase/auth";
import { BrandLogo } from "./BrandLogo";
import { BetaBadge } from "./BetaBadge";
import { ProfileMenu } from "./ProfileMenu";
import { useAiStore } from "../state/aiStore";

interface ToolbarProps {
  onFeedback: () => void;
  onCheckForUpdates: () => void;
  checkingForUpdates: boolean;
  authUser: User | null;
  signingIn: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
  onBetaNotes: () => void;
  onCopyDiagnostics: () => void;
}

export function Toolbar(props: ToolbarProps) {
  const openAiSettings = useAiStore((state) => state.openSettings);
  return (
    <header className="toolbar">
      <div className="brand">
        <BrandLogo />
        <strong>DBStudio</strong>
        <BetaBadge />
      </div>
      <nav className="toolbar-actions" aria-label="Application actions">
        <button className="icon-button" aria-label="AI provider settings" title="AI provider settings" onClick={openAiSettings}><Sparkles size={15} /></button>
        <button className="icon-button" aria-label="Check for updates" title="Check for updates" disabled={props.checkingForUpdates} onClick={props.onCheckForUpdates}><RefreshCw className={props.checkingForUpdates ? "spinning" : undefined} size={15} /></button>
        <button className="command-button feedback-command" onClick={props.onFeedback} title="Send private feedback"><MessageSquareText size={15} /><span className="command-label">Feedback</span></button>
        <ProfileMenu
          user={props.authUser}
          signingIn={props.signingIn}
          onSignIn={props.onSignIn}
          onSignOut={props.onSignOut}
          onFeedback={props.onFeedback}
          onBetaNotes={props.onBetaNotes}
          onCopyDiagnostics={props.onCopyDiagnostics}
        />
      </nav>
    </header>
  );
}
