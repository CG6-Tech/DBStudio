import type { SelectProjection } from "../../domain/selectProjection";

function fieldKind(fields: string[]): "field" | "fields" | "expression" {
  if (fields.length > 1) return "fields";
  return /^[a-z_][\w$]*(?:\.[a-z_][\w$]*)?$/i.test(fields[0] ?? "") ? "field" : "expression";
}

export function SelectProjectionBody({ select }: { select: SelectProjection }) {
  return <div className="select-projection-body">
    <div className="select-projection-row fields"><span>fields</span><b className={`select-kind-chip ${fieldKind(select.fields)}`}>{fieldKind(select.fields)}</b><code title={select.fields.join(", ")}>{select.fields.join(", ")}</code></div>
    {select.target && <div className="select-projection-row"><span>into</span><b className="select-kind-chip variable">Variable</b><code title={select.target}>{select.target}</code></div>}
    {select.table && <div className="select-projection-row"><span>table</span><b className="select-kind-chip source">Source</b><code title={select.table}>{select.table}</code></div>}
    {select.condition && <div className="select-projection-row"><span>condition</span><b className="select-kind-chip filter">Filter</b><code title={select.condition}>{select.condition}</code></div>}
  </div>;
}
