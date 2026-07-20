import { Cog, TableProperties, Zap } from "lucide-react";
import type { LogicGraphNodeKind } from "../../domain/logicGraph";

export function LogicObjectIcon({ kind, size = 14 }: { kind: LogicGraphNodeKind; size?: number }) {
  if (kind === "table") return <TableProperties size={size} strokeWidth={2.1} />;
  if (kind === "trigger") return <Zap size={size} strokeWidth={2.2} />;
  if (kind === "routine") return <Cog size={size} strokeWidth={2.2} />;
  return <span>?</span>;
}
