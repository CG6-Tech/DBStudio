import { describe, expect, it } from "vitest";
import { mutationProjectionHeight, projectMutationStatement } from "./mutationProjection";

describe("mutation projection", () => {
  it("extracts update table, assignments, and condition", () => {
    expect(projectMutationStatement("UPDATE public.products SET stock_quantity = stock_quantity + OLD.quantity, updated_at = now() WHERE id = OLD.product;")).toEqual({
      operation: "UPDATE",
      table: "public.products",
      assignments: [
        { field: "stock_quantity", value: "stock_quantity + OLD.quantity" },
        { field: "updated_at", value: "now()" },
      ],
      condition: "id = OLD.product",
    });
  });

  it("extracts delete table and condition", () => {
    expect(projectMutationStatement("DELETE FROM public.audit_log WHERE created_at < cutoff;")).toEqual({
      operation: "DELETE",
      table: "public.audit_log",
      condition: "created_at < cutoff",
    });
  });

  it("sizes the card from its visible semantic rows", () => {
    const projection = projectMutationStatement("UPDATE inventory SET count = count - 1, updated_at = now() WHERE id = 1;")!;
    expect(mutationProjectionHeight(projection)).toBe(108);
  });
});
