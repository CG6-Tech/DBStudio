import type { AssignmentProjection } from "../../domain/assignmentProjection";
import { SqlText } from "../ui/SqlText";

export function AssignmentProjectionBody({ assignment }: { assignment: AssignmentProjection }) {
  return <div className="assignment-projection-body">
    <div className="assignment-projection-row target">
      <span>TARGET</span>
      <code title={assignment.target}>{assignment.target}</code>
      <b>:=</b>
    </div>
    <div className="assignment-projection-row value">
      <span>VALUE</span>
      <SqlText className="assignment-sql-value" sql={assignment.value}/>
    </div>
  </div>;
}
