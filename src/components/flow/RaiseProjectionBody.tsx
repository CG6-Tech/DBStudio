import type { RoutineFlowNodeDetails } from "../../domain/routineFlow";

const fields = [
  ["ERRCODE", "errcode"],
  ["MESSAGE", "message"],
  ["DETAIL", "detail"],
  ["HINT", "hint"],
] as const;

export function RaiseProjectionBody({ details }: { details: RoutineFlowNodeDetails }) {
  const rows = fields.filter(([, key]) => details[key]);
  return <div className="raise-projection-body">
    {rows.map(([label, key]) => <div className={"raise-projection-row " + key} key={key}>
      <span>{label}</span>
      {key === "errcode"
        ? <b className="raise-code-chip">{details[key]}</b>
        : <code title={details[key]}>{details[key]}</code>}
    </div>)}
  </div>;
}
