import { handRolledSchemaParser, type SchemaParser } from "./schemaParser";
import type { Column, Relationship, SchemaDocument, SourceRange, Table } from "./types";

/**
 * The differential oracle.
 *
 * A candidate parser (e.g. a future Rust-AST parser over IPC) is trusted only
 * once its {@link SchemaDocument} output matches the hand-rolled parser's across
 * a representative corpus. {@link compareSchemaDocuments} does the structural
 * comparison; {@link differentialSchemaParser} wraps a candidate so it runs in
 * shadow mode — both parsers run, divergences are reported, but the TRUSTED
 * output is served, so behavior is unchanged while confidence is gathered.
 *
 * Entities are matched by SEMANTIC key (schema+name for tables, name for
 * columns), never by `id`: parser IDs embed source offsets, so id comparison
 * would report every offset drift as an identity mismatch. Offsets are checked
 * as their own dimension instead, so a divergence points at the real defect.
 */

/** The dimension a divergence falls in — see module doc. */
export type SchemaDivergenceKind =
  | "structure"
  | "attribute"
  | "offset"
  | "original-field"
  | "relationship"
  | "custom-type";

export interface SchemaDivergence {
  kind: SchemaDivergenceKind;
  /** Dotted semantic path, e.g. `users.email` or `users` or `relationships`. */
  path: string;
  field: string;
  trusted: unknown;
  candidate: unknown;
}

function tableKey(table: Pick<Table, "schema" | "name">): string {
  return table.schema ? `${table.schema}.${table.name}` : table.name;
}

function rangeEqual(a: SourceRange | undefined, b: SourceRange | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.start === b.start && a.end === b.end;
}

function pushRange(
  out: SchemaDivergence[],
  path: string,
  field: string,
  trusted: SourceRange | undefined,
  candidate: SourceRange | undefined,
): void {
  if (!rangeEqual(trusted, candidate)) {
    out.push({ kind: "offset", path, field, trusted, candidate });
  }
}

function compareColumn(out: SchemaDivergence[], path: string, trusted: Column, candidate: Column): void {
  const attrs: Array<keyof Column> = ["dataType", "nullable", "primaryKey", "unique", "defaultExpression"];
  for (const attr of attrs) {
    if (trusted[attr] !== candidate[attr]) {
      out.push({ kind: "attribute", path, field: attr, trusted: trusted[attr], candidate: candidate[attr] });
    }
  }
  const originals: Array<keyof Column> = ["originalName", "originalDataType", "originalNullable"];
  for (const attr of originals) {
    if (trusted[attr] !== candidate[attr]) {
      out.push({ kind: "original-field", path, field: attr, trusted: trusted[attr], candidate: candidate[attr] });
    }
  }
  pushRange(out, path, "nameRange", trusted.nameRange, candidate.nameRange);
  pushRange(out, path, "typeRange", trusted.typeRange, candidate.typeRange);
  pushRange(out, path, "notNullRange", trusted.notNullRange, candidate.notNullRange);
}

function compareTable(out: SchemaDivergence[], trusted: Table, candidate: Table): void {
  const path = tableKey(trusted);
  if (trusted.originalName !== candidate.originalName) {
    out.push({ kind: "original-field", path, field: "originalName", trusted: trusted.originalName, candidate: candidate.originalName });
  }
  if (trusted.comment !== candidate.comment) {
    out.push({ kind: "attribute", path, field: "comment", trusted: trusted.comment, candidate: candidate.comment });
  }
  if (trusted.originalComment !== candidate.originalComment) {
    out.push({ kind: "original-field", path, field: "originalComment", trusted: trusted.originalComment, candidate: candidate.originalComment });
  }
  pushRange(out, path, "nameRange", trusted.nameRange, candidate.nameRange);
  pushRange(out, path, "statementRange", trusted.statementRange, candidate.statementRange);
  pushRange(out, path, "commentStatementRange", trusted.commentStatementRange, candidate.commentStatementRange);
  pushRange(out, path, "commentValueRange", trusted.commentValueRange, candidate.commentValueRange);

  const trustedColumnNames = new Set(trusted.columns.map((column) => column.name));
  const candidateColumns = new Map(candidate.columns.map((column) => [column.name, column]));
  for (const column of trusted.columns) {
    const match = candidateColumns.get(column.name);
    if (!match) {
      out.push({ kind: "structure", path, field: "column.missing", trusted: column.name, candidate: undefined });
      continue;
    }
    compareColumn(out, `${path}.${column.name}`, column, match);
  }
  for (const name of candidateColumns.keys()) {
    if (!trustedColumnNames.has(name)) {
      out.push({ kind: "structure", path, field: "column.extra", trusted: undefined, candidate: name });
    }
  }
}

