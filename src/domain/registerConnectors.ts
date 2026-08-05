import { registerModelConnector } from "./modelConnector";
import { claudeCodeConnector, codexConnector } from "./connectors/agentConnectors";
import { registerExplainRoutineSkill } from "./skills/explainRoutine";

/**
 * Startup wiring for the AI layer. This is the first production seam-registration
 * in the codebase (parser/connector seams previously defaulted themselves and were
 * only swapped in tests). Call once from the app entry point.
 */
let registered = false;

export function registerConnectors(): void {
  if (registered) return;
  registered = true;
  registerModelConnector(claudeCodeConnector);
  registerModelConnector(codexConnector);
  registerExplainRoutineSkill();
}
