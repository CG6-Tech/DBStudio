export interface SelectProjection {
  fields: string[];
  target?: string;
  table?: string;
  condition?: string;
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
  const parts: string[] = [];
  const state: ScanState = { quote: null, depth: 0 };
  let start = 0;
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

function cleanTable(value: string): string {
  const source = compact(value).replace(/;$/, "");
  const jsonbKeys = source.match(/^jsonb_object_keys\s*\(\s*([^)]+?)\s*\)(?:\s+AS)?(?:\s+\w+(?:\s*\([^)]*\))?)?$/i);
  if (jsonbKeys) {
    const expression = compact(jsonbKeys[1]);
    if (/^old_data\s*\|\|\s*new_data$/i.test(expression)) return "keys from old_data || new_data";
    if (/^(?:old_data|new_data)$/i.test(expression)) return `keys from ${expression}`;
    return expression;
  }
  return source.replace(/\s+(?:AS\s+)?[a-z_][\w$]*(?:\s*\([^)]*\))?$/i, "");
}

function cleanCondition(value: string): string {
  const source = compact(value).replace(/;$/, "");
  if (/\bold_data\s*->\s*key\s+IS\s+DISTINCT\s+FROM\s+new_data\s*->\s*key\b/i.test(source)) return "old_data.key != new_data.key";
  return source;
}

export function projectSelectStatement(source: string): SelectProjection | null {
  const normalized = compact(source);
  const select = normalized.match(/^SELECT\b/i);
  if (!select) return null;
  const into = findTopLevelKeyword(normalized, "INTO", select[0].length);
  const from = findTopLevelKeyword(normalized, "FROM", select[0].length);
  if (from < 0) return null;
  const fieldEnd = into >= 0 && into < from ? into : from;
  const where = findTopLevelKeyword(normalized, "WHERE", from + 4);
  const target = into >= 0 && into < from ? compact(normalized.slice(into + 4, from)) : undefined;
  const tableEnd = where >= 0 ? where : normalized.length;
  return {
    fields: splitTopLevelList(normalized.slice(select[0].length, fieldEnd)),
    target,
    table: cleanTable(normalized.slice(from + 4, tableEnd)),
    condition: where >= 0 ? cleanCondition(normalized.slice(where + 5)) : undefined,
  };
}
