import type { DiagramArea, SchemaDocument } from "./types";

export interface AreaItemBounds {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

function containsCenter(area: DiagramArea, item: AreaItemBounds): boolean {
  const centerX = item.x + item.width / 2;
  const centerY = item.y + item.height / 2;
  return centerX >= area.x && centerX <= area.x + area.width && centerY >= area.y && centerY <= area.y + area.height;
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

export function captureAreaContents(document: SchemaDocument, areaId: string, tables: readonly AreaItemBounds[], notes: readonly AreaItemBounds[]): SchemaDocument {
  const target = document.areas.find((area) => area.id === areaId);
  if (!target) return document;
  const tableOwners = new Map<string, string>();
  const noteOwners = new Map<string, string>();
  document.areas.forEach((area) => {
    area.tableIds.forEach((id) => tableOwners.set(id, area.id));
    (area.noteIds ?? []).forEach((id) => noteOwners.set(id, area.id));
  });
  const fallbackOwner = (item: AreaItemBounds) => [...document.areas].reverse().find((area) => area.id !== areaId && containsCenter(area, item))?.id;
  tables.forEach((item) => {
    if (containsCenter(target, item)) tableOwners.set(item.id, areaId);
    else if (tableOwners.get(item.id) === areaId) {
      const fallback = fallbackOwner(item);
      if (fallback) tableOwners.set(item.id, fallback); else tableOwners.delete(item.id);
    }
  });
  notes.forEach((item) => {
    if (containsCenter(target, item)) noteOwners.set(item.id, areaId);
    else if (noteOwners.get(item.id) === areaId) {
      const fallback = fallbackOwner(item);
      if (fallback) noteOwners.set(item.id, fallback); else noteOwners.delete(item.id);
    }
  });
  let changed = false;
  const areas = document.areas.map((area) => {
    const tableIds = document.tables.map((table) => table.id).filter((id) => tableOwners.get(id) === area.id);
    const noteIds = document.notes.map((note) => note.id).filter((id) => noteOwners.get(id) === area.id);
    if (sameIds(tableIds, area.tableIds) && sameIds(noteIds, area.noteIds ?? [])) return area;
    changed = true;
    return { ...area, tableIds, noteIds };
  });
  return changed ? { ...document, areas } : document;
}
