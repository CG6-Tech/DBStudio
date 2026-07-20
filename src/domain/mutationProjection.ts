export interface MutationAssignment { field: string; value: string }
export interface MutationProjection { operation: "UPDATE" | "DELETE"; table: string; assignments?: MutationAssignment[]; condition?: string }

export function mutationProjectionHeight(mutation: MutationProjection): number {
  const assignmentCount = Math.min(3, mutation.assignments?.length ?? 0);
  const overflowRow = (mutation.assignments?.length ?? 0) > assignmentCount ? 1 : 0;
  return (1 + assignmentCount + overflowRow + (mutation.condition ? 1 : 0)) * 27;
}

interface ScanState { quote: "single" | "double" | null; depth: number }

function compact(value: string): string { return value.replace(/\s+/g, " ").trim(); }

function findTopLevelKeyword(source: string, keyword: string, from = 0): number {
  const state: ScanState = { quote: null, depth: 0 };
  const pattern = new RegExp(`^${keyword}\\b`, "i");
  for (let index = from; index < source.length; index += 1) {
    const char = source[index];
    if (state.quote === "single") { if (char === "'" && source[index + 1] === "'") index += 1; else if (char === "'") state.quote = null; continue; }
    if (state.quote === "double") { if (char === '"' && source[index + 1] === '"') index += 1; else if (char === '"') state.quote = null; continue; }
    if (char === "'") { state.quote = "single"; continue; }
    if (char === '"') { state.quote = "double"; continue; }
    if (char === "(") state.depth += 1;
    else if (char === ")") state.depth = Math.max(0, state.depth - 1);
    else if (state.depth === 0 && /\s/.test(source[index - 1] ?? " ") && pattern.test(source.slice(index))) return index;
  }
  return -1;
}

function splitTopLevelList(value: string): string[] {
  const parts: string[] = []; const state: ScanState = { quote: null, depth: 0 }; let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (state.quote === "single") { if (char === "'" && value[index + 1] === "'") index += 1; else if (char === "'") state.quote = null; continue; }
    if (state.quote === "double") { if (char === '"' && value[index + 1] === '"') index += 1; else if (char === '"') state.quote = null; continue; }
    if (char === "'") { state.quote = "single"; continue; }
    if (char === '"') { state.quote = "double"; continue; }
    if (char === "(") state.depth += 1;
    else if (char === ")") state.depth = Math.max(0, state.depth - 1);
    else if (char === "," && state.depth === 0) { parts.push(compact(value.slice(start, index))); start = index + 1; }
  }
  parts.push(compact(value.slice(start)));
  return parts.filter(Boolean);
}

function cleanTable(value: string): string { return compact(value).replace(/;$/, "").replace(/\s+(?:AS\s+)?[a-z_][\w$]*$/i, ""); }
function cleanCondition(value: string): string { return compact(value).replace(/;$/, ""); }

function parseAssignments(value: string): MutationAssignment[] {
  return splitTopLevelList(value).map((item) => {
    const match = item.match(/^(.+?)\s*=\s*([\s\S]+)$/);
    return match ? { field: compact(match[1]), value: compact(match[2]) } : { field: item, value: "" };
  });
}

export function projectMutationStatement(source: string): MutationProjection | null {
  const normalized = compact(source);
  const update = normalized.match(/^UPDATE\s+(.+?)\s+SET\b/i);
  if (update) {
    const set = findTopLevelKeyword(normalized, "SET", 0);
    const where = findTopLevelKeyword(normalized, "WHERE", set + 3);
    const assignmentEnd = where >= 0 ? where : normalized.length;
    return { operation: "UPDATE", table: cleanTable(update[1]), assignments: parseAssignments(normalized.slice(set + 3, assignmentEnd)), condition: where >= 0 ? cleanCondition(normalized.slice(where + 5)) : undefined };
  }
  const deleteMatch = normalized.match(/^DELETE\s+FROM\s+(.+?)(?:\s+WHERE\b|;?$)/i);
  if (deleteMatch) {
    const where = findTopLevelKeyword(normalized, "WHERE", 0);
    const tableEnd = where >= 0 ? where : normalized.length;
    return { operation: "DELETE", table: cleanTable(normalized.slice("DELETE FROM".length, tableEnd)), condition: where >= 0 ? cleanCondition(normalized.slice(where + 5)) : undefined };
  }
  return null;
}
