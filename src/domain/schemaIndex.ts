import type { Column, CustomType, Relationship, SchemaDocument, Table } from "./types";

export type CustomTypeUsage =
  | { kind: "column"; tableId: string; columnId: string }
  | { kind: "domain"; ownerTypeId: string }
  | { kind: "composite-field"; ownerTypeId: string; fieldId: string };

export interface ColumnLocation {
  tableIndex: number;
  columnIndex: number;
}

export interface SchemaIndex {
  tableById: Map<string, Table>;
  tableByQualifiedName: Map<string, Table>;
  tableByName: Map<string, Table>;
  tablePositionById: Map<string, number>;
  columnById: Map<string, Column>;
  columnLocationById: Map<string, ColumnLocation>;
  columnsByNameByTableId: Map<string, Map<string, Column>>;
  relationshipById: Map<string, Relationship>;
  relationshipsByTableId: Map<string, Relationship[]>;
  customTypeById: Map<string, CustomType>;
  customTypePositionById: Map<string, number>;
  customTypeUsages: Map<string, CustomTypeUsage[]>;
  customTypeDependencies: Map<string, Set<string>>;
  customTypeDependents: Map<string, Set<string>>;
  structuralTableIds: Set<string>;
}

export function normalizeSchemaName(value: string): string {
  return value.trim().toLowerCase();
}

export function qualifiedTableKey(schema: string | undefined, name: string): string {
  const normalizedName = normalizeSchemaName(name);
  return schema ? `${normalizeSchemaName(schema)}.${normalizedName}` : normalizedName;
}

export function buildSchemaIndex(
  source: Pick<SchemaDocument, "tables" | "relationships" | "structuralTableIds" | "customTypes"> | { tables: Table[]; relationships?: Relationship[]; structuralTableIds?: string[]; customTypes?: CustomType[] },
): SchemaIndex {
  const tableById = new Map<string, Table>();
  const tableByQualifiedName = new Map<string, Table>();
  const tableByName = new Map<string, Table>();
  const tablePositionById = new Map<string, number>();
  const columnById = new Map<string, Column>();
  const columnLocationById = new Map<string, ColumnLocation>();
  const columnsByNameByTableId = new Map<string, Map<string, Column>>();
  const relationshipById = new Map<string, Relationship>();
  const relationshipsByTableId = new Map<string, Relationship[]>();
  const customTypeById = new Map<string, CustomType>();
  const customTypePositionById = new Map<string, number>();
  const customTypeUsages = new Map<string, CustomTypeUsage[]>();
  const customTypeDependencies = new Map<string, Set<string>>();
  const customTypeDependents = new Map<string, Set<string>>();

  const addUsage = (customTypeId: string | undefined, usage: CustomTypeUsage) => {
    if (!customTypeId) return;
    const usages = customTypeUsages.get(customTypeId) ?? [];
    usages.push(usage);
    customTypeUsages.set(customTypeId, usages);
  };

  source.tables.forEach((table, tableIndex) => {
    tableById.set(table.id, table);
    tablePositionById.set(table.id, tableIndex);
    const qualified = qualifiedTableKey(table.schema, table.name);
    if (!tableByQualifiedName.has(qualified)) tableByQualifiedName.set(qualified, table);
    const unqualified = normalizeSchemaName(table.name);
    if (!tableByName.has(unqualified)) tableByName.set(unqualified, table);

    const columnsByName = new Map<string, Column>();
    table.columns.forEach((column, columnIndex) => {
      columnById.set(column.id, column);
      columnLocationById.set(column.id, { tableIndex, columnIndex });
      addUsage(column.typeSpec.customTypeId, { kind: "column", tableId: table.id, columnId: column.id });
      const name = normalizeSchemaName(column.name);
      if (!columnsByName.has(name)) columnsByName.set(name, column);
    });
    columnsByNameByTableId.set(table.id, columnsByName);
  });

  (source.relationships ?? []).forEach((relationship) => {
    relationshipById.set(relationship.id, relationship);
    const sourceRelationships = relationshipsByTableId.get(relationship.sourceTableId) ?? [];
    sourceRelationships.push(relationship);
    relationshipsByTableId.set(relationship.sourceTableId, sourceRelationships);
    if (relationship.targetTableId !== relationship.sourceTableId) {
      const targetRelationships = relationshipsByTableId.get(relationship.targetTableId) ?? [];
      targetRelationships.push(relationship);
      relationshipsByTableId.set(relationship.targetTableId, targetRelationships);
    }
  });

  (source.customTypes ?? []).forEach((type, customTypeIndex) => {
    customTypeById.set(type.id, type);
    customTypePositionById.set(type.id, customTypeIndex);
    customTypeUsages.set(type.id, customTypeUsages.get(type.id) ?? []);
    const dependencies = new Set<string>();
    if (type.kind === "domain") {
      if (type.baseType.customTypeId) dependencies.add(type.baseType.customTypeId);
      addUsage(type.baseType.customTypeId, { kind: "domain", ownerTypeId: type.id });
    } else if (type.kind === "composite") {
      type.fields.forEach((field) => {
        if (field.type.customTypeId) dependencies.add(field.type.customTypeId);
        addUsage(field.type.customTypeId, { kind: "composite-field", ownerTypeId: type.id, fieldId: field.id });
      });
    }
    customTypeDependencies.set(type.id, dependencies);
    customTypeDependents.set(type.id, customTypeDependents.get(type.id) ?? new Set());
  });

  customTypeDependencies.forEach((dependencies, ownerTypeId) => dependencies.forEach((dependencyId) => {
    const dependents = customTypeDependents.get(dependencyId) ?? new Set<string>();
    dependents.add(ownerTypeId);
    customTypeDependents.set(dependencyId, dependents);
  }));

  return {
    tableById,
    tableByQualifiedName,
    tableByName,
    tablePositionById,
    columnById,
    columnLocationById,
    columnsByNameByTableId,
    relationshipById,
    relationshipsByTableId,
    customTypeById,
    customTypePositionById,
    customTypeUsages,
    customTypeDependencies,
    customTypeDependents,
    structuralTableIds: new Set(source.structuralTableIds ?? []),
  };
}

