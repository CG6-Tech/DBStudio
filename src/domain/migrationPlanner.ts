import { stableHash, type MigrationSnapshot, type MigrationSnapshotColumn, type MigrationSnapshotObject, type MigrationSnapshotTable } from "./migrationSnapshot";
import { stableDependencyOrder } from "./dependencyGraph";

export type MigrationStrategy = "standard" | "low-lock" | "expand-contract";
export type MigrationRisk = "safe" | "review" | "blocked";
export type MigrationChangeKind =
  | "create-table" | "drop-table" | "rename-table"
  | "add-column" | "drop-column" | "rename-column" | "alter-column"
  | "create-index" | "drop-index" | "add-foreign-key" | "drop-foreign-key" | "add-check" | "drop-check"
  | "create-object" | "drop-object" | "replace-object";

export interface MigrationRenameSuggestion {
  id: string;
  kind: "table" | "column";
  desiredKey: string;
  targetKey: string;
  tableKey?: string;
  score: number;
  reasons: string[];
}

export interface MigrationChange {
  id: string;
  kind: MigrationChangeKind;
  objectKind: "table" | "column" | "index" | "foreign-key" | "check" | "type" | "routine" | "trigger";
  objectKey: string;
  tableKey?: string;
  before?: unknown;
  after?: unknown;
  risk: MigrationRisk;
  reason: string;
  dependsOn: string[];
  phase: "expand" | "migrate" | "contract";
  reversible: boolean;
}

export interface MigrationPlan {
  id: string;
  desired: MigrationSnapshot;
  target: MigrationSnapshot;
  changes: MigrationChange[];
  renameSuggestions: MigrationRenameSuggestion[];
  unresolvedRenameIds: string[];
  strategy: MigrationStrategy;
  fingerprint: string;
}

export interface MigrationPlanDecisions {
  renames?: Record<string, "accepted" | "rejected">;
  approvals?: Record<string, { approved: boolean; reason?: string }>;
  backfills?: Record<string, string>;
}

