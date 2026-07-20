import type { PerformProjection } from "../../domain/performProjection";

export function PerformProjectionBody({ perform }: { perform: PerformProjection }) {
  return <div className="perform-projection-body">
    <div className="perform-projection-row"><span>table</span><b className="select-kind-chip source">Source</b><code title={perform.table}>{perform.table}</code></div>
    {perform.condition && <div className="perform-projection-row"><span>condition</span><b className="select-kind-chip filter">Filter</b><code title={perform.condition}>{perform.condition}</code></div>}
    {perform.orderBy && <div className="perform-projection-row"><span>order</span><b className="select-kind-chip field">By</b><code title={perform.orderBy}>{perform.orderBy}</code></div>}
    {perform.lock && <div className="perform-projection-row"><span>lock</span><b className="select-kind-chip lock">Lock</b><code title={perform.lock}>{perform.lock}</code></div>}
  </div>;
}
