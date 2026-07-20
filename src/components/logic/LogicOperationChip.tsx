import { logicOperationClass } from "./logicUi";

export function LogicOperationChip({ value, kind }: { value: string; kind?: string }) {
  return <b className={`logic-operation-chip ${logicOperationClass(kind ?? value)}`}>{value.toUpperCase()}</b>;
}
