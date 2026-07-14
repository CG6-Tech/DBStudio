export interface SourceRange {
  start: number;
  end: number;
}

export type SqlDialect = "postgresql" | "mysql";

export interface FieldTypeSpec {
  kind: "builtin" | "custom" | "unresolved";
  typeId: string;
  customTypeId?: string;
  parameters: {
    length?: string;
    precision?: string;
    scale?: string;
    values?: string[];
  };
  arrayDimensions: number;
  unsigned: boolean;
  raw: string;
}

interface CustomTypeBase {
  id: string;
  name: string;
  originalName: string;
  schema?: string;
  statementRange: SourceRange;
  isNew?: boolean;
  isEdited?: boolean;
}

export interface EnumCustomType extends CustomTypeBase {
  kind: "enum";
  values: string[];
}

export interface DomainCustomType extends CustomTypeBase {
  kind: "domain";
  baseType: FieldTypeSpec;
  defaultExpression?: string;
  nullable: boolean;
  checkExpression?: string;
}

export interface CompositeTypeField {
  id: string;
  name: string;
  type: FieldTypeSpec;
}

export interface CompositeCustomType extends CustomTypeBase {
  kind: "composite";
  fields: CompositeTypeField[];
}

export type CustomType = EnumCustomType | DomainCustomType | CompositeCustomType;

export interface Column {
  id: string;
  tableId: string;
  name: string;
  originalName: string;
  dataType: string;
  typeSpec: FieldTypeSpec;
  originalDataType: string;
  nullable: boolean;
  originalNullable: boolean;
  primaryKey: boolean;
  nameRange: SourceRange;
  typeRange: SourceRange;
  notNullRange?: SourceRange;
  unique: boolean;
  defaultExpression?: string;
  isNew?: boolean;
}

export type PostgresIndexMethod = "btree" | "hash" | "gist" | "spgist" | "gin" | "brin";

export interface TableIndex {
  id: string;
  name?: string;
  columnIds: string[];
  unique: boolean;
  method: PostgresIndexMethod;
  sourceRange?: SourceRange;
  standalone: boolean;
  isNew?: boolean;
}

export interface CheckConstraint {
  id: string;
  name?: string;
  expression: string;
  sourceRange?: SourceRange;
  isNew?: boolean;
}

export interface Table {
  id: string;
  name: string;
  originalName: string;
  schema?: string;
  columns: Column[];
  indexes: TableIndex[];
  checkConstraints: CheckConstraint[];
  nameRange: SourceRange;
  statementRange: SourceRange;
  tableOptions?: string;
  position: { x: number; y: number };
  color: string;
  collapsed: boolean;
  isNew?: boolean;
}

export interface DiagramArea {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  width: number;
  height: number;
  tableIds: string[];
  locked: boolean;
  collapsed: boolean;
  moveContents: boolean;
}

export interface DiagramNote {
  id: string;
  text: string;
  color: string;
  x: number;
  y: number;
}

export interface Relationship {
  id: string;
  sourceTableId: string;
  sourceColumnId: string;
  targetTableId: string;
  targetColumnId: string;
  sourceColumnReferenceRange?: SourceRange;
  targetTableReferenceRange: SourceRange;
  targetColumnReferenceRange: SourceRange;
}

export interface Diagnostic {
  level: "warning" | "error";
  message: string;
  offset?: number;
}

export interface SchemaDocument {
  dialect: SqlDialect;
  hasSavedLayout: boolean;
  source: string;
  tables: Table[];
  relationships: Relationship[];
  diagnostics: Diagnostic[];
  areas: DiagramArea[];
  notes: DiagramNote[];
  customTypes: CustomType[];
  structuralTableIds: string[];
  removedStatementRanges: SourceRange[];
}

export interface FileIdentity {
  dialect: SqlDialect;
  path: string | null;
  hash: string;
  modifiedMs: number | null;
  isExample: boolean;
}

export interface OpenedDocument extends FileIdentity {
  source: string;
}

export type Selection =
  | { kind: "table"; tableId: string }
  | { kind: "column"; tableId: string; columnId: string }
  | { kind: "relationship"; relationshipId: string }
  | null;

export interface LayoutNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutEdge {
  id: string;
  points: Array<{ x: number; y: number }>;
}

export interface LayoutResult {
  generation?: number;
  kind?: "initial" | "manual";
  nodes: LayoutNode[];
  edges: LayoutEdge[];
}
