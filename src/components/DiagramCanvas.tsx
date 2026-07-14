import { useEffect, useRef, useState } from "react";
import { Application, Container, FederatedPointerEvent, Graphics, Text, TextStyle } from "pixi.js";
import RBush from "rbush";
import type { LayoutResult, SchemaDocument } from "../domain/types";
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

export function DiagramCanvas({ document, layout }: DiagramCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const worldRef = useRef<Container | null>(null);
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
      appRef.current = null;
      worldRef.current = null;
      if (initialized) app.destroy(true, { children: true });
    };
  }, [setSelection]);

  useEffect(() => {
    const app = appRef.current;
    const world = worldRef.current;
    if (!app || !world) return;
    world.removeChildren().forEach((child) => child.destroy({ children: true }));

    const nodeById = new Map(layout.nodes.map((node) => [node.id, node]));
    const index = new RBush<SpatialItem>();
    index.load(layout.nodes.map((node) => ({ minX: node.x, minY: node.y, maxX: node.x + node.width, maxY: node.y + node.height, id: node.id })));
    const viewport = viewportRef.current;
    const visible = new Set(index.search({
      minX: -viewport.x / viewport.scale - 200,
      minY: -viewport.y / viewport.scale - 200,
      maxX: (app.screen.width - viewport.x) / viewport.scale + 200,
      maxY: (app.screen.height - viewport.y) / viewport.scale + 200,
    }).map((item) => item.id));

    const edgeLayer = new Graphics();
    document.relationships.forEach((relationship) => {
      const source = nodeById.get(relationship.sourceTableId);
      const target = nodeById.get(relationship.targetTableId);
      if (!source || !target || (!visible.has(source.id) && !visible.has(target.id))) return;
      const route = layout.edges.find((edge) => edge.id === relationship.id)?.points;
      const points = route?.length ? route : [
        { x: source.x + source.width, y: source.y + source.height / 2 },
        { x: (source.x + source.width + target.x) / 2, y: source.y + source.height / 2 },
        { x: (source.x + source.width + target.x) / 2, y: target.y + target.height / 2 },
        { x: target.x, y: target.y + target.height / 2 },
      ];
      edgeLayer.moveTo(points[0].x, points[0].y);
      points.slice(1).forEach((point) => edgeLayer.lineTo(point.x, point.y));
      edgeLayer.stroke({ color: colors.edge, width: 2 });
      const start = points[0];
      const end = points.at(-1)!;
      edgeLayer.circle(start.x, start.y, 4).fill(colors.selected);
      edgeLayer.circle(end.x, end.y, 4).fill(colors.edge);
    });
    world.addChild(edgeLayer);

    document.tables.forEach((table) => {
      const node = nodeById.get(table.id);
      if (!node || !visible.has(node.id)) return;
      const tableSelected = selection?.tableId === table.id;
      const card = new Container();
      card.position.set(node.x, node.y);
      card.eventMode = "static";
      card.cursor = "pointer";
      card.on("pointertap", () => setSelection({ kind: "table", tableId: table.id }));

      const background = new Graphics()
        .roundRect(0, 0, node.width, node.height, 10)
        .fill(colors.card)
        .stroke({ color: tableSelected ? colors.selected : colors.border, width: tableSelected ? 2 : 1 });
      background.roundRect(0, 0, node.width, 50, 10).fill(colors.cardTop);
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
        const row = new Container();
        row.eventMode = "static";
        row.cursor = "pointer";
        row.hitArea = { contains: (x: number, py: number) => x >= 0 && x <= node.width && py >= 0 && py <= 32 };
        row.on("pointertap", (event) => {
          event.stopPropagation();
          setSelection({ kind: "column", tableId: table.id, columnId: column.id });
        });
        row.position.set(0, y);
        if (selection?.kind === "column" && selection.columnId === column.id) {
          row.addChild(new Graphics().rect(4, -4, node.width - 8, 31).fill({ color: colors.selected, alpha: 0.09 }));
        }
        if (column.primaryKey) {
          const key = new Text({ text: "PK", style: badgeStyle });
          key.position.set(14, 4);
          row.addChild(key);
        } else {
          row.addChild(new Graphics().circle(22, 10, 3).fill(column.nullable ? colors.type : colors.selected));
        }
        const name = new Text({ text: column.name, style: columnStyle });
        name.position.set(42, 0);
        row.addChild(name);
        const type = new Text({ text: column.dataType, style: typeStyle });
        type.anchor.set(1, 0);
        type.position.set(node.width - 16, 3);
        row.addChild(type);
        card.addChild(row);
      });
      world.addChild(card);
    });
  }, [document, layout, selection, setSelection, rendererReady, viewportVersion]);

  useEffect(() => {
    const app = appRef.current;
    const world = worldRef.current;
    if (!app || !world || layout.nodes.length === 0) return;
    const minX = Math.min(...layout.nodes.map((node) => node.x));
    const minY = Math.min(...layout.nodes.map((node) => node.y));
    const maxX = Math.max(...layout.nodes.map((node) => node.x + node.width));
    const maxY = Math.max(...layout.nodes.map((node) => node.y + node.height));
    const scale = Math.min(1.15, Math.max(0.35, Math.min((app.screen.width - 140) / (maxX - minX), (app.screen.height - 140) / (maxY - minY))));
    const viewport = viewportRef.current;
    viewport.scale = scale;
    viewport.x = (app.screen.width - (maxX - minX) * scale) / 2 - minX * scale;
    viewport.y = (app.screen.height - (maxY - minY) * scale) / 2 - minY * scale;
    world.scale.set(scale);
    world.position.set(viewport.x, viewport.y);
    setViewportVersion((version) => version + 1);
  }, [fitRequest, layout, rendererReady]);

  return (
    <div className="canvas-shell" ref={hostRef}>
      <div className="canvas-hint">Drag to pan · Scroll to zoom · Click a field to edit</div>
      <div className="zoom-badge">PIXIJ‍S · RBUSH · ELK</div>
    </div>
  );
}