function nameSimilarity(left: string, right: string): number {
  const a = left.toLocaleLowerCase("en");
  const b = right.toLocaleLowerCase("en");
  if (a === b) return 1;
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let row = 1; row <= a.length; row += 1) {
    let diagonal = previous[0];
    previous[0] = row;
    for (let column = 1; column <= b.length; column += 1) {
      const above = previous[column];
      previous[column] = Math.min(previous[column] + 1, previous[column - 1] + 1, diagonal + (a[row - 1] === b[column - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return 1 - previous[b.length] / Math.max(1, a.length, b.length);
}

function jaccard(left: Iterable<string>, right: Iterable<string>): number {
  const a = new Set(left);
  const b = new Set(right);
  let intersection = 0;
  a.forEach((value) => { if (b.has(value)) intersection += 1; });
  const union = new Set([...a, ...b]).size;
  return union ? intersection / union : 1;
}

function maximumWeightPairs(weights: number[][]): Array<[number, number, number]> {
  const rows = weights.length;
  const columns = Math.max(0, ...weights.map((row) => row.length));
  const size = Math.max(rows, columns);
  if (!size) return [];
  const maxWeight = Math.max(0, ...weights.flat());
  const u = Array(size + 1).fill(0);
  const v = Array(size + 1).fill(0);
  const p = Array(size + 1).fill(0);
  const way = Array(size + 1).fill(0);
  for (let row = 1; row <= size; row += 1) {
    p[0] = row;
    let column0 = 0;
    const minValue = Array(size + 1).fill(Number.POSITIVE_INFINITY);
    const used = Array(size + 1).fill(false);
    do {
      used[column0] = true;
      const row0 = p[column0];
      let delta = Number.POSITIVE_INFINITY;
      let column1 = 0;
      for (let column = 1; column <= size; column += 1) {
        if (used[column]) continue;
        const weight = row0 <= rows && column <= (weights[row0 - 1]?.length ?? 0) ? weights[row0 - 1][column - 1] : 0;
        const current = maxWeight - weight - u[row0] - v[column];
        if (current < minValue[column]) { minValue[column] = current; way[column] = column0; }
        if (minValue[column] < delta) { delta = minValue[column]; column1 = column; }
      }
      for (let column = 0; column <= size; column += 1) {
        if (used[column]) { u[p[column]] += delta; v[column] -= delta; }
        else minValue[column] -= delta;
      }
      column0 = column1;
    } while (p[column0] !== 0);
    do {
      const column1 = way[column0];
      p[column0] = p[column1];
      column0 = column1;
    } while (column0 !== 0);
  }
  const result: Array<[number, number, number]> = [];
  for (let column = 1; column <= size; column += 1) {
    const row = p[column];
    if (row <= rows && column <= columns) result.push([row - 1, column - 1, weights[row - 1]?.[column - 1] ?? 0]);
  }
  return result;
}

function boundedMaximumWeightPairs<T, U>(
  desired: T[],
  target: U[],
  candidatesFor: (item: T) => number[],
  score: (left: T, right: U) => number,
): Array<[number, number, number]> {
  const result: Array<[number, number, number]> = [];
  const matchedTargets = new Set<number>();
  const chunkSize = 24;
  for (let start = 0; start < desired.length; start += chunkSize) {
    const desiredIndexes = Array.from({ length: Math.min(chunkSize, desired.length - start) }, (_, offset) => start + offset);
    const scoresByDesired = desiredIndexes.map((desiredIndex) => candidatesFor(desired[desiredIndex])
      .filter((targetIndex) => !matchedTargets.has(targetIndex))
      .slice(0, 48)
      .map((targetIndex) => ({ targetIndex, score: score(desired[desiredIndex], target[targetIndex]) }))
      .filter((item) => item.score > 0));
    const targetIndexes = [...new Set(scoresByDesired.flatMap((items) => items.map((item) => item.targetIndex)))]
      .sort((left, right) => left - right)
      .slice(0, 64);
    const targetPosition = new Map(targetIndexes.map((index, position) => [index, position]));
    const weights = scoresByDesired.map((items) => {
      const row = Array(targetIndexes.length).fill(0);
      items.forEach((item) => { const position = targetPosition.get(item.targetIndex); if (position !== undefined) row[position] = item.score; });
      return row;
    });
    maximumWeightPairs(weights).forEach(([desiredPosition, targetPositionIndex, weight]) => {
      const targetIndex = targetIndexes[targetPositionIndex];
      if (weight <= 0 || targetIndex === undefined || matchedTargets.has(targetIndex)) return;
      matchedTargets.add(targetIndex);
      result.push([desiredIndexes[desiredPosition], targetIndex, weight]);
    });
  }
  return result;
}

function addIndexValue(index: Map<string, number[]>, key: string, value: number): void {
  const values = index.get(key);
  if (values) values.push(value); else index.set(key, [value]);
}

function addBoundedCandidates(result: Set<number>, values: readonly number[] | undefined, seed: string, limit = 48): void {
  if (!values?.length || result.size >= limit) return;
  const start = Number.parseInt(stableHash(seed).slice(0, 8), 16) % values.length;
  const count = Math.min(values.length, limit - result.size);
  for (let offset = 0; offset < count; offset += 1) result.add(values[(start + offset) % values.length]);
}

function tableRenameSuggestions(desired: MigrationSnapshotTable[], target: MigrationSnapshotTable[]): MigrationRenameSuggestion[] {
  const featureIndex = new Map<string, number[]>();
  target.forEach((table, index) => {
    const schema = (table.schema ?? "public").toLowerCase();
    addIndexValue(featureIndex, `${schema}:fingerprint:${table.fingerprint}`, index);
    addIndexValue(featureIndex, `${schema}:name-prefix:${table.name.toLowerCase().slice(0, 2)}`, index);
    table.columns.forEach((column) => addIndexValue(featureIndex, `${schema}:column:${column.key}:${column.dataType.toLowerCase()}`, index));
  });
  const candidatesFor = (table: MigrationSnapshotTable) => {
    const schema = (table.schema ?? "public").toLowerCase();
    const candidates = new Set<number>();
    addBoundedCandidates(candidates, featureIndex.get(`${schema}:fingerprint:${table.fingerprint}`), `${table.key}:fingerprint`);
    addBoundedCandidates(candidates, featureIndex.get(`${schema}:name-prefix:${table.name.toLowerCase().slice(0, 2)}`), `${table.key}:name`);
    table.columns.forEach((column) => addBoundedCandidates(candidates, featureIndex.get(`${schema}:column:${column.key}:${column.dataType.toLowerCase()}`), `${table.key}:${column.key}`));
    return [...candidates].sort((left, right) => target[left].key.localeCompare(target[right].key));
  };
  const score = (left: MigrationSnapshotTable, right: MigrationSnapshotTable) => {
    if ((left.schema ?? "public").toLowerCase() !== (right.schema ?? "public").toLowerCase()) return 0;
    const structure = jaccard(left.columns.map((column) => `${column.key}:${column.dataType.toLowerCase()}`), right.columns.map((column) => `${column.key}:${column.dataType.toLowerCase()}`));
    const types = jaccard(left.columns.map((column) => column.fingerprint), right.columns.map((column) => column.fingerprint));
    if (Math.max(structure, types) < 0.45) return 0;
    return nameSimilarity(left.name, right.name) * 0.25 + structure * 0.5 + types * 0.25;
  };
  return boundedMaximumWeightPairs(desired, target, candidatesFor, score).flatMap(([desiredIndex, targetIndex, matchScore]) => {
    if (matchScore < 0.62) return [];
    const left = desired[desiredIndex];
    const right = target[targetIndex];
    const id = `rename:table:${right.key}:${left.key}`;
    return [{ id, kind: "table" as const, desiredKey: left.key, targetKey: right.key, score: matchScore, reasons: ["Same schema", `${Math.round(matchScore * 100)}% structural match`] }];
  });
}

function columnRenameSuggestions(tableKey: string, desired: MigrationSnapshotColumn[], target: MigrationSnapshotColumn[]): MigrationRenameSuggestion[] {
  const byType = new Map<string, number[]>();
  target.forEach((column, index) => addIndexValue(byType, column.dataType.toLowerCase(), index));
  const score = (left: MigrationSnapshotColumn, right: MigrationSnapshotColumn) => {
    const compatible = left.dataType.toLowerCase() === right.dataType.toLowerCase() ? 1 : left.fingerprint === right.fingerprint ? 0.9 : 0;
    return compatible ? compatible * 0.72 + nameSimilarity(left.name, right.name) * 0.28 : 0;
  };
  return boundedMaximumWeightPairs(desired, target, (column) => {
    const candidates = new Set<number>();
    addBoundedCandidates(candidates, byType.get(column.dataType.toLowerCase()), `${tableKey}:${column.key}`);
    return [...candidates];
  }, score).flatMap(([desiredIndex, targetIndex, matchScore]) => {
    if (matchScore < 0.72) return [];
    const left = desired[desiredIndex];
    const right = target[targetIndex];
    return [{ id: `rename:column:${tableKey}:${right.key}:${left.key}`, kind: "column" as const, desiredKey: left.key, targetKey: right.key, tableKey, score: matchScore, reasons: ["Compatible type", `${Math.round(matchScore * 100)}% match`] }];
  });
}

function change(kind: MigrationChangeKind, objectKind: MigrationChange["objectKind"], objectKey: string, values: Partial<MigrationChange>): MigrationChange {
  return {
    id: `change:${stableHash(`${kind}:${objectKind}:${objectKey}`)}`,
    kind,
    objectKind,
    objectKey,
    risk: "safe",
    reason: kind.replaceAll("-", " "),
    dependsOn: [],
    phase: kind.startsWith("drop") ? "contract" : "expand",
    reversible: !kind.startsWith("drop"),
    ...values,
  };
}

function riskForColumn(before: MigrationSnapshotColumn, after: MigrationSnapshotColumn): { risk: MigrationRisk; reason: string } {
  if (before.dataType.toLowerCase() !== after.dataType.toLowerCase()) return { risk: "review", reason: `Type changes from ${before.dataType} to ${after.dataType}` };
  if (before.nullable && !after.nullable) return { risk: "blocked", reason: "Required column may contain null values" };
  return { risk: "safe", reason: "Compatible column metadata change" };
}

function compareTable(desired: MigrationSnapshotTable, target: MigrationSnapshotTable, decisions: MigrationPlanDecisions, suggestions: MigrationRenameSuggestion[], changes: MigrationChange[]): void {
  const desiredColumns = new Map(desired.columns.map((column) => [column.key, column]));
  const targetColumns = new Map(target.columns.map((column) => [column.key, column]));
  const unmatchedDesired = desired.columns.filter((column) => !targetColumns.has(column.key));
  const unmatchedTarget = target.columns.filter((column) => !desiredColumns.has(column.key));
  const columnSuggestions = columnRenameSuggestions(desired.key, unmatchedDesired, unmatchedTarget);
  suggestions.push(...columnSuggestions);
  const acceptedDesired = new Map<string, MigrationSnapshotColumn>();
  const acceptedTarget = new Set<string>();
  columnSuggestions.forEach((suggestion) => {
    if (decisions.renames?.[suggestion.id] !== "accepted") return;
    const before = targetColumns.get(suggestion.targetKey) ?? unmatchedTarget.find((column) => column.key === suggestion.targetKey);
    const after = desiredColumns.get(suggestion.desiredKey) ?? unmatchedDesired.find((column) => column.key === suggestion.desiredKey);
    if (!before || !after) return;
    acceptedDesired.set(after.key, before);
    acceptedTarget.add(before.key);
    changes.push(change("rename-column", "column", `${desired.key}.${before.name}->${after.name}`, { tableKey: desired.key, before, after, risk: "review", reason: "Confirmed column rename", phase: "migrate" }));
  });
  unmatchedDesired.filter((column) => !acceptedDesired.has(column.key)).forEach((column) => changes.push(change("add-column", "column", `${desired.key}.${column.name}`, { tableKey: desired.key, after: column, risk: !column.nullable && !column.defaultExpression ? "blocked" : "safe", reason: !column.nullable && !column.defaultExpression ? "Required column needs a backfill" : "Additive column" })));
  unmatchedTarget.filter((column) => !acceptedTarget.has(column.key)).forEach((column) => changes.push(change("drop-column", "column", `${desired.key}.${column.name}`, { tableKey: desired.key, before: column, risk: "blocked", reason: "Drops column data", reversible: false })));
  desired.columns.forEach((after) => {
    const before = targetColumns.get(after.key) ?? acceptedDesired.get(after.key);
    if (!before || before.fingerprint === after.fingerprint) return;
    const risk = riskForColumn(before, after);
    changes.push(change("alter-column", "column", `${desired.key}.${after.name}`, { tableKey: desired.key, before, after, ...risk, phase: "migrate" }));
  });

  const compareNamed = <T extends { key: string; fingerprint: string }>(desiredItems: T[], targetItems: T[], objectKind: "index" | "foreign-key" | "check", createKind: "create-index" | "add-foreign-key" | "add-check", dropKind: "drop-index" | "drop-foreign-key" | "drop-check") => {
    const desiredByKey = new Map(desiredItems.map((item) => [item.key, item]));
    const targetByKey = new Map(targetItems.map((item) => [item.key, item]));
    desiredItems.forEach((item) => {
      const before = targetByKey.get(item.key);
      if (!before) { changes.push(change(createKind, objectKind, `${desired.key}.${item.key}`, { tableKey: desired.key, after: item })); return; }
      if (before.fingerprint === item.fingerprint) return;
      const drop = change(dropKind, objectKind, `${desired.key}.${item.key}:replace`, { tableKey: desired.key, before, risk: "review", reason: `Replace changed ${objectKind}` });
      changes.push(drop, change(createKind, objectKind, `${desired.key}.${item.key}:replacement`, { tableKey: desired.key, after: item, dependsOn: [drop.id], risk: "review", reason: `Replace changed ${objectKind}` }));
    });
    targetItems.forEach((item) => { if (!desiredByKey.has(item.key)) changes.push(change(dropKind, objectKind, `${desired.key}.${item.key}`, { tableKey: desired.key, before: item, risk: objectKind === "index" ? "safe" : "review" })); });
  };
  compareNamed(desired.indexes, target.indexes, "index", "create-index", "drop-index");
  compareNamed(desired.foreignKeys, target.foreignKeys, "foreign-key", "add-foreign-key", "drop-foreign-key");
  compareNamed(desired.checks, target.checks, "check", "add-check", "drop-check");
}

function compareObjects(desired: MigrationSnapshotObject[], target: MigrationSnapshotObject[], changes: MigrationChange[]): void {
  const desiredByKey = new Map(desired.map((object) => [`${object.kind}:${object.key}`, object]));
  const targetByKey = new Map(target.map((object) => [`${object.kind}:${object.key}`, object]));
  desiredByKey.forEach((after, key) => {
    const before = targetByKey.get(key);
    if (!before) changes.push(change("create-object", after.kind, after.key, { after }));
    else if (before.fingerprint !== after.fingerprint) changes.push(change("replace-object", after.kind, after.key, { before, after, risk: "review", reason: `Replace changed ${after.kind}`, phase: "migrate" }));
  });
  targetByKey.forEach((before, key) => { if (!desiredByKey.has(key)) changes.push(change("drop-object", before.kind, before.key, { before, risk: "blocked", reason: `Drops ${before.kind}`, reversible: false })); });
}

function orderChanges(changes: MigrationChange[]): MigrationChange[] {
  const rank: Record<MigrationChangeKind, number> = {
    "drop-foreign-key": 0, "create-object": 1, "create-table": 2, "rename-table": 3, "rename-column": 4,
    "add-column": 5, "alter-column": 6, "create-index": 7, "add-check": 8, "add-foreign-key": 9, "replace-object": 10,
    "drop-check": 11, "drop-index": 12, "drop-column": 13, "drop-object": 14, "drop-table": 15,
  };
  const byId = new Map(changes.map((item) => [item.id, item]));
  const createTableByKey = new Map(changes.filter((item) => item.kind === "create-table").map((item) => [item.objectKey, item]));
  const dropForeignKeys = changes.filter((item) => item.kind === "drop-foreign-key");
  changes.forEach((item) => {
    const dependencies = new Set(item.dependsOn);
    if (["add-column", "create-index", "add-foreign-key"].includes(item.kind) && item.tableKey) {
      const createTable = createTableByKey.get(item.tableKey);
      if (createTable) dependencies.add(createTable.id);
    }
    if (item.kind === "add-foreign-key") {
      const targetTable = (item.after as { targetTable?: string } | undefined)?.targetTable;
      const targetCreate = targetTable ? createTableByKey.get(targetTable) : undefined;
      if (targetCreate) dependencies.add(targetCreate.id);
    }
    if (item.kind === "drop-table") {
      dropForeignKeys.forEach((foreignKey) => {
        const targetTable = (foreignKey.before as { targetTable?: string } | undefined)?.targetTable;
        if (foreignKey.tableKey === item.objectKey || targetTable === item.objectKey) dependencies.add(foreignKey.id);
      });
    }
    item.dependsOn = [...dependencies].filter((id) => byId.has(id)).sort();
  });
  const dependencies = new Map(changes.map((item) => [item, new Set(item.dependsOn.flatMap((id) => byId.get(id) ?? []))]));
  return stableDependencyOrder(changes, dependencies, (item) => `${String(rank[item.kind]).padStart(2, "0")}:${item.objectKey}:${item.id}`);
}

export function createMigrationPlan(desired: MigrationSnapshot, target: MigrationSnapshot, strategy: MigrationStrategy = "standard", decisions: MigrationPlanDecisions = {}): MigrationPlan {
  if (desired.dialect !== target.dialect) throw new Error("Migration inputs must use the same database engine.");
  const desiredByKey = new Map(desired.tables.map((table) => [table.key, table]));
  const targetByKey = new Map(target.tables.map((table) => [table.key, table]));
  const unmatchedDesired = desired.tables.filter((table) => !targetByKey.has(table.key));
  const unmatchedTarget = target.tables.filter((table) => !desiredByKey.has(table.key));
  const renameSuggestions = tableRenameSuggestions(unmatchedDesired, unmatchedTarget);
  const acceptedDesired = new Map<string, MigrationSnapshotTable>();
  const acceptedTarget = new Set<string>();
  const changes: MigrationChange[] = [];
  renameSuggestions.forEach((suggestion) => {
    if (decisions.renames?.[suggestion.id] !== "accepted") return;
    const after = desiredByKey.get(suggestion.desiredKey) ?? unmatchedDesired.find((table) => table.key === suggestion.desiredKey);
    const before = targetByKey.get(suggestion.targetKey) ?? unmatchedTarget.find((table) => table.key === suggestion.targetKey);
    if (!before || !after) return;
    acceptedDesired.set(after.key, before);
    acceptedTarget.add(before.key);
    changes.push(change("rename-table", "table", `${before.key}->${after.key}`, { before, after, risk: "review", reason: "Confirmed table rename", phase: "migrate" }));
  });
  unmatchedDesired.filter((table) => !acceptedDesired.has(table.key)).forEach((table) => {
    const createTable = change("create-table", "table", table.key, { after: table });
    changes.push(createTable);
    table.indexes.forEach((index) => changes.push(change("create-index", "index", `${table.key}.${index.key}`, { tableKey: table.key, after: index, dependsOn: [createTable.id] })));
    table.foreignKeys.forEach((foreignKey) => changes.push(change("add-foreign-key", "foreign-key", `${table.key}.${foreignKey.key}`, { tableKey: table.key, after: foreignKey, dependsOn: [createTable.id] })));
  });
  unmatchedTarget.filter((table) => !acceptedTarget.has(table.key)).forEach((table) => changes.push(change("drop-table", "table", table.key, { before: table, risk: "blocked", reason: "Drops table and all contained data", reversible: false })));
  desired.tables.forEach((after) => {
    const before = targetByKey.get(after.key) ?? acceptedDesired.get(after.key);
    if (before) compareTable(after, before, decisions, renameSuggestions, changes);
  });
  compareObjects(desired.objects, target.objects, changes);
  const ordered = orderChanges(changes);
  const unresolvedRenameIds = renameSuggestions.filter((suggestion) => decisions.renames?.[suggestion.id] === undefined).map((suggestion) => suggestion.id);
  const fingerprint = stableHash(`${desired.fingerprint}:${target.fingerprint}:${strategy}:${ordered.map((item) => item.id).join(":")}`);
  return { id: `plan:${fingerprint}`, desired, target, changes: ordered, renameSuggestions, unresolvedRenameIds, strategy, fingerprint };
}
