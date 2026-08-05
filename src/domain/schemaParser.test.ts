import { afterEach, describe, expect, it } from "vitest";
import { parseSchema } from "./parser";
import { getSchemaParser, handRolledSchemaParser, parseSchemaDocument, setSchemaParser, type SchemaParser } from "./schemaParser";
import type { SchemaDocument } from "./types";

const sql = `CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL
);`;

describe("schemaParser seam", () => {
  afterEach(() => {
    setSchemaParser(handRolledSchemaParser);
  });

  it("defaults to the hand-rolled parser and delegates verbatim", () => {
    expect(getSchemaParser()).toBe(handRolledSchemaParser);
    expect(parseSchemaDocument(sql, "postgresql")).toEqual(parseSchema(sql, "postgresql"));
  });

  it("defaults the dialect to postgresql", () => {
    expect(parseSchemaDocument(sql)).toEqual(parseSchema(sql, "postgresql"));
  });

  it("threads the requested dialect through to the active parser", () => {
    const seen: string[] = [];
    setSchemaParser({
      name: "recording",
      parse: (source, dialect) => {
        seen.push(dialect);
        return parseSchema(source, dialect);
      },
    });
    parseSchemaDocument(sql, "mysql");
    expect(seen).toEqual(["mysql"]);
  });

  it("routes through a swapped parser and restores the previous one", () => {
    const stub: SchemaDocument = { ...parseSchema(sql, "postgresql"), source: "stubbed" };
    const stubParser: SchemaParser = { name: "stub", parse: () => stub };

    const previous = setSchemaParser(stubParser);
    expect(previous).toBe(handRolledSchemaParser);
    expect(getSchemaParser()).toBe(stubParser);
    expect(parseSchemaDocument(sql, "postgresql")).toBe(stub);

    setSchemaParser(previous);
    expect(getSchemaParser()).toBe(handRolledSchemaParser);
    expect(parseSchemaDocument(sql, "postgresql").source).toBe(sql);
  });
});
