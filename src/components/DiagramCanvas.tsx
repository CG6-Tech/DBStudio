import { useEffect, useMemo, useRef, useState } from "react";
import { Application, Container, FederatedPointerEvent, Graphics, Text, TextStyle } from "pixi.js";
import RBush from "rbush";
import {
  buildRelationshipGeometry, connectedRelationshipIds, indexRelationshipsByTable, relationshipAnimationEnabled, roundedOrthogonalPath, type AnchorSide, type Point,
} from "../domain/relationshipGeometry";
import { canCreateRelationship, normalizeRelationshipType, relationshipCandidates, type RelationshipCandidate } from "../domain/relationshipCreation";
import { isRelationshipDeleteKey, nearestRelationship, relationshipSegments, type RelationshipSegmentItem } from "../domain/relationshipHitTesting";
import { moveArea, pointerDelta, resizeArea } from "../domain/areaGeometry";
import { adaptiveGrid, projectPoint, quantizeDevicePixel, snapPoint, zoomAround } from "../domain/canvasGeometry";
import { buildCanvasIndexes } from "../domain/canvasSnapshot";
import { MAX_CANVAS_ZOOM, MIN_CANVAS_ZOOM, scaleToFit } from "../domain/viewportGeometry";
import { inflateRoutingObstacles, routeIntersectsObstacles, type RoutingRequest } from "../domain/orthogonalRouter";
import type { RoutingWorkerResponse } from "../layout/relationship-routing.worker";
import type { DiagramArea, LayoutNode, LayoutResult, Relationship, SchemaDocument } from "../domain/types";
import { addRelationship, assignTableToArea, deleteRelationship, updateArea, updateNote, updateTable } from "../domain/schemaActions";
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

interface RelationshipChoice {
  candidates: RelationshipCandidate[];
  x: number;
  y: number;
}

interface CreationPort extends SpatialItem {
  container: Container;
  tableId: string;
  columnId?: string;
  kind: "table" | "field";
  point: Point;
}

type RelationshipDrag = {
  kind: "table" | "field";
  pointerId: number;
  sourceTableId: string;
  sourceColumnId?: string;
  sourcePoint: Point;
};

interface AreaRender {
  area: DiagramArea;
  color: number;
  frame: Container;
  shape: Graphics;
  label: Container;
  resizeTarget: Container;
  width: number;
  height: number;
}

interface CanvasGeometryController {
  reconcile: (document: SchemaDocument, nodes: LayoutNode[]) => void;
}

type CanvasInteraction = {
  kind: "table-move";
  pointerId: number;
  tableId: string;
  card: Container;
  node: LayoutNode;
  startPointer: Point;
  startCard: Point;
  moved: boolean;
} | {
  kind: "area-move";
  pointerId: number;
  render: AreaRender;
  startPointer: Point;
  startArea: Point;
  tableStarts: Map<string, Point>;
  moved: boolean;
} | {
  kind: "area-resize";
  pointerId: number;
  render: AreaRender;
  startPointer: Point;
  startSize: { width: number; height: number };
  moved: boolean;
};

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
const cardCornerRadius = 5;
const cardAccentHeight = 10;
const areaResizeTargetSize = 28;
const areaLabelOffset = { x: 12, y: -15 };

function colorNumber(value: string): number {
  return Number.parseInt(value.replace("#", ""), 16);
}

function editableTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return Boolean(element?.isContentEditable || element?.closest("input, textarea, select"));
}

function drawSolidRoute(graphics: Graphics, points: Point[], color: number, width: number): void {
  if (points.length < 2) return;
  graphics.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((point) => graphics.lineTo(point.x, point.y));
  graphics.stroke({ color, width });
}

function drawTopAccent(graphics: Graphics, width: number, color: number): void {
  graphics
    .beginPath()
    .moveTo(0, cardAccentHeight)
    .lineTo(0, cardCornerRadius)
    .quadraticCurveTo(0, 0, cardCornerRadius, 0)
    .lineTo(width - cardCornerRadius, 0)
    .quadraticCurveTo(width, 0, width, cardCornerRadius)
    .lineTo(width, cardAccentHeight)
    .closePath()
    .fill(color);
}

function drawAreaFrame(graphics: Graphics, width: number, height: number, color: number): void {
  graphics.clear()
    .roundRect(0, 0, width, height, 10)
    .fill({ color, alpha: 0.1 })
    .stroke({ color, alpha: 0.9, width: 2 });
}

function createAreaLabel(area: DiagramArea, color: number): Container {
  const label = new Container();
  const name = new Text({ text: area.name, style: new TextStyle({ fontFamily: "Inter, system-ui, sans-serif", fontSize: 12, fontWeight: "600", fill: colors.text }) });
  const tableCount = area.tableIds.length;
  const count = new Text({ text: `${tableCount} table${tableCount === 1 ? "" : "s"}`, style: new TextStyle({ fontFamily: "Inter, system-ui, sans-serif", fontSize: 9, fontWeight: "500", fill: colors.muted }) });
  const width = Math.max(132, 54 + name.width + count.width);
  const background = new Graphics().roundRect(0, 0, width, 30, 7).fill({ color: 0x111b26, alpha: 0.98 }).stroke({ color, alpha: 0.85, width: 1 });
  const grip = new Graphics();
  [0, 1].forEach((column) => [0, 1, 2].forEach((row) => grip.circle(column * 5, row * 5, 1.4).fill({ color, alpha: 0.9 })));
  grip.position.set(12, 9);
  name.position.set(31, 7);
  count.position.set(width - count.width - 11, 9);
  label.addChild(background, grip, name, count);
  return label;
}

function createAreaResizeTarget(color: number): Container {
  const target = new Container();
  target.hitArea = { contains: (x: number, y: number) => x >= 0 && x <= areaResizeTargetSize && y >= 0 && y <= areaResizeTargetSize };
  const indicator = new Graphics()
    .moveTo(8, 21)
    .lineTo(21, 21)
    .lineTo(21, 8)
    .stroke({ color, alpha: 0.95, width: 3 });
  target.addChild(indicator);
  return target;
}

function positionAreaRender(render: AreaRender, x: number, y: number): void {
  render.frame.position.set(x, y);
  render.label.position.set(x + areaLabelOffset.x, y + areaLabelOffset.y);
  render.resizeTarget.position.set(x + render.width - areaResizeTargetSize, y + render.height - areaResizeTargetSize);
}

function sizeAreaRender(render: AreaRender, width: number, height: number): void {
  render.width = width;
  render.height = height;
  drawAreaFrame(render.shape, width, height, render.color);
  positionAreaRender(render, render.frame.x, render.frame.y);
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
  styleCardinalityBadge(badge, label, active);
  return badge;
}

function styleCardinalityBadge(badge: Container, label: "1" | "N", active: boolean): void {
  badge.removeChildren().forEach((child) => child.destroy());
  const fill = active ? 0xaab9d0 : 0x80908a;
  badge.addChild(new Graphics().circle(0, 0, active ? 14 : 12).fill(fill).stroke({ color: colors.canvas, width: 2 }));
  const text = new Text({ text: label, style: new TextStyle({ fontFamily: "Inter, system-ui, sans-serif", fontSize: active ? 13 : 11, fontWeight: "700", fill: 0x14202a }) });
  text.anchor.set(0.5);
  badge.addChild(text);
}

function drawCardBackground(graphics: Graphics, width: number, height: number, accent: number, selected: boolean): void {
  graphics.clear().roundRect(0, 0, width, height, cardCornerRadius).fill(colors.card);
  graphics.roundRect(0, 0, width, 50, cardCornerRadius).fill(colors.cardTop);
  drawTopAccent(graphics, width, accent);
  graphics.rect(0, 40, width, 10).fill(colors.cardTop);
  graphics.moveTo(0, 50).lineTo(width, 50).stroke({ color: colors.border, width: 1 });
  graphics.roundRect(0, 0, width, height, cardCornerRadius).stroke({ color: selected ? accent : colors.border, width: selected ? 2 : 1 });
}

