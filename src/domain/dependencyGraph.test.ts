import { describe, expect, it } from "vitest";
import { stableDependencyOrder, stronglyConnectedComponents } from "./dependencyGraph";

describe("dependency graph", () => {
  it("groups cycles in linear traversal order", () => {
    const graph = new Map<string, Set<string>>([["a", new Set(["b"])], ["b", new Set(["a", "c"])], ["c", new Set()]]);
    const components = stronglyConnectedComponents(graph).map((group) => group.sort()).sort((a, b) => a[0].localeCompare(b[0]));
    expect(components).toEqual([["a", "b"], ["c"]]);
  });

  it("orders dependencies before dependents and keeps cycles deterministic", () => {
    const dependencies = new Map<string, Set<string>>([
      ["index", new Set(["table"])], ["table", new Set()], ["cycle-b", new Set(["cycle-a"])], ["cycle-a", new Set(["cycle-b"])],
    ]);
    const ordered = stableDependencyOrder(["index", "cycle-b", "table", "cycle-a"], dependencies, String);
    expect(ordered.indexOf("table")).toBeLessThan(ordered.indexOf("index"));
    expect(ordered.filter((item) => item.startsWith("cycle"))).toEqual(["cycle-a", "cycle-b"]);
  });
});
