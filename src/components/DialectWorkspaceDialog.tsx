import type { SqlDialect } from "../domain/types";

export function DialectWorkspaceDialog({ rootName, suggested, onChoose, onCancel }: {
  rootName: string;
  suggested: SqlDialect;
  onChoose: (dialect: SqlDialect) => void;
  onCancel: () => void;
}) {
  return <div className="modal-backdrop" role="presentation">
    <section className="dialect-dialog" role="dialog" aria-modal="true" aria-labelledby="dialect-dialog-title">
      <h2 id="dialect-dialog-title">Choose workspace dialect</h2>
      <p><strong>{rootName}</strong> contains portable or mixed SQL markers. Every file in this workspace will use one dialect.</p>
      <div className="dialect-choices">
        {(["postgresql", "mysql"] as const).map((dialect) => <button key={dialect} className={dialect === suggested ? "recommended" : ""} onClick={() => onChoose(dialect)}>
          <strong>{dialect === "postgresql" ? "PostgreSQL" : "MySQL"}</strong>
          <span>{dialect === suggested ? "Suggested" : "Use this dialect"}</span>
        </button>)}
      </div>
      <button className="dialog-cancel" onClick={onCancel}>Cancel</button>
    </section>
  </div>;
}
