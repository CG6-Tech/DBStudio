import { createByteOffsetMapper } from "./byteOffset";
import { stablePart, unquoteIdentifier } from "./parser";
import { buildSchemaIndex, findIndexedColumn, findIndexedTable } from "./schemaIndex";
import { parseFieldType } from "../dialects";
import type { Column, Relationship, SchemaDocument, SourceRange, SqlDialect, Table } from "./types";

/**
 * The AST contract between the Rust real-parser (pg_query / sqlparser) and the
 * TypeScript {@link SchemaDocument} model.
 *
 * Rust returns a normalized {@link SchemaAst} — plain structure plus UTF-8 BYTE
 * ranges lifted from the real AST. All the {@link SchemaDocument} concerns that
 * need the source string live on the TS side, in {@link schemaDocumentFromAst}:
 *   - byte → character offset conversion (via the byteOffset mapper)
 *   - deriving `dataType` / `defaultExpression` text by slicing the source
 *   - ID generation and `original*` fields, matching the hand-rolled parser
 *
 * This slice covers the source-preserving core (tables, columns, inline and
 * table-level foreign keys, table primary keys). Indexes, table comments,
 * custom types, and routines/triggers are NOT covered yet — the differential
 * oracle flags them as divergences, which is the intended "candidate is not yet
 * complete" signal.
 */

/** A UTF-8 byte range, as reported by the Rust parser. */
export interface ByteRange {
  start: number;
  end: number;
}

export interface AstForeignKey {
  sourceColumnName: string;
  targetTableName: string;
  targetTableSchema?: string;
  targetColumnName: string;
  /** Present for inline column REFERENCES, absent for table-level FOREIGN KEY on the source side. */
  sourceColumnReferenceRange?: ByteRange;
  targetTableReferenceRange: ByteRange;
  targetColumnReferenceRange: ByteRange;
}

export interface AstColumn {
  name: string;
  nameRange: ByteRange;
  typeRange: ByteRange;
  notNull: boolean;
  /** Byte range spanning the `NOT NULL` tokens, when present. */
  notNullRange?: ByteRange;
  primaryKey: boolean;
  unique: boolean;
  defaultRange?: ByteRange;
}

export interface AstTable {
  name: string;
  schema?: string;
  nameRange: ByteRange;
  statementRange: ByteRange;
  /** Text between the closing `)` and the statement terminator (e.g. MySQL ENGINE=…). */
  optionsRange?: ByteRange;
  columns: AstColumn[];
  /** Column names named in a table-level PRIMARY KEY (…) clause. */
  primaryKeyColumns: string[];
  foreignKeys: AstForeignKey[];
}

export interface SchemaAst {
  dialect: SqlDialect;
  tables: AstTable[];
}

/**
 * Convert a Rust {@link SchemaAst} + the original `source` into a
 * {@link SchemaDocument}, in the same character-offset space the hand-rolled
 * parser and `generateSql` use. Reuses the parser's own ID and type helpers so
 * the differential oracle can compare candidate against trusted directly.
 */
