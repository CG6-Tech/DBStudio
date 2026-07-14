import { describe, expect, it } from "vitest";
import { inflateRoutingObstacles, routeIntersectsObstacles, routeOrthogonalAStar } from "./orthogonalRouter";

describe("orthogonal router", () => {
  it("routes deterministically around inflated table obstacles", () => {
    const obstacles = inflateRoutingObstacles([{ id: "middle", x: 180, y: 60, width: 120, height: 140 }], 20);
    const request = { id: "r", start: { x: 100, y: 120 }, end: { x: 380, y: 120 }, startSide: "right" as const, endSide: "left" as const, sourceId: "source", targetId: "target" };
    const first = routeOrthogonalAStar(request, obstacles);
    expect(first).toEqual(routeOrthogonalAStar(request, obstacles));
    expect(routeIntersectsObstacles(first, obstacles)).toBe(false);
    expect(first.length).toBeGreaterThan(4);
  });

  it("inflates obstacles with predictable clearance", () => {
    expect(inflateRoutingObstacles([{ id: "a", x: 10, y: 20, width: 30, height: 40 }], 5)[0]).toEqual({ id: "a", minX: 5, minY: 15, maxX: 45, maxY: 65 });
  });
});
