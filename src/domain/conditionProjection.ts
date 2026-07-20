export type ConditionLogic = "and" | "or";
export type ConditionProjectionKind = "guard" | "decision" | "switch";

export interface ConditionClause {
  left: string;
  operator: string;
  right?: string;
  raw: string;
}

export interface ConditionBranchProjection {
  label: string;
  value?: string;
  expression?: string;
  summary?: string;
}

export interface ConditionProjection {
  kind: ConditionProjectionKind;
  original: string;
  clauses: ConditionClause[];
  logic?: ConditionLogic;
  subject?: string;
  branches?: ConditionBranchProjection[];
}

export interface ConditionDisplayRow {
  id: string;
  left: string;
  operator?: string;
  right?: string;
  outcome: string;
  portId?: string;
  group?: ConditionLogic;
  groupIndex?: number;
  groupSize?: number;
  raw?: string;
}

const readableOperators: Array<[RegExp, string]> = [
  [/^(.+?)\s+IS\s+NOT\s+NULL$/i, "is present"],
  [/^(.+?)\s+IS\s+NULL$/i, "is missing"],
  [/^(.+?)\s+NOT\s+BETWEEN\s+(.+?)\s+AND\s+(.+)$/i, "outside range"],
  [/^(.+?)\s+BETWEEN\s+(.+?)\s+AND\s+(.+)$/i, "within range"],
  [/^(.+?)\s+IS\s+DISTINCT\s+FROM\s+(.+)$/i, "differs from"],
  [/^(.+?)\s*>=\s*(.+)$/i, ">="],
  [/^(.+?)\s*<=\s*(.+)$/i, "<="],
  [/^(.+?)\s*(<>|!=)\s*(.+)$/i, "!="],
  [/^(.+?)\s*=\s*(.+)$/i, "="],
  [/^(.+?)\s*>\s*(.+)$/i, ">"],
  [/^(.+?)\s*<\s*(.+)$/i, "<"],
];

function displayValue(value: string): string {
  const trimmed = value.trim();
  return /^'(?:''|[^'])*'$/.test(trimmed) ? trimmed.slice(1, -1).replaceAll("''", "'") : trimmed;
}

function keywordAt(source: string, index: number, keyword: string): boolean {
  if (source.slice(index, index + keyword.length).toUpperCase() !== keyword) return false;
  const before = source[index - 1]; const after = source[index + keyword.length];
  return (!before || !/[\w$]/.test(before)) && (!after || !/[\w$]/.test(after));
}

function splitTopLevel(source: string, keyword: "AND" | "OR"): string[] {
  const parts: string[] = []; let start = 0; let depth = 0; let quote: "'" | '"' | null = null; let between = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === quote && source[index + 1] === quote) { index += 1; continue; }
      if (character === quote) quote = null;
      continue;
    }
    if (character === "'" || character === '"') { quote = character; continue; }
    if (character === "(") { depth += 1; continue; }
    if (character === ")") { depth = Math.max(0, depth - 1); continue; }
    if (depth !== 0) continue;
    if (keywordAt(source, index, "BETWEEN")) { between = true; index += "BETWEEN".length - 1; continue; }
    if (keyword === "AND" && between && keywordAt(source, index, "AND")) { between = false; index += 2; continue; }
    if (!keywordAt(source, index, keyword)) continue;
    parts.push(source.slice(start, index).trim()); start = index + keyword.length; index += keyword.length - 1; between = false;
  }
  parts.push(source.slice(start).trim());
  return parts.filter(Boolean);
}

function stripOuterParens(source: string): string {
  const value = source.trim();
  if (!value.startsWith("(") || !value.endsWith(")")) return value;
  let depth = 0; let quote: "'" | '"' | null = null;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quote) { if (character === quote && value[index + 1] === quote) index += 1; else if (character === quote) quote = null; continue; }
    if (character === "'" || character === '"') { quote = character; continue; }
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (depth === 0 && index < value.length - 1) return value;
  }
  return value.slice(1, -1).trim();
}

export function projectConditionClause(source: string): ConditionClause {
  const raw = stripOuterParens(source);
  for (const [pattern, operator] of readableOperators) {
    const match = raw.match(pattern); if (!match) continue;
    const valueIndex = operator === "!=" && match[3] ? 3 : 2;
    const right = operator === "outside range" || operator === "within range" ? `${displayValue(match[2])} – ${displayValue(match[3])}` : match[valueIndex] ? displayValue(match[valueIndex]) : undefined;
    return { left: match[1].trim(), operator, right, raw };
  }
  return { left: raw, operator: "evaluates as true", raw };
}

export function projectConditionExpression(expression: string): Pick<ConditionProjection, "original" | "clauses" | "logic"> {
  const original = expression.trim();
  const orParts = splitTopLevel(original, "OR");
  if (orParts.length > 1) return { original, clauses: orParts.map(projectConditionClause), logic: "or" };
  const andParts = splitTopLevel(original, "AND");
  if (andParts.length > 1) return { original, clauses: andParts.map(projectConditionClause), logic: "and" };
  return { original, clauses: [projectConditionClause(original)] };
}

function equality(expression: string): { subject: string; value: string } | undefined {
  const clause = projectConditionClause(expression);
  if (clause.operator !== "=" || !clause.right) return undefined;
  return { subject: clause.left.replace(/\s+/g, " ").trim(), value: clause.right.replace(/^'|'$/g, "") };
}

export function projectConditionChain(conditions: Array<string | undefined>, terminalFirstBranch = false): ConditionProjection {
  const explicit = conditions.filter((condition): condition is string => Boolean(condition));
  const equalities = explicit.map(equality);
  if (explicit.length > 1 && equalities.every(Boolean) && equalities.every((item) => item!.subject.toUpperCase() === equalities[0]!.subject.toUpperCase())) {
    const branches: ConditionBranchProjection[] = equalities.map((item, index) => ({ label: item!.value, value: item!.value, expression: explicit[index] }));
    if (conditions.some((condition) => !condition)) branches.push({ label: "Otherwise" });
    return { kind: "switch", original: explicit.join("\n"), subject: equalities[0]!.subject, clauses: [], branches };
  }
  return { kind: terminalFirstBranch ? "guard" : "decision", ...projectConditionExpression(explicit[0] ?? "") };
}
