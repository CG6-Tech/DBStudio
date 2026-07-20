import { useEffect, useState } from "react";
import { ArrowDownUp, FileCode2, FolderOpen, GitCompareArrows, X } from "lucide-react";
import type { MigrationSource } from "./MigrationPlannerPanel";

interface Props {
  oldSource: MigrationSource;
  newSource: MigrationSource;
  onChooseFile: () => Promise<MigrationSource | null>;
  onChooseFolder: () => Promise<MigrationSource | null>;
  onCompare: (oldSource: MigrationSource, newSource: MigrationSource) => void;
  onClose: () => void;
}

function SourceSlot({ role, source, error, onChooseFile, onChooseFolder }: { role: string; source: MigrationSource; error: string | null; onChooseFile: () => void; onChooseFolder: () => void }) {
  const snapshot = source.snapshot;
  return <section className={`migration-source-slot${error ? " invalid" : ""}`}>
    <header><span>{role}</span><small>{snapshot.dialect === "postgresql" ? "PostgreSQL" : "MySQL"}</small></header>
    <div><FileCode2 size={20} /><span><strong title={source.label}>{source.label}</strong><small>{snapshot.tables.length} tables · {snapshot.objects.filter((item) => item.kind === "routine").length} routines</small></span></div>
    {error && <p>{error}</p>}
    <footer><button onClick={onChooseFile}><FileCode2 size={13} /> SQL file</button><button onClick={onChooseFolder}><FolderOpen size={13} /> Folder</button></footer>
  </section>;
}

export function MigrationSourceDialog({ oldSource, newSource, onChooseFile, onChooseFolder, onCompare, onClose }: Props) {
  const [oldValue, setOldValue] = useState(oldSource);
  const [newValue, setNewValue] = useState(newSource);
  const [oldError, setOldError] = useState<string | null>(null);
  const [newError, setNewError] = useState<string | null>(null);
  useEffect(() => { setOldValue(oldSource); setNewValue(newSource); }, [newSource, oldSource]);
  const choose = async (role: "old" | "new", chooser: () => Promise<MigrationSource | null>) => {
    try {
      const source = await chooser();
      if (!source) return;
      const external = { ...source, id: source.id.startsWith("external:") ? source.id : `external:${source.id}` };
      if (role === "old") { setOldValue(external); setOldError(null); }
      else { setNewValue(external); setNewError(null); }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (role === "old") setOldError(message); else setNewError(message);
    }
  };
  const mismatch = oldValue.snapshot.dialect !== newValue.snapshot.dialect;
  return <div className="migration-source-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="migration-source-dialog" role="dialog" aria-modal="true" aria-labelledby="migration-source-title">
      <header><div><GitCompareArrows size={17} /><span><strong id="migration-source-title">Compare schemas</strong><small>Select complete old and new schema states</small></span></div><button aria-label="Close comparison dialog" onClick={onClose}><X size={16} /></button></header>
      <div className="migration-source-pair">
        <SourceSlot role="Current / Old" source={oldValue} error={oldError} onChooseFile={() => void choose("old", onChooseFile)} onChooseFolder={() => void choose("old", onChooseFolder)} />
        <button className="migration-source-swap" aria-label="Swap old and new sources" title="Swap sources" onClick={() => { setOldValue(newValue); setNewValue(oldValue); setOldError(newError); setNewError(oldError); }}><ArrowDownUp size={16} /></button>
        <SourceSlot role="Desired / New" source={newValue} error={newError} onChooseFile={() => void choose("new", onChooseFile)} onChooseFolder={() => void choose("new", onChooseFolder)} />
      </div>
      {mismatch && <p className="migration-source-mismatch">Both schemas must use the same database engine.</p>}
      <footer><button onClick={onClose}>Cancel</button><button className="primary" disabled={mismatch || Boolean(oldError || newError)} onClick={() => onCompare(oldValue, newValue)}><GitCompareArrows size={13} /> Compare</button></footer>
    </div>
  </div>;
}
