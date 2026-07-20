import type { SourceRange } from "./types";
import { projectInsertStatement, type InsertProjection } from "./insertProjection";
import { computeSummary, computeTarget, projectComputeStatement, type ComputeProjection } from "./computeProjection";
import { projectMutationStatement, type MutationProjection } from "./mutationProjection";
import { projectSelectStatement, type SelectProjection } from "./selectProjection";
import { projectConditionChain, projectConditionExpression, type ConditionDisplayRow, type ConditionProjection } from "./conditionProjection";
import { projectContextDeclarations, type ContextProjection } from "./contextProjection";
import { projectPerformStatement, type PerformProjection } from "./performProjection";
import { projectReturnStatement, type ReturnProjection } from "./returnProjection";
import { projectAssignmentStatement, type AssignmentProjection } from "./assignmentProjection";

export type RoutineFlowNodeKind = "start" | "context" | "condition" | "assignment" | "compute" | "raise" | "return" | "sql" | "merge" | "unparsed" | "end";
export type RoutineFlowPortType = "control" | "data" | "branch" | "error" | "result";

export interface RoutineFlowPort { id: string; label: string; type: RoutineFlowPortType; }
export interface RoutineFlowDiagnostic { level: "warning" | "error"; message: string; range?: SourceRange; }
export interface MergeProjection { rows: Array<{ inputId: string; label: string; detail: string; kind: "variable" | "branch" }>; consumer?: string }
export interface RoutineFlowNodeDetails { errcode?: string; message?: string; detail?: string; hint?: string; context?: ContextProjection; assignment?: AssignmentProjection; perform?: PerformProjection; return?: ReturnProjection; insert?: InsertProjection; select?: SelectProjection; mutation?: MutationProjection; compute?: ComputeProjection; merge?: MergeProjection; condition?: ConditionProjection; conditionRows?: ConditionDisplayRow[] }
export interface RoutineFlowNode {
  id: string;
  kind: RoutineFlowNodeKind;
  title: string;
  source: string;
  range: SourceRange;
  inputs: RoutineFlowPort[];
  outputs: RoutineFlowPort[];
  details?: RoutineFlowNodeDetails;
  groupedSourceIds?: string[];
  diagnostic?: RoutineFlowDiagnostic;
}
export interface RoutineFlowEdge { id: string; sourceId: string; sourcePortId: string; targetId: string; targetPortId: string; }
export interface RoutineFlow { routineId: string; bodyHash: string; nodes: RoutineFlowNode[]; edges: RoutineFlowEdge[]; diagnostics: RoutineFlowDiagnostic[]; complete: boolean; }

type Statement =
  | { kind: "if"; start: number; end: number; branches: Array<{ condition?: string; conditionRange?: SourceRange; body: Statement[] }>; source: string }
  | { kind: "context" | "assignment" | "compute" | "raise" | "return" | "sql" | "unparsed"; start: number; end: number; source: string };

interface SourceLine { text: string; start: number; end: number; }

function hash(value: string): string {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) result = Math.imul(result ^ value.charCodeAt(index), 16777619);
  return (result >>> 0).toString(36);
}

function linesOf(source: string): SourceLine[] {
  const lines: SourceLine[] = [];
  let start = 0;
  for (const match of source.matchAll(/.*(?:\n|$)/g)) {
    if (!match[0]) continue;
    lines.push({ text: match[0], start, end: start + match[0].length });
    start += match[0].length;
  }
  return lines;
}

function significant(value: string): string { return value.replace(/--.*$/, "").trim(); }

function splitDeclare(lines: SourceLine[]): { context?: Statement; bodyFrom: number } {
  const first = lines.findIndex((line) => significant(line.text));
  if (first < 0 || !/^DECLARE\b/i.test(significant(lines[first].text))) return { bodyFrom: 0 };
  const begin = lines.findIndex((line, index) => index > first && /^BEGIN\b/i.test(significant(line.text)));
  if (begin < 0) return { bodyFrom: 0 };
  return {
    context: { kind: "context", start: lines[first].start, end: lines[Math.max(first, begin - 1)].end, source: lines.slice(first, begin).map((line) => line.text).join("").trim() },
    bodyFrom: begin,
  };
}

function collectThrough(lines: SourceLine[], from: number, pattern: RegExp): { next: number; source: string; start: number; end: number } {
  let index = from;
  let source = "";
  while (index < lines.length) {
    source += lines[index].text;
    index += 1;
    if (pattern.test(source)) break;
  }
  return { next: index, source: source.trim(), start: lines[from]?.start ?? 0, end: lines[index - 1]?.end ?? lines[from]?.end ?? 0 };
}

