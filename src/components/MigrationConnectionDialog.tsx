import { useMemo, useState } from "react";
import { Database, Plus, Trash2, X } from "lucide-react";
import { deleteConnectionProfile, loadConnectionProfiles, saveConnectionProfile, type MigrationConnectionProfile, type MigrationEnvironment } from "../domain/migrationConnections";

interface Props {
  onClose: () => void;
  onSelect: (profile: MigrationConnectionProfile, password?: string) => Promise<void>;
}

function blankProfile(): MigrationConnectionProfile {
  return { id: crypto.randomUUID(), name: "", environment: "development", dialect: "postgresql", host: "localhost", port: 5432, database: "", username: "", tls: true };
}

export function MigrationConnectionDialog({ onClose, onSelect }: Props) {
  const [profiles, setProfiles] = useState(loadConnectionProfiles);
  const [editing, setEditing] = useState<MigrationConnectionProfile | null>(profiles.length ? null : blankProfile());
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = useMemo(() => Boolean(editing?.name.trim() && editing.host.trim() && editing.database.trim() && editing.username.trim() && editing.port > 0), [editing]);

  const update = <K extends keyof MigrationConnectionProfile>(key: K, value: MigrationConnectionProfile[K]) => setEditing((current) => current ? { ...current, [key]: value } : current);
  const saveProfile = async (connect: boolean) => {
    if (!editing || !valid) return;
    setBusy(true); setError(null);
    try {
      await saveConnectionProfile(editing, password || undefined);
      setProfiles(loadConnectionProfiles());
      if (connect) await onSelect(editing, password || undefined);
      else { setEditing(null); setPassword(""); }
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  };
  const useProfile = async (profile: MigrationConnectionProfile) => {
    setBusy(true); setError(null);
    try { await onSelect(profile); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  };
  const remove = async (profile: MigrationConnectionProfile) => {
    await deleteConnectionProfile(profile.id);
    setProfiles(loadConnectionProfiles());
  };

  return <div className="migration-connection-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="migration-connection-dialog" role="dialog" aria-modal="true" aria-label="Live database source">
      <header><div><Database size={16} /><strong>Live database</strong></div><button aria-label="Close" onClick={onClose}><X size={15} /></button></header>
      {!editing ? <>
        <div className="migration-profile-list">
          {profiles.map((profile) => <article key={profile.id} className={profile.environment === "production" ? "production" : ""}>
            <button className="migration-profile-main" disabled={busy} onClick={() => void useProfile(profile)}><strong>{profile.name}</strong><span>{profile.environment} · {profile.dialect === "postgresql" ? "PostgreSQL" : "MySQL"}</span><small>{profile.username}@{profile.host}:{profile.port}/{profile.database}</small></button>
            <button aria-label={`Edit ${profile.name}`} onClick={() => { setEditing(profile); setPassword(""); }}>Edit</button>
            <button aria-label={`Delete ${profile.name}`} onClick={() => void remove(profile)}><Trash2 size={13} /></button>
          </article>)}
          {profiles.length === 0 && <p>No saved connection profiles.</p>}
        </div>
        <button className="migration-new-profile" onClick={() => setEditing(blankProfile())}><Plus size={13} /> New connection</button>
      </> : <div className="migration-profile-form">
        <div className="migration-profile-grid">
          <label className="wide"><span>Name</span><input value={editing.name} onChange={(event) => update("name", event.target.value)} placeholder="Development" /></label>
          <label><span>Environment</span><select value={editing.environment} onChange={(event) => update("environment", event.target.value as MigrationEnvironment)}><option value="development">Development</option><option value="staging">Staging</option><option value="production">Production</option><option value="custom">Custom</option></select></label>
          <label><span>Engine</span><select value={editing.dialect} onChange={(event) => { const dialect = event.target.value as MigrationConnectionProfile["dialect"]; setEditing({ ...editing, dialect, port: dialect === "postgresql" ? 5432 : 3306 }); }}><option value="postgresql">PostgreSQL</option><option value="mysql">MySQL</option></select></label>
          <label className="host"><span>Host</span><input value={editing.host} onChange={(event) => update("host", event.target.value)} /></label>
          <label className="port"><span>Port</span><input type="number" min="1" max="65535" value={editing.port} onChange={(event) => update("port", Number(event.target.value))} /></label>
          <label><span>Database</span><input value={editing.database} onChange={(event) => update("database", event.target.value)} /></label>
          <label><span>Username</span><input value={editing.username} onChange={(event) => update("username", event.target.value)} /></label>
          <label className="wide"><span>Password {profiles.some((profile) => profile.id === editing.id) && "(leave blank to use Keychain)"}</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" /></label>
          <label className="migration-tls wide"><input type="checkbox" checked={editing.tls} onChange={(event) => update("tls", event.target.checked)} /><span>Require encrypted connection</span></label>
        </div>
        {editing.environment === "production" && <p className="migration-production-warning">Production source. DBStudio will only run read-only catalog queries.</p>}
        {error && <p className="migration-profile-error">{error}</p>}
        <footer><button onClick={() => { setEditing(null); setPassword(""); }}>Back</button><button disabled={!valid || busy} onClick={() => void saveProfile(false)}>Save</button><button className="primary" disabled={!valid || busy} onClick={() => void saveProfile(true)}>{busy ? "Inspecting…" : "Save & use"}</button></footer>
      </div>}
      {!editing && error && <p className="migration-profile-error">{error}</p>}
    </section>
  </div>;
}
