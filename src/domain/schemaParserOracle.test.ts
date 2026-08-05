import { describe, expect, it } from "vitest";
import { parseSchema } from "./parser";
import { handRolledSchemaParser, type SchemaParser } from "./schemaParser";
import { compareSchemaDocuments, differentialSchemaParser, type SchemaDivergence } from "./schemaParserOracle";
import type { SchemaDocument } from "./types";

const sql = `CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL
);

CREATE TABLE orders (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id)
);`;

function parse(): SchemaDocument {
  return parseSchema(sql, "postgresql");
}

/** Deep clone so a mutated candidate can't alias the trusted document. */
function clone(document: SchemaDocument): SchemaDocument {
  return structuredClone(document);
}

function kinds(divergences: SchemaDivergence[]): string[] {
  return [...new Set(divergences.map((item) => item.kind))].sort();
}

describe("compareSchemaDocuments", () => {
  it("reports no divergence for an identical document", () => {
    expect(compareSchemaDocuments(parse(), parse())).toEqual([]);
  });

  it("detects a missing table (structure)", () => {
    const trusted = parse();
    const candidate = clone(trusted);
    candidate.tables = candidate.tables.filter((table) => table.name !== "orders");
    const divergences = compareSchemaDocuments(trusted, candidate);
    expect(divergences.some((d) => d.kind === "structure" && d.field === "table.missing" && d.trusted === "orders")).toBe(true);
  });

  it("detects a changed column attribute (attribute)", () => {
    const trusted = parse();
    const candidate = clone(trusted);
    candidate.tables[0].columns[1].nullable = !candidate.tables[0].columns[1].nullable;
    const divergences = compareSchemaDocuments(trusted, candidate);
    expect(divergences.some((d) => d.kind === "attribute" && d.field === "nullable")).toBe(true);
  });

  it("detects a drifted offset without reporting it as a structural mismatch", () => {
    const trusted = parse();
    const candidate = clone(trusted);
    candidate.tables[0].columns[0].nameRange = { start: 999, end: 1002 };
    const divergences = compareSchemaDocuments(trusted, candidate);
    expect(kinds(divergences)).toEqual(["offset"]);
    expect(divergences[0].field).toBe("nameRange");
  });

  it("detects an original-field mismatch (the emitter diff basis)", () => {
    const trusted = parse();
    const candidate = clone(trusted);
    candidate.tables[0].columns[0].originalDataType = "CHANGED";
    const divergences = compareSchemaDocuments(trusted, candidate);
    expect(kinds(divergences)).toEqual(["original-field"]);
  });

  it("detects a relationship difference", () => {
    const trusted = parse();
    const candidate = clone(trusted);
    candidate.relationships = [];
    const divergences = compareSchemaDocuments(trusted, candidate);
    expect(divergences.some((d) => d.kind === "relationship" && d.field === "missing")).toBe(true);
  });

  it("matches tables by semantic key, not by offset-derived id", () => {
    const trusted = parse();
    const candidate = clone(trusted);
    // Mutate every id as a real parser with different id scheme would; content identical.
    for (const table of candidate.tables) {
      table.id = `x:${table.name}`;
      for (const column of table.columns) column.id = `x:${table.name}.${column.name}`;
    }
    expect(compareSchemaDocuments(trusted, candidate)).toEqual([]);
  });
});

describe("differentialSchemaParser", () => {
  it("serves the trusted output and reports divergence for a mismatching candidate", () => {
    const dropOrders: SchemaParser = {
      name: "drop-orders",
      parse: (source, dialect) => {
        const document = parseSchema(source, dialect);
        return { ...document, tables: document.tables.filter((table) => table.name !== "orders") };
      },
    };
    const reports: SchemaDivergence[][] = [];
    const parser = differentialSchemaParser(dropOrders, { onDivergence: (report) => reports.push(report.divergences) });

    const served = parser.parse(sql, "postgresql");
    // Served result is the TRUSTED one — orders is present.
    expect(served.tables.map((table) => table.name)).toEqual(["users", "orders"]);
    expect(reports).toHaveLength(1);
    expect(reports[0].some((d) => d.field === "table.missing")).toBe(true);
  });

  it("does not fire onDivergence when the candidate matches", () => {
    const reports: unknown[] = [];
    const parser = differentialSchemaParser(handRolledSchemaParser, { onDivergence: (report) => reports.push(report) });
    parser.parse(sql, "postgresql");
    expect(reports).toEqual([]);
  });

  it("serves trusted output and reports when the candidate throws", () => {
    const boom: SchemaParser = { name: "boom", parse: () => { throw new Error("kaboom"); } };
    const reports: SchemaDivergence[][] = [];
    const parser = differentialSchemaParser(boom, { onDivergence: (report) => reports.push(report.divergences) });

    const served = parser.parse(sql, "postgresql");
    expect(served.tables).toHaveLength(2);
    expect(reports[0][0]).toMatchObject({ field: "threw", candidate: "kaboom" });
  });

  it("skips the candidate entirely when no onDivergence is provided", () => {
    const boom: SchemaParser = { name: "boom", parse: () => { throw new Error("should not run"); } };
    const parser = differentialSchemaParser(boom);
    // No throw, because the candidate is never invoked without an observer.
    expect(parser.parse(sql, "postgresql").tables).toHaveLength(2);
  });
});
