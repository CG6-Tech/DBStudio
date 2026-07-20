export interface ElkWorkerLike {
  postMessage(message: unknown): void;
  terminate(): void;
}

export type ElkWorkerConstructor = new () => ElkWorkerLike;

interface WorkerModuleShape {
  Worker?: unknown;
  default?: unknown;
}

function constructorFrom(value: unknown): ElkWorkerConstructor | null {
  if (typeof value === "function") return value as ElkWorkerConstructor;
  if (!value || typeof value !== "object") return null;
  const module = value as WorkerModuleShape;
  return constructorFrom(module.Worker) ?? constructorFrom(module.default);
}

export function resolveElkWorkerConstructor(module: unknown): ElkWorkerConstructor {
  const constructor = constructorFrom(module);
  if (!constructor) throw new Error("ELK worker constructor is unavailable");
  return constructor;
}
