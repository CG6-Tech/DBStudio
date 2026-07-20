import { describe, expect, it } from "vitest";
import { addArea, addNote } from "./schemaActions";
import { captureAreaContents } from "./areaMembership";
import { parseSchema } from "./parser";

describe("area content capture", () => {
  it("captures items by center and releases them after a shrink", () => {
    let document = addNote(addArea(parseSchema("CREATE TABLE users(id INT);")));
    const area = document.areas[0];
    document = captureAreaContents(document, area.id, [{ id: document.tables[0].id, x: 100, y: 400, width: 200, height: 100 }], [{ id: document.notes[0].id, x: 120, y: 420, width: 220, height: 110 }]);
    expect(document.areas[0].tableIds).toEqual([document.tables[0].id]);
    expect(document.areas[0].noteIds).toEqual([document.notes[0].id]);

    document = { ...document, areas: document.areas.map((item) => item.id === area.id ? { ...item, width: 40, height: 40 } : item) };
    document = captureAreaContents(document, area.id, [{ id: document.tables[0].id, x: 100, y: 400, width: 200, height: 100 }], [{ id: document.notes[0].id, x: 120, y: 420, width: 220, height: 110 }]);
    expect(document.areas[0].tableIds).toEqual([]);
    expect(document.areas[0].noteIds).toEqual([]);
  });

  it("gives ownership to the most recently captured overlapping area", () => {
    let document = addArea(addArea(parseSchema("CREATE TABLE users(id INT);")));
    document = { ...document, areas: document.areas.map((area) => ({ ...area, x: 0, y: 0, width: 500, height: 500 })) };
    const table = { id: document.tables[0].id, x: 100, y: 100, width: 200, height: 100 };
    document = captureAreaContents(document, document.areas[0].id, [table], []);
    document = captureAreaContents(document, document.areas[1].id, [table], []);
    expect(document.areas[0].tableIds).toEqual([]);
    expect(document.areas[1].tableIds).toEqual([table.id]);
  });
});
