import { describe, expect, it } from "vitest";
import { projectAssignmentStatement } from "./assignmentProjection";

describe("projectAssignmentStatement", () => {
  it("separates the assignment target and value", () => {
    expect(projectAssignmentStatement("NEW.body := nullif(btrim(NEW.body), '');")).toEqual({
      target: "NEW.body",
      value: "nullif(btrim(NEW.body), '')",
    });
  });

  it("supports quoted field names and rejects empty values", () => {
    expect(projectAssignmentStatement('NEW."Test" := now();')?.target).toBe('NEW."Test"');
    expect(projectAssignmentStatement("value :=;")).toBeNull();
  });
});
