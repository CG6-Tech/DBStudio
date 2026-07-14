import { useEffect, useRef, useState } from "react";
import { Application, Container, FederatedPointerEvent, Graphics, Text, TextStyle } from "pixi.js";
import RBush from "rbush";
import {
  buildRelationshipGeometry, connectedRelationshipIds, relationshipAnimationEnabled, roundedOrthogonalPath, type AnchorSide, type Point,
} from "../domain/relationshipGeometry";
import type { LayoutNode, LayoutResult, Relationship, SchemaDocument } from "../domain/types";
import { assignTableToArea, updateArea, updateNote, updateTable } from "../domain/schemaActions";
import { useUiStore } from "../state/uiStore";

interface SpatialItem {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  id: string;
}

interface DiagramCanvasProps {
  document: SchemaDocument;
  layout: LayoutResult;
  onReplace: (label: string, next: SchemaDocument) => void;
}

const colors = {
  canvas: 0x0d1114,
  grid: 0x20272b,
  card: 0x171d21,
  cardTop: 0x1e262b,
  border: 0x344047,
  selected: 0x7ee0b5,
  text: 0xe9f1ed,
  muted: 0x8f9b97,
  type: 0x799089,
  key: 0xf5bd69,
  edge: 0x63736d,
};

const titleStyle = new TextStyle({ fontFamily: "Inter, system-ui, sans-serif", fontSize: 16, fontWeight: "600", fill: colors.text });
const columnStyle = new TextStyle({ fontFamily: "Inter, system-ui, sans-serif", fontSize: 13, fill: colors.text });
const typeStyle = new TextStyle({ fontFamily: "ui-monospace, SFMono-Regular, monospace", fontSize: 11, fill: colors.type });
const badgeStyle = new TextStyle({ fontFamily: "Inter, system-ui, sans-serif", fontSize: 9, fontWeight: "700", fill: colors.key });

function colorNumber(value: string): number {
  return Number.parseInt(value.replace("#", ""), 16);
}

function drawSolidRoute(graphics: Graphics, points: Point[], color: number, width: number): void {
  if (points.length < 2) return;
  graphics.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((point) => graphics.lineTo(point.x, point.y));
  graphics.stroke({ color, width });
}

export function drawDashedRoute(graphics: Graphics, points: Point[], phase: number, color: number, width: number): void {
  const dash = 12;
  const gap = 8;
  const cycle = dash + gap;
  let pattern = ((-phase % cycle) + cycle) % cycle;
  let drawing = pattern < dash;
  let patternRemaining = drawing ? dash - pattern : cycle - pattern;

  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (length === 0) continue;
    let distance = 0;
    while (distance < length) {
      const step = Math.min(patternRemaining, length - distance);
      if (drawing && step > 0) {
        graphics.moveTo(start.x + dx * (distance / length), start.y + dy * (distance / length));
        graphics.lineTo(start.x + dx * ((distance + step) / length), start.y + dy * ((distance + step) / length));
      }
      distance += step;
      patternRemaining -= step;
      if (patternRemaining <= 0.0001) {
        drawing = !drawing;
        patternRemaining = drawing ? dash : gap;
      }
    }
  }
  graphics.stroke({ color, width });
}

function createCardinalityBadge(label: "1" | "N", active: boolean): Container {
  const badge = new Container();
  const fill = active ? 0xaab9d0 : 0x80908a;
  badge.addChild(new Graphics().circle(0, 0, active ? 14 : 12).fill(fill).stroke({ color: colors.canvas, width: 2 }));
  const text = new Text({ text: label, style: new TextStyle({ fontFamily: "Inter, system-ui, sans-serif", fontSize: active ? 13 : 11, fontWeight: "700", fill: 0x14202a }) });
  text.anchor.set(0.5);
  badge.addChild(text);
  return badge;
}