const documentIndexCache = new WeakMap<SchemaDocument, SchemaIndex>();

export function schemaIndexFor(document: SchemaDocument): SchemaIndex {
  const cached = documentIndexCache.get(document);
  if (cached) return cached;
  const index = buildSchemaIndex(document);
  documentIndexCache.set(document, index);
  return index;
}

export function customTypeUsageLabels(document: SchemaDocument, customTypeId: string, index = schemaIndexFor(document)): string[] {
  return (index.customTypeUsages.get(customTypeId) ?? []).map((usage) => {
    if (usage.kind === "column") {
      const table = index.tableById.get(usage.tableId);
      const column = index.columnById.get(usage.columnId);
      return `${table?.name ?? usage.tableId}.${column?.name ?? usage.columnId}`;
    }
    const owner = index.customTypeById.get(usage.ownerTypeId);
    if (usage.kind === "domain") return `domain ${owner?.name ?? usage.ownerTypeId}`;
    const field = owner?.kind === "composite" ? owner.fields.find((item) => item.id === usage.fieldId) : undefined;
    return `${owner?.name ?? usage.ownerTypeId}.${field?.name ?? usage.fieldId}`;
  });
}

export function customTypeDependentClosure(index: SchemaIndex, customTypeId: string): Set<string> {
  const result = new Set<string>([customTypeId]);
  const queue = [customTypeId];
  let head = 0;
  while (head < queue.length) {
    const current = queue[head++];
    index.customTypeDependents.get(current)?.forEach((dependentId) => {
      if (result.has(dependentId)) return;
      result.add(dependentId);
      queue.push(dependentId);
    });
  }
  return result;
}

export function findIndexedTable(index: SchemaIndex, name: string, schema?: string): Table | undefined {
  return schema
    ? index.tableByQualifiedName.get(qualifiedTableKey(schema, name))
    : index.tableByName.get(normalizeSchemaName(name));
}

export function findIndexedColumn(index: SchemaIndex, tableId: string, name: string): Column | undefined {
  return index.columnsByNameByTableId.get(tableId)?.get(normalizeSchemaName(name));
}
