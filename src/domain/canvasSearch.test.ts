import { describe, expect, it } from "vitest";
import { parseSchema } from "./parser";
import { searchCanvas } from "./canvasSearch";

describe("searchCanvas", () => {
  it("ranks exact tables before matching columns and substrings", () => {
    const document = parseSchema("CREATE TABLE users (id INT, user_name TEXT); CREATE TABLE app_users (id INT);");
    expect(searchCanvas(document, "users").map((result) => [result.tableName, result.columnName])).toEqual([["users", undefined], ["app_users", undefined]]);
    expect(searchCanvas(document, "user")[0].tableName).toBe("users");
  });
});
