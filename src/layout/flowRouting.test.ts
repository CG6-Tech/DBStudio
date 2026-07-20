import { describe, expect, it } from "vitest";
import { clearFlowRouteCache, flowRouteCacheSize, routeFlowConnection } from "./flowRouting";

describe("flow connection routing", () => {
  it("uses a horizontal-tangent curve for an unobstructed forward edge", () => {
    const route = routeFlowConnection({ x: 100, y: 80 }, { x: 420, y: 160 });
    expect(route.kind).toBe("curve");
    expect(route.path).toMatch(/^M100 80 C/);
    expect(route.path.endsWith(",420 160")).toBe(true);
  });

  it("keeps a natural compact curve when a card intersects the corridor", () => {
    const source = { x: 100, y: 100 }; const target = { x: 500, y: 100 };
    const route = routeFlowConnection(source, target, [{ x: 250, y: 50, width: 120, height: 120 }]);
    expect(route.kind).toBe("curve");
    expect(route.points[0]).toEqual(source);
    expect(route.points.at(-1)).toEqual(target);
    expect(route.points.every((point) => point.x >= 100 && point.x <= 500)).toBe(true);
  });

  it("assigns deterministic local offsets to parallel routes", () => {
    const obstacle = [{ x: 220, y: 40, width: 100, height: 100 }];
    const first = routeFlowConnection({ x: 100, y: 80 }, { x: 450, y: 90 }, obstacle, 0);
    const second = routeFlowConnection({ x: 100, y: 80 }, { x: 450, y: 90 }, obstacle, 1);
    expect(first.path).not.toBe(second.path);
    expect(routeFlowConnection({ x: 100, y: 80 }, { x: 450, y: 90 }, obstacle, 1)).toEqual(second);
  });

  it("keeps backward curves inside a bounded endpoint margin", () => {
    const route = routeFlowConnection({ x: 500, y: 100 }, { x: 160, y: 400 });
    expect(route.points[0]).toEqual({ x: 500, y: 100 });
    expect(route.points.at(-1)).toEqual({ x: 160, y: 400 });
    expect(route.points.every((point) => point.x >= 50 && point.x <= 610 && point.y >= 100 && point.y <= 400)).toBe(true);
  });

  it("caches routes by endpoints and parallel offset", () => {
    clearFlowRouteCache(); const first = routeFlowConnection({ x: 1, y: 2 }, { x: 300, y: 40 }, [], 2); const second = routeFlowConnection({ x: 1, y: 2 }, { x: 300, y: 40 }, [], 2);
    expect(second).toBe(first);
    expect(flowRouteCacheSize()).toBe(1);
  });

  it("routes a 1,500-edge production fixture without obstacle-dependent growth", () => {
    clearFlowRouteCache();
    const routes = Array.from({ length: 1500 }, (_, index) => routeFlowConnection({ x: (index % 25) * 20, y: index % 500 }, { x: 600 + (index % 13) * 10, y: (index * 7) % 700 }, [], index % 5));
    expect(routes).toHaveLength(1500);
    expect(routes.every((route) => route.kind === "curve" && route.points.length <= 7)).toBe(true);
    expect(flowRouteCacheSize()).toBe(1500);
  });
});
