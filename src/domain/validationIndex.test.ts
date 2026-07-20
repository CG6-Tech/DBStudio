import { describe, expect, it } from "vitest";
import { parseSchema } from "./parser";
import { validationIssuesFor } from "./validationIndex";

describe("validation issue index", () => {
  it("routes offset and editor diagnostics through prebuilt indexes", () => {
    const document = parseSchema("CREATE TABLE users (id bigint, email mystery_type); CREATE TABLE orders (id bigint, user_id bigint REFERENCES users(id));");
    const users = document.tables[0];
    const email = users.columns[1];
    document.diagnostics = [
      { level: "warning", message: "Parser warning", offset: email.typeRange.start },
      { level: "warning", message: "Editor: Field users.email uses unresolved type mystery_type." },
    ];
    const issues = validationIssuesFor(document);
    expect(issues.map((issue) => issue.targetName)).toEqual(["users.email", "users.email"]);
    expect(issues.every((issue) => issue.target?.kind === "selection" && issue.target.selection.kind === "column")).toBe(true);
  });

  it("returns the cached issue records for the same document", () => {
    const document = parseSchema("CREATE TABLE users (id bigint);");
    expect(validationIssuesFor(document)).toBe(validationIssuesFor(document));
  });
});
