import { describe, expect, it } from "vitest";
import { projectComputeStatement } from "./computeProjection";

describe("compute projection", () => {
  it("projects changed-field comparisons from old and new jsonb data", () => {
    expect(projectComputeStatement(`SELECT coalesce(array_agg(key ORDER BY key), ARRAY[]::text[])
      INTO changed
      FROM jsonb_object_keys(old_data || new_data) AS keys(key)
     WHERE old_data -> key IS DISTINCT FROM new_data -> key;`)).toMatchObject({
      target: "changed",
      source: "keys from old_data || new_data",
      filter: "old_data.key != new_data.key",
      summary: "Compare old and new fields",
      select: { fields: ["coalesce(array_agg(key ORDER BY key), ARRAY[]::text[])"], target: "changed", table: "keys from old_data || new_data", condition: "old_data.key != new_data.key" },
    });
  });

  it("projects simple old and new data sources", () => {
    expect(projectComputeStatement("SELECT array_agg(key) INTO changed FROM jsonb_object_keys(new_data) keys(key);")?.source).toBe("keys from new_data");
    expect(projectComputeStatement("SELECT array_agg(key) INTO changed FROM jsonb_object_keys(old_data) keys(key);")?.source).toBe("keys from old_data");
  });
});
