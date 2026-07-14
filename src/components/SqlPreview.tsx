interface SqlPreviewProps {
  open: boolean;
  sql: string;
  changes: number;
  onClose: () => void;
}

export function SqlPreview({ open, sql, changes, onClose }: SqlPreviewProps) {
  if (!open) return null;
  return (
    <section className="sql-preview" aria-label="SQL preview">
      <header>
        <div><span className="live-dot" /><strong>Generated SQL</strong><small>{changes} pending {changes === 1 ? "change" : "changes"}</small></div>
        <button aria-label="Close SQL preview" onClick={onClose}>×</button>
      </header>
      <pre><code>{sql}</code></pre>
    </section>
  );
}
