import { describe, expect, it } from "vitest";
import { projectPerformStatement } from "./performProjection";

describe("PERFORM projection", () => {
  it("extracts a filtered row lock", () => {
    expect(projectPerformStatement("PERFORM 1 FROM public.products WHERE id = OLD.product FOR UPDATE;")).toEqual({
      expression: "1",
      table: "public.products",
      condition: "id = OLD.product",
      lock: "FOR UPDATE",
    });
  });

  it("preserves stable lock ordering", () => {
    expect(projectPerformStatement(`PERFORM 1 FROM public.products
      WHERE id IN (OLD.product, NEW.product)
      ORDER BY id
      FOR UPDATE;`)).toEqual({
      expression: "1",
      table: "public.products",
      condition: "id IN (OLD.product, NEW.product)",
      orderBy: "id",
      lock: "FOR UPDATE",
    });
  });

  it("rejects PERFORM calls without a table source", () => {
    expect(projectPerformStatement("PERFORM refresh_inventory();")).toBeNull();
  });
});