export function schemaDocumentFromAst(ast: SchemaAst, source: string, dialect: SqlDialect): SchemaDocument {
  const mapper = createByteOffsetMapper(source);
  const toRange = (range: ByteRange): SourceRange => mapper.toRange(range);
  const slice = (range: ByteRange): string => {
    const { start, end } = mapper.toRange(range);
    return source.slice(start, end);
  };

  interface PendingReference {
    sourceTableId: string;
    sourceColumnName: string;
    targetTableName: string;
    targetTableSchema?: string;
    targetColumnName: string;
    sourceColumnReferenceRange?: SourceRange;
    targetTableReferenceRange: SourceRange;
    targetColumnReferenceRange: SourceRange;
  }
  const references: PendingReference[] = [];

  const tables: Table[] = ast.tables.map((astTable) => {
    const name = unquoteIdentifier(astTable.name);
    const schema = astTable.schema ? unquoteIdentifier(astTable.schema) : undefined;
    const nameRange = toRange(astTable.nameRange);
    const tableId = `table:${stablePart(schema ? `${schema}.${name}` : name)}:${nameRange.start}`;
    const primaryKeyNames = new Set(astTable.primaryKeyColumns.map((column) => unquoteIdentifier(column).toLowerCase()));

    const columns: Column[] = astTable.columns.map((astColumn) => {
      const columnName = unquoteIdentifier(astColumn.name);
      const columnNameRange = toRange(astColumn.nameRange);
      const typeRange = toRange(astColumn.typeRange);
      const dataType = source.slice(typeRange.start, typeRange.end);
      const isPrimaryKey = astColumn.primaryKey || primaryKeyNames.has(columnName.toLowerCase());
      const nullable = isPrimaryKey ? false : !astColumn.notNull;
      return {
        id: `${tableId}:column:${stablePart(columnName)}:${columnNameRange.start}`,
        tableId,
        name: columnName,
        originalName: columnName,
        dataType,
        typeSpec: parseFieldType(dataType, dialect, []),
        originalDataType: dataType,
        nullable,
        originalNullable: nullable,
        primaryKey: isPrimaryKey,
        unique: astColumn.unique,
        defaultExpression: astColumn.defaultRange ? slice(astColumn.defaultRange) : undefined,
        nameRange: columnNameRange,
        typeRange,
        notNullRange: astColumn.notNullRange ? toRange(astColumn.notNullRange) : undefined,
      };
    });

    for (const fk of astTable.foreignKeys) {
      references.push({
        sourceTableId: tableId,
        sourceColumnName: unquoteIdentifier(fk.sourceColumnName),
        targetTableName: unquoteIdentifier(fk.targetTableName),
        targetTableSchema: fk.targetTableSchema ? unquoteIdentifier(fk.targetTableSchema) : undefined,
        targetColumnName: unquoteIdentifier(fk.targetColumnName),
        sourceColumnReferenceRange: fk.sourceColumnReferenceRange ? toRange(fk.sourceColumnReferenceRange) : undefined,
        targetTableReferenceRange: toRange(fk.targetTableReferenceRange),
        targetColumnReferenceRange: toRange(fk.targetColumnReferenceRange),
      });
    }

    const statementRange = toRange(astTable.statementRange);
    return {
      id: tableId,
      name,
      originalName: name,
      schema,
      columns,
      indexes: [],
      checkConstraints: [],
      nameRange,
      statementRange,
      tableOptions: astTable.optionsRange ? slice(astTable.optionsRange) : "",
      position: { x: 0, y: 0 },
      color: "#7ee0b5",
      collapsed: false,
    };
  });

  const schemaIndex = buildSchemaIndex({ tables });
  const relationships: Relationship[] = [];
  references.forEach((reference, index) => {
    const sourceTable = schemaIndex.tableById.get(reference.sourceTableId);
    const targetTable = findIndexedTable(schemaIndex, reference.targetTableName, reference.targetTableSchema);
    const sourceColumn = sourceTable && findIndexedColumn(schemaIndex, sourceTable.id, reference.sourceColumnName);
    const targetColumn = targetTable && findIndexedColumn(schemaIndex, targetTable.id, reference.targetColumnName);
    if (sourceTable && targetTable && sourceColumn && targetColumn) {
      relationships.push({
        id: `relationship:${index}:${sourceColumn.id}:${targetColumn.id}`,
        sourceTableId: sourceTable.id,
        sourceColumnId: sourceColumn.id,
        targetTableId: targetTable.id,
        targetColumnId: targetColumn.id,
        sourceColumnReferenceRange: reference.sourceColumnReferenceRange,
        targetTableReferenceRange: reference.targetTableReferenceRange,
        targetColumnReferenceRange: reference.targetColumnReferenceRange,
      });
    }
  });

  return {
    dialect,
    hasSavedLayout: false,
    source,
    tables,
    relationships,
    diagnostics: [],
    areas: [],
    notes: [],
    customTypes: [],
    triggers: [],
    routines: [],
    logicEdges: [],
    structuralTableIds: [],
    removedStatementRanges: [],
  };
}
