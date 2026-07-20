import type { ContextProjection } from "../../domain/contextProjection";
import { SqlText } from "../ui/SqlText";

export function ContextProjectionBody({ context }: { context: ContextProjection }) {
  return <div className="context-projection-body">
    {context.declarations.map((declaration) => <div key={`${declaration.name}:${declaration.source}`} className={`context-declaration-row${declaration.initialValue ? " initialized" : ""}`}>
      <div className="context-declaration-main">
        <code title={declaration.name}>{declaration.name}</code>
        <b title={declaration.dataType}>{declaration.dataType}</b>
      </div>
      {declaration.initialValue && <div className="context-initial-value">
        <span>Initial</span>
        <code title={declaration.initialValue}>{declaration.initialValue}</code>
      </div>}
    </div>)}
    {context.unparsed.length > 0 && <SqlText className="context-unparsed-declarations" sql={context.unparsed.join(";\n")}/>}
  </div>;
}
