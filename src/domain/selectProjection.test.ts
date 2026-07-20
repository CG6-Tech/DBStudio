import { describe, expect, it } from "vitest";
import { projectSelectStatement } from "./selectProjection";

describe("select projection", () => {
  it("extracts fields, table, and condition from a normal select", () => {
    expect(projectSelectStatement("SELECT id, status, total FROM public.orders WHERE status = 'PAID';")).toEqual({
      fields: ["id", "status", "total"],
      table: "public.orders",
      condition: "status = 'PAID'",
    });
  });

  it("extracts fields, target, jsonb source, and condition from select into", () => {
    expect(projectSelectStatement(`SELECT coalesce(array_agg(key ORDER BY key), ARRAY[]::text[])
      INTO changed
      FROM jsonb_object_keys(old_data || new_data) AS keys(key)
     WHERE old_data -> key IS DISTINCT FROM new_data -> key;`)).toEqual({
      fields: ["coalesce(array_agg(key ORDER BY key), ARRAY[]::text[])"],
      target: "changed",
      table: "keys from old_data || new_data",
      condition: "old_data.key != new_data.key",
    });
  });
});
