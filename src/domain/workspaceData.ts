import type { DiagramArea, DiagramNote, SchemaDocument, Table } from "./types";
import { normalizeTableWidthScale } from "./tableGeometry";

export const WORKSPACE_DATA_FORMAT = "dbstudio-workspace" as const;
export const WORKSPACE_DATA_VERSION = 2 as const;

export interface PortableTableRef {
  sourceIdentity?: string;
  sourceFile?: string;
  schema?: string;
  name: string;
  fingerprint: string;
}

export interface WorkspaceTableRecord {
  ref: PortableTableRef;
  visual: {
    position: { x: number; y: number };
    color: string;
    collapsed: boolean;
    widthScale: 1 | 1.5 | 2;
  };
  comment?: {
    text: string;
    visible: boolean;
    offset?: { x: number; y: number };
    color: string;
  };
}

export interface WorkspaceAreaRecord extends Omit<DiagramArea, "tableIds"> {
  tableRefs: PortableTableRef[];
}

export interface WorkspaceDataV2 {
  format: typeof WORKSPACE_DATA_FORMAT;
  version: typeof WORKSPACE_DATA_VERSION;
  dialect: SchemaDocument["dialect"];
  tables: WorkspaceTableRecord[];
  areas: WorkspaceAreaRecord[];
  notes: DiagramNote[];
  canvases: {
    logic?: NonNullable<SchemaDocument["logicLayout"]>;
    routineFlows?: SchemaDocument["routineFlowLayouts"];
  };
}

export interface LegacyWorkspaceMetadata {
  version: 1;
  tables: Array<{
    id?: string;
    name: string;
    position: { x: number; y: number };
    color: string;
    collapsed: boolean;
    widthScale?: 1 | 1.5 | 2;
    commentVisible?: boolean;
    commentOffset?: { x: number; y: number };
    commentColor?: string;
  }>;
  areas?: DiagramArea[];
  notes?: DiagramNote[];
  logic?: NonNullable<SchemaDocument["logicLayout"]>;
  routineFlows?: SchemaDocument["routineFlowLayouts"];
}

export interface WorkspaceDataIssue {
  path: string;
  message: string;
}

export interface WorkspaceDataParseResult {
  data: WorkspaceDataV2;
  issues: WorkspaceDataIssue[];
}

export interface WorkspaceMergeReport {
  matched: number;
  changed: number;
  unchanged: number;
  skipped: number;
  ambiguous: number;
  invalid: number;
  details: string[];
}

export interface WorkspaceMergeResult {
  document: SchemaDocument;
  report: WorkspaceMergeReport;
}

const colorPattern = /^#[0-9a-f]{6}$/i;
const recordLimit = 100_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 10_000_000;
}

function point(value: unknown): { x: number; y: number } | null {
  if (!isRecord(value) || !finite(value.x) || !finite(value.y)) return null;
  return { x: value.x, y: value.y };
}

function color(value: unknown): string | null {
  return typeof value === "string" && colorPattern.test(value) ? value.toLowerCase() : null;
}

function normalizedName(value: string): string {
  return value.trim().toLowerCase();
}

function qualifiedName(ref: Pick<PortableTableRef, "schema" | "name">): string {
  const name = normalizedName(ref.name);
  return ref.schema?.trim() ? `${normalizedName(ref.schema)}.${name}` : name;
}

export function tableFingerprint(table: Pick<Table, "columns">): string {
  return table.columns
    .map((column) => `${normalizedName(column.name)}:${column.dataType.trim().toLowerCase()}`)
    .sort()
    .join("|");
}

export function tableRef(table: Table): PortableTableRef {
  return {
    sourceIdentity: table.id,
    schema: table.schema,
    name: table.name,
    fingerprint: tableFingerprint(table),
  };
}

function commentRecord(table: Table): WorkspaceTableRecord["comment"] {
  const text = table.comment ?? "";
  if (!text && table.commentVisible === undefined && !table.commentOffset && !table.commentColor) return undefined;
  return {
    text,
    visible: table.commentVisible !== false,
    offset: table.commentOffset,
    color: table.commentColor ?? table.color,
  };
}

