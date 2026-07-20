import type { ReturnProjection } from "../../domain/returnProjection";

export function ReturnProjectionBody({ projection }: { projection: ReturnProjection }) {
  return <div className="return-projection-body">
    <div className="return-projection-row"><span>value</span><b className="select-kind-chip variable">Value</b><code title={projection.value}>{projection.value}</code></div>
  </div>;
}
