export type InsertValueKind = "constant" | "variable" | "function" | "expression";
export interface InsertMapping { column: string; value: string; kind: InsertValueKind }
export interface InsertProjection { table: string; mappings: InsertMapping[]; columnCount: number; valueCount: number; complete: boolean; warning?: string }

interface ScanState { quote: "single" | "double" | null; dollarTag: string | null; depth: number }

function scanTopLevel(value: string, onComma: (index: number) => void): boolean {
  const state: ScanState = { quote: null, dollarTag: null, depth: 0 };
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (state.dollarTag) { if (value.startsWith(state.dollarTag, index)) { index += state.dollarTag.length - 1; state.dollarTag = null; } continue; }
    if (state.quote === "single") { if (char === "'" && value[index + 1] === "'") index += 1; else if (char === "'") state.quote = null; continue; }
    if (state.quote === "double") { if (char === '"' && value[index + 1] === '"') index += 1; else if (char === '"') state.quote = null; continue; }
    if (char === "'") { state.quote = "single"; continue; } if (char === '"') { state.quote = "double"; continue; }
    if (char === "$") { const match = value.slice(index).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/); if (match) { state.dollarTag = match[0]; index += match[0].length - 1; continue; } }
    if (char === "(") state.depth += 1; else if (char === ")") { state.depth -= 1; if (state.depth < 0) return false; } else if (char === "," && state.depth === 0) onComma(index);
  }
  return !state.quote && !state.dollarTag && state.depth === 0;
}

function splitList(value: string): string[] | null {
  const indexes = [-1]; if (!scanTopLevel(value, (index) => indexes.push(index))) return null; indexes.push(value.length);
  return indexes.slice(0, -1).map((start, index) => value.slice(start + 1, indexes[index + 1]).trim());
}

function matchingParen(source: string, open: number): number {
  const slice = source.slice(open + 1); let result = -1; const valid = scanTopLevel(slice, () => undefined);
  if (!valid && !slice.includes(")")) return -1;
  let quote: string | null = null; let dollar: string | null = null; let depth = 1;
  for (let index = open + 1; index < source.length; index += 1) { const char = source[index]; if (dollar) { if (source.startsWith(dollar, index)) { index += dollar.length - 1; dollar = null; } continue; } if (quote === "'") { if (char === "'" && source[index + 1] === "'") index += 1; else if (char === "'") quote = null; continue; } if (quote === '"') { if (char === '"' && source[index + 1] === '"') index += 1; else if (char === '"') quote = null; continue; } if (char === "'" || char === '"') { quote = char; continue; } if (char === "$") { const match = source.slice(index).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/); if (match) { dollar = match[0]; index += match[0].length - 1; continue; } } if (char === "(") depth += 1; else if (char === ")" && --depth === 0) { result = index; break; } }
  return result;
}

function cleanIdentifier(value: string): string { return value.trim().replace(/\s*\.\s*/g, "."); }

export function classifyInsertValue(value: string): InsertValueKind {
  const trimmed = value.trim();
  if (/^(?:NULL|TRUE|FALSE|[-+]?\d+(?:\.\d+)?|'(?:''|[^'])*')(?:::[\w."\[\]]+)?$/i.test(trimmed)) return "constant";
  if (/^(?:"(?:""|[^"])+"|[A-Za-z_][\w$]*)(?:\.(?:"(?:""|[^"])+"|[A-Za-z_][\w$]*))*$/i.test(trimmed)) return "variable";
  const call = trimmed.match(/^([A-Za-z_][\w$]*(?:\.[A-Za-z_][\w$]*)*)\s*\(/); if (call) { const open = trimmed.indexOf("("); const close = matchingParen(trimmed, open); if (close === trimmed.length - 1 && call[1].toLowerCase() !== "format") return "function"; }
  return "expression";
}

export function projectInsertStatement(source: string): InsertProjection | null {
  const header = source.match(/^\s*INSERT\s+INTO\s+((?:"(?:""|[^"])+"|[A-Za-z_][\w$]*)(?:\s*\.\s*(?:"(?:""|[^"])+"|[A-Za-z_][\w$]*))*)\s*/i); if (!header) return null;
  const table = cleanIdentifier(header[1]); const columnOpen = source.indexOf("(", header[0].length); if (columnOpen < 0) return null; const columnClose = matchingParen(source, columnOpen); if (columnClose < 0) return null;
  const between = source.slice(columnClose + 1); const valuesMatch = between.match(/^\s*VALUES\s*/i); if (!valuesMatch) return null; const valuesOpen = columnClose + 1 + valuesMatch[0].length; if (source[valuesOpen] !== "(") return null; const valuesClose = matchingParen(source, valuesOpen); if (valuesClose < 0) return null;
  const columns = splitList(source.slice(columnOpen + 1, columnClose)); const values = splitList(source.slice(valuesOpen + 1, valuesClose)); if (!columns || !values || columns.some((item) => !item) || values.some((item) => !item)) return null;
  const count = Math.min(columns.length, values.length); const mappings = Array.from({ length: count }, (_, index) => ({ column: cleanIdentifier(columns[index]), value: values[index], kind: classifyInsertValue(values[index]) })); const complete = columns.length === values.length;
  return { table, mappings, columnCount: columns.length, valueCount: values.length, complete, warning: complete ? undefined : `${columns.length} columns but ${values.length} values` };
}
