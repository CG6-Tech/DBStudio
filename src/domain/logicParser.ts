import type { DatabaseTrigger, LogicEdge, LogicReference, Routine, RoutineParameter, SqlDialect, Table } from "./types";

function unquote(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("`") && trimmed.endsWith("`"))) return trimmed.slice(1, -1);
  return trimmed;
}

function qualified(value: string): { schema?: string; name: string } {
  const parts = value.split(".").map(unquote);
  return parts.length > 1 ? { schema: parts.at(-2), name: parts.at(-1)! } : { name: parts[0] };
}

function stable(value: string): string {
  return value.toLocaleLowerCase("en").replace(/[^a-z0-9_$.-]+/g, "-");
}

function splitParameters(value: string): RoutineParameter[] {
  const result: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === "(") depth += 1;
    else if (value[index] === ")") depth -= 1;
    else if (value[index] === "," && depth === 0) { result.push(value.slice(start, index)); start = index + 1; }
  }
  result.push(value.slice(start));
  return result.map((raw) => raw.trim()).filter(Boolean).map((raw) => {
    const parts = raw.split(/\s+/);
    const modeValue = parts[0]?.toLocaleLowerCase("en");
    const mode = (["in", "out", "inout", "variadic"] as const).find((item) => item === modeValue);
    if (mode) parts.shift();
    if (parts.length === 1) return { mode, dataType: parts[0] };
    return { mode, name: unquote(parts.shift()!), dataType: parts.join(" ") };
  });
}

function refs(body: string, expression: RegExp): LogicReference[] {
  const seen = new Set<string>();
  return [...body.matchAll(expression)].flatMap((match) => {
    const item = qualified(match[1]);
    const key = `${item.schema ?? ""}.${item.name}`.toLocaleLowerCase("en");
    if (seen.has(key)) return [];
    seen.add(key);
    return [item];
  });
}

function routineBody(definition: string, dialect: SqlDialect): string {
  if (dialect === "postgresql") {
    const dollar = definition.match(/\$([A-Za-z0-9_]*)\$([\s\S]*?)\$\1\$/);
    if (dollar) return dollar[2].trim();
    const quoted = definition.match(/\bAS\s+'([\s\S]*?)'\s*(?:LANGUAGE|;|$)/i);
    if (quoted) return quoted[1].replaceAll("''", "'").trim();
  }
  const begin = definition.match(/\bBEGIN\b([\s\S]*?)\bEND\b/i);
  return (begin?.[1] ?? definition).trim();
}

function objectDefinitions(source: string): Array<{ start: number; end: number; sql: string }> {
  const starts = [...source.matchAll(/\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:DEFINER\s*=\s*[^\s]+\s+)?(?:FUNCTION|PROCEDURE|TRIGGER)\b/gi)].map((match) => match.index);
  return starts.map((start, index) => {
    const next = starts[index + 1] ?? source.length;
    let end = next;
    const delimiter = source.slice(start, next).search(/\n\s*DELIMITER\s+/i);
    if (delimiter >= 0) end = start + delimiter;
    return { start, end, sql: source.slice(start, end).trim() };
  });
}

