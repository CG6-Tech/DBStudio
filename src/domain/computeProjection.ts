import { projectSelectStatement, type SelectProjection } from "./selectProjection";

export interface ComputeProjection {
  target: string;
  source?: string;
  filter?: string;
  summary: string;
  select?: SelectProjection;
}

function compact(value: string): string { return value.replace(/\s+/g, " ").trim(); }

export function computeTarget(source: string): string | undefined {
  return source.match(/\bINTO\s+([a-z_][\w$]*)\b/i)?.[1];
}

function projectJsonbKeySource(source: string): string | undefined {
  const match = source.match(/\bFROM\s+jsonb_object_keys\s*\(\s*([^)]+?)\s*\)/i);
  if (!match) return undefined;
  const value = compact(match[1]);
  if (/^old_data\s*\|\|\s*new_data$/i.test(value)) return "keys from old_data || new_data";
  if (/^new_data$/i.test(value)) return "keys from new_data";
  if (/^old_data$/i.test(value)) return "keys from old_data";
  return value;
}

function projectFilter(source: string): string | undefined {
  if (/\bold_data\s*->\s*key\s+IS\s+DISTINCT\s+FROM\s+new_data\s*->\s*key\b/i.test(source)) return "old_data.key != new_data.key";
  const match = source.match(/\bWHERE\s+([\s\S]+?);?$/i);
  return match ? compact(match[1]).replace(/;$/, "") : undefined;
}

export function computeSummary(source: string): string {
  if (/\bold_data\s*\|\|\s*new_data\b/i.test(source)) return "Compare old and new fields";
  if (/jsonb_object_keys\s*\(\s*new_data\s*\)/i.test(source)) return "Collect fields from new data";
  if (/jsonb_object_keys\s*\(\s*old_data\s*\)/i.test(source)) return "Collect fields from old data";
  const target = computeTarget(source);
  return target ? `Compute ${target}` : "Compute value";
}

export function projectComputeStatement(source: string): ComputeProjection | null {
  const target = computeTarget(source);
  if (!target) return null;
  return { target, source: projectJsonbKeySource(source), filter: projectFilter(source), summary: computeSummary(source), select: projectSelectStatement(source) ?? undefined };
}
