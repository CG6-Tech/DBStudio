import { useEffect, useRef, useState } from "react";
import type { MigrationPlan, MigrationPlanDecisions, MigrationStrategy } from "./migrationPlanner";
import type { MigrationSnapshot } from "./migrationSnapshot";

interface WorkerResponse { generation: number; plan: MigrationPlan | null; error: string | null }

export function useMigrationPlan(desired: MigrationSnapshot, target: MigrationSnapshot, strategy: MigrationStrategy, decisions: MigrationPlanDecisions) {
  const workerRef = useRef<Worker | null>(null);
  const generationRef = useRef(0);
  const [result, setResult] = useState<{ plan: MigrationPlan | null; error: string | null; pending: boolean }>({ plan: null, error: null, pending: true });

  useEffect(() => {
    const worker = new Worker(new URL("./migration-plan.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.generation !== generationRef.current) return;
      setResult({ plan: event.data.plan, error: event.data.error, pending: false });
    };
    worker.onerror = () => setResult((current) => ({ ...current, error: "Migration planning worker failed.", pending: false }));
    workerRef.current = worker;
    return () => { workerRef.current = null; worker.terminate(); };
  }, []);

  useEffect(() => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    setResult((current) => ({ ...current, pending: true, error: null }));
    workerRef.current?.postMessage({ generation, desired, target, strategy, decisions });
  }, [decisions, desired, strategy, target]);

  return result;
}
