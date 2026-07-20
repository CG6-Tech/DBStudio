import type { ComputeProjection } from "../../domain/computeProjection";
import { SelectProjectionBody } from "./SelectProjectionBody";

export function ComputeProjectionBody({ compute }: { compute: ComputeProjection }) {
  if (compute.select) return <SelectProjectionBody select={compute.select}/>;
  return <div className="compute-projection-body">
    <div className="compute-target-row"><strong title={compute.target}>{compute.target}</strong></div>
    {compute.source && <div className="compute-projection-row"><span>FROM</span><code title={compute.source}>{compute.source}</code></div>}
    {compute.filter && <div className="compute-projection-row"><span>WHERE</span><code title={compute.filter}>{compute.filter}</code></div>}
  </div>;
}