export function workspaceDataFromDocument(document: SchemaDocument): WorkspaceDataV2 {
  const refs = new Map(document.tables.map((table) => [table.id, tableRef(table)]));
  return {
    format: WORKSPACE_DATA_FORMAT,
    version: WORKSPACE_DATA_VERSION,
    dialect: document.dialect,
    tables: document.tables.map((table) => ({
      ref: refs.get(table.id)!,
      visual: {
        position: { ...table.position },
        color: table.color,
        collapsed: table.collapsed,
        widthScale: normalizeTableWidthScale(table.widthScale),
      },
      comment: commentRecord(table),
    })),
    areas: document.areas.map(({ tableIds, ...area }) => ({
      ...area,
      tableRefs: tableIds.flatMap((id) => {
        const ref = refs.get(id);
        return ref ? [ref] : [];
      }),
      noteIds: area.noteIds ? [...area.noteIds] : undefined,
    })),
    notes: document.notes.map((note) => ({ ...note })),
    canvases: {
      logic: document.logicLayout,
      routineFlows: document.routineFlowLayouts,
    },
  };
}

function parseRef(value: unknown): PortableTableRef | null {
  if (!isRecord(value) || typeof value.name !== "string" || !value.name.trim() || typeof value.fingerprint !== "string") return null;
  return {
    sourceIdentity: typeof value.sourceIdentity === "string" && value.sourceIdentity ? value.sourceIdentity : undefined,
    sourceFile: typeof value.sourceFile === "string" && value.sourceFile ? value.sourceFile : undefined,
    schema: typeof value.schema === "string" && value.schema.trim() ? value.schema : undefined,
    name: value.name,
    fingerprint: value.fingerprint,
  };
}

function parseTable(value: unknown): WorkspaceTableRecord | null {
  if (!isRecord(value)) return null;
  const ref = parseRef(value.ref);
  const visual = isRecord(value.visual) ? value.visual : null;
  const position = point(visual?.position);
  const visualColor = color(visual?.color);
  if (!ref || !visual || !position || !visualColor || typeof visual.collapsed !== "boolean") return null;
  const widthScale = visual.widthScale === 1.5 || visual.widthScale === 2 ? visual.widthScale : visual.widthScale === 1 ? 1 : null;
  if (!widthScale) return null;
  let comment: WorkspaceTableRecord["comment"];
  if (value.comment !== undefined) {
    if (!isRecord(value.comment) || typeof value.comment.text !== "string" || typeof value.comment.visible !== "boolean") return null;
    const commentColor = color(value.comment.color);
    const offset = value.comment.offset === undefined ? undefined : point(value.comment.offset);
    if (!commentColor || offset === null) return null;
    comment = { text: value.comment.text, visible: value.comment.visible, offset, color: commentColor };
  }
  return { ref, visual: { position, color: visualColor, collapsed: visual.collapsed, widthScale }, comment };
}

function parseNote(value: unknown): DiagramNote | null {
  if (!isRecord(value) || typeof value.id !== "string" || !value.id || typeof value.text !== "string") return null;
  const noteColor = color(value.color);
  if (!noteColor || !finite(value.x) || !finite(value.y)) return null;
  return { id: value.id, text: value.text, color: noteColor, x: value.x, y: value.y };
}

function parseArea(value: unknown): WorkspaceAreaRecord | null {
  if (!isRecord(value) || typeof value.id !== "string" || !value.id || typeof value.name !== "string") return null;
  const areaColor = color(value.color);
  if (!areaColor || !finite(value.x) || !finite(value.y) || !finite(value.width) || !finite(value.height) || value.width <= 0 || value.height <= 0) return null;
  if (typeof value.locked !== "boolean" || typeof value.collapsed !== "boolean" || typeof value.moveContents !== "boolean" || !Array.isArray(value.tableRefs)) return null;
  const refs = value.tableRefs.map(parseRef);
  if (refs.some((ref) => !ref)) return null;
  const noteIds = value.noteIds === undefined ? undefined : Array.isArray(value.noteIds) && value.noteIds.every((id) => typeof id === "string") ? [...value.noteIds] as string[] : null;
  if (noteIds === null) return null;
  return { id: value.id, name: value.name, color: areaColor, x: value.x, y: value.y, width: value.width, height: value.height, tableRefs: refs as PortableTableRef[], noteIds, locked: value.locked, collapsed: value.collapsed, moveContents: value.moveContents };
}

