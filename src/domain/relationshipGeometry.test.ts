import { describe, expect, it } from "vitest";
import { parseSchema } from "./parser";
import { buildRelationshipGeometry, connectedRelationshipIds, fieldAnchor, relationshipAnimationEnabled, relationshipCardinality, roundedOrthogonalPath } from "./relationshipGeometry";
import type { LayoutNode } from "./types";

const sql = `CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY
);

CREATE TABLE orders (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id),
  external_id BIGINT UNIQUE REFERENCES users(id)
);`;

function nodes(document: ReturnType<typeof parseSchema>): Map<string, LayoutNode> {
  return new Map([
    [document.tables[0].id, { id: document.tables[0].id, x: 500, y: 80, width: 260, height: 92 }],
    [document.tables[1].id, { id: document.tables[1].id, x: 80, y: 120, width: 260, height: 160 }],
  ]);
}

describe("relationship geometry", () => {
  it("derives many-to-one and one-to-one cardinality", () => {
    const document = parseSchema(sql);
    expect(relationshipCardinality(document.tables[1].columns[1])).toBe("N");
    expect(relationshipCardinality(document.tables[1].columns[2])).toBe("1");
  });

  it("anchors a relationship to its exact field rows", () => {
    const document = parseSchema(sql);
    const geometry = buildRelationshipGeometry(document, document.relationships[0], nodes(document));
    expect(geometry?.source.point).toEqual({ x: 340, y: 222 });
    expect(geometry?.target.point).toEqual({ x: 500, y: 148 });
    expect(geometry?.sourceCardinality).toBe("N");
    expect(geometry?.targetCardinality).toBe("1");
  });

  it("updates anchors when the table moves", () => {
    const document = parseSchema(sql);
    const nodeMap = nodes(document);
    const before = buildRelationshipGeometry(document, document.relationships[0], nodeMap)!;
    nodeMap.set(document.tables[1].id, { ...nodeMap.get(document.tables[1].id)!, x: 180, y: 240 });
    const after = buildRelationshipGeometry(document, document.relationships[0], nodeMap)!;
    expect(after.source.point.x - before.source.point.x).toBe(100);
    expect(after.source.point.y - before.source.point.y).toBe(120);
  });

  it("returns every relationship connected to the active table", () => {
    const document = parseSchema(sql);
    expect(connectedRelationshipIds(document, document.tables[0].id).size).toBe(2);
    expect(connectedRelationshipIds(document, null).size).toBe(0);
  });

  it("disables decorative movement for reduced-motion users", () => {
    expect(relationshipAnimationEnabled(2, false)).toBe(true);
    expect(relationshipAnimationEnabled(2, true)).toBe(false);
    expect(relationshipAnimationEnabled(0, false)).toBe(false);
  });

  it("computes either edge of a field row", () => {
    const document = parseSchema(sql);
    const node = nodes(document).get(document.tables[0].id)!;
    expect(fieldAnchor(node, document.tables[0], document.tables[0].columns[0].id, "left").point.x).toBe(500);
    expect(fieldAnchor(node, document.tables[0], document.tables[0].columns[0].id, "right").point.x).toBe(760);
  });

  it("rounds horizontal-to-vertical and vertical-to-horizontal elbows", () => {
    const rounded = roundedOrthogonalPath([
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 50 },
      { x: 80, y: 50 },
    ], 12, 6);
    expect(rounded[0]).toEqual({ x: 0, y: 0 });
    expect(rounded.at(-1)).toEqual({ x: 80, y: 50 });
    expect(rounded).toContainEqual({ x: 28, y: 0 });
    expect(rounded).toContainEqual({ x: 40, y: 12 });
    expect(rounded).toContainEqual({ x: 40, y: 38 });
    expect(rounded).toContainEqual({ x: 52, y: 50 });
  });

  it("clamps the radius to short adjacent segments", () => {
    const rounded = roundedOrthogonalPath([
      { x: 0, y: 0 },
      { x: 8, y: 0 },
      { x: 8, y: 6 },
    ], 12, 2);
    expect(rounded).toContainEqual({ x: 5, y: 0 });
    expect(rounded.at(-1)).toEqual({ x: 8, y: 6 });
    expect(rounded.every((point) => point.x >= 0 && point.x <= 8 && point.y >= 0 && point.y <= 6)).toBe(true);
  });

  it("leaves a straight route unchanged", () => {
    const points = [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 80, y: 0 }];
    expect(roundedOrthogonalPath(points)).toEqual(points);
  });
});