export function DiagramCanvas({ document, layout, onReplace }: DiagramCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const worldRef = useRef<Container | null>(null);
  const tickerCleanupRef = useRef<() => void>(() => undefined);
  const [rendererReady, setRendererReady] = useState(false);
  const [viewportVersion, setViewportVersion] = useState(0);
  const [relationshipChoice, setRelationshipChoice] = useState<RelationshipChoice | null>(null);
  const [relationshipChoiceIndex, setRelationshipChoiceIndex] = useState(0);
  const viewportRef = useRef({ x: 80, y: 80, scale: 1 });
  const syncViewportRef = useRef<() => void>(() => undefined);
  const focusSelectionRef = useRef<() => void>(() => undefined);
  const centerWorldRef = useRef<(point: Point) => void>(() => undefined);
  const refreshViewportCullingRef = useRef<() => void>(() => undefined);
  const minimapViewportRef = useRef<HTMLElement>(null);
  const relationshipHitTestRef = useRef<(point: Point) => boolean>(() => false);
  const refreshRelationshipSelectionRef = useRef<(previousId: string | null, nextId: string | null) => void>(() => undefined);
  const refreshColumnSelectionRef = useRef<(previousId: string | null, nextId: string | null) => void>(() => undefined);
  const refreshActiveTableSelectionRef = useRef<(previousId: string | null, nextId: string | null) => void>(() => undefined);
  const geometryControllerRef = useRef<CanvasGeometryController | null>(null);
  const documentRef = useRef(document);
  const onReplaceRef = useRef(onReplace);
  const selectedRelationshipIdRef = useRef<string | null>(null);
  const workspaceBoundsRef = useRef({ minX: 0, minY: 0, maxX: 1, maxY: 1 });
  const gridLevelRef = useRef(1);
  const routingGenerationRef = useRef(0);
  const routingCacheRef = useRef(new Map<string, Point[]>());
  const previousRoutingNodesRef = useRef(new Map<string, LayoutNode>());
  const selection = useUiStore((state) => state.selection);
  const setSelection = useUiStore((state) => state.setSelection);
  const setZoom = useUiStore((state) => state.setZoom);
  const fitRequest = useUiStore((state) => state.fitRequest);
  const zoomInRequest = useUiStore((state) => state.zoomInRequest);
  const zoomOutRequest = useUiStore((state) => state.zoomOutRequest);
  const focusRequest = useUiStore((state) => state.focusRequest);
  const snapToGrid = useUiStore((state) => state.snapToGrid);
  const snapToGridRef = useRef(snapToGrid);
  const minimapVisible = useUiStore((state) => state.minimapVisible);
  const lastZoomInRequest = useRef(zoomInRequest);
  const lastZoomOutRequest = useRef(zoomOutRequest);
  const lastFocusRequest = useRef(focusRequest);
  snapToGridRef.current = snapToGrid;
  const activeSelectionTableId = selection?.kind === "table" || selection?.kind === "column" ? selection.tableId : null;
  const selectedColumnId = selection?.kind === "column" ? selection.columnId : null;
  const selectedRelationshipId = selection?.kind === "relationship" ? selection.relationshipId : null;
  selectedRelationshipIdRef.current = selectedRelationshipId;
  documentRef.current = document;
  onReplaceRef.current = onReplace;

  const canvasIndexes = useMemo(() => buildCanvasIndexes(document), [document.tables, document.relationships]);
  const effectiveNodes = useMemo(() => layout.nodes.map((node) => {
    const table = canvasIndexes.tableById.get(node.id);
    return table && (table.position.x !== 0 || table.position.y !== 0) ? { ...node, ...table.position } : node;
  }), [canvasIndexes.tableById, layout.nodes]);
  const sceneStructureKey = useMemo(() => JSON.stringify([
    document.tables.map((table) => [table.id, table.name, table.color, table.columns.map((column) => [column.id, column.name, column.dataType, column.nullable, column.primaryKey])]),
    document.relationships.map((relationship) => [relationship.id, relationship.sourceTableId, relationship.sourceColumnId, relationship.targetTableId, relationship.targetColumnId]),
    document.areas.map((area) => [area.id, area.name, area.color, area.locked, area.moveContents, area.tableIds]),
    document.notes.map((note) => [note.id, note.text, note.color]),
  ]), [document.tables, document.relationships, document.areas, document.notes]);
  const workspaceBounds = useMemo(() => {
    const left = [...effectiveNodes.map((node) => node.x), ...document.areas.map((area) => area.x), ...document.notes.map((note) => note.x)];
    const top = [...effectiveNodes.map((node) => node.y), ...document.areas.map((area) => area.y), ...document.notes.map((note) => note.y)];
    const right = [...effectiveNodes.map((node) => node.x + node.width), ...document.areas.map((area) => area.x + area.width), ...document.notes.map((note) => note.x + 220)];
    const bottom = [...effectiveNodes.map((node) => node.y + node.height), ...document.areas.map((area) => area.y + area.height), ...document.notes.map((note) => note.y + 110)];
    return { minX: Math.min(0, ...left), minY: Math.min(0, ...top), maxX: Math.max(1, ...right), maxY: Math.max(1, ...bottom) };
  }, [document.areas, document.notes, effectiveNodes]);
  workspaceBoundsRef.current = workspaceBounds;

  useEffect(() => {
    if (!hostRef.current) return;
    let cancelled = false;
    let initialized = false;
    let viewportRefreshTimer: number | undefined;
    const app = new Application();
    void app.init({ backgroundAlpha: 0, antialias: true, resizeTo: hostRef.current, resolution: window.devicePixelRatio || 1, autoDensity: true }).then(() => {
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
      const syncViewport = () => {
        const viewport = viewportRef.current;
        world.scale.set(viewport.scale);
        world.position.set(viewport.x, viewport.y);
        const devicePixelRatio = window.devicePixelRatio || 1;
        const grid = adaptiveGrid(viewport.scale, gridLevelRef.current, devicePixelRatio);
        gridLevelRef.current = grid.level;
        const host = hostRef.current;
        if (host) {
          const gridX = quantizeDevicePixel(((viewport.x % grid.spacing) + grid.spacing) % grid.spacing, devicePixelRatio);
          const gridY = quantizeDevicePixel(((viewport.y % grid.spacing) + grid.spacing) % grid.spacing, devicePixelRatio);
          host.style.setProperty("--grid-spacing", `${grid.spacing}px`);
          host.style.setProperty("--grid-radius", `${grid.radius}px`);
          host.style.setProperty("--grid-x", `${gridX}px`);
          host.style.setProperty("--grid-y", `${gridY}px`);
        }
        const minimapViewport = minimapViewportRef.current;
        if (minimapViewport) {
          const bounds = workspaceBoundsRef.current;
          const topLeft = projectPoint({ x: -viewport.x / viewport.scale, y: -viewport.y / viewport.scale }, bounds);
          const bottomRight = projectPoint({ x: (app.screen.width - viewport.x) / viewport.scale, y: (app.screen.height - viewport.y) / viewport.scale }, bounds);
          minimapViewport.style.left = `${Math.max(0, topLeft.x) * 100}%`;
          minimapViewport.style.top = `${Math.max(0, topLeft.y) * 100}%`;
          minimapViewport.style.width = `${Math.max(3, (Math.min(1, bottomRight.x) - Math.max(0, topLeft.x)) * 100)}%`;
          minimapViewport.style.height = `${Math.max(3, (Math.min(1, bottomRight.y) - Math.max(0, topLeft.y)) * 100)}%`;
        }
        setZoom(viewport.scale);
      };
      syncViewportRef.current = syncViewport;
      centerWorldRef.current = (point) => {
        const viewport = viewportRef.current;
        viewport.x = app.screen.width / 2 - point.x * viewport.scale;
        viewport.y = app.screen.height / 2 - point.y * viewport.scale;
        syncViewport();
        refreshViewportCullingRef.current();
      };
      syncViewport();
      setRendererReady(true);

      let panning = false;
      let last = { x: 0, y: 0 };
      const refreshVisibleObjects = () => {
        window.clearTimeout(viewportRefreshTimer);
        viewportRefreshTimer = window.setTimeout(() => refreshViewportCullingRef.current(), 80);
      };
      app.stage.on("pointerdown", (event: FederatedPointerEvent) => {
        if (event.target !== app.stage) return;
        if (relationshipHitTestRef.current({ x: event.global.x, y: event.global.y })) return;
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
        syncViewport();
      });
      const stopPan = () => {
        if (panning) refreshVisibleObjects();
        panning = false;
      };
      app.stage.on("pointerup", stopPan);
      app.stage.on("pointerupoutside", stopPan);
      app.canvas.addEventListener("wheel", (event) => {
        event.preventDefault();
        const viewport = viewportRef.current;
        const bounds = app.canvas.getBoundingClientRect();
        const pointer = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
        const nextScale = Math.min(MAX_CANVAS_ZOOM, Math.max(MIN_CANVAS_ZOOM, viewport.scale * Math.exp(-event.deltaY * 0.0012)));
        viewportRef.current = zoomAround(viewport, pointer, nextScale);
        syncViewport();
        refreshVisibleObjects();
      }, { passive: false });
    });
    return () => {
      cancelled = true;
      window.clearTimeout(viewportRefreshTimer);
      tickerCleanupRef.current();
      tickerCleanupRef.current = () => undefined;
      appRef.current = null;
      worldRef.current = null;
      syncViewportRef.current = () => undefined;
      centerWorldRef.current = () => undefined;
      refreshViewportCullingRef.current = () => undefined;
      if (initialized) app.destroy(true, { children: true });
    };
  }, [setSelection, setZoom]);

  useEffect(() => {
    const app = appRef.current;
    const world = worldRef.current;
    if (!app || !world) return;
    tickerCleanupRef.current();
    tickerCleanupRef.current = () => undefined;
    world.removeChildren().forEach((child) => child.destroy({ children: true }));

    const nodeById = new Map<string, LayoutNode>(effectiveNodes.map((node) => [node.id, node]));
    const previousRoutingNodes = previousRoutingNodesRef.current;
    const changedTableIds = new Set<string>();
    const changedNodes: LayoutNode[] = [];
    effectiveNodes.forEach((node) => {
      const previous = previousRoutingNodes.get(node.id);
      if (!previous || previous.x !== node.x || previous.y !== node.y || previous.width !== node.width || previous.height !== node.height) {
        changedTableIds.add(node.id);
        changedNodes.push(node);
        if (previous) changedNodes.push(previous);
      }
    });
    previousRoutingNodes.forEach((node, id) => { if (!nodeById.has(id)) { changedTableIds.add(id); changedNodes.push(node); } });
    if (changedNodes.length > 0) {
      const changedObstacles = inflateRoutingObstacles(changedNodes);
      document.relationships.forEach((relationship) => {
        const cached = routingCacheRef.current.get(relationship.id);
        if (!cached) return;
        if (changedTableIds.has(relationship.sourceTableId) || changedTableIds.has(relationship.targetTableId) || routeIntersectsObstacles(cached, changedObstacles)) routingCacheRef.current.delete(relationship.id);
      });
    }
    const relationshipIdSet = new Set(document.relationships.map((relationship) => relationship.id));
    routingCacheRef.current.forEach((_points, id) => { if (!relationshipIdSet.has(id)) routingCacheRef.current.delete(id); });
    previousRoutingNodesRef.current = new Map(effectiveNodes.map((node) => [node.id, { ...node }]));
    focusSelectionRef.current = () => {
      const currentSelection = useUiStore.getState().selection;
      const selectedTableId = currentSelection?.kind === "table" || currentSelection?.kind === "column" ? currentSelection.tableId : null;
      const selectedNode = selectedTableId ? nodeById.get(selectedTableId) : undefined;
      if (!selectedNode) return;
      const viewport = viewportRef.current;
      const readableScale = Math.max(viewport.scale, Math.min(1.15, 620 / Math.max(selectedNode.width, selectedNode.height)));
      viewport.scale = readableScale;
      viewport.x = app.screen.width / 2 - (selectedNode.x + selectedNode.width / 2) * readableScale;
      viewport.y = app.screen.height / 2 - (selectedNode.y + selectedNode.height / 2) * readableScale;
      syncViewportRef.current();
      refreshViewportCullingRef.current();
    };
    const relationshipIdsByTable = indexRelationshipsByTable(document.relationships);
    const tableCardsById = new Map<string, Container>();
    const tableBackgroundsById = new Map<string, { graphics: Graphics; node: LayoutNode; accent: number }>();
    const columnVisualsById = new Map<string, { tableId: string; activeBackground: Graphics; name: Text; type: Text; leftPort: Graphics; rightPort: Graphics }>();
    const noteContainersById = new Map<string, Container>();
    const columnSelectionGraphics = new Map<string, Graphics>();
    const areaRenders = new Map<string, AreaRender>();
    let activeInteraction: CanvasInteraction | null = null;
    let pendingTableMove: { pointerId: number; point: Point } | null = null;
    let tableMoveFrame: number | null = null;
    const index = new RBush<SpatialItem>();
    const spatialItems = effectiveNodes.map((node) => ({ minX: node.x, minY: node.y, maxX: node.x + node.width, maxY: node.y + node.height, id: node.id }));
    const spatialItemsById = new Map(spatialItems.map((item) => [item.id, item]));
    index.load(spatialItems);
    const updateSpatialItem = (tableId: string, node: LayoutNode) => {
      const item = spatialItemsById.get(tableId);
      if (!item) return;
      index.remove(item);
      item.minX = node.x;
      item.minY = node.y;
      item.maxX = node.x + node.width;
      item.maxY = node.y + node.height;
      index.insert(item);
    };
    const viewport = viewportRef.current;
    const cullingMargin = 600 / viewport.scale;
    const retainedViewportBounds = {
      minX: -viewport.x / viewport.scale - cullingMargin,
      minY: -viewport.y / viewport.scale - cullingMargin,
      maxX: (app.screen.width - viewport.x) / viewport.scale + cullingMargin,
      maxY: (app.screen.height - viewport.y) / viewport.scale + cullingMargin,
    };
    const visible = new Set(index.search(retainedViewportBounds).map((item) => item.id));
    refreshViewportCullingRef.current = () => {
      const nextViewport = viewportRef.current;
      const nextVisibleBounds = {
        minX: -nextViewport.x / nextViewport.scale - 200,
        minY: -nextViewport.y / nextViewport.scale - 200,
        maxX: (app.screen.width - nextViewport.x) / nextViewport.scale + 200,
        maxY: (app.screen.height - nextViewport.y) / nextViewport.scale + 200,
      };
      if (nextVisibleBounds.minX < retainedViewportBounds.minX || nextVisibleBounds.minY < retainedViewportBounds.minY || nextVisibleBounds.maxX > retainedViewportBounds.maxX || nextVisibleBounds.maxY > retainedViewportBounds.maxY) setViewportVersion((version) => version + 1);
    };

    document.areas.forEach((area) => {
      const color = colorNumber(area.color);
      const frame = new Container();
      const shape = new Graphics();
      frame.addChild(shape);
      const label = createAreaLabel(area, color);
      label.eventMode = area.locked ? "none" : "static";
      label.cursor = area.locked ? "default" : "move";
      const resizeTarget = createAreaResizeTarget(color);
      resizeTarget.eventMode = area.locked ? "none" : "static";
      resizeTarget.cursor = area.locked ? "default" : "nwse-resize";
      const render: AreaRender = { area, color, frame, shape, label, resizeTarget, width: area.width, height: area.height };
      drawAreaFrame(shape, area.width, area.height, color);
      positionAreaRender(render, area.x, area.y);

      label.on("pointerdown", (event: FederatedPointerEvent) => {
        event.stopPropagation();
        const tableStarts = new Map<string, Point>();
        if (area.moveContents) {
          area.tableIds.forEach((tableId) => {
            const node = nodeById.get(tableId);
            if (node) tableStarts.set(tableId, { x: node.x, y: node.y });
          });
        }
        activeInteraction = {
          kind: "area-move",
          pointerId: event.pointerId,
          render,
          startPointer: { x: event.global.x, y: event.global.y },
          startArea: { x: frame.x, y: frame.y },
          tableStarts,
          moved: false,
        };
      });

      resizeTarget.on("pointerdown", (event: FederatedPointerEvent) => {
        event.stopPropagation();
        activeInteraction = {
          kind: "area-resize",
          pointerId: event.pointerId,
          render,
          startPointer: { x: event.global.x, y: event.global.y },
          startSize: { width: render.width, height: render.height },
          moved: false,
        };
      });

      areaRenders.set(area.id, render);
      world.addChild(frame);
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
        start = { x: event.global.x, y: event.global.y, noteX: noteContainer.x, noteY: noteContainer.y };
      });
      noteContainer.on("pointermove", (event: FederatedPointerEvent) => {
        if (!dragging) return;
        const scale = viewportRef.current.scale;
        const position = { x: start.noteX + (event.global.x - start.x) / scale, y: start.noteY + (event.global.y - start.y) / scale };
        const next = snapToGridRef.current ? snapPoint(position) : position;
        noteContainer.position.set(next.x, next.y);
      });
      const finishNoteDrag = () => {
        if (!dragging) return;
        dragging = false;
        const currentDocument = documentRef.current;
        onReplaceRef.current("Move note", updateNote(currentDocument, note.id, { x: noteContainer.x, y: noteContainer.y }));
      };
      noteContainer.on("pointerup", finishNoteDrag);
      noteContainer.on("pointerupoutside", finishNoteDrag);
      noteContainersById.set(note.id, noteContainer);
      world.addChild(noteContainer);
    });

    const activeTableId = activeSelectionTableId;
    const activeRelationshipIds = connectedRelationshipIds(document, activeTableId);
    const activeTable = activeTableId ? canvasIndexes.tableById.get(activeTableId) : undefined;
    let activeColor = activeTable ? colorNumber(activeTable.color) : colors.selected;
    const connectedColumnIds = new Set<string>();
    const connectedPortSides = new Map<string, Set<AnchorSide>>();
    const edgeLayer = new Container();
    const relationshipSegmentIndex = new RBush<RelationshipSegmentItem>();
    const relationshipSegmentsById = new Map<string, RelationshipSegmentItem[]>();
    const reindexRelationship = (relationshipId: string, points: Point[]) => {
      relationshipSegmentsById.get(relationshipId)?.forEach((segment) => relationshipSegmentIndex.remove(segment));
      const segments = relationshipSegments(relationshipId, points);
      relationshipSegmentsById.set(relationshipId, segments);
      relationshipSegmentIndex.load(segments);
    };
    const routingRequests: RoutingRequest[] = [];
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

    const visibleRelationships = new Map<string, Relationship>();
    visible.forEach((tableId) => canvasIndexes.relationshipsByTable.get(tableId)?.forEach((relationship) => visibleRelationships.set(relationship.id, relationship)));
    visibleRelationships.forEach((relationship) => {
      const source = nodeById.get(relationship.sourceTableId);
      const target = nodeById.get(relationship.targetTableId);
      if (!source || !target) return;
      const geometry = buildRelationshipGeometry(document, relationship, nodeById, canvasIndexes.tableById, canvasIndexes.columnById);
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
      const cachedRoute = routingCacheRef.current.get(relationship.id);
      const renderedPoints = roundedOrthogonalPath(cachedRoute ?? geometry.points);
      edgeRenders.set(relationship.id, {
        relationship,
        graphics,
        sourceBadge,
        targetBadge,
        sourceBadgePoint: geometry.sourceBadge,
        targetBadgePoint: geometry.targetBadge,
        points: renderedPoints,
        active,
      });
      reindexRelationship(relationship.id, renderedPoints);
      if (!cachedRoute) routingRequests.push({ id: relationship.id, start: geometry.source.point, end: geometry.target.point, startSide: geometry.source.side, endSide: geometry.target.side, sourceId: relationship.sourceTableId, targetId: relationship.targetTableId });
    });

    let dashPhase = 0;
    const dirtyRelationshipIds = new Set<string>();
    const redrawRelationship = (relationshipId: string, recalculateGeometry = false) => {
      const render = edgeRenders.get(relationshipId);
      if (!render) return;
      if (recalculateGeometry) {
        const geometry = buildRelationshipGeometry(document, render.relationship, nodeById, canvasIndexes.tableById, canvasIndexes.columnById);
        if (!geometry) return;
        render.points = roundedOrthogonalPath(geometry.points);
        render.sourceBadgePoint = geometry.sourceBadge;
        render.targetBadgePoint = geometry.targetBadge;
      }
      render.graphics.clear();
      if (selectedRelationshipIdRef.current === relationshipId) drawSolidRoute(render.graphics, render.points, colors.selected, 4);
      else if (render.active) drawDashedRoute(render.graphics, render.points, dashPhase, 0xaab9d0, 3);
      else drawSolidRoute(render.graphics, render.points, colors.edge, 2);
      if (recalculateGeometry) reindexRelationship(relationshipId, render.points);
      render.sourceBadge.position.set(render.sourceBadgePoint.x, render.sourceBadgePoint.y);
      render.targetBadge.position.set(render.targetBadgePoint.x, render.targetBadgePoint.y);
    };

    edgeRenders.forEach((_render, relationshipId) => redrawRelationship(relationshipId));
    refreshRelationshipSelectionRef.current = (previousId, nextId) => {
      if (previousId) redrawRelationship(previousId);
      if (nextId && nextId !== previousId) redrawRelationship(nextId);
    };
    world.addChild(edgeLayer);
    const relationshipPreview = new Graphics();
    edgeLayer.addChild(relationshipPreview);
    relationshipHitTestRef.current = (globalPoint) => {
      const viewport = viewportRef.current;
      const worldPoint = { x: (globalPoint.x - viewport.x) / viewport.scale, y: (globalPoint.y - viewport.y) / viewport.scale };
      const relationshipId = nearestRelationship(relationshipSegmentIndex, worldPoint, 10 / viewport.scale);
      if (!relationshipId) return false;
      setSelection({ kind: "relationship", relationshipId });
      return true;
    };
    let routingWorker: Worker | null = null;
    const startRoutingWorker = (requests: RoutingRequest[]) => {
      routingGenerationRef.current += 1;
      routingWorker?.terminate();
      routingWorker = null;
      if (requests.length === 0) return;
      const routingGeneration = routingGenerationRef.current;
      try {
        routingWorker = new Worker(new URL("../layout/relationship-routing.worker.ts", import.meta.url), { type: "module" });
        routingWorker.onmessage = (event: MessageEvent<RoutingWorkerResponse>) => {
          if (event.data.generation !== routingGenerationRef.current) return;
          event.data.routes.forEach((route) => {
            const render = edgeRenders.get(route.id);
            if (!render) return;
            routingCacheRef.current.set(route.id, route.points);
            render.points = roundedOrthogonalPath(route.points);
            reindexRelationship(route.id, render.points);
            redrawRelationship(route.id);
          });
        };
        routingWorker.postMessage({ generation: routingGeneration, obstacles: inflateRoutingObstacles([...nodeById.values()]), relationships: requests });
      } catch {
        routingWorker = null;
      }
    };
    startRoutingWorker(routingRequests);

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const updateRelationships = () => {
      const recalculatedIds = new Set(dirtyRelationshipIds);
      dirtyRelationshipIds.clear();
      recalculatedIds.forEach((relationshipId) => redrawRelationship(relationshipId, true));
      if (relationshipAnimationEnabled(activeRelationshipIds.size, reducedMotion)) {
        dashPhase += app.ticker.deltaMS * 0.045;
        activeRelationshipIds.forEach((relationshipId) => {
          if (!recalculatedIds.has(relationshipId)) redrawRelationship(relationshipId);
        });
      }
    };
    app.ticker.add(updateRelationships);
    tickerCleanupRef.current = () => app.ticker.remove(updateRelationships);

    const creationPorts: CreationPort[] = [];
    const creationPortIndex = new RBush<CreationPort>();
    const portsByTable = new Map<string, CreationPort[]>();
    const fieldPortsByType = new Map<string, CreationPort[]>();
    const visibleCreationPorts = new Set<CreationPort>();
    let activeTargetPort: CreationPort | null = null;
    let relationshipDrag: RelationshipDrag | null = null;
    const setCreationPortVisible = (port: CreationPort, visible: boolean) => {
      port.container.visible = visible;
      if (visible) visibleCreationPorts.add(port);
      else visibleCreationPorts.delete(port);
    };
    const setTablePortVisibility = (tableId: string, visible: boolean) => {
      portsByTable.get(tableId)?.forEach((port) => setCreationPortVisible(port, visible));
    };
    const resetCreationPorts = () => [...visibleCreationPorts].forEach((port) => {
      setCreationPortVisible(port, false);
      port.container.alpha = 1;
      port.container.scale.set(1);
    });
    const worldPointFromEvent = (event: FederatedPointerEvent): Point => ({
      x: (event.global.x - viewportRef.current.x) / viewportRef.current.scale,
      y: (event.global.y - viewportRef.current.y) / viewportRef.current.scale,
    });
    const tableAtPoint = (point: Point) => {
      const candidates = index.search({ minX: point.x, minY: point.y, maxX: point.x, maxY: point.y });
      for (let candidateIndex = candidates.length - 1; candidateIndex >= 0; candidateIndex -= 1) {
        const table = canvasIndexes.tableById.get(candidates[candidateIndex].id);
        if (table) return table;
      }
      return undefined;
    };
    const fieldPortAtPoint = (point: Point) => {
      const radius = 18 / viewportRef.current.scale;
      let nearest: CreationPort | undefined;
      let nearestDistance = Number.POSITIVE_INFINITY;
      creationPortIndex.search({ minX: point.x - radius, minY: point.y - radius, maxX: point.x + radius, maxY: point.y + radius }).forEach((port) => {
        if (port.kind !== "field" || !port.container.visible) return;
        const distance = Math.hypot(point.x - port.point.x, point.y - port.point.y);
        if (distance <= radius && distance < nearestDistance) { nearest = port; nearestDistance = distance; }
      });
      return nearest;
    };
    const drawRelationshipPreview = (end: Point) => {
      if (!relationshipDrag) return;
      const start = relationshipDrag.sourcePoint;
      const direction = end.x >= start.x ? 1 : -1;
      const startOut = { x: start.x + direction * 42, y: start.y };
      const middleX = (startOut.x + end.x) / 2;
      relationshipPreview.clear();
      drawDashedRoute(relationshipPreview, roundedOrthogonalPath([start, startOut, { x: middleX, y: start.y }, { x: middleX, y: end.y }, end]), 0, colors.selected, 2.5);
    };
    const beginRelationshipDrag = (event: FederatedPointerEvent, port: CreationPort) => {
      event.stopPropagation();
      setRelationshipChoice(null);
      relationshipDrag = { kind: port.kind, pointerId: event.pointerId, sourceTableId: port.tableId, sourceColumnId: port.columnId, sourcePoint: port.point };
      resetCreationPorts();
      setCreationPortVisible(port, true);
      if (port.kind === "field" && port.columnId) {
        const sourceColumn = canvasIndexes.columnById.get(port.columnId);
        const compatiblePorts = sourceColumn ? fieldPortsByType.get(normalizeRelationshipType(sourceColumn.dataType)) ?? [] : [];
        compatiblePorts.forEach((candidate) => {
          setCreationPortVisible(candidate, true);
          candidate.container.alpha = canCreateRelationship(documentRef.current, port.tableId, port.columnId!, candidate.tableId, candidate.columnId!) ? 1 : 0.16;
        });
      } else {
        creationPorts.filter((candidate) => candidate.kind === "table").forEach((candidate) => {
          setCreationPortVisible(candidate, true);
          candidate.container.alpha = candidate.tableId === port.tableId ? 0.16 : 1;
        });
      }
      drawRelationshipPreview(port.point);
    };
    const createPort = (card: Container, tableId: string, columnId: string | undefined, kind: "table" | "field", x: number, y: number): CreationPort => {
      const container = new Container();
      container.position.set(x, y);
      container.visible = false;
      container.eventMode = "static";
      container.cursor = "crosshair";
      container.hitArea = { contains: (px: number, py: number) => Math.hypot(px, py) <= 13 };
      container.addChild(new Graphics().circle(0, 0, kind === "table" ? 8 : 7).fill(colors.selected).stroke({ color: colors.canvas, width: 2 }));
      const node = nodeById.get(tableId)!;
      const point = { x: node.x + x, y: node.y + y };
      const port: CreationPort = { container, tableId, columnId, kind, point, id: `${kind}:${tableId}:${columnId ?? "table"}:${x}`, minX: point.x, minY: point.y, maxX: point.x, maxY: point.y };
      container.on("pointerdown", (event: FederatedPointerEvent) => beginRelationshipDrag(event, port));
      creationPorts.push(port);
      creationPortIndex.insert(port);
      portsByTable.set(tableId, [...(portsByTable.get(tableId) ?? []), port]);
      if (kind === "field" && columnId) {
        const column = canvasIndexes.columnById.get(columnId);
        if (column) {
          const key = normalizeRelationshipType(column.dataType);
          fieldPortsByType.set(key, [...(fieldPortsByType.get(key) ?? []), port]);
        }
      }
      card.addChild(container);
      return port;
    };

    visible.forEach((tableId) => {
      const table = canvasIndexes.tableById.get(tableId);
      if (!table) return;
      const node = nodeById.get(table.id);
      if (!node || !visible.has(node.id)) return;
      const tableSelected = activeSelectionTableId === table.id;
      const card = new Container();
      card.position.set(node.x, node.y);
      card.eventMode = "static";
      card.cursor = "pointer";
      card.on("pointerenter", () => { if (!relationshipDrag) setTablePortVisibility(table.id, true); });
      card.on("pointerleave", () => { if (!relationshipDrag) setTablePortVisibility(table.id, false); });
      card.on("pointerdown", (event: FederatedPointerEvent) => {
        event.stopPropagation();
        routingGenerationRef.current += 1;
        routingWorker?.terminate();
        routingWorker = null;
        activeInteraction = {
          kind: "table-move",
          pointerId: event.pointerId,
          tableId: table.id,
          card,
          node,
          startPointer: { x: event.global.x, y: event.global.y },
          startCard: { x: card.x, y: card.y },
          moved: false,
        };
      });

      const accent = colorNumber(table.color);
      const background = new Graphics();
      drawCardBackground(background, node.width, node.height, accent, tableSelected);
      tableBackgroundsById.set(table.id, { graphics: background, node, accent });
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
        rowBackground.moveTo(0, 27).lineTo(node.width, 27).stroke({ color: colors.border, alpha: 0.7, width: 1 });
        row.addChild(rowBackground);
        const activeBackground = new Graphics();
        if (connected) activeBackground.rect(1, -7, node.width - 2, 33).fill({ color: activeColor, alpha: tableSelected ? 0.34 : 0.22 });
        row.addChildAt(activeBackground, 0);
        const selectionBackground = new Graphics().rect(4, -5, node.width - 8, 30).fill({ color: activeColor, alpha: 0.2 });
        selectionBackground.visible = selectedColumnId === column.id;
        columnSelectionGraphics.set(column.id, selectionBackground);
        row.addChild(selectionBackground);
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
        const leftPort = new Graphics().circle(0, 10, 8).fill(activeColor).stroke({ color: colors.canvas, width: 2 });
        const rightPort = new Graphics().circle(0, 10, 8).fill(activeColor).stroke({ color: colors.canvas, width: 2 });
        rightPort.position.x = node.width;
        leftPort.visible = Boolean(portSides?.has("left"));
        rightPort.visible = Boolean(portSides?.has("right"));
        row.addChild(leftPort, rightPort);
        columnVisualsById.set(column.id, { tableId: table.id, activeBackground, name, type, leftPort, rightPort });
        card.addChild(row);
      });
      createPort(card, table.id, undefined, "table", 0, 25);
      createPort(card, table.id, undefined, "table", node.width, 25);
      table.columns.forEach((column, columnIndex) => {
        const y = 68 + columnIndex * 34;
        createPort(card, table.id, column.id, "field", 0, y);
        createPort(card, table.id, column.id, "field", node.width, y);
      });
      tableCardsById.set(table.id, card);
      world.addChild(card);
    });
    refreshColumnSelectionRef.current = (previousId, nextId) => {
      if (previousId) { const graphic = columnSelectionGraphics.get(previousId); if (graphic) graphic.visible = false; }
      if (nextId) { const graphic = columnSelectionGraphics.get(nextId); if (graphic) graphic.visible = true; }
    };
    refreshActiveTableSelectionRef.current = (previousId, nextId) => {
      activeRelationshipIds.clear();
      connectedColumnIds.clear();
      connectedPortSides.clear();
      connectedRelationshipIds(documentRef.current, nextId).forEach((relationshipId) => activeRelationshipIds.add(relationshipId));
      const nextTable = nextId ? documentRef.current.tables.find((table) => table.id === nextId) : undefined;
      activeColor = nextTable ? colorNumber(nextTable.color) : colors.selected;
      activeRelationshipIds.forEach((relationshipId) => {
        const render = edgeRenders.get(relationshipId);
        if (!render) return;
        const geometry = buildRelationshipGeometry(documentRef.current, render.relationship, nodeById, canvasIndexes.tableById, canvasIndexes.columnById);
        if (!geometry) return;
        connectedColumnIds.add(render.relationship.sourceColumnId);
        connectedColumnIds.add(render.relationship.targetColumnId);
        addPortSide(render.relationship.sourceColumnId, geometry.source.side);
        addPortSide(render.relationship.targetColumnId, geometry.target.side);
      });
      [previousId, nextId].forEach((tableId) => {
        if (!tableId) return;
        const record = tableBackgroundsById.get(tableId);
        if (record) drawCardBackground(record.graphics, record.node.width, record.node.height, record.accent, tableId === nextId);
      });
      columnVisualsById.forEach((visual, columnId) => {
        const connected = connectedColumnIds.has(columnId);
        const tableSelected = visual.tableId === nextId;
        visual.activeBackground.clear();
        if (connected) {
          const record = tableBackgroundsById.get(visual.tableId);
          if (record) visual.activeBackground.rect(1, -7, record.node.width - 2, 33).fill({ color: activeColor, alpha: tableSelected ? 0.34 : 0.22 });
        }
        visual.name.style = connected ? new TextStyle({ fontFamily: "Inter, system-ui, sans-serif", fontSize: 13, fontWeight: "600", fill: 0x69a7ff }) : columnStyle;
        visual.type.style = connected ? new TextStyle({ fontFamily: "ui-monospace, SFMono-Regular, monospace", fontSize: 11, fill: 0x9bbfff }) : typeStyle;
        visual.leftPort.clear().circle(0, 10, 8).fill(activeColor).stroke({ color: colors.canvas, width: 2 });
        visual.rightPort.clear().circle(0, 10, 8).fill(activeColor).stroke({ color: colors.canvas, width: 2 });
        const sides = connectedPortSides.get(columnId);
        visual.leftPort.visible = tableSelected || Boolean(sides?.has("left"));
        visual.rightPort.visible = tableSelected || Boolean(sides?.has("right"));
      });
      edgeRenders.forEach((render, relationshipId) => {
        const active = activeRelationshipIds.has(relationshipId);
        if (render.active === active) return;
        render.active = active;
        const geometry = buildRelationshipGeometry(documentRef.current, render.relationship, nodeById, canvasIndexes.tableById, canvasIndexes.columnById);
        if (geometry) {
          styleCardinalityBadge(render.sourceBadge, geometry.sourceCardinality, active);
          styleCardinalityBadge(render.targetBadge, geometry.targetCardinality, active);
        }
        redrawRelationship(relationshipId);
      });
    };

    areaRenders.forEach((render) => world.addChild(render.label, render.resizeTarget));

    geometryControllerRef.current = {
      reconcile: (nextDocument, nextNodes) => {
        const changedNodeBounds: LayoutNode[] = [];
        const changedTableIds = new Set<string>();
        let needsVisibilityRefresh = false;
        nextNodes.forEach((nextNode) => {
          const retainedNode = nodeById.get(nextNode.id);
          if (!retainedNode) return;
          if (retainedNode.x === nextNode.x && retainedNode.y === nextNode.y && retainedNode.width === nextNode.width && retainedNode.height === nextNode.height) return;
          changedNodeBounds.push({ ...retainedNode }, { ...nextNode });
          changedTableIds.add(nextNode.id);
          Object.assign(retainedNode, nextNode);
          if (!tableCardsById.has(nextNode.id) && nextNode.x <= retainedViewportBounds.maxX && nextNode.x + nextNode.width >= retainedViewportBounds.minX && nextNode.y <= retainedViewportBounds.maxY && nextNode.y + nextNode.height >= retainedViewportBounds.minY) needsVisibilityRefresh = true;
          tableCardsById.get(nextNode.id)?.position.set(nextNode.x, nextNode.y);
          updateSpatialItem(nextNode.id, retainedNode);
          portsByTable.get(nextNode.id)?.forEach((port) => {
            creationPortIndex.remove(port);
            port.point.x = nextNode.x + port.container.x;
            port.point.y = nextNode.y + port.container.y;
            port.minX = port.maxX = port.point.x;
            port.minY = port.maxY = port.point.y;
            creationPortIndex.insert(port);
          });
        });

        nextDocument.areas.forEach((area) => {
          const render = areaRenders.get(area.id);
          if (!render) return;
          if (render.frame.x !== area.x || render.frame.y !== area.y) positionAreaRender(render, area.x, area.y);
          if (render.width !== area.width || render.height !== area.height) sizeAreaRender(render, area.width, area.height);
        });
        nextDocument.notes.forEach((note) => noteContainersById.get(note.id)?.position.set(note.x, note.y));

        if (needsVisibilityRefresh) setViewportVersion((version) => version + 1);

        if (changedTableIds.size === 0) return;
        const changedObstacles = inflateRoutingObstacles(changedNodeBounds);
        const dirtyRoutes = new Set<string>();
        edgeRenders.forEach((render, relationshipId) => {
          if (changedTableIds.has(render.relationship.sourceTableId) || changedTableIds.has(render.relationship.targetTableId) || routeIntersectsObstacles(render.points, changedObstacles)) {
            routingCacheRef.current.delete(relationshipId);
            dirtyRelationshipIds.add(relationshipId);
            dirtyRoutes.add(relationshipId);
          }
        });
        const requests: RoutingRequest[] = [];
        dirtyRoutes.forEach((relationshipId) => {
          const render = edgeRenders.get(relationshipId);
          if (!render) return;
          const geometry = buildRelationshipGeometry(nextDocument, render.relationship, nodeById, canvasIndexes.tableById, canvasIndexes.columnById);
          if (!geometry) return;
          requests.push({ id: relationshipId, start: geometry.source.point, end: geometry.target.point, startSide: geometry.source.side, endSide: geometry.target.side, sourceId: render.relationship.sourceTableId, targetId: render.relationship.targetTableId });
        });
        startRoutingWorker(requests);
        previousRoutingNodesRef.current = new Map([...nodeById].map(([id, node]) => [id, { ...node }]));
      },
    };

    const applyActiveInteraction = (pointerId: number, point: Point) => {
      const interaction = activeInteraction;
      if (!interaction || pointerId !== interaction.pointerId) return;
      const delta = pointerDelta(interaction.startPointer, point, viewportRef.current.scale);

      if (interaction.kind === "table-move") {
        const rawPosition = moveArea(interaction.startCard, delta);
        const position = snapToGridRef.current ? snapPoint(rawPosition) : rawPosition;
        interaction.moved ||= Math.abs(position.x - interaction.startCard.x) + Math.abs(position.y - interaction.startCard.y) > 2;
        interaction.card.position.set(position.x, position.y);
        interaction.node.x = position.x;
        interaction.node.y = position.y;
        updateSpatialItem(interaction.tableId, interaction.node);
        relationshipIdsByTable.get(interaction.tableId)?.forEach((relationshipId) => dirtyRelationshipIds.add(relationshipId));
        return;
      }

      if (interaction.kind === "area-move") {
        const rawPosition = moveArea(interaction.startArea, delta);
        const position = snapToGridRef.current ? snapPoint(rawPosition) : rawPosition;
        const appliedDelta = { x: position.x - interaction.startArea.x, y: position.y - interaction.startArea.y };
        interaction.moved ||= Math.abs(position.x - interaction.startArea.x) + Math.abs(position.y - interaction.startArea.y) > 2;
        positionAreaRender(interaction.render, position.x, position.y);
        interaction.tableStarts.forEach((start, tableId) => {
          const tablePosition = moveArea(start, appliedDelta);
          const node = nodeById.get(tableId);
          if (node) {
            node.x = tablePosition.x;
            node.y = tablePosition.y;
            updateSpatialItem(tableId, node);
          }
          tableCardsById.get(tableId)?.position.set(tablePosition.x, tablePosition.y);
          relationshipIdsByTable.get(tableId)?.forEach((relationshipId) => dirtyRelationshipIds.add(relationshipId));
        });
        return;
      }

      const rawSize = resizeArea(interaction.startSize, delta);
      const size = snapToGridRef.current ? { width: Math.max(280, snapPoint({ x: rawSize.width, y: 0 }).x), height: Math.max(180, snapPoint({ x: 0, y: rawSize.height }).y) } : rawSize;
      interaction.moved ||= size.width !== interaction.startSize.width || size.height !== interaction.startSize.height;
      sizeAreaRender(interaction.render, size.width, size.height);
    };

    const flushPendingTableMove = (pointerId?: number) => {
      if (tableMoveFrame !== null) cancelAnimationFrame(tableMoveFrame);
      tableMoveFrame = null;
      const pending = pendingTableMove;
      pendingTableMove = null;
      if (pending && (pointerId === undefined || pointerId === pending.pointerId)) applyActiveInteraction(pending.pointerId, pending.point);
    };

    const moveActiveInteraction = (event: FederatedPointerEvent) => {
      const interaction = activeInteraction;
      if (!interaction || event.pointerId !== interaction.pointerId) return;
      if (interaction.kind !== "table-move") {
        applyActiveInteraction(event.pointerId, { x: event.global.x, y: event.global.y });
        return;
      }
      pendingTableMove = { pointerId: event.pointerId, point: { x: event.global.x, y: event.global.y } };
      if (tableMoveFrame === null) {
        tableMoveFrame = requestAnimationFrame(() => {
          tableMoveFrame = null;
          const pending = pendingTableMove;
          pendingTableMove = null;
          if (pending) applyActiveInteraction(pending.pointerId, pending.point);
        });
      }
    };

    const finishActiveInteraction = (event: FederatedPointerEvent) => {
      flushPendingTableMove(event.pointerId);
      const interaction = activeInteraction;
      if (!interaction || event.pointerId !== interaction.pointerId) return;
      activeInteraction = null;

      if (interaction.kind === "table-move") {
        if (!interaction.moved) {
          setSelection({ kind: "table", tableId: interaction.tableId });
          return;
        }
        const currentDocument = documentRef.current;
        const table = currentDocument.tables.find((candidate) => candidate.id === interaction.tableId);
        if (!table) return;
        let next = updateTable(currentDocument, table.id, { position: { x: interaction.card.x, y: interaction.card.y } });
        const center = { x: interaction.card.x + interaction.node.width / 2, y: interaction.card.y + interaction.node.height / 2 };
        const targetArea = [...currentDocument.areas].reverse().find((area) => !area.locked && center.x >= area.x && center.x <= area.x + area.width && center.y >= area.y && center.y <= area.y + area.height);
        next = assignTableToArea(next, table.id, targetArea?.id ?? null);
        onReplaceRef.current(targetArea ? `Move table into ${targetArea.name}` : "Move table", next);
        return;
      }

      if (!interaction.moved) return;
      if (interaction.kind === "area-resize") {
        const currentDocument = documentRef.current;
        onReplaceRef.current("Resize area", updateArea(currentDocument, interaction.render.area.id, { width: interaction.render.width, height: interaction.render.height }));
        return;
      }

      const currentDocument = documentRef.current;
      let next = updateArea(currentDocument, interaction.render.area.id, { x: interaction.render.frame.x, y: interaction.render.frame.y });
      interaction.tableStarts.forEach((_start, tableId) => {
        const node = nodeById.get(tableId);
        if (node) next = updateTable(next, tableId, { position: { x: node.x, y: node.y } });
      });
      onReplaceRef.current("Move area", next);
    };

    const cancelActiveInteraction = (event: FederatedPointerEvent) => {
      if (!activeInteraction || event.pointerId !== activeInteraction.pointerId) return;
      if (tableMoveFrame !== null) cancelAnimationFrame(tableMoveFrame);
      tableMoveFrame = null;
      pendingTableMove = null;
      const interaction = activeInteraction;
      activeInteraction = null;
      if (interaction.kind === "table-move") {
        interaction.card.position.set(interaction.startCard.x, interaction.startCard.y);
        interaction.node.x = interaction.startCard.x;
        interaction.node.y = interaction.startCard.y;
        updateSpatialItem(interaction.tableId, interaction.node);
        relationshipIdsByTable.get(interaction.tableId)?.forEach((relationshipId) => dirtyRelationshipIds.add(relationshipId));
        return;
      }
      if (interaction.kind === "area-resize") {
        sizeAreaRender(interaction.render, interaction.startSize.width, interaction.startSize.height);
        return;
      }
      positionAreaRender(interaction.render, interaction.startArea.x, interaction.startArea.y);
      interaction.tableStarts.forEach((start, tableId) => {
        const node = nodeById.get(tableId);
        if (node) {
          node.x = start.x;
          node.y = start.y;
          updateSpatialItem(tableId, node);
        }
        tableCardsById.get(tableId)?.position.set(start.x, start.y);
        relationshipIdsByTable.get(tableId)?.forEach((relationshipId) => dirtyRelationshipIds.add(relationshipId));
      });
    };

    app.stage.on("globalpointermove", moveActiveInteraction);
    app.stage.on("pointerup", finishActiveInteraction);
    app.stage.on("pointerupoutside", finishActiveInteraction);
    app.stage.on("pointercancel", cancelActiveInteraction);

    let pendingRelationshipMove: { pointerId: number; point: Point } | null = null;
    let relationshipMoveFrame: number | null = null;
    const applyRelationshipMove = (pointerId: number, point: Point) => {
      if (!relationshipDrag || pointerId !== relationshipDrag.pointerId) return;
      if (activeTargetPort) activeTargetPort.container.scale.set(1);
      activeTargetPort = null;
      if (relationshipDrag.kind === "field" && relationshipDrag.sourceColumnId) {
        const target = fieldPortAtPoint(point);
        if (target?.columnId && canCreateRelationship(documentRef.current, relationshipDrag.sourceTableId, relationshipDrag.sourceColumnId, target.tableId, target.columnId)) {
          target.container.scale.set(1.35);
          activeTargetPort = target;
          drawRelationshipPreview(target.point);
          return;
        }
      } else {
        const targetTable = tableAtPoint(point);
        if (targetTable && targetTable.id !== relationshipDrag.sourceTableId) {
          const node = nodeById.get(targetTable.id)!;
          drawRelationshipPreview({ x: point.x < node.x + node.width / 2 ? node.x : node.x + node.width, y: node.y + 25 });
          return;
        }
      }
      drawRelationshipPreview(point);
    };
    const flushRelationshipMove = (pointerId?: number) => {
      if (relationshipMoveFrame !== null) cancelAnimationFrame(relationshipMoveFrame);
      relationshipMoveFrame = null;
      const pending = pendingRelationshipMove;
      pendingRelationshipMove = null;
      if (pending && (pointerId === undefined || pointerId === pending.pointerId)) applyRelationshipMove(pending.pointerId, pending.point);
    };
    const moveRelationshipDrag = (event: FederatedPointerEvent) => {
      if (!relationshipDrag || event.pointerId !== relationshipDrag.pointerId) return;
      pendingRelationshipMove = { pointerId: event.pointerId, point: worldPointFromEvent(event) };
      if (relationshipMoveFrame === null) relationshipMoveFrame = requestAnimationFrame(() => {
        relationshipMoveFrame = null;
        const pending = pendingRelationshipMove;
        pendingRelationshipMove = null;
        if (pending) applyRelationshipMove(pending.pointerId, pending.point);
      });
    };
    const cancelRelationshipDrag = () => {
      relationshipDrag = null;
      activeTargetPort = null;
      relationshipPreview.clear();
      resetCreationPorts();
    };
    const finishRelationshipDrag = (event: FederatedPointerEvent) => {
      flushRelationshipMove(event.pointerId);
      const drag = relationshipDrag;
      if (!drag || event.pointerId !== drag.pointerId) return;
      const point = worldPointFromEvent(event);
      if (drag.kind === "field" && drag.sourceColumnId) {
        const target = fieldPortAtPoint(point);
        const currentDocument = documentRef.current;
        if (target?.columnId && canCreateRelationship(currentDocument, drag.sourceTableId, drag.sourceColumnId, target.tableId, target.columnId)) {
          onReplaceRef.current("Add relationship", addRelationship(currentDocument, drag.sourceTableId, drag.sourceColumnId, target.tableId, target.columnId));
        }
      } else {
        const targetTable = tableAtPoint(point);
        if (targetTable && targetTable.id !== drag.sourceTableId) {
          const candidates = relationshipCandidates(documentRef.current, drag.sourceTableId, targetTable.id);
          if (candidates.length > 0) {
            setRelationshipChoiceIndex(0);
            setRelationshipChoice({ candidates, x: Math.max(12, Math.min(app.screen.width - 332, event.global.x)), y: Math.max(12, Math.min(app.screen.height - 270, event.global.y)) });
          }
        }
      }
      cancelRelationshipDrag();
    };
    const cancelRelationshipPointer = (event: FederatedPointerEvent) => {
      if (relationshipDrag && event.pointerId === relationshipDrag.pointerId) { flushRelationshipMove(event.pointerId); cancelRelationshipDrag(); }
    };
    const cancelRelationshipOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      cancelRelationshipDrag();
      setRelationshipChoice(null);
    };
    app.stage.on("globalpointermove", moveRelationshipDrag);
    app.stage.on("pointerup", finishRelationshipDrag);
    app.stage.on("pointerupoutside", finishRelationshipDrag);
    app.stage.on("pointercancel", cancelRelationshipPointer);
    window.addEventListener("keydown", cancelRelationshipOnEscape);

    return () => {
      activeInteraction = null;
      if (relationshipMoveFrame !== null) cancelAnimationFrame(relationshipMoveFrame);
      relationshipMoveFrame = null;
      pendingRelationshipMove = null;
      if (tableMoveFrame !== null) cancelAnimationFrame(tableMoveFrame);
      tableMoveFrame = null;
      pendingTableMove = null;
      app.stage.off("globalpointermove", moveActiveInteraction);
      app.stage.off("pointerup", finishActiveInteraction);
      app.stage.off("pointerupoutside", finishActiveInteraction);
      app.stage.off("pointercancel", cancelActiveInteraction);
      app.stage.off("globalpointermove", moveRelationshipDrag);
      app.stage.off("pointerup", finishRelationshipDrag);
      app.stage.off("pointerupoutside", finishRelationshipDrag);
      app.stage.off("pointercancel", cancelRelationshipPointer);
      window.removeEventListener("keydown", cancelRelationshipOnEscape);
      routingGenerationRef.current += 1;
      routingWorker?.terminate();
      relationshipHitTestRef.current = () => false;
      refreshRelationshipSelectionRef.current = () => undefined;
      refreshColumnSelectionRef.current = () => undefined;
      refreshActiveTableSelectionRef.current = () => undefined;
      refreshViewportCullingRef.current = () => undefined;
      geometryControllerRef.current = null;
      tickerCleanupRef.current();
      tickerCleanupRef.current = () => undefined;
    };
  }, [rendererReady, sceneStructureKey, setSelection, viewportVersion]);

  useEffect(() => {
    geometryControllerRef.current?.reconcile(document, effectiveNodes);
  }, [document, effectiveNodes, rendererReady, sceneStructureKey]);

  const previousSelectedRelationshipIdRef = useRef<string | null>(null);
  useEffect(() => {
    refreshRelationshipSelectionRef.current(previousSelectedRelationshipIdRef.current, selectedRelationshipId);
    previousSelectedRelationshipIdRef.current = selectedRelationshipId;
  }, [selectedRelationshipId]);

  const previousSelectedColumnIdRef = useRef<string | null>(null);
  useEffect(() => {
    refreshColumnSelectionRef.current(previousSelectedColumnIdRef.current, selectedColumnId);
    previousSelectedColumnIdRef.current = selectedColumnId;
  }, [selectedColumnId]);

  const previousActiveTableIdRef = useRef<string | null>(null);
  useEffect(() => {
    refreshActiveTableSelectionRef.current(previousActiveTableIdRef.current, activeSelectionTableId);
    previousActiveTableIdRef.current = activeSelectionTableId;
  }, [activeSelectionTableId, rendererReady, sceneStructureKey, viewportVersion]);

  useEffect(() => {
    if (selection?.kind !== "relationship") return;
    const relationshipId = selection.relationshipId;
    const onDelete = (event: KeyboardEvent) => {
      if (!isRelationshipDeleteKey(event.key) || editableTarget(event.target)) return;
      if (!document.relationships.some((relationship) => relationship.id === relationshipId)) return;
      event.preventDefault();
      onReplace("Delete relationship", deleteRelationship(document, relationshipId));
      setSelection(null);
    };
    window.addEventListener("keydown", onDelete);
    return () => window.removeEventListener("keydown", onDelete);
  }, [document, onReplace, selection, setSelection]);

  useEffect(() => {
    if (zoomInRequest === lastZoomInRequest.current) return;
    lastZoomInRequest.current = zoomInRequest;
    const app = appRef.current;
    if (!app) return;
    viewportRef.current = zoomAround(viewportRef.current, { x: app.screen.width / 2, y: app.screen.height / 2 }, viewportRef.current.scale * 1.25);
    syncViewportRef.current();
    refreshViewportCullingRef.current();
  }, [zoomInRequest]);

  useEffect(() => {
    if (zoomOutRequest === lastZoomOutRequest.current) return;
    lastZoomOutRequest.current = zoomOutRequest;
    const app = appRef.current;
    if (!app) return;
    viewportRef.current = zoomAround(viewportRef.current, { x: app.screen.width / 2, y: app.screen.height / 2 }, viewportRef.current.scale / 1.25);
    syncViewportRef.current();
    refreshViewportCullingRef.current();
  }, [zoomOutRequest]);

  useEffect(() => {
    if (focusRequest === lastFocusRequest.current) return;
    lastFocusRequest.current = focusRequest;
    focusSelectionRef.current();
  }, [focusRequest]);

  useEffect(() => {
    const app = appRef.current;
    const world = worldRef.current;
    if (!app || !world || layout.nodes.length === 0) return;
    const { minX, minY, maxX, maxY } = workspaceBoundsRef.current;
    const scale = scaleToFit(app.screen.width, app.screen.height, { minX, minY, maxX, maxY });
    const viewport = viewportRef.current;
    viewport.scale = scale;
    viewport.x = (app.screen.width - (maxX - minX) * scale) / 2 - minX * scale;
    viewport.y = (app.screen.height - (maxY - minY) * scale) / 2 - minY * scale;
    syncViewportRef.current();
    refreshViewportCullingRef.current();
  }, [fitRequest, rendererReady, layout.generation]);

  useEffect(() => { syncViewportRef.current(); }, [workspaceBounds, minimapVisible]);

  return (
    <div className="canvas-shell" ref={hostRef}>
      <div className="canvas-hint">Drag to pan · Scroll to zoom · Click a field to edit</div>
      <div className="zoom-badge">PIXIJ‍S · RBUSH · ELK</div>
      {relationshipChoice && <div className="relationship-picker" style={{ left: relationshipChoice.x, top: relationshipChoice.y }} onKeyDown={(event) => {
        if (event.key === "Escape") setRelationshipChoice(null);
        else if (event.key === "ArrowDown") { event.preventDefault(); setRelationshipChoiceIndex((index) => Math.min(relationshipChoice.candidates.length - 1, index + 1)); }
        else if (event.key === "ArrowUp") { event.preventDefault(); setRelationshipChoiceIndex((index) => Math.max(0, index - 1)); }
        else if (event.key === "Enter") {
          const candidate = relationshipChoice.candidates[relationshipChoiceIndex];
          if (candidate) {
            onReplace("Add relationship", addRelationship(document, candidate.sourceTableId, candidate.sourceColumnId, candidate.targetTableId, candidate.targetColumnId));
            setRelationshipChoice(null);
          }
        }
      }}>
        <header><strong>Connect fields</strong><button onClick={() => setRelationshipChoice(null)} aria-label="Close">×</button></header>
        <p>Compatible field pairs</p>
        <div>{relationshipChoice.candidates.map((candidate, index) => {
          const sourceTable = canvasIndexes.tableById.get(candidate.sourceTableId)?.name;
          const targetTable = canvasIndexes.tableById.get(candidate.targetTableId)?.name;
          return <button key={`${candidate.sourceColumnId}:${candidate.targetColumnId}`} autoFocus={index === 0} className={index === relationshipChoiceIndex ? "active" : ""} onFocus={() => setRelationshipChoiceIndex(index)} onClick={() => {
            onReplace("Add relationship", addRelationship(document, candidate.sourceTableId, candidate.sourceColumnId, candidate.targetTableId, candidate.targetColumnId));
            setRelationshipChoice(null);
          }}><span><b>{sourceTable}.{candidate.sourceName}</b><i>→</i><b>{targetTable}.{candidate.targetName}</b></span><small>{candidate.dataType}</small></button>;
        })}</div>
      </div>}
      {minimapVisible && <div className="minimap" aria-label="Workspace minimap" onPointerDown={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const point = { x: workspaceBounds.minX + ((event.clientX - rect.left) / rect.width) * (workspaceBounds.maxX - workspaceBounds.minX), y: workspaceBounds.minY + ((event.clientY - rect.top) / rect.height) * (workspaceBounds.maxY - workspaceBounds.minY) };
        centerWorldRef.current(point);
      }}>
        {document.areas.map((area) => { const start = projectPoint({ x: area.x, y: area.y }, workspaceBounds); return <i key={area.id} style={{ left: `${start.x * 100}%`, top: `${start.y * 100}%`, width: `${area.width / (workspaceBounds.maxX - workspaceBounds.minX) * 100}%`, height: `${area.height / (workspaceBounds.maxY - workspaceBounds.minY) * 100}%`, borderColor: area.color }} />; })}
        {document.notes.map((note) => { const point = projectPoint(note, workspaceBounds); return <em key={note.id} style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%`, background: note.color }} />; })}
        {effectiveNodes.map((node) => { const table = canvasIndexes.tableById.get(node.id); const point = projectPoint(node, workspaceBounds); return <b key={node.id} style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%`, background: table?.color }} />; })}
        <u ref={minimapViewportRef} />
      </div>}
    </div>
  );
}