function parseCanvasNodes(value: unknown): NonNullable<SchemaDocument["logicLayout"]>["nodes"] | null {
  if (!Array.isArray(value) || value.length > recordLimit) return null;
  const ids = new Set<string>();
  const nodes = value.flatMap((item) => {
    if (!isRecord(item) || typeof item.id !== "string" || !item.id || ids.has(item.id)) return [];
    const position = point(item.position);
    if (!position || (item.pinned !== undefined && typeof item.pinned !== "boolean")) return [];
    ids.add(item.id);
    return [{ id: item.id, position, pinned: item.pinned as boolean | undefined }];
  });
  return nodes.length === value.length ? nodes : null;
}

function parseViewport(value: unknown): { x: number; y: number; scale: number } | null {
  if (!isRecord(value) || !finite(value.x) || !finite(value.y) || !finite(value.scale) || value.scale <= 0 || value.scale > 100) return null;
  return { x: value.x, y: value.y, scale: value.scale };
}

function parseAlgorithmVersion(value: unknown): number | undefined | null {
  if (value === undefined) return undefined;
  return Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : null;
}

function parseLogicCanvas(value: unknown): NonNullable<SchemaDocument["logicLayout"]> | null {
  if (!isRecord(value)) return null;
  const nodes = parseCanvasNodes(value.nodes);
  const viewport = parseViewport(value.viewport);
  const algorithmVersion = parseAlgorithmVersion(value.algorithmVersion);
  if (!nodes || !viewport || algorithmVersion === null) return null;
  return { nodes, viewport, algorithmVersion };
}

function parseRoutineCanvas(value: unknown): NonNullable<SchemaDocument["routineFlowLayouts"]>[string] | null {
  if (!isRecord(value)) return null;
  const nodes = parseCanvasNodes(value.nodes);
  const viewport = value.viewport === undefined ? undefined : parseViewport(value.viewport);
  const algorithmVersion = parseAlgorithmVersion(value.algorithmVersion);
  if (!nodes || !finite(value.scale) || value.scale <= 0 || value.scale > 100 || viewport === null || algorithmVersion === null) return null;
  return { nodes, scale: value.scale, viewport, algorithmVersion };
}

export function parseWorkspaceData(value: unknown): WorkspaceDataParseResult {
  if (!isRecord(value)) throw new Error("Workspace data must be a JSON object.");
  if (value.format !== WORKSPACE_DATA_FORMAT) throw new Error("This is not a DBStudio workspace data file.");
  if (value.version !== WORKSPACE_DATA_VERSION) throw new Error(`Unsupported DBStudio workspace data version: ${String(value.version)}.`);
  if (value.dialect !== "postgresql" && value.dialect !== "mysql") throw new Error("Workspace data has an unsupported SQL dialect.");
  if (!Array.isArray(value.tables) || !Array.isArray(value.areas) || !Array.isArray(value.notes)) throw new Error("Workspace data is missing its tables, areas, or notes collection.");
  if (value.tables.length > recordLimit || value.areas.length > recordLimit || value.notes.length > recordLimit) throw new Error("Workspace data contains too many records.");
  const issues: WorkspaceDataIssue[] = [];
  const tables = value.tables.flatMap((item, index) => {
    const parsed = parseTable(item);
    if (!parsed) issues.push({ path: `tables[${index}]`, message: "Invalid table visual record." });
    return parsed ? [parsed] : [];
  });
  const areas = value.areas.flatMap((item, index) => {
    const parsed = parseArea(item);
    if (!parsed) issues.push({ path: `areas[${index}]`, message: "Invalid area record." });
    return parsed ? [parsed] : [];
  });
  const notes = value.notes.flatMap((item, index) => {
    const parsed = parseNote(item);
    if (!parsed) issues.push({ path: `notes[${index}]`, message: "Invalid note record." });
    return parsed ? [parsed] : [];
  });
  const canvases = isRecord(value.canvases) ? value.canvases : {};
  const logic = canvases.logic === undefined ? undefined : parseLogicCanvas(canvases.logic);
  if (canvases.logic !== undefined && !logic) issues.push({ path: "canvases.logic", message: "Invalid logic canvas layout." });
  let routineFlows: SchemaDocument["routineFlowLayouts"];
  if (canvases.routineFlows !== undefined) {
    if (!isRecord(canvases.routineFlows) || Object.keys(canvases.routineFlows).length > recordLimit) {
      issues.push({ path: "canvases.routineFlows", message: "Invalid routine canvas layouts." });
    } else {
      routineFlows = {};
      Object.entries(canvases.routineFlows).forEach(([routineId, layout]) => {
        const parsed = routineId ? parseRoutineCanvas(layout) : null;
        if (parsed) routineFlows![routineId] = parsed;
        else issues.push({ path: `canvases.routineFlows.${routineId}`, message: "Invalid routine canvas layout." });
      });
    }
  }
  return {
    data: {
      format: WORKSPACE_DATA_FORMAT,
      version: WORKSPACE_DATA_VERSION,
      dialect: value.dialect,
      tables,
      areas,
      notes,
      canvases: {
        logic: logic ?? undefined,
        routineFlows,
      },
    },
    issues,
  };
}