function parseSequence(lines: SourceLine[], from: number, stop: (line: string) => boolean, diagnostics: RoutineFlowDiagnostic[]): { statements: Statement[]; next: number } {
  const statements: Statement[] = [];
  let index = from;
  while (index < lines.length) {
    const line = significant(lines[index].text);
    if (!line || /^\s*(?:BEGIN|END)\s*;?\s*$/i.test(line)) { index += 1; continue; }
    if (stop(line)) break;
    if (/^IF\b/i.test(line)) {
      const header = collectThrough(lines, index, /\bTHEN\s*(?:--.*)?$/im);
      const firstCondition = header.source.replace(/^IF\s+/i, "").replace(/\s+THEN\s*$/i, "").trim();
      const branches: Extract<Statement, { kind: "if" }>["branches"] = [];
      let cursor = header.next;
      let body = parseSequence(lines, cursor, (value) => /^(?:ELSIF\b|ELSE\b|END\s+IF\b)/i.test(value), diagnostics);
      branches.push({ condition: firstCondition, conditionRange: { start: header.start, end: header.end }, body: body.statements });
      cursor = body.next;
      while (cursor < lines.length && /^ELSIF\b/i.test(significant(lines[cursor].text))) {
        const elsifHeader = collectThrough(lines, cursor, /\bTHEN\s*(?:--.*)?$/im);
        const condition = elsifHeader.source.replace(/^ELSIF\s+/i, "").replace(/\s+THEN\s*$/i, "").trim();
        body = parseSequence(lines, elsifHeader.next, (value) => /^(?:ELSIF\b|ELSE\b|END\s+IF\b)/i.test(value), diagnostics);
        branches.push({ condition, conditionRange: { start: elsifHeader.start, end: elsifHeader.end }, body: body.statements });
        cursor = body.next;
      }
      if (cursor < lines.length && /^ELSE\b/i.test(significant(lines[cursor].text))) {
        body = parseSequence(lines, cursor + 1, (value) => /^END\s+IF\b/i.test(value), diagnostics);
        branches.push({ body: body.statements });
        cursor = body.next;
      }
      if (cursor >= lines.length || !/^END\s+IF\b/i.test(significant(lines[cursor].text))) {
        diagnostics.push({ level: "error", message: "Unclosed IF block.", range: { start: header.start, end: header.end } });
        statements.push({ kind: "if", start: header.start, end: lines[Math.max(index, cursor - 1)]?.end ?? header.end, branches, source: lines.slice(index, cursor).map((item) => item.text).join("").trim() });
        return { statements, next: cursor };
      }
      const end = lines[cursor].end;
      statements.push({ kind: "if", start: header.start, end, branches, source: lines.slice(index, cursor + 1).map((item) => item.text).join("").trim() });
      index = cursor + 1;
      continue;
    }
    const collected = collectThrough(lines, index, /;\s*(?:--.*)?$/m);
    const normalized = collected.source.trim();
    const terminated = /;\s*(?:--.*)?$/m.test(collected.source);
    const kind: Statement["kind"] = !terminated ? "unparsed" : /^RAISE\s+EXCEPTION\b/i.test(normalized) ? "raise" : /^RETURN\b/i.test(normalized) ? "return" : /^SELECT\b[\s\S]*\bINTO\b/i.test(normalized) ? "compute" : /:=/.test(normalized) ? "assignment" : "sql";
    statements.push({ kind, start: collected.start, end: collected.end, source: normalized } as Statement);
    if (!terminated) diagnostics.push({ level: "warning", message: "Statement has no terminating semicolon.", range: { start: collected.start, end: collected.end } });
    index = collected.next;
  }
  return { statements, next: index };
}

function nodeId(routineId: string, kind: string, start: number): string { return `${routineId}:flow:${kind}:${start}`; }

