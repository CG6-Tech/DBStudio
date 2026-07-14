import RBush from "rbush";
import { describe, expect, it } from "vitest";
import { isRelationshipDeleteKey, nearestRelationship, pointToSegmentDistance, relationshipSegments, type RelationshipSegmentItem } from "./relationshipHitTesting";

describe("relationship hit testing", () => {
  it("accepts macOS Delete and forward Delete keys", () => {
    expect(isRelationshipDeleteKey("Backspace")).toBe(true);
    expect(isRelationshipDeleteKey("Delete")).toBe(true);
    expect(isRelationshipDeleteKey("Enter")).toBe(false);
  });

  it("measures the shortest distance to a segment", () => {
    expect(pointToSegmentDistance({ x: 5, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(4);
    expect(pointToSegmentDistance({ x: 15, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(5);
  });

  it("selects the nearest indexed relationship within tolerance", () => {
    const index = new RBush<RelationshipSegmentItem>();
    index.load([...relationshipSegments("far", [{ x: 0, y: 9 }, { x: 20, y: 9 }]), ...relationshipSegments("near", [{ x: 0, y: 2 }, { x: 20, y: 2 }])]);
    expect(nearestRelationship(index, { x: 10, y: 0 }, 5)).toBe("near");
    expect(nearestRelationship(index, { x: 10, y: 0 }, 1)).toBeNull();
  });
});
