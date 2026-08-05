import { registerModelConnector } from "./modelConnector";
import { anthropicConnector } from "./connectors/anthropic";
import { openaiConnector } from "./connectors/openai";
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
  registerModelConnector(anthropicConnector);
  registerModelConnector(openaiConnector);
  registerExplainRoutineSkill();
}
