import { describe, expect, it } from "vitest";
import { parseSchema } from "./parser";
import { mergeWorkspaceData, parseWorkspaceData, workspaceDataFromDocument } from "./workspaceData";

const source = `
CREATE TABLE public.users (id bigint PRIMARY KEY, email text);
COMMENT ON TABLE public.users IS 'People';
CREATE TABLE public.orders (id bigint PRIMARY KEY, user_id bigint REFERENCES public.users(id));
`;

describe("workspace data", () => {
  it("round trips version 2 visual data", () => {
    const document = parseSchema(source, "postgresql");
    document.tables[0].position = { x: 120, y: 240 };
    document.tables[0].color = "#22c55e";
    document.tables[0].commentVisible = true;
    const serialized = JSON.parse(JSON.stringify(workspaceDataFromDocument(document)));
    const parsed = parseWorkspaceData(serialized);
    expect(parsed.issues).toEqual([]);
    expect(parsed.data.format).toBe("dbstudio-workspace");
    expect(parsed.data.tables[0].visual.position).toEqual({ x: 120, y: 240 });
    expect(parsed.data.tables[0].comment?.text).toBe("People");
  });

  it("merges by qualified name when parser ids differ", () => {
    const sourceDocument = parseSchema(source, "postgresql");
    sourceDocument.tables[0].position = { x: 333, y: 444 };
    const data = workspaceDataFromDocument(sourceDocument);
    data.tables[0].ref.sourceIdentity = "different-workspace-id";
    const target = parseSchema(`\n\n${source}`, "postgresql");
    const result = mergeWorkspaceData(target, data);
    expect(result.report.matched).toBe(2);
    expect(result.document.tables.find((table) => table.name === "users")?.position).toEqual({ x: 333, y: 444 });
  });

  it("imports comment text only for explicit imports", () => {
    const document = parseSchema(source, "postgresql");
    const data = workspaceDataFromDocument(document);
    data.tables[0].comment!.text = "Imported people";
    expect(mergeWorkspaceData(document, data, { importComments: false }).document.tables[0].comment).toBe("People");
    expect(mergeWorkspaceData(document, data, { importComments: true }).document.tables[0].comment).toBe("Imported people");
  });

  it("skips invalid optional records without mutating current records", () => {
    const document = parseSchema(source, "postgresql");
    const value = workspaceDataFromDocument(document) as unknown as Record<string, unknown>;
    value.notes = [{ id: "bad", text: "Bad", color: "red", x: 0, y: 0 }];
    const parsed = parseWorkspaceData(value);
    const result = mergeWorkspaceData(document, parsed.data, { importComments: false, invalid: parsed.issues.length });
    expect(parsed.issues).toHaveLength(1);
    expect(result.report.invalid).toBe(1);
    expect(result.document.notes).toEqual(document.notes);
  });

  it("rejects malformed canvas layouts without passing them to renderers", () => {
    const document = parseSchema(source, "postgresql");
    const value = workspaceDataFromDocument(document) as unknown as Record<string, unknown>;
    value.canvases = {
      logic: { nodes: [{ id: "duplicate", position: { x: 0, y: 0 } }, { id: "duplicate", position: { x: 1, y: 1 } }], viewport: { x: 0, y: 0, scale: 1 } },
      routineFlows: { routine: { nodes: [], scale: -1 } },
    };
    const parsed = parseWorkspaceData(value);
    expect(parsed.data.canvases.logic).toBeUndefined();
    expect(parsed.data.canvases.routineFlows).toEqual({});
    expect(parsed.issues.map((issue) => issue.path)).toEqual(["canvases.logic", "canvases.routineFlows.routine"]);
  });
});