function splitRaiseOptions(source: string): string[] {
  const using = source.match(/\bUSING\b([\s\S]*?);?\s*$/i)?.[1];
  if (!using) return [];
  const options: string[] = [];
  let start = 0;
  let depth = 0;
  let quoted = false;
  for (let index = 0; index < using.length; index += 1) {
    const character = using[index];
    if (character === "'" && quoted && using[index + 1] === "'") { index += 1; continue; }
    if (character === "'") { quoted = !quoted; continue; }
    if (quoted) continue;
    if (character === "(" || character === "[") depth += 1;
    else if (character === ")" || character === "]") depth = Math.max(0, depth - 1);
    else if (character === "," && depth === 0) {
      options.push(using.slice(start, index).trim());
      start = index + 1;
    }
  }
  options.push(using.slice(start).trim());
  return options.filter(Boolean);
}

function raiseDetails(source: string): RoutineFlowNodeDetails {
  const result: RoutineFlowNodeDetails = {};
  for (const option of splitRaiseOptions(source)) {
    const match = option.match(/^(ERRCODE|MESSAGE|DETAIL|HINT)\s*=\s*([\s\S]+)$/i);
    if (!match) continue;
    const literal = match[2].trim().match(/^'((?:''|[^'])*)'$/);
    const value = literal ? literal[1].replaceAll("''", "'") : match[2].trim();
    const key = match[1].toLocaleLowerCase("en");
    if (key === "errcode") result.errcode = value;
    else if (key === "message") result.message = value;
    else if (key === "detail") result.detail = value;
    else if (key === "hint") result.hint = value;
  }
  return result;
}

function conciseMessage(source: string): string | undefined {
  const message = raiseDetails(source).message?.replace(/[.!]+$/, "");
  if (!message) return undefined;
  return message.length > 44 ? `${message.slice(0, 41)}…` : message;
}

function branchSummary(branch: Extract<Statement, { kind: "if" }>["branches"][number]): string | undefined {
  const first = branch.body[0]; if (!first) return undefined;
  if (first.kind === "return") return "Return from routine";
  if (first.kind === "raise") return conciseMessage(first.source) ?? "Raise exception";
  if (first.kind === "assignment") return "Update value";
  if (first.kind === "compute") return computeSummary(first.source);
  if (first.kind === "sql") {
    return "Run SQL statement";
  }
  return undefined;
}

function nodeTitle(item: Extract<Statement, { kind: "context" | "assignment" | "compute" | "raise" | "return" | "sql" | "unparsed" }>): string {
  if (item.kind === "context") return "DECLARE";
  if (item.kind === "compute") {
    const target = computeTarget(item.source);
    if (target === "changed") return "Changed fields";
    return target ? `Compute ${target}` : "Compute value";
  }
  if (item.kind === "raise") return "RAISE EXCEPTION";
  if (item.kind === "return") return "RETURN";
  if (item.kind === "assignment") return "ASSIGNMENT";
  if (item.kind === "unparsed") return "Unparsed SQL";
  const perform = projectPerformStatement(item.source); if (perform) return "PERFORM";
  const insert = projectInsertStatement(item.source); if (insert) return `INSERT ${insert.table}`;
  const select = projectSelectStatement(item.source); if (select?.table) return `Read ${select.table}`;
  const mutation = projectMutationStatement(item.source); if (mutation) return mutation.operation === "UPDATE" ? "UPDATE" : `Delete ${mutation.table}`;
  return "SQL statement";
}

function nodeDetails(item: Extract<Statement, { kind: "context" | "assignment" | "compute" | "raise" | "return" | "sql" | "unparsed" }>): RoutineFlowNodeDetails | undefined {
  if (item.kind === "raise") return raiseDetails(item.source);
  if (item.kind === "return") return { return: projectReturnStatement(item.source) ?? undefined };
  if (item.kind === "assignment") return { assignment: projectAssignmentStatement(item.source) ?? undefined };
  if (item.kind === "context") {
    const context = projectContextDeclarations(item.source);
    const names = context.declarations.map((declaration) => declaration.name);
    return { context, ...(names.length ? { message: names.join(", ") } : {}) };
  }
  if (item.kind === "compute") {
    const compute = projectComputeStatement(item.source);
    return { message: compute?.summary ?? computeSummary(item.source), compute: compute ?? undefined };
  }
  if (item.kind === "sql") return { perform: projectPerformStatement(item.source) ?? undefined, insert: projectInsertStatement(item.source) ?? undefined, select: projectSelectStatement(item.source) ?? undefined, mutation: projectMutationStatement(item.source) ?? undefined };
  return undefined;
}

