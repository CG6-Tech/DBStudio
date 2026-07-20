import { describe, expect, it } from "vitest";
import { projectReturnStatement } from "./returnProjection";

describe("RETURN projection", () => {
  it("extracts row values and expressions", () => {
    expect(projectReturnStatement("RETURN OLD;")).toEqual({ value: "OLD" });
    expect(projectReturnStatement("RETURN coalesce(NEW, OLD);")).toEqual({ value: "coalesce(NEW, OLD)" });
  });

  it("rejects incomplete returns", () => {
    expect(projectReturnStatement("RETURN;")).toBeNull();
  });
});
