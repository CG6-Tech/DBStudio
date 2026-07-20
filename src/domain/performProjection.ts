export interface PerformProjection {
  expression: string;
  table: string;
  condition?: string;
  orderBy?: string;
  lock?: string;
}

function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function phraseAt(source: string, index: number, phrase: string): boolean {
  if (source.slice(index, index + phrase.length).toUpperCase() !== phrase) return false;
  const before = source[index - 1];
  const after = source[index + phrase.length];
  return (!before || /\s/.test(before)) && (!after || /\s|;/.test(after));
}

function findTopLevelPhrase(source: string, phrase: string, from = 0): number {
  let depth = 0;
  let quote: "single" | "double" | null = null;
  for (let index = from; index < source.length; index += 1) {
    const char = source[index];
    if (quote === "single") {
      if (char === "'" && source[index + 1] === "'") index += 1;
      else if (char === "'") quote = null;
      continue;
    }
    if (quote === "double") {
      if (char === '"' && source[index + 1] === '"') index += 1;
      else if (char === '"') quote = null;
      continue;
    }
    if (char === "'") { quote = "single"; continue; }
    if (char === '"') { quote = "double"; continue; }
    if (char === "(") { depth += 1; continue; }
    if (char === ")") { depth = Math.max(0, depth - 1); continue; }
    if (depth === 0 && phraseAt(source, index, phrase)) return index;
  }
  return -1;
}

function firstAfter(indices: number[], after: number, fallback: number): number {
  const matches = indices.filter((index) => index > after);
  return matches.length ? Math.min(...matches) : fallback;
}

export function performProjectionHeight(perform: PerformProjection): number {
  return [perform.table, perform.condition, perform.orderBy, perform.lock].filter(Boolean).length * 27;
}

export function projectPerformStatement(source: string): PerformProjection | null {
  const normalized = compact(source).replace(/;$/, "");
  if (!/^PERFORM\b/i.test(normalized)) return null;
  const from = findTopLevelPhrase(normalized, "FROM", 7);
  if (from < 0) return null;

  const where = findTopLevelPhrase(normalized, "WHERE", from + 4);
  const orderBy = findTopLevelPhrase(normalized, "ORDER BY", from + 4);
  const lockCandidates = ["FOR NO KEY UPDATE", "FOR KEY SHARE", "FOR UPDATE", "FOR SHARE"]
    .map((phrase) => ({ phrase, index: findTopLevelPhrase(normalized, phrase, from + 4) }))
    .filter((item) => item.index >= 0)
    .sort((left, right) => left.index - right.index);
  const lock = lockCandidates[0];
  const boundaries = [where, orderBy, lock?.index ?? -1];
  const tableEnd = firstAfter(boundaries, from, normalized.length);
  const conditionEnd = where >= 0 ? firstAfter([orderBy, lock?.index ?? -1], where, normalized.length) : -1;
  const orderEnd = orderBy >= 0 ? firstAfter([lock?.index ?? -1], orderBy, normalized.length) : -1;

  const expression = compact(normalized.slice("PERFORM".length, from));
  const table = compact(normalized.slice(from + "FROM".length, tableEnd));
  if (!expression || !table) return null;
  return {
    expression,
    table,
    ...(where >= 0 ? { condition: compact(normalized.slice(where + "WHERE".length, conditionEnd)) } : {}),
    ...(orderBy >= 0 ? { orderBy: compact(normalized.slice(orderBy + "ORDER BY".length, orderEnd)) } : {}),
    ...(lock ? { lock: lock.phrase } : {}),
  };
}
