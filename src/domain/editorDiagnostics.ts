import { schemaIndexFor } from "./schemaIndex";
import type { CustomType, Diagnostic, SchemaDocument, Table } from "./types";

type DiagnosticGroups = Map<string, Diagnostic[]>;

export interface EditorDiagnosticChanges {
  tableIds?: Iterable<string>;
  customTypeIds?: Iterable<string>;
  customGlobals?: boolean;
  customNames?: boolean;
  customCycles?: boolean;
  full?: boolean;
}

const diagnosticCache = new WeakMap<SchemaDocument, DiagnosticGroups>();

function tableDiagnostics(table: Table): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  table.columns.forEach((column) => {
    if (column.typeSpec.kind === "unresolved") diagnostics.push({ level: "warning", message: `Editor: Field ${table.name}.${column.name} uses unresolved type ${column.typeSpec.raw || column.typeSpec.typeId}.` });
  });
  table.indexes.forEach((index) => {
    if (index.columnIds.length === 0) diagnostics.push({ level: "warning", message: `Editor: Index ${index.name || "(unnamed)"} on ${table.name} needs at least one field.` });
  });
  table.checkConstraints.forEach((constraint) => {
    if (!constraint.expression.trim()) diagnostics.push({ level: "warning", message: `Editor: Check ${constraint.name || "(unnamed)"} on ${table.name} needs an expression.` });
  });
  return diagnostics;
}

function customTypeDiagnostics(type: CustomType): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  if (!type.name.trim()) diagnostics.push({ level: "warning", message: "Editor: Custom type name cannot be empty." });
  if (type.kind === "enum") {
    const values = type.values.map((value) => value.trim()).filter(Boolean);
    if (values.length !== type.values.length || new Set(values).size !== values.length) diagnostics.push({ level: "warning", message: `Editor: Enum ${type.name} needs unique, non-empty values.` });
  }
  if (type.kind === "domain" && type.baseType.kind === "unresolved") diagnostics.push({ level: "warning", message: `Editor: Domain ${type.name} has an unresolved base type.` });
  if (type.kind === "composite") {
    const fieldNames = type.fields.map((field) => field.name.trim()).filter(Boolean);
    if (fieldNames.length !== type.fields.length || new Set(fieldNames.map((name) => name.toLowerCase())).size !== fieldNames.length) diagnostics.push({ level: "warning", message: `Editor: Composite ${type.name} has invalid or duplicate field names.` });
  }
  return diagnostics;
}

function duplicateNameDiagnostics(document: SchemaDocument): Diagnostic[] {
  const names = new Set<string>();
  const diagnostics: Diagnostic[] = [];
  document.customTypes.forEach((type) => {
    const qualified = `${type.schema ?? ""}.${type.name}`.toLowerCase();
    if (type.name.trim() && names.has(qualified)) diagnostics.push({ level: "warning", message: `Editor: Duplicate custom type ${type.name}.` });
    names.add(qualified);
  });
  return diagnostics;
}

export function recursiveCustomTypeIds(document: SchemaDocument): Set<string> {
  const index = schemaIndexFor(document);
  const discovery = new Map<string, number>();
  const lowLink = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const cyclic = new Set<string>();
  let nextDiscovery = 0;

  const connect = (typeId: string) => {
    discovery.set(typeId, nextDiscovery);
    lowLink.set(typeId, nextDiscovery);
    nextDiscovery += 1;
    stack.push(typeId);
    onStack.add(typeId);

    index.customTypeDependencies.get(typeId)?.forEach((dependencyId) => {
      if (!index.customTypeById.has(dependencyId)) return;
      if (!discovery.has(dependencyId)) {
        connect(dependencyId);
        lowLink.set(typeId, Math.min(lowLink.get(typeId)!, lowLink.get(dependencyId)!));
      } else if (onStack.has(dependencyId)) {
        lowLink.set(typeId, Math.min(lowLink.get(typeId)!, discovery.get(dependencyId)!));
      }
    });

    if (lowLink.get(typeId) !== discovery.get(typeId)) return;
    const component: string[] = [];
    while (stack.length > 0) {
      const member = stack.pop()!;
      onStack.delete(member);
      component.push(member);
      if (member === typeId) break;
    }
    if (component.length > 1 || index.customTypeDependencies.get(typeId)?.has(typeId)) component.forEach((member) => cyclic.add(member));
  };

  document.customTypes.forEach((type) => { if (!discovery.has(type.id)) connect(type.id); });
  return cyclic;
}

function cycleDiagnostics(document: SchemaDocument): Diagnostic[] {
  const cyclic = recursiveCustomTypeIds(document);
  return document.customTypes.flatMap((type) => cyclic.has(type.id)
    ? [{ level: "warning" as const, message: `Editor: Custom type ${type.name || type.id} has a recursive dependency.` }]
    : []);
}

function completeGroups(document: SchemaDocument): DiagnosticGroups {
  const groups: DiagnosticGroups = new Map();
  document.tables.forEach((table) => groups.set(`table:${table.id}`, tableDiagnostics(table)));
  document.customTypes.forEach((type) => groups.set(`custom:${type.id}`, customTypeDiagnostics(type)));
  groups.set("custom:names", duplicateNameDiagnostics(document));
  groups.set("custom:cycles", cycleDiagnostics(document));
  return groups;
}

function flatten(document: SchemaDocument, groups: DiagnosticGroups): SchemaDocument {
  const diagnostics = document.diagnostics.filter((diagnostic) => !diagnostic.message.startsWith("Editor: "));
  [...groups.keys()].sort().forEach((key) => diagnostics.push(...(groups.get(key) ?? [])));
  const next = { ...document, diagnostics };
  diagnosticCache.set(next, groups);
  return next;
}

export function applyEditorDiagnostics(previous: SchemaDocument | null, document: SchemaDocument, changes: EditorDiagnosticChanges = { full: true }): SchemaDocument {
  if (changes.full || !previous) return flatten(document, completeGroups(document));
  const groups = new Map(diagnosticCache.get(previous) ?? completeGroups(previous));
  const previousIndex = schemaIndexFor(previous);

  new Set(changes.tableIds ?? []).forEach((tableId) => {
    const position = previousIndex.tablePositionById.get(tableId);
    const table = position === undefined ? document.tables.find((candidate) => candidate.id === tableId) : document.tables[position]?.id === tableId ? document.tables[position] : document.tables.find((candidate) => candidate.id === tableId);
    if (table) groups.set(`table:${tableId}`, tableDiagnostics(table));
    else groups.delete(`table:${tableId}`);
  });

  new Set(changes.customTypeIds ?? []).forEach((customTypeId) => {
    const position = previousIndex.customTypePositionById.get(customTypeId);
    const type = position === undefined ? document.customTypes.find((candidate) => candidate.id === customTypeId) : document.customTypes[position]?.id === customTypeId ? document.customTypes[position] : document.customTypes.find((candidate) => candidate.id === customTypeId);
    if (type) groups.set(`custom:${customTypeId}`, customTypeDiagnostics(type));
    else groups.delete(`custom:${customTypeId}`);
  });

  if (changes.customGlobals || changes.customNames) {
    groups.set("custom:names", duplicateNameDiagnostics(document));
  }
  if (changes.customGlobals || changes.customCycles) {
    groups.set("custom:cycles", cycleDiagnostics(document));
  }
  return flatten(document, groups);
}

export function rebuildEditorDiagnostics(document: SchemaDocument): SchemaDocument {
  return applyEditorDiagnostics(null, document, { full: true });
}
