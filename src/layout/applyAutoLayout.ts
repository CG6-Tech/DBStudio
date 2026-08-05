import { tableHeight, tableWidth } from "../domain/tableGeometry";
import type { DiagramNote, LayoutNode, LayoutResult, SchemaDocument } from "../domain/types";

const AREA_PADDING = 50;
const NOTE_WIDTH = 220;
const NOTE_HEIGHT = 110;

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function boundsOf(items: Bounds[]): Bounds | null {
  if (items.length === 0) return null;
  return {
    minX: Math.min(...items.map((item) => item.minX)),
    minY: Math.min(...items.map((item) => item.minY)),
    maxX: Math.max(...items.map((item) => item.maxX)),
    maxY: Math.max(...items.map((item) => item.maxY)),
  };
}

function tableBounds(document: SchemaDocument, tableId: string): Bounds | null {
  const table = document.tables.find((item) => item.id === tableId);
  if (!table) return null;
  return {
    minX: table.position.x,
    minY: table.position.y,
    maxX: table.position.x + tableWidth(table),
    maxY: table.position.y + tableHeight(table),
  };
}

function nodeBounds(nodes: Map<string, LayoutNode>, tableId: string): Bounds | null {
  const node = nodes.get(tableId);
  return node ? { minX: node.x, minY: node.y, maxX: node.x + node.width, maxY: node.y + node.height } : null;
}

function noteBounds(note: DiagramNote): Bounds {
  return { minX: note.x, minY: note.y, maxX: note.x + NOTE_WIDTH, maxY: note.y + NOTE_HEIGHT };
}

function center(bounds: Bounds): { x: number; y: number } {
  return { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
}

export function applyAutoLayout(document: SchemaDocument, layout: LayoutResult): SchemaDocument {
  const nodes = new Map(layout.nodes.map((node) => [node.id, node]));
  const positionedTables = document.tables.map((table) => {
    const node = nodes.get(table.id);
    return node ? { ...table, position: { x: node.x, y: node.y } } : table;
  });

  const noteOffsets = new Map<string, { x: number; y: number }>();
  const nextAreas = document.areas.map((area) => {
    const oldTableBounds = boundsOf(area.tableIds.flatMap((id) => tableBounds(document, id) ?? []));
    const newTableBounds = boundsOf(area.tableIds.flatMap((id) => nodeBounds(nodes, id) ?? []));
    const delta = oldTableBounds && newTableBounds
      ? { x: center(newTableBounds).x - center(oldTableBounds).x, y: center(newTableBounds).y - center(oldTableBounds).y }
      : { x: 0, y: 0 };

    (area.noteIds ?? []).forEach((noteId) => {
      if (!noteOffsets.has(noteId)) noteOffsets.set(noteId, delta);
    });

    const movedNotes = (area.noteIds ?? [])
      .flatMap((noteId) => {
        const note = document.notes.find((item) => item.id === noteId);
        return note ? [{ ...note, x: note.x + delta.x, y: note.y + delta.y }] : [];
      })
      .map(noteBounds);
    const contentBounds = boundsOf([
      ...area.tableIds.flatMap((id) => nodeBounds(nodes, id) ?? []),
      ...movedNotes,
    ]);
    if (!contentBounds) return area;

    return {
      ...area,
      x: contentBounds.minX - AREA_PADDING,
      y: contentBounds.minY - AREA_PADDING,
      width: contentBounds.maxX - contentBounds.minX + AREA_PADDING * 2,
      height: contentBounds.maxY - contentBounds.minY + AREA_PADDING * 2,
    };
  });

  const nextNotes = document.notes.map((note) => {
    const offset = noteOffsets.get(note.id);
    return offset ? { ...note, x: note.x + offset.x, y: note.y + offset.y } : note;
  });

  return { ...document, hasSavedLayout: true, tables: positionedTables, areas: nextAreas, notes: nextNotes };
}
