import { describe, expect, it } from "vitest";
import { parseSchema } from "./parser";
import { compareSchemaDocuments } from "./schemaParserOracle";
import { schemaDocumentFromAst, type SchemaAst } from "./astSchema";
import type { SchemaDocument } from "./types";

/**
 * Build a byte-offset {@link SchemaAst} from a hand-rolled-parsed document.
 * Valid only for ASCII sources, where UTF-8 byte offsets equal JS string
 * indices — which lets us assert the converter reproduces the trusted parser
 * exactly, without a Rust build. This mimics what the Rust parser will emit.
 */
function astFromParsed(document: SchemaDocument): SchemaAst {
  const columnName = new Map<string, string>();
  const tableName = new Map<string, string>();
  for (const table of document.tables) {
    tableName.set(table.id, table.name);
    for (const column of table.columns) columnName.set(column.id, column.name);
  }

  return {
    dialect: document.dialect,
    tables: document.tables.map((table) => ({
      name: table.name,
      schema: table.schema,
      nameRange: table.nameRange,
      statementRange: table.statementRange,
      columns: table.columns.map((column) => ({
        name: column.name,
        nameRange: column.nameRange,
        typeRange: column.typeRange,
        notNull: Boolean(column.notNullRange),
        notNullRange: column.notNullRange,
        primaryKey: column.primaryKey,
        unique: column.unique,
      })),
      primaryKeyColumns: [],
      foreignKeys: document.relationships
        .filter((relationship) => relationship.sourceTableId === table.id)
        .map((relationship) => ({
          sourceColumnName: columnName.get(relationship.sourceColumnId) ?? "",
          targetTableName: tableName.get(relationship.targetTableId) ?? "",
          targetColumnName: columnName.get(relationship.targetColumnId) ?? "",
          sourceColumnReferenceRange: relationship.sourceColumnReferenceRange,
          targetTableReferenceRange: relationship.targetTableReferenceRange,
          targetColumnReferenceRange: relationship.targetColumnReferenceRange,
        })),
    })),
  };
}

const asciiSql = `CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  age INT
);

CREATE TABLE orders (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id)
);`;

describe("schemaDocumentFromAst", () => {
  it("reproduces the hand-rolled parser exactly for the covered core (oracle sees no divergence)", () => {
    const trusted = parseSchema(asciiSql, "postgresql");
    const ast = astFromParsed(trusted);
    const candidate = schemaDocumentFromAst(ast, asciiSql, "postgresql");
    expect(compareSchemaDocuments(trusted, candidate)).toEqual([]);
  });

  it("preserves table and column names, keys, and nullability", () => {
    const trusted = parseSchema(asciiSql, "postgresql");
    const candidate = schemaDocumentFromAst(astFromParsed(trusted), asciiSql, "postgresql");
    const users = candidate.tables.find((table) => table.name === "users");
    expect(users?.columns.map((column) => column.name)).toEqual(["id", "email", "age"]);
    expect(users?.columns.find((column) => column.name === "id")?.primaryKey).toBe(true);
    expect(users?.columns.find((column) => column.name === "email")?.nullable).toBe(false);
    expect(users?.columns.find((column) => column.name === "age")?.nullable).toBe(true);
    expect(candidate.relationships).toHaveLength(1);
  });

  it("converts byte offsets to character offsets for a non-ASCII source", () => {
    // A multi-byte comment shifts every byte offset past it; the converter must
    // land the ranges on the right characters so slicing recovers the tokens.
    const source = "-- café ☕ table\nCREATE TABLE t (\n  id INT PRIMARY KEY\n);";
    const idByte = new TextEncoder().encode(source.slice(0, source.indexOf("id"))).length;
    const tByte = new TextEncoder().encode(source.slice(0, source.indexOf("t ("))).length;
    const ast: SchemaAst = {
      dialect: "postgresql",
      tables: [
        {
          name: "t",
          nameRange: { start: tByte, end: tByte + 1 },
          statementRange: { start: new TextEncoder().encode(source.slice(0, source.indexOf("CREATE"))).length, end: new TextEncoder().encode(source).length },
          columns: [
            {
              name: "id",
              nameRange: { start: idByte, end: idByte + 2 },
              typeRange: { start: idByte + 3, end: idByte + 6 },
              notNull: false,
              primaryKey: true,
              unique: false,
            },
          ],
          primaryKeyColumns: [],
          foreignKeys: [],
        },
      ],
    };
    const document = schemaDocumentFromAst(ast, source, "postgresql");
    const table = document.tables[0];
    expect(source.slice(table.nameRange.start, table.nameRange.end)).toBe("t");
    const column = table.columns[0];
    expect(source.slice(column.nameRange.start, column.nameRange.end)).toBe("id");
    expect(source.slice(column.typeRange.start, column.typeRange.end)).toBe("INT");
    expect(column.dataType).toBe("INT");
    expect(column.primaryKey).toBe(true);
  });

  it("folds a table-level PRIMARY KEY clause into the named column", () => {
    const source = "CREATE TABLE t (\n  id INT,\n  PRIMARY KEY (id)\n);";
    const idByte = source.indexOf("id"); // ASCII
    const ast: SchemaAst = {
      dialect: "postgresql",
      tables: [
        {
          name: "t",
          nameRange: { start: source.indexOf("t ("), end: source.indexOf("t (") + 1 },
          statementRange: { start: 0, end: source.length },
          columns: [
            { name: "id", nameRange: { start: idByte, end: idByte + 2 }, typeRange: { start: idByte + 3, end: idByte + 6 }, notNull: false, primaryKey: false, unique: false },
          ],
          primaryKeyColumns: ["id"],
          foreignKeys: [],
        },
      ],
    };
    const column = schemaDocumentFromAst(ast, source, "postgresql").tables[0].columns[0];
    expect(column.primaryKey).toBe(true);
    expect(column.nullable).toBe(false);
    expect(column.originalNullable).toBe(false);
  });
});