function compile(routineId: string, body: string, statements: Statement[]): { nodes: RoutineFlowNode[]; edges: RoutineFlowEdge[] } {
  const nodes: RoutineFlowNode[] = [];
  const edges: RoutineFlowEdge[] = [];
  const context = statements[0]?.kind === "context" ? statements[0] : undefined;
  const executableStatements = context ? statements.slice(1) : statements;
  const start: RoutineFlowNode = { id: nodeId(routineId, "start", 0), kind: "start", title: "BEGIN", source: "BEGIN", range: { start: 0, end: 0 }, inputs: context ? [{ id: "in", label: "In", type: "control" }] : [], outputs: [{ id: "next", label: "Next", type: "control" }] };
  const end: RoutineFlowNode = { id: nodeId(routineId, "end", body.length), kind: "end", title: "End", source: "END", range: { start: body.length, end: body.length }, inputs: [{ id: "in", label: "In", type: "control" }], outputs: [] };
  let edgeOrdinal = 0;
  const connect = (sourceId: string, port: string, targetId: string) => edges.push({ id: `${routineId}:flow-edge:${edgeOrdinal++}`, sourceId, sourcePortId: port, targetId, targetPortId: "in" });

  if (context) {
    const contextNode: RoutineFlowNode = {
      id: nodeId(routineId, "context", context.start), kind: "context", title: nodeTitle(context), source: context.source, range: { start: context.start, end: context.end },
      inputs: [], outputs: [{ id: "next", label: "Next", type: "control" }], details: nodeDetails(context),
    };
    nodes.push(contextNode, start);
    connect(contextNode.id, "next", start.id);
  } else {
    nodes.push(start);
  }

  const compileSequence = (items: Statement[], incoming: Array<{ id: string; port: string }>): Array<{ id: string; port: string }> => {
    let tails = incoming;
    for (const item of items) {
      if (item.kind === "if") {
        const terminalFirstBranch = item.branches[0]?.body.at(-1)?.kind === "return";
        const condition = projectConditionChain(item.branches.map((branch) => branch.condition), terminalFirstBranch);
        condition.branches = item.branches.map((branch, index) => ({ ...(condition.branches?.[index] ?? { label: branch.condition ? "Condition met" : "Otherwise" }), summary: branchSummary(branch) }));
        const outputs: RoutineFlowPort[] = []; const conditionRows: ConditionDisplayRow[] = []; const branchPorts: string[][] = [];
        const branchOutcome = (branchIndex: number, hasCondition: boolean) => {
          if (condition.kind === "switch") return hasCondition ? "Then" : "Else";
          if (!hasCondition) return "Else";
          return branchIndex === 0 ? "Then" : "Elsif";
        };
        item.branches.forEach((branch, branchIndex) => {
          if (!branch.condition) {
            const outcome = branchOutcome(branchIndex, false);
            const portId = `branch-${branchIndex}`; outputs.push({ id: portId, label: outcome, type: "branch" }); branchPorts.push([portId]);
            conditionRows.push({ id: `otherwise-${branchIndex}`, left: "Otherwise", outcome, portId }); return;
          }
          const projected = projectConditionExpression(branch.condition); const ports: string[] = [];
          const outcome = branchOutcome(branchIndex, true);
          projected.clauses.forEach((clause, clauseIndex) => {
            const actionable = clauseIndex === projected.clauses.length - 1;
            const portId = actionable ? `branch-${branchIndex}` : undefined;
            if (portId) { outputs.push({ id: portId, label: outcome, type: branch.body[0]?.kind === "raise" ? "error" : "branch" }); ports.push(portId); }
            conditionRows.push({ id: `branch-${branchIndex}-row-${clauseIndex}`, left: clause.left, operator: clause.operator, right: clause.right, outcome, portId, group: projected.logic, groupIndex: clauseIndex, groupSize: projected.clauses.length, raw: clause.raw });
          });
          branchPorts.push(ports);
        });
        if (!item.branches.some((branch) => !branch.condition)) { const outcome = "Continue"; outputs.push({ id: "default", label: outcome, type: "branch" }); conditionRows.push({ id: "default-row", left: "Otherwise", outcome, portId: "default" }); }
        const comparedRows = conditionRows.filter((row) => row.left !== "Otherwise");
        const isTriggerOperation = comparedRows.length > 0 && comparedRows.every((row) => row.left.replace(/\s+/g, "").toUpperCase() === "TG_OP");
        const conditionTitle = isTriggerOperation ? "IF" : condition.kind === "switch" ? "Branch by value" : condition.kind === "guard" ? "Guard" : "IF";
        if (condition.kind === "guard" && /pg_trigger_depth\s*\(/i.test(condition.original) && condition.branches?.[0]) condition.branches[0].label = "Nested trigger";
        const conditionNode: RoutineFlowNode = { id: nodeId(routineId, "condition", item.start), kind: "condition", title: conditionTitle, source: item.source, range: { start: item.start, end: item.end }, inputs: [{ id: "in", label: "In", type: "control" }], outputs, details: { condition, conditionRows } };
        nodes.push(conditionNode); tails.forEach((tail) => connect(tail.id, tail.port, conditionNode.id));
        const branchTails = item.branches.flatMap((branch, index) => compileSequence(branch.body, branchPorts[index].map((port) => ({ id: conditionNode.id, port }))));
        tails = item.branches.some((branch) => !branch.condition) ? branchTails : [...branchTails, { id: conditionNode.id, port: "default" }];
        continue;
      }
      const kind = item.kind;
      const title = nodeTitle(item);
      const outputs: RoutineFlowPort[] = kind === "raise" || kind === "return" ? [] : [{ id: "next", label: "Next", type: kind === "sql" || kind === "assignment" || kind === "compute" ? "result" : "control" }];
      const node: RoutineFlowNode = { id: nodeId(routineId, kind, item.start), kind, title, source: item.source, range: { start: item.start, end: item.end }, inputs: [{ id: "in", label: "In", type: kind === "raise" ? "error" : "control" }], outputs, details: nodeDetails(item) };
      nodes.push(node); tails.forEach((tail) => connect(tail.id, tail.port, node.id)); tails = outputs.length ? [{ id: node.id, port: "next" }] : [];
    }
    return tails;
  };
  const tails = compileSequence(executableStatements, [{ id: start.id, port: "next" }]);
  if (tails.length > 0) { nodes.push(end); tails.forEach((tail) => connect(tail.id, tail.port, end.id)); }
  return { nodes, edges };
}

export function groupRoutineValidations(flow: RoutineFlow): RoutineFlow {
  const nodesById = new Map(flow.nodes.map((node) => [node.id, node]));
  const removed = new Set<string>();
  const replacementEdges = [...flow.edges];
  const failureEdgesFor = (nodeId: string) => replacementEdges.filter((edge) => edge.sourceId === nodeId && edge.sourcePortId !== "default");
  const singleRaiseTarget = (nodeId: string): string | undefined => {
    const targets = [...new Set(failureEdgesFor(nodeId).map((edge) => edge.targetId))];
    return targets.length === 1 && nodesById.get(targets[0])?.kind === "raise" ? targets[0] : undefined;
  };
  const nodes = flow.nodes.map((node) => {
    if (node.kind !== "condition" || removed.has(node.id)) return node;
    const chain = [node];
    let cursor = node;
    while (true) {
      const defaultEdge = replacementEdges.find((edge) => edge.sourceId === cursor.id && edge.sourcePortId === "default");
      const next = defaultEdge && nodesById.get(defaultEdge.targetId);
      if (!singleRaiseTarget(cursor.id) || next?.kind !== "condition") break;
      if (!singleRaiseTarget(next.id)) break;
      chain.push(next); removed.add(next.id); cursor = next;
    }
    if (chain.length === 1) return node;
    const outputs: RoutineFlowPort[] = [];
    chain.forEach((condition, index) => {
      const failures = failureEdgesFor(condition.id);
      const failure = failures[0];
      const original = condition.outputs.find((port) => port.id !== "default");
      if (!failure || !original) return;
      const portId = `failure-${index}`;
      outputs.push({ id: portId, label: original.label, type: "error" });
      failure.sourceId = node.id; failure.sourcePortId = portId;
      failures.slice(1).forEach((edge) => { edge.sourceId = "__removed__"; });
    });
    const finalDefault = replacementEdges.find((edge) => edge.sourceId === chain.at(-1)!.id && edge.sourcePortId === "default");
    replacementEdges.filter((edge) => chain.slice(0, -1).some((item) => item.id === edge.sourceId && edge.sourcePortId === "default")).forEach((edge) => { edge.sourceId = "__removed__"; });
    if (finalDefault) { finalDefault.sourceId = node.id; finalDefault.sourcePortId = "default"; }
    outputs.push({ id: "default", label: "Default", type: "branch" });
    const clauses = chain.flatMap((item) => item.details?.condition?.clauses ?? []);
    const branches = outputs.filter((output) => output.id !== "default").map((output) => ({ label: output.label }));
    const groupedCondition: ConditionProjection = { kind: "decision", original: chain.map((item) => item.details?.condition?.original ?? item.source).join("\n"), clauses, branches };
    const conditionRows: ConditionDisplayRow[] = chain.flatMap((item, index) => (item.details?.conditionRows ?? []).filter((row) => row.portId !== "default").map((row) => ({ ...row, id: `${item.id}:${row.id}`, ...(row.portId ? { portId: `failure-${index}` } : {}) }))).concat([{ id: "default-row", left: "Otherwise", outcome: "Continue", portId: "default" }]);
    return { ...node, title: "Validation", source: chain.map((item) => item.source).join("\n"), range: { start: node.range.start, end: chain.at(-1)!.range.end }, outputs, groupedSourceIds: chain.map((item) => item.id), details: { ...node.details, condition: groupedCondition, conditionRows } };
  }).filter((node) => !removed.has(node.id));
  return { ...flow, nodes, edges: replacementEdges.filter((edge) => edge.sourceId !== "__removed__" && !removed.has(edge.targetId)) };
}

export function parseRoutineFlow(routineId: string, body: string): RoutineFlow {
  const diagnostics: RoutineFlowDiagnostic[] = [];
  const lines = linesOf(body);
  const declaration = splitDeclare(lines);
  const parsed = parseSequence(lines, declaration.bodyFrom, () => false, diagnostics);
  const compiled = compile(routineId, body, declaration.context ? [declaration.context, ...parsed.statements] : parsed.statements);
  return insertRoutineFlowMerges(groupRoutineValidations({ routineId, bodyHash: hash(body), ...compiled, diagnostics, complete: !diagnostics.some((item) => item.level === "error") }));
}

export function insertRoutineFlowMerges(flow: RoutineFlow): RoutineFlow {
  const nodes = [...flow.nodes]; const edges = [...flow.edges];
  const semanticChangedMerge = (incoming: RoutineFlowEdge[], target: RoutineFlowNode): MergeProjection | undefined => {
    const rows = incoming.map((edge, index) => {
      const source = nodes.find((node) => node.id === edge.sourceId);
      if (source?.kind !== "compute" || source.details?.compute?.target !== "changed") return null;
      return { inputId: `in-${index}`, label: "changed", detail: source.details.compute.select?.fields.join(", ") ?? source.details.compute.summary, kind: "variable" as const };
    });
    const consumer = target.details?.insert?.mappings.find((mapping) => mapping.value === "changed")?.column;
    return rows.every(Boolean) ? { rows: rows as MergeProjection["rows"], consumer } : undefined;
  };
  const targets = [...new Set(edges.map((edge) => edge.targetId))].sort();
  for (const targetId of targets) {
    const incoming = edges.filter((edge) => edge.targetId === targetId).sort((a, b) => a.id.localeCompare(b.id));
    if (incoming.length < 2) continue;
    const semanticSources = new Set(incoming.map((edge) => `${edge.sourceId}:${edge.sourcePortId.replace(/-clause-\d+$/, "")}`));
    if (semanticSources.size < 2) continue;
    const signature = incoming.map((edge) => `${edge.sourceId}:${edge.sourcePortId}`).join("|");
    const mergeId = `${flow.routineId}:flow:merge:${hash(`${targetId}|${signature}`)}`;
    const target = nodes.find((node) => node.id === targetId); if (!target || target.kind === "merge") continue;
    const semanticMerge = semanticChangedMerge(incoming, target);
    const merge: RoutineFlowNode = { id: mergeId, kind: "merge", title: semanticMerge ? "changed ready" : "Merge", source: "", range: { start: target.range.start, end: target.range.start }, inputs: incoming.map((edge, index) => ({ id: `in-${index}`, label: semanticMerge?.rows[index]?.label ?? `Path ${index + 1}`, type: "branch" })), outputs: [{ id: "next", label: semanticMerge?.consumer ? `to ${semanticMerge.consumer}` : "Next", type: "control" }], details: semanticMerge ? { merge: semanticMerge } : undefined };
    nodes.push(merge);
    incoming.forEach((edge, index) => { edge.targetId = mergeId; edge.targetPortId = `in-${index}`; });
    edges.push({ id: `${mergeId}:next`, sourceId: mergeId, sourcePortId: "next", targetId, targetPortId: target.inputs[0]?.id ?? "in" });
  }
  return { ...flow, nodes, edges };
}
