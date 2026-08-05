import { useEffect, useMemo, useState } from "react";
import { Sparkles, X } from "lucide-react";
import {
  getActiveConnectorId,
  getActiveModel,
  listModelConnectors,
  setActiveConnectorId,
  setActiveModel,
} from "../../domain/modelConnector";
import { deleteAiSecret, hasAiSecret, saveAiSecret } from "../../platform/aiSecrets";

/**
 * AI provider settings: choose the active provider + model and store its API key
 * in the macOS Keychain. Mirrors the MigrationConnectionDialog structure. Config
 * (provider/model choice) persists to localStorage via modelConnector; the key
 * never returns to the webview once stored.
 */
export function AiSettingsDialog({ onClose }: { onClose: () => void }) {
  const connectors = useMemo(() => listModelConnectors(), []);
  const [providerId, setProviderId] = useState(() => getActiveConnectorId() ?? connectors[0]?.id ?? "");
  const provider = connectors.find((item) => item.id === providerId);
  const [model, setModel] = useState(() => getActiveModel(provider) ?? provider?.models[0] ?? "");
  const [apiKey, setApiKey] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setModel(getActiveModel(provider) ?? provider?.models[0] ?? "");
    setApiKey("");
    if (providerId) void hasAiSecret(providerId).then((value) => { if (active) setHasKey(value); });
    return () => { active = false; };
  }, [providerId, provider]);

  const save = async () => {
    if (!provider) return;
    setBusy(true); setError(null);
    try {
      if (apiKey.trim()) await saveAiSecret(provider.id, apiKey.trim());
      setActiveConnectorId(provider.id);
      setActiveModel(provider.id, model);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  const removeKey = async () => {
    if (!provider) return;
    await deleteAiSecret(provider.id);
    setHasKey(false);
    setApiKey("");
  };

  return (
    <div className="migration-connection-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="migration-connection-dialog ai-settings-dialog" role="dialog" aria-modal="true" aria-label="AI provider settings">
        <header><div><Sparkles size={16} /><strong>AI provider</strong></div><button aria-label="Close" onClick={onClose}><X size={15} /></button></header>
        <div className="migration-profile-form">
          <div className="migration-profile-grid">
            <label className="wide"><span>Provider</span>
              <select value={providerId} onChange={(event) => setProviderId(event.target.value)}>
                {connectors.map((connector) => <option key={connector.id} value={connector.id}>{connector.label}</option>)}
              </select>
            </label>
            <label className="wide"><span>Model</span>
              <select value={model} onChange={(event) => setModel(event.target.value)}>
                {provider?.models.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label className="wide"><span>API key {hasKey && "(stored in Keychain — leave blank to keep)"}</span>
              <input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} autoComplete="new-password" placeholder={hasKey ? "••••••••" : "Paste your API key"} />
            </label>
          </div>
          <p className="ai-settings-note">Your API key is stored in the macOS Keychain and sent only to the provider you choose. AI features require the desktop app.</p>
          {error && <p className="migration-profile-error">{error}</p>}
          <footer>
            {hasKey && <button onClick={() => void removeKey()} disabled={busy}>Remove key</button>}
            <button onClick={onClose}>Cancel</button>
            <button className="primary" disabled={busy || !provider || (!hasKey && !apiKey.trim())} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</button>
          </footer>
        </div>
      </section>
    </div>
  );
}
