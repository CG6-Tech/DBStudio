import { parseSchema } from "./parser";
import type { SchemaDocument, SqlDialect } from "./types";

/**
 * The parser seam.
 *
 * Every production consumer parses SQL through {@link parseSchemaDocument} rather
 * than importing {@link parseSchema} directly. This is the single point where a
 * future real-AST parser (pg_query / sqlparser over IPC on desktop) can be
 * introduced — behind a differential oracle that compares its output against the
 * hand-rolled parser — without touching any call site.
 *
 * Today it delegates verbatim to the hand-rolled TypeScript parser, so behavior
 * is unchanged. The contract a replacement must honor:
 *   - string in / {@link SchemaDocument} out, no I/O in the interface itself
 *   - all `*Range` fields are CHARACTER offsets into `SchemaDocument.source`
 *     (JS `String.slice` indices), consumed by `generateSql` in operations.ts
 *   - the `original*` fields (originalName/originalDataType/originalNullable/…)
 *     equal the parsed values, since the emitter diffs current-vs-original.
 */
export interface SchemaParser {
  /** Human-readable name — used by the differential oracle and diagnostics. */
  readonly name: string;
  parse(source: string, dialect: SqlDialect): SchemaDocument;
}

/** The hand-rolled TypeScript parser. Default and browser fallback. */
export const handRolledSchemaParser: SchemaParser = {
  name: "hand-rolled",
  parse: (source, dialect) => parseSchema(source, dialect),
};

let activeSchemaParser: SchemaParser = handRolledSchemaParser;

/** The parser currently backing {@link parseSchemaDocument}. */
export function getSchemaParser(): SchemaParser {
  return activeSchemaParser;
}

/**
 * Swap the active parser. Returns the previous parser so callers (and tests)
 * can restore it. Intended for wiring a real-AST parser at app startup and for
 * the differential oracle; production defaults to the hand-rolled parser.
 */
export function setSchemaParser(parser: SchemaParser): SchemaParser {
  const previous = activeSchemaParser;
  activeSchemaParser = parser;
  return previous;
}

/**
 * Parse SQL into a {@link SchemaDocument} via the active parser.
 * Production entry point — prefer this over importing `parseSchema` directly.
 */
export function parseSchemaDocument(source: string, dialect: SqlDialect = "postgresql"): SchemaDocument {
  return activeSchemaParser.parse(source, dialect);
}
