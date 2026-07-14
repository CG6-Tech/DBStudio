export interface SourceRange {
  start: number;
  end: number;
}

export interface Column {
  id: string;
  tableId: string;
  name: string;
  originalName: string;
  dataType: string;
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

export interface Table {
  id: string;
  name: string;
  originalName: string;
  schema?: string;
  columns: Column[];
  nameRange: SourceRange;
  statementRange: SourceRange;
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
  source: string;
  tables: Table[];
  relationships: Relationship[];
  diagnostics: Diagnostic[];
  areas: DiagramArea[];
  notes: DiagramNote[];
  structuralTableIds: string[];
  removedStatementRanges: SourceRange[];
}

export interface FileIdentity {
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
  nodes: LayoutNode[];
  edges: LayoutEdge[];
}
