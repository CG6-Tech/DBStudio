import { useState } from "react";
import type { InsertProjection, InsertValueKind } from "../../domain/insertProjection";

const labels: Record<InsertValueKind, string> = { constant: "Constant", variable: "Variable", function: "Function", expression: "Expression" };

export function InsertMappingBody({ insert }: { insert: InsertProjection }) {
  const [expanded, setExpanded] = useState(false); const visible = expanded ? insert.mappings : insert.mappings.slice(0, 4); const remaining = insert.mappings.length - visible.length;
  return <div className="insert-mapping-body"><div className="insert-mapping-summary"><strong>{insert.table}</strong><span>{insert.columnCount} fields</span>{insert.warning && <em title={insert.warning}>⚠</em>}</div>{visible.map((mapping, index) => <div className="insert-mapping-row" key={`${mapping.column}:${index}`}><code title={mapping.column}>{mapping.column}</code><span className={`insert-value-kind ${mapping.kind}`}>{labels[mapping.kind]}</span><b title={mapping.value}>{mapping.value}</b></div>)}{insert.mappings.length > 4 && <button className="insert-mapping-toggle" onClick={(event) => { event.stopPropagation(); setExpanded((value) => !value); }}><span>{expanded ? "Show less" : `+ ${remaining} more`}</span><b>{expanded ? "Collapse" : "Expand"}</b></button>}</div>;
}
