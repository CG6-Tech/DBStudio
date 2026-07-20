/// <reference lib="webworker" />
import { createMigrationPlan, type MigrationPlanDecisions, type MigrationStrategy } from "./migrationPlanner";
import type { MigrationSnapshot } from "./migrationSnapshot";

interface Request {
  generation: number;
  desired: MigrationSnapshot;
  target: MigrationSnapshot;
  strategy: MigrationStrategy;
  decisions: MigrationPlanDecisions;
}

self.onmessage = (event: MessageEvent<Request>) => {
  const { generation, desired, target, strategy, decisions } = event.data;
  try {
    self.postMessage({ generation, plan: createMigrationPlan(desired, target, strategy, decisions), error: null });
  } catch (error) {
    self.postMessage({ generation, plan: null, error: error instanceof Error ? error.message : String(error) });
  }
};

export {};