function relationshipKey(relationship: Relationship): string {
  return `${relationship.sourceColumnId}>${relationship.targetColumnId}`;
}

/**
 * Compare a trusted document against a candidate, returning every divergence in
 * the source-preserving contract. An empty array means the candidate is
 * interchangeable with the trusted parser for this input.
 */
export function compareSchemaDocuments(trusted: SchemaDocument, candidate: SchemaDocument): SchemaDivergence[] {
  const out: SchemaDivergence[] = [];

  if (trusted.dialect !== candidate.dialect) {
    out.push({ kind: "attribute", path: "document", field: "dialect", trusted: trusted.dialect, candidate: candidate.dialect });
  }
  if (trusted.source !== candidate.source) {
    out.push({ kind: "attribute", path: "document", field: "source", trusted: trusted.source, candidate: candidate.source });
  }

  const trustedTableKeys = new Set(trusted.tables.map(tableKey));
  const candidateTables = new Map(candidate.tables.map((table) => [tableKey(table), table]));
  for (const table of trusted.tables) {
    const key = tableKey(table);
    const match = candidateTables.get(key);
    if (!match) {
      out.push({ kind: "structure", path: key, field: "table.missing", trusted: key, candidate: undefined });
      continue;
    }
    compareTable(out, table, match);
  }
  for (const key of candidateTables.keys()) {
    if (!trustedTableKeys.has(key)) {
      out.push({ kind: "structure", path: key, field: "table.extra", trusted: undefined, candidate: key });
    }
  }

  const trustedRelationships = new Set(trusted.relationships.map(relationshipKey));
  const candidateRelationships = new Set(candidate.relationships.map(relationshipKey));
  for (const key of trustedRelationships) {
    if (!candidateRelationships.has(key)) {
      out.push({ kind: "relationship", path: "relationships", field: "missing", trusted: key, candidate: undefined });
    }
  }
  for (const key of candidateRelationships) {
    if (!trustedRelationships.has(key)) {
      out.push({ kind: "relationship", path: "relationships", field: "extra", trusted: undefined, candidate: key });
    }
  }

  const trustedTypes = new Set(trusted.customTypes.map((type) => (type.schema ? `${type.schema}.${type.name}` : type.name)));
  const candidateTypes = new Set(candidate.customTypes.map((type) => (type.schema ? `${type.schema}.${type.name}` : type.name)));
  for (const key of trustedTypes) {
    if (!candidateTypes.has(key)) {
      out.push({ kind: "custom-type", path: "customTypes", field: "missing", trusted: key, candidate: undefined });
    }
  }
  for (const key of candidateTypes) {
    if (!trustedTypes.has(key)) {
      out.push({ kind: "custom-type", path: "customTypes", field: "extra", trusted: undefined, candidate: key });
    }
  }

  return out;
}

export interface DifferentialParserOptions {
  /** The trusted reference parser. Defaults to the hand-rolled parser. */
  trusted?: SchemaParser;
  /**
   * Invoked (only) when the candidate diverges from the trusted output.
   * The trusted output is served regardless — this is a shadow-mode probe.
   */
  onDivergence?: (report: {
    source: string;
    dialect: string;
    candidateName: string;
    divergences: SchemaDivergence[];
  }) => void;
}

/**
 * Wrap a candidate parser in shadow mode: run both parsers, compare, report any
 * divergence via `onDivergence`, and always return the TRUSTED output. Swap this
 * in via `setSchemaParser` to gather confidence in a new parser with no risk to
 * the served result. If the candidate throws, the trusted output still serves
 * and the throw is reported as a divergence.
 */
export function differentialSchemaParser(candidate: SchemaParser, options: DifferentialParserOptions = {}): SchemaParser {
  const trusted = options.trusted ?? handRolledSchemaParser;
  return {
    name: `differential(${candidate.name} vs ${trusted.name})`,
    parse(source, dialect) {
      const trustedDocument = trusted.parse(source, dialect);
      if (!options.onDivergence) return trustedDocument;
      try {
        const candidateDocument = candidate.parse(source, dialect);
        const divergences = compareSchemaDocuments(trustedDocument, candidateDocument);
        if (divergences.length > 0) {
          options.onDivergence({ source, dialect, candidateName: candidate.name, divergences });
        }
      } catch (error) {
        options.onDivergence({
          source,
          dialect,
          candidateName: candidate.name,
          divergences: [{ kind: "structure", path: "document", field: "threw", trusted: undefined, candidate: error instanceof Error ? error.message : String(error) }],
        });
      }
      return trustedDocument;
    },
  };
}