interface MatchIndexes {
  bySource: Map<string, Table[]>;
  byQualified: Map<string, Table[]>;
  byName: Map<string, Table[]>;
  byFingerprint: Map<string, Table[]>;
}

function pushIndex(index: Map<string, Table[]>, key: string | undefined, table: Table): void {
  if (!key) return;
  index.set(key, [...(index.get(key) ?? []), table]);
}

function buildMatchIndexes(document: SchemaDocument): MatchIndexes {
  const indexes: MatchIndexes = { bySource: new Map(), byQualified: new Map(), byName: new Map(), byFingerprint: new Map() };
  document.tables.forEach((table) => {
    pushIndex(indexes.bySource, table.id, table);
    pushIndex(indexes.byQualified, qualifiedName(tableRef(table)), table);
    pushIndex(indexes.byName, normalizedName(table.name), table);
    pushIndex(indexes.byFingerprint, tableFingerprint(table), table);
  });
  return indexes;
}

function matchTable(ref: PortableTableRef, indexes: MatchIndexes): { table?: Table; ambiguous: boolean } {
  const candidates = [
    ref.sourceIdentity ? indexes.bySource.get(ref.sourceIdentity) : undefined,
    indexes.byQualified.get(qualifiedName(ref)),
    indexes.byName.get(normalizedName(ref.name)),
    ref.fingerprint ? indexes.byFingerprint.get(ref.fingerprint) : undefined,
  ];
  for (const matches of candidates) {
    if (!matches?.length) continue;
    if (matches.length === 1) return { table: matches[0], ambiguous: false };
    return { ambiguous: true };
  }
  return { ambiguous: false };
}