function parseRoutine(definition: { start: number; end: number; sql: string }, dialect: SqlDialect): Routine | null {
  const match = definition.sql.match(/\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:DEFINER\s*=\s*[^\s]+\s+)?(FUNCTION|PROCEDURE)\s+((?:["`\w$]+\.)?["`\w$]+)\s*\(([^)]*)\)/i);
  if (!match) return null;
  const kind = match[1].toLocaleLowerCase("en") as Routine["kind"];
  const name = qualified(match[2]);
  const body = routineBody(definition.sql, dialect);
  const returnType = kind === "function" ? definition.sql.match(/\bRETURNS?\s+([^\n;]+?)(?=\s+LANGUAGE|\s+AS\s+|\s+DETERMINISTIC|\s+BEGIN|$)/i)?.[1]?.trim() : undefined;
  const language = definition.sql.match(/\bLANGUAGE\s+([\w]+)/i)?.[1];
  const dynamic = /\bEXECUTE\s+(?:IMMEDIATE\s+)?[^'"`\w]/i.test(body);
  const calls = refs(body, /\b(?:CALL|PERFORM)\s+((?:["`\w$]+\.)?["`\w$]+)\s*\(/gi);
  if (dynamic) calls.push({ name: "dynamic SQL", dynamic: true });
  return {
    id: `routine:${stable(name.schema ? `${name.schema}.${name.name}` : name.name)}:${definition.start}`,
    kind, ...name, parameters: splitParameters(match[3]), returnType, language, body,
    definitionSql: definition.sql, statementRange: { start: definition.start, end: definition.end },
    calls,
    reads: refs(body, /\b(?:FROM|JOIN)\s+((?:["`\w$]+\.)?["`\w$]+)/gi),
    inserts: refs(body, /\bINSERT\s+INTO\s+((?:["`\w$]+\.)?["`\w$]+)/gi),
    updates: refs(body, /\bUPDATE\s+((?:["`\w$]+\.)?["`\w$]+)\s+SET\b/gi),
    deletes: refs(body, /\bDELETE\s+FROM\s+((?:["`\w$]+\.)?["`\w$]+)/gi),
    partial: false,
  };
}

function parseTrigger(definition: { start: number; end: number; sql: string }, dialect: SqlDialect): DatabaseTrigger | null {
  const header = definition.sql.match(/\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:DEFINER\s*=\s*[^\s]+\s+)?TRIGGER\s+((?:["`\w$]+\.)?["`\w$]+)\s+(BEFORE|AFTER|INSTEAD\s+OF)\s+([\s\S]*?)\s+ON\s+((?:["`\w$]+\.)?["`\w$]+)/i);
  if (!header) return null;
  const name = qualified(header[1]);
  const events = [...header[3].matchAll(/\b(INSERT|UPDATE|DELETE|TRUNCATE)\b/gi)].map((match) => match[1].toLocaleLowerCase("en") as DatabaseTrigger["events"][number]);
  const targetTable = qualified(header[4]);
  const executed = dialect === "postgresql" ? definition.sql.match(/\bEXECUTE\s+(?:FUNCTION|PROCEDURE)\s+((?:["`\w$]+\.)?["`\w$]+)\s*\(/i) : null;
  const condition = definition.sql.match(/\bWHEN\s*\(([^;]+?)\)\s*(?:EXECUTE|BEGIN|FOR)/i)?.[1]?.trim();
  const body = dialect === "mysql" ? routineBody(definition.sql, dialect) : undefined;
  return {
    id: `trigger:${stable(name.schema ? `${name.schema}.${name.name}` : name.name)}:${definition.start}`,
    ...name,
    timing: header[2].replace(/\s+/g, " ").toLocaleLowerCase("en") as DatabaseTrigger["timing"],
    events, scope: /\bFOR\s+EACH\s+ROW\b/i.test(definition.sql) || dialect === "mysql" ? "row" : "statement",
    targetTable, condition, executedRoutine: executed ? qualified(executed[1]) : undefined, body,
    definitionSql: definition.sql, statementRange: { start: definition.start, end: definition.end },
    partial: events.length === 0,
  };
}

function key(value: { schema?: string; name: string }): string { return `${value.schema ?? ""}.${value.name}`.toLocaleLowerCase("en"); }

export function linkDatabaseLogic(tables: readonly Table[], routines: Routine[], triggers: DatabaseTrigger[]): LogicEdge[] {
  const tableByName = new Map(tables.map((table) => [key(table), table]));
  const routinesByName = new Map<string, Routine[]>();
  for (const routine of routines) routinesByName.set(key(routine), [...(routinesByName.get(key(routine)) ?? []), routine]);
  const resolveTable = (reference: LogicReference) => {
    if (reference.schema) return tableByName.get(key(reference));
    const values = tables.filter((table) => table.name.toLocaleLowerCase("en") === reference.name.toLocaleLowerCase("en"));
    return values.length === 1 ? values[0] : undefined;
  };
  const resolveRoutine = (reference: LogicReference) => {
    if (reference.schema) { const values = routinesByName.get(key(reference)); return values?.length === 1 ? values[0] : undefined; }
    const values = routines.filter((routine) => routine.name.toLocaleLowerCase("en") === reference.name.toLocaleLowerCase("en"));
    return values.length === 1 ? values[0] : undefined;
  };
  const logicEdges: LogicEdge[] = [];
  for (const trigger of triggers) {
    const table = resolveTable(trigger.targetTable);
    if (table) trigger.targetTable.resolvedId = table.id;
    logicEdges.push({ id: `${trigger.id}:event`, kind: "table-event", sourceId: table?.id ?? trigger.id, targetId: table ? trigger.id : undefined, unresolvedTarget: table ? undefined : trigger.targetTable, label: trigger.events.map((event) => `ON ${event.toUpperCase()}`).join(" / ") });
    if (trigger.executedRoutine) {
      const routine = resolveRoutine(trigger.executedRoutine);
      if (routine) trigger.executedRoutine.resolvedId = routine.id;
      logicEdges.push({ id: `${trigger.id}:executes`, kind: "executes", sourceId: trigger.id, targetId: routine?.id, unresolvedTarget: routine ? undefined : trigger.executedRoutine, label: "EXECUTES" });
    }
  }
  for (const routine of routines) {
    const groups = [["calls", routine.calls], ["reads", routine.reads], ["inserts", routine.inserts], ["updates", routine.updates], ["deletes", routine.deletes]] as const;
    for (const [kind, references] of groups) for (const reference of references) {
      const target = kind === "calls" ? resolveRoutine(reference) : resolveTable(reference);
      if (target) reference.resolvedId = target.id;
      logicEdges.push({ id: `${routine.id}:${kind}:${stable(key(reference))}`, kind, sourceId: routine.id, targetId: target?.id, unresolvedTarget: target ? undefined : reference, label: kind.toUpperCase() });
    }
  }
  return logicEdges;
}

export function parseDatabaseLogic(source: string, dialect: SqlDialect, tables: readonly Table[]): { routines: Routine[]; triggers: DatabaseTrigger[]; logicEdges: LogicEdge[] } {
  const definitions = objectDefinitions(source);
  const routines = definitions.flatMap((definition) => { const item = parseRoutine(definition, dialect); return item ? [item] : []; });
  const triggers = definitions.flatMap((definition) => { const item = parseTrigger(definition, dialect); return item ? [item] : []; });
  return { routines, triggers, logicEdges: linkDatabaseLogic(tables, routines, triggers) };
}