export function DiagramCanvas({ document, layout, onReplace }: DiagramCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const worldRef = useRef<Container | null>(null);
  const tickerCleanupRef = useRef<() => void>(() => undefined);
  const [rendererReady, setRendererReady] = useState(false);
  const [viewportVersion, setViewportVersion] = useState(0);
  const viewportRef = useRef({ x: 80, y: 80, scale: 1 });
  const selection = useUiStore((state) => state.selection);
  const setSelection = useUiStore((state) => state.setSelection);
  const fitRequest = useUiStore((state) => state.fitRequest);

  useEffect(() => {
    if (!hostRef.current) return;
    let cancelled = false;
    let initialized = false;
    const app = new Application();
    void app.init({ background: colors.canvas, antialias: true, resizeTo: hostRef.current, resolution: window.devicePixelRatio || 1, autoDensity: true }).then(() => {
      initialized = true;
      if (cancelled || !hostRef.current) {
        app.destroy(true);
        return;
      }
      hostRef.current.appendChild(app.canvas);
      const world = new Container();
      world.position.set(viewportRef.current.x, viewportRef.current.y);
      app.stage.addChild(world);
      app.stage.eventMode = "static";
      app.stage.hitArea = app.screen;
      appRef.current = app;
      worldRef.current = world;
      setRendererReady(true);

      let panning = false;
      let last = { x: 0, y: 0 };
      app.stage.on("pointerdown", (event: FederatedPointerEvent) => {
        if (event.target !== app.stage) return;
        panning = true;
        last = { x: event.global.x, y: event.global.y };
        setSelection(null);
      });
      app.stage.on("pointermove", (event: FederatedPointerEvent) => {
        if (!panning) return;
        const viewport = viewportRef.current;
        viewport.x += event.global.x - last.x;
        viewport.y += event.global.y - last.y;
        last = { x: event.global.x, y: event.global.y };
        world.position.set(viewport.x, viewport.y);
      });
      const stopPan = () => { panning = false; };
      app.stage.on("pointerup", stopPan);
      app.stage.on("pointerupoutside", stopPan);
      app.canvas.addEventListener("wheel", (event) => {
        event.preventDefault();
        const viewport = viewportRef.current;
        const bounds = app.canvas.getBoundingClientRect();
        const pointer = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
        const worldPoint = { x: (pointer.x - viewport.x) / viewport.scale, y: (pointer.y - viewport.y) / viewport.scale };
        const nextScale = Math.min(2.2, Math.max(0.35, viewport.scale * Math.exp(-event.deltaY * 0.0012)));
        viewport.scale = nextScale;
        viewport.x = pointer.x - worldPoint.x * nextScale;
        viewport.y = pointer.y - worldPoint.y * nextScale;
        world.scale.set(nextScale);
        world.position.set(viewport.x, viewport.y);
      }, { passive: false });
    });
    return () => {
      cancelled = true;
      tickerCleanupRef.current();
      tickerCleanupRef.current = () => undefined;
      appRef.current = null;
      worldRef.current = null;
      if (initialized) app.destroy(true, { children: true });
    };
  }, [setSelection]);

  useEffect(() => {
    const app = appRef.current;
    const world = worldRef.current;
    if (!app || !world) return;
    tickerCleanupRef.current();
    tickerCleanupRef.current = () => undefined;
    world.removeChildren().forEach((child) => child.destroy({ children: true }));

    const effectiveNodes = layout.nodes.map((node) => {
      const table = document.tables.find((item) => item.id === node.id);
      return table && (table.position.x !== 0 || table.position.y !== 0) ? { ...node, ...table.position } : node;
    });
    const nodeById = new Map<string, LayoutNode>(effectiveNodes.map((node) => [node.id, node]));
    const index = new RBush<SpatialItem>();
    index.load(effectiveNodes.map((node) => ({ minX: node.x, minY: node.y, maxX: node.x + node.width, maxY: node.y + node.height, id: node.id })));
    const viewport = viewportRef.current;
    const visible = new Set(index.search({
      minX: -viewport.x / viewport.scale - 200,
      minY: -viewport.y / viewport.scale - 200,
      maxX: (app.screen.width - viewport.x) / viewport.scale + 200,
      maxY: (app.screen.height - viewport.y) / viewport.scale + 200,
    }).map((item) => item.id));

    document.areas.forEach((area) => {
      const areaContainer = new Container();
      areaContainer.position.set(area.x, area.y);
      areaContainer.eventMode = area.locked ? "none" : "static";
      areaContainer.cursor = area.locked ? "default" : "move";
      const fill = colorNumber(area.color);
      const shape = new Graphics().roundRect(0, 0, area.width, area.height, 12).fill({ color: fill, alpha: 0.14 }).stroke({ color: fill, alpha: 1, width: 3 });
      areaContainer.addChild(shape);
      const areaHeader = new Graphics().roundRect(0, 0, area.width, 42, 12).fill({ color: fill, alpha: 0.22 }).rect(0, 22, area.width, 20).fill({ color: fill, alpha: 0.22 });
      areaContainer.addChild(areaHeader);
      const label = new Text({ text: area.name, style: new TextStyle({ fontFamily: "Inter, system-ui, sans-serif", fontSize: 14, fontWeight: "600", fill }) });
      label.position.set(16, 12);
      areaContainer.addChild(label);
      const resizeHandle = new Graphics().roundRect(0, 0, 12, 12, 3).fill({ color: fill, alpha: 0.9 });
      resizeHandle.position.set(area.width - 18, area.height - 18);
      resizeHandle.eventMode = area.locked ? "none" : "static";
      resizeHandle.cursor = "nwse-resize";
      areaContainer.addChild(resizeHandle);
      let resizing = false;
      let resizeStart = { x: 0, y: 0, width: area.width, height: area.height };
      let currentSize = { width: area.width, height: area.height };
      resizeHandle.on("pointerdown", (event: FederatedPointerEvent) => {
        event.stopPropagation();
        resizing = true;
        resizeStart = { x: event.global.x, y: event.global.y, width: area.width, height: area.height };
      });
      resizeHandle.on("pointermove", (event: FederatedPointerEvent) => {
        if (!resizing) return;
        event.stopPropagation();
        const scale = viewportRef.current.scale;
        currentSize = {
          width: Math.max(220, resizeStart.width + (event.global.x - resizeStart.x) / scale),
          height: Math.max(140, resizeStart.height + (event.global.y - resizeStart.y) / scale),
        };
        shape.clear().roundRect(0, 0, currentSize.width, currentSize.height, 12).fill({ color: fill, alpha: 0.14 }).stroke({ color: fill, alpha: 1, width: 3 });
        areaHeader.clear().roundRect(0, 0, currentSize.width, 42, 12).fill({ color: fill, alpha: 0.22 }).rect(0, 22, currentSize.width, 20).fill({ color: fill, alpha: 0.22 });
        resizeHandle.position.set(currentSize.width - 18, currentSize.height - 18);
      });
      const finishResize = () => {
        if (!resizing) return;
        resizing = false;
        onReplace("Resize area", updateArea(document, area.id, currentSize));
      };
      resizeHandle.on("pointerup", finishResize);
      resizeHandle.on("pointerupoutside", finishResize);
      let dragging = false;
      let start = { x: 0, y: 0, areaX: area.x, areaY: area.y };
      areaContainer.on("pointerdown", (event: FederatedPointerEvent) => {
        event.stopPropagation();
        dragging = true;
        start = { x: event.global.x, y: event.global.y, areaX: area.x, areaY: area.y };
      });
      areaContainer.on("pointermove", (event: FederatedPointerEvent) => {
        if (!dragging) return;
        const scale = viewportRef.current.scale;
        areaContainer.position.set(start.areaX + (event.global.x - start.x) / scale, start.areaY + (event.global.y - start.y) / scale);
      });
      const finishAreaDrag = () => {
        if (!dragging) return;
        dragging = false;
        const dx = areaContainer.x - area.x;
        const dy = areaContainer.y - area.y;
        let next = updateArea(document, area.id, { x: areaContainer.x, y: areaContainer.y });
        if (area.moveContents && (dx !== 0 || dy !== 0)) {
          area.tableIds.forEach((tableId) => {
            const table = next.tables.find((item) => item.id === tableId);
            if (table) next = updateTable(next, tableId, { position: { x: table.position.x + dx, y: table.position.y + dy } });
          });
        }
        onReplace("Move area", next);
      };
      areaContainer.on("pointerup", finishAreaDrag);
      areaContainer.on("pointerupoutside", finishAreaDrag);
      world.addChild(areaContainer);
    });

    document.notes.forEach((note) => {
      const noteContainer = new Container();
      noteContainer.position.set(note.x, note.y);
      noteContainer.eventMode = "static";
      noteContainer.cursor = "move";
      const fill = colorNumber(note.color);
      noteContainer.addChild(new Graphics().roundRect(0, 0, 220, 110, 10).fill({ color: fill, alpha: 0.2 }).stroke({ color: fill, alpha: 0.9, width: 2 }));
      const text = new Text({ text: note.text, style: new TextStyle({ fontFamily: "Inter, system-ui, sans-serif", fontSize: 13, lineHeight: 19, fill: colors.text, wordWrap: true, wordWrapWidth: 188 }) });
      text.position.set(16, 15);
      noteContainer.addChild(text);
      let dragging = false;
      let start = { x: 0, y: 0, noteX: note.x, noteY: note.y };
      noteContainer.on("pointerdown", (event: FederatedPointerEvent) => {
        event.stopPropagation();
        dragging = true;
        start = { x: event.global.x, y: event.global.y, noteX: note.x, noteY: note.y };
      });
      noteContainer.on("pointermove", (event: FederatedPointerEvent) => {
        if (!dragging) return;
        const scale = viewportRef.current.scale;
        noteContainer.position.set(start.noteX + (event.global.x - start.x) / scale, start.noteY + (event.global.y - start.y) / scale);
      });
      const finishNoteDrag = () => {
        if (!dragging) return;
        dragging = false;
        onReplace("Move note", updateNote(document, note.id, { x: noteContainer.x, y: noteContainer.y }));
      };
      noteContainer.on("pointerup", finishNoteDrag);
      noteContainer.on("pointerupoutside", finishNoteDrag);
      world.addChild(noteContainer);
    });

    const activeTableId = selection?.tableId ?? null;
    const activeRelationshipIds = connectedRelationshipIds(document, activeTableId);
    const activeTable = document.tables.find((table) => table.id === activeTableId);
    const activeColor = activeTable ? colorNumber(activeTable.color) : colors.selected;
    const connectedColumnIds = new Set<string>();
    const connectedPortSides = new Map<string, Set<AnchorSide>>();
    const edgeLayer = new Container();
    const edgeRenders = new Map<string, {
      relationship: Relationship;
      graphics: Graphics;
      sourceBadge: Container;
      targetBadge: Container;
      sourceBadgePoint: Point;
      targetBadgePoint: Point;
      points: Point[];
      active: boolean;
    }>();

    const addPortSide = (columnId: string, side: AnchorSide) => {
      const sides = connectedPortSides.get(columnId) ?? new Set<AnchorSide>();
      sides.add(side);
      connectedPortSides.set(columnId, sides);
    };

    document.relationships.forEach((relationship) => {
      const source = nodeById.get(relationship.sourceTableId);
      const target = nodeById.get(relationship.targetTableId);
      if (!source || !target || (!visible.has(source.id) && !visible.has(target.id))) return;
      const geometry = buildRelationshipGeometry(document, relationship, nodeById);
      if (!geometry) return;
      const active = activeRelationshipIds.has(relationship.id);
      if (active) {
        connectedColumnIds.add(relationship.sourceColumnId);
        connectedColumnIds.add(relationship.targetColumnId);
        addPortSide(relationship.sourceColumnId, geometry.source.side);
        addPortSide(relationship.targetColumnId, geometry.target.side);
      }
      const graphics = new Graphics();
      const sourceBadge = createCardinalityBadge(geometry.sourceCardinality, active);
      const targetBadge = createCardinalityBadge(geometry.targetCardinality, active);
      edgeLayer.addChild(graphics, sourceBadge, targetBadge);
      edgeRenders.set(relationship.id, {
        relationship,
        graphics,
        sourceBadge,
        targetBadge,
        sourceBadgePoint: geometry.sourceBadge,
        targetBadgePoint: geometry.targetBadge,
        points: roundedOrthogonalPath(geometry.points),
        active,
      });
    });

    let dashPhase = 0;
    const redrawRelationship = (relationshipId: string, recalculateGeometry = false) => {
      const render = edgeRenders.get(relationshipId);
      if (!render) return;
      if (recalculateGeometry) {
        const geometry = buildRelationshipGeometry(document, render.relationship, nodeById);
        if (!geometry) return;
        render.points = roundedOrthogonalPath(geometry.points);
        render.sourceBadgePoint = geometry.sourceBadge;
        render.targetBadgePoint = geometry.targetBadge;
      }
      render.graphics.clear();
      if (render.active) drawDashedRoute(render.graphics, render.points, dashPhase, 0xaab9d0, 3);
      else drawSolidRoute(render.graphics, render.points, colors.edge, 2);
      render.sourceBadge.position.set(render.sourceBadgePoint.x, render.sourceBadgePoint.y);
      render.targetBadge.position.set(render.targetBadgePoint.x, render.targetBadgePoint.y);
    };

    edgeRenders.forEach((_render, relationshipId) => redrawRelationship(relationshipId));
    world.addChild(edgeLayer);

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (relationshipAnimationEnabled(activeRelationshipIds.size, reducedMotion)) {
      const animateRelationships = () => {
        dashPhase += app.ticker.deltaMS * 0.045;
        activeRelationshipIds.forEach((relationshipId) => redrawRelationship(relationshipId));
      };
      app.ticker.add(animateRelationships);
      tickerCleanupRef.current = () => app.ticker.remove(animateRelationships);
    }

    document.tables.forEach((table) => {
      const node = nodeById.get(table.id);
      if (!node || !visible.has(node.id)) return;
      const tableSelected = selection?.tableId === table.id;
      const card = new Container();
      card.position.set(node.x, node.y);
      card.eventMode = "static";
      card.cursor = "pointer";
      let dragging = false;
      let moved = false;
      let dragStart = { x: 0, y: 0, cardX: node.x, cardY: node.y };
      card.on("pointerdown", (event: FederatedPointerEvent) => {
        event.stopPropagation();
        dragging = true;
        moved = false;
        dragStart = { x: event.global.x, y: event.global.y, cardX: card.x, cardY: card.y };
      });
      card.on("pointermove", (event: FederatedPointerEvent) => {
        if (!dragging) return;
        const scale = viewportRef.current.scale;
        const x = dragStart.cardX + (event.global.x - dragStart.x) / scale;
        const y = dragStart.cardY + (event.global.y - dragStart.y) / scale;
        moved ||= Math.abs(x - dragStart.cardX) + Math.abs(y - dragStart.cardY) > 2;
        card.position.set(x, y);
        node.x = x;
        node.y = y;
        document.relationships
          .filter((relationship) => relationship.sourceTableId === table.id || relationship.targetTableId === table.id)
          .forEach((relationship) => redrawRelationship(relationship.id, true));
      });
      const finishTableDrag = () => {
        if (!dragging) return;
        dragging = false;
        if (!moved) {
          setSelection({ kind: "table", tableId: table.id });
          return;
        }
        let next = updateTable(document, table.id, { position: { x: card.x, y: card.y } });
        const center = { x: card.x + node.width / 2, y: card.y + node.height / 2 };
        const targetArea = [...document.areas].reverse().find((area) => !area.locked && center.x >= area.x && center.x <= area.x + area.width && center.y >= area.y && center.y <= area.y + area.height);
        next = assignTableToArea(next, table.id, targetArea?.id ?? null);
        onReplace(targetArea ? `Move table into ${targetArea.name}` : "Move table", next);
      };
      card.on("pointerup", finishTableDrag);
      card.on("pointerupoutside", finishTableDrag);

      const background = new Graphics()
        .roundRect(0, 0, node.width, node.height, 10)
        .fill(colors.card)
        .stroke({ color: tableSelected ? colorNumber(table.color) : colors.border, width: tableSelected ? 2 : 1 });
      background.roundRect(0, 0, node.width, 50, 10).fill(colors.cardTop);
      background.rect(0, 0, node.width, 5).fill(colorNumber(table.color));
      background.rect(0, 40, node.width, 10).fill(colors.cardTop);
      background.moveTo(0, 50).lineTo(node.width, 50).stroke({ color: colors.border, width: 1 });
      card.addChild(background);

      const title = new Text({ text: table.name, style: titleStyle });
      title.position.set(18, 15);
      card.addChild(title);
      const count = new Text({ text: `${table.columns.length} cols`, style: typeStyle });
      count.anchor.set(1, 0);
      count.position.set(node.width - 16, 18);
      card.addChild(count);

      table.columns.forEach((column, columnIndex) => {
        const y = 58 + columnIndex * 34;
        const connected = connectedColumnIds.has(column.id);
        const row = new Container();
        row.eventMode = "static";
        row.cursor = "pointer";
        row.hitArea = { contains: (x: number, py: number) => x >= 0 && x <= node.width && py >= 0 && py <= 32 };
        row.on("pointertap", (event) => {
          event.stopPropagation();
          setSelection({ kind: "column", tableId: table.id, columnId: column.id });
        });
        row.position.set(0, y);
        const rowBackground = new Graphics();
        if (connected) rowBackground.rect(1, -7, node.width - 2, 33).fill({ color: activeColor, alpha: tableSelected ? 0.34 : 0.22 });
        if (selection?.kind === "column" && selection.columnId === column.id) rowBackground.rect(4, -5, node.width - 8, 30).fill({ color: activeColor, alpha: 0.2 });
        rowBackground.moveTo(0, 27).lineTo(node.width, 27).stroke({ color: colors.border, alpha: 0.7, width: 1 });
        row.addChild(rowBackground);
        if (column.primaryKey) {
          const key = new Text({ text: "PK", style: badgeStyle });
          key.position.set(14, 4);
          row.addChild(key);
        } else {
          row.addChild(new Graphics().circle(22, 10, 3).fill(column.nullable ? colors.type : colors.selected));
        }
        const name = new Text({ text: column.name, style: connected ? new TextStyle({ fontFamily: "Inter, system-ui, sans-serif", fontSize: 13, fontWeight: "600", fill: 0x69a7ff }) : columnStyle });
        name.position.set(42, 0);
        row.addChild(name);
        const type = new Text({ text: column.dataType, style: connected ? new TextStyle({ fontFamily: "ui-monospace, SFMono-Regular, monospace", fontSize: 11, fill: 0x9bbfff }) : typeStyle });
        type.anchor.set(1, 0);
        type.position.set(node.width - 16, 3);
        row.addChild(type);
        const portSides = tableSelected ? new Set<AnchorSide>(["left", "right"]) : connectedPortSides.get(column.id);
        portSides?.forEach((side) => {
          const port = new Graphics().circle(0, 10, 8).fill(activeColor).stroke({ color: colors.canvas, width: 2 });
          port.position.x = side === "left" ? 0 : node.width;
          row.addChild(port);
        });
        card.addChild(row);
      });
      world.addChild(card);
    });
  }, [document, layout, selection, setSelection, rendererReady, viewportVersion, onReplace]);

  useEffect(() => {
    const app = appRef.current;
    const world = worldRef.current;
    if (!app || !world || layout.nodes.length === 0) return;
    const fittedNodes = layout.nodes.map((node) => {
      const table = document.tables.find((item) => item.id === node.id);
      return table && (table.position.x !== 0 || table.position.y !== 0) ? { ...node, ...table.position } : node;
    });
    const minX = Math.min(...fittedNodes.map((node) => node.x), ...document.areas.map((area) => area.x), ...document.notes.map((note) => note.x));
    const minY = Math.min(...fittedNodes.map((node) => node.y), ...document.areas.map((area) => area.y), ...document.notes.map((note) => note.y));
    const maxX = Math.max(...fittedNodes.map((node) => node.x + node.width), ...document.areas.map((area) => area.x + area.width), ...document.notes.map((note) => note.x + 220));
    const maxY = Math.max(...fittedNodes.map((node) => node.y + node.height), ...document.areas.map((area) => area.y + area.height), ...document.notes.map((note) => note.y + 110));
    const scale = Math.min(1.15, Math.max(0.35, Math.min((app.screen.width - 140) / (maxX - minX), (app.screen.height - 140) / (maxY - minY))));
    const viewport = viewportRef.current;
    viewport.scale = scale;
    viewport.x = (app.screen.width - (maxX - minX) * scale) / 2 - minX * scale;
    viewport.y = (app.screen.height - (maxY - minY) * scale) / 2 - minY * scale;
    world.scale.set(scale);
    world.position.set(viewport.x, viewport.y);
    setViewportVersion((version) => version + 1);
  }, [fitRequest, layout, rendererReady, document]);

  return (
    <div className="canvas-shell" ref={hostRef}>
      <div className="canvas-hint">Drag to pan · Scroll to zoom · Click a field to edit</div>
      <div className="zoom-badge">PIXIJ‍S · RBUSH · ELK</div>
      <div className="minimap" aria-label="Workspace minimap">
        {document.areas.map((area) => <i key={area.id} style={{ left: `${Math.max(0, Math.min(85, area.x / 14))}%`, top: `${Math.max(0, Math.min(75, area.y / 10))}%`, width: `${Math.max(10, area.width / 16)}px`, height: `${Math.max(8, area.height / 18)}px`, borderColor: area.color }} />)}
        {document.notes.map((note) => <em key={note.id} style={{ left: `${Math.max(2, Math.min(88, note.x / 14))}%`, top: `${Math.max(2, Math.min(80, note.y / 10))}%`, background: note.color }} />)}
        {document.tables.map((table, index) => <b key={table.id} style={{ left: `${Math.max(4, Math.min(90, (table.position.x || index * 300) / 14))}%`, top: `${Math.max(4, Math.min(82, (table.position.y || index * 120) / 10))}%`, background: table.color }} />)}
      </div>
    </div>
  );
}