export function mergeWorkspaceData(document: SchemaDocument, data: WorkspaceDataV2, options: { importComments: boolean; invalid?: number } = { importComments: false }): WorkspaceMergeResult {
  const indexes = buildMatchIndexes(document);
  const tableUpdates = new Map<string, Table>();
  const report: WorkspaceMergeReport = { matched: 0, changed: 0, unchanged: 0, skipped: 0, ambiguous: 0, invalid: options.invalid ?? 0, details: [] };
  const resolvedRefIds = new Map<PortableTableRef, string>();
  data.tables.forEach((record) => {
    const match = matchTable(record.ref, indexes);
    if (!match.table) {
      if (match.ambiguous) {
        report.ambiguous += 1;
        report.details.push(`${qualifiedName(record.ref)} was ambiguous.`);
      } else {
        report.skipped += 1;
        report.details.push(`${qualifiedName(record.ref)} was not found.`);
      }
      return;
    }
    report.matched += 1;
    resolvedRefIds.set(record.ref, match.table.id);
    const previous = match.table;
    const next: Table = {
      ...previous,
      position: { ...record.visual.position },
      color: record.visual.color,
      collapsed: record.visual.collapsed,
      widthScale: record.visual.widthScale,
      comment: options.importComments && record.comment ? record.comment.text : previous.comment,
      commentVisible: record.comment?.visible ?? previous.commentVisible,
      commentOffset: record.comment?.offset ?? previous.commentOffset,
      commentColor: record.comment?.color ?? previous.commentColor,
    };
    const changed = JSON.stringify({ position: previous.position, color: previous.color, collapsed: previous.collapsed, widthScale: normalizeTableWidthScale(previous.widthScale), comment: previous.comment, commentVisible: previous.commentVisible, commentOffset: previous.commentOffset, commentColor: previous.commentColor })
      !== JSON.stringify({ position: next.position, color: next.color, collapsed: next.collapsed, widthScale: next.widthScale, comment: next.comment, commentVisible: next.commentVisible, commentOffset: next.commentOffset, commentColor: next.commentColor });
    if (changed) {
      report.changed += 1;
      tableUpdates.set(previous.id, next);
    } else report.unchanged += 1;
  });

  const resolveRef = (ref: PortableTableRef): string | null => {
    const cached = resolvedRefIds.get(ref);
    if (cached) return cached;
    return matchTable(ref, indexes).table?.id ?? null;
  };
  const importedAreas = data.areas.map((area) => ({
    id: area.id,
    name: area.name,
    color: area.color,
    x: area.x,
    y: area.y,
    width: area.width,
    height: area.height,
    tableIds: [...new Set(area.tableRefs.flatMap((ref) => resolveRef(ref) ?? []))],
    noteIds: area.noteIds,
    locked: area.locked,
    collapsed: area.collapsed,
    moveContents: area.moveContents,
  }));
  const areaById = new Map(document.areas.map((area) => [area.id, area]));
  importedAreas.forEach((area) => areaById.set(area.id, area));
  const noteById = new Map(document.notes.map((note) => [note.id, note]));
  data.notes.forEach((note) => noteById.set(note.id, note));
  return {
    document: {
      ...document,
      hasSavedLayout: data.tables.length > 0 || document.hasSavedLayout,
      tables: document.tables.map((table) => tableUpdates.get(table.id) ?? table),
      areas: [...areaById.values()],
      notes: [...noteById.values()],
      logicLayout: data.canvases.logic ?? document.logicLayout,
      routineFlowLayouts: data.canvases.routineFlows ?? document.routineFlowLayouts,
    },
    report,
  };
}

export function migrateLegacyWorkspaceData(document: SchemaDocument, legacy: LegacyWorkspaceMetadata): WorkspaceDataV2 {
  const tables = document.tables.map((table, index) => {
    const visual = legacy.tables.find((item) => item.id === table.id)
      ?? legacy.tables.find((item) => normalizedName(item.name) === normalizedName(table.name))
      ?? (legacy.tables.some((item) => item.id) ? undefined : legacy.tables[index]);
    return {
      ref: tableRef(table),
      visual: {
        position: visual?.position ?? table.position,
        color: visual?.color ?? table.color,
        collapsed: visual?.collapsed ?? table.collapsed,
        widthScale: normalizeTableWidthScale(visual?.widthScale ?? table.widthScale),
      },
      comment: table.comment || visual?.commentVisible !== undefined || visual?.commentOffset || visual?.commentColor ? {
        text: table.comment ?? "",
        visible: visual?.commentVisible ?? table.commentVisible !== false,
        offset: visual?.commentOffset ?? table.commentOffset,
        color: visual?.commentColor ?? table.commentColor ?? table.color,
      } : undefined,
    } satisfies WorkspaceTableRecord;
  });
  const refs = new Map(document.tables.map((table) => [table.id, tableRef(table)]));
  return {
    format: WORKSPACE_DATA_FORMAT,
    version: WORKSPACE_DATA_VERSION,
    dialect: document.dialect,
    tables,
    areas: (legacy.areas ?? []).map(({ tableIds, ...area }) => ({
      ...area,
      tableRefs: tableIds.flatMap((id) => refs.get(id) ?? []),
    })),
    notes: legacy.notes ?? [],
    canvases: { logic: legacy.logic, routineFlows: legacy.routineFlows },
  };
}

export function parseOrMigrateWorkspaceData(document: SchemaDocument, value: unknown): WorkspaceDataParseResult {
  if (isRecord(value) && value.version === 1) {
    return { data: migrateLegacyWorkspaceData(document, value as unknown as LegacyWorkspaceMetadata), issues: [] };
  }
  return parseWorkspaceData(value);
}
