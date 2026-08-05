import { useEffect, useMemo, useState } from "react";
import { Sparkles, X, CheckCircle2, AlertTriangle } from "lucide-react";
import {
  getActiveConnectorId,
  listModelConnectors,
  setActiveConnectorId,
} from "../../domain/modelConnector";
import { agentCliAvailable } from "../../platform/agentCli";

/**
 * AI agent settings: choose which locally installed CLI agent DBStudio should
 * drive (Claude Code or Codex). No API keys — the CLI is already authenticated.
 * We probe each agent's availability so the user knows what is installed.
 */
export function AiSettingsDialog({ onClose }: { onClose: () => void }) {
  const connectors = useMemo(() => listModelConnectors(), []);
  const [selected, setSelected] = useState(() => getActiveConnectorId() ?? connectors[0]?.id ?? "");
  const [availability, setAvailability] = useState<Record<string, boolean | undefined>>({});

  useEffect(() => {
    let active = true;
    Promise.all(connectors.map(async (connector) => [connector.id, await agentCliAvailable(connector.id)] as const)).then((pairs) => {
      if (active) setAvailability(Object.fromEntries(pairs));
    });
    return () => { active = false; };
  }, [connectors]);

  const save = () => {
    if (selected) setActiveConnectorId(selected);
    onClose();
  };

  return (
    <div className="migration-connection-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="migration-connection-dialog ai-settings-dialog" role="dialog" aria-modal="true" aria-label="AI agent settings">
        <header><div><Sparkles size={16} /><strong>AI agent</strong></div><button aria-label="Close" onClick={onClose}><X size={15} /></button></header>
        <div className="migration-profile-form">
          <div className="ai-agent-choices">
            {connectors.map((connector) => {
              const state = availability[connector.id];
              return (
                <label key={connector.id} className={`ai-agent-choice ${selected === connector.id ? "selected" : ""}`}>
                  <input type="radio" name="ai-agent" value={connector.id} checked={selected === connector.id} onChange={() => setSelected(connector.id)} />
                  <div className="ai-agent-choice-body">
                    <strong>{connector.label}</strong>
                    <span className={`ai-agent-status ${state ? "ok" : state === false ? "missing" : ""}`}>
                      {state === undefined ? "Checking…" : state ? <><CheckCircle2 size={11} /> Installed</> : <><AlertTriangle size={11} /> Not found on PATH</>}
                    </span>
                  </div>
                </label>
              );
            })}
          </div>
          <p className="ai-settings-note">DBStudio runs your locally installed <code>claude</code> or <code>codex</code> CLI — already signed in, no API key needed. Explanations use whatever model that CLI is configured for. Requires the desktop app.</p>
          <footer>
            <button onClick={onClose}>Cancel</button>
            <button className="primary" disabled={!selected} onClick={save}>Save</button>
          </footer>
        </div>
      </section>
    </div>
  );
}
