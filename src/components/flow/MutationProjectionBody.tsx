import type { MutationProjection } from "../../domain/mutationProjection";

export function MutationProjectionBody({ mutation }: { mutation: MutationProjection }) {
  const assignments = mutation.assignments?.slice(0, 3) ?? [];
  const remaining = Math.max(0, (mutation.assignments?.length ?? 0) - assignments.length);
  return <div className="mutation-projection-body">
    <div className="mutation-projection-row"><span>table</span><b className="select-kind-chip source">{mutation.operation}</b><code title={mutation.table}>{mutation.table}</code></div>
    {assignments.map((assignment, index) => <div className="mutation-projection-row" key={`${assignment.field}:${index}`}><span title={assignment.field}>{assignment.field}</span><b className="select-kind-chip expression">Set</b><code title={assignment.value}>{assignment.value}</code></div>)}
    {remaining > 0 && <div className="mutation-projection-row muted"><span>fields</span><b className="select-kind-chip fields">More</b><code>{remaining} more</code></div>}
    {mutation.condition && <div className="mutation-projection-row"><span>condition</span><b className="select-kind-chip filter">Filter</b><code title={mutation.condition}>{mutation.condition}</code></div>}
  </div>;
}
