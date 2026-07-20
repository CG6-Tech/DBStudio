import type { LayoutNode } from "../../domain/types";

export function sceneLayoutKey(nodes: LayoutNode[]): string {
  return JSON.stringify(nodes.map(({ id, x, y, width, height }) => [id, x, y, width, height]));
}

export function shouldFitLayoutGeneration(lastGeneration: number | null, nextGeneration: number | undefined, explicitFit: boolean): boolean {
  return explicitFit || lastGeneration !== (nextGeneration ?? 0);
}
