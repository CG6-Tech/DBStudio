import { Container, FederatedPointerEvent, Graphics, Text, TextStyle } from "pixi.js";
import type { AnchorSide } from "../../domain/relationshipGeometry";
import type { LayoutNode, Table } from "../../domain/types";

export interface ColumnVisual {
  tableId: string;
  activeBackground: Graphics;
  name: Text;
  type: Text;
  leftPort: Graphics;
  rightPort: Graphics;
}

export interface TableBackgroundVisual {
  graphics: Graphics;
  node: LayoutNode;
  accent: number;
}

export interface TableCardRender {
  card: Container;
  background: TableBackgroundVisual;
  columnVisuals: Array<{ columnId: string; visual: ColumnVisual }>;
  columnSelections: Array<{ columnId: string; graphic: Graphics }>;
}

interface TableCardOptions {
  table: Table;
  node: LayoutNode;
  selected: boolean;
  highlighted: boolean;
  selectedColumnId: string | null;
  activeColor: number;
  connectedColumnIds: ReadonlySet<string>;
  connectedPortSides: ReadonlyMap<string, ReadonlySet<AnchorSide>>;
  onPointerEnter: (tableId: string) => void;
  onPointerLeave: (tableId: string) => void;
  onPointerDown: (event: FederatedPointerEvent, card: Container, node: LayoutNode) => void;
  onFocusTable: (tableId: string) => void;
  onChangeWidth: (tableId: string) => void;
  onSelectColumn: (tableId: string, columnId: string) => void;
  createPort: (card: Container, tableId: string, columnId: string, x: number, y: number) => void;
}

export const tableCardColors = {
  canvas: 0x0d1114,
  card: 0x171d21,
  cardTop: 0x1e262b,
  border: 0x344047,
  selected: 0x7ee0b5,
  text: 0xe9f1ed,
  muted: 0x8f9b97,
  type: 0x799089,
  key: 0xf5bd69,
};

export const tableColumnStyle = new TextStyle({ fontFamily: "Inter, system-ui, sans-serif", fontSize: 13, fill: tableCardColors.text });
export const tableTypeStyle = new TextStyle({ fontFamily: "ui-monospace, SFMono-Regular, monospace", fontSize: 11, fill: tableCardColors.type });

const titleStyle = new TextStyle({ fontFamily: "Inter, system-ui, sans-serif", fontSize: 16, fontWeight: "600", fill: tableCardColors.text });
const badgeStyle = new TextStyle({ fontFamily: "Inter, system-ui, sans-serif", fontSize: 9, fontWeight: "700", fill: tableCardColors.key });
const cardCornerRadius = 5;
const cardAccentHeight = 10;
const headerHeight = 50;
const headerCenterY = 30;
const headerPaddingX = 20;
const tableGlyphSize = 18;
const titleX = headerPaddingX + tableGlyphSize + 16;
const widthControlInset = 34;
const focusControlGap = 46;
const headerControlMarker = "__tableHeaderControl";

function px(value: number): number {
  return Math.round(value);
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

export function drawTableCardBackground(graphics: Graphics, width: number, height: number, accent: number, selected: boolean): void {
  graphics.clear().roundRect(0, 0, width, height, cardCornerRadius).fill(tableCardColors.card);
  graphics.roundRect(0, 0, width, headerHeight, cardCornerRadius).fill(tableCardColors.cardTop);
  drawTopAccent(graphics, width, accent);
  graphics.rect(0, headerHeight - cardAccentHeight, width, cardAccentHeight).fill(tableCardColors.cardTop);
  graphics.moveTo(0, headerHeight).lineTo(width, headerHeight).stroke({ color: tableCardColors.border, width: 1 });
  graphics.roundRect(0, 0, width, height, cardCornerRadius).stroke({ color: selected ? accent : tableCardColors.border, width: selected ? 2 : 1 });
}

function createTableGlyph(): Graphics {
  return new Graphics()
    .roundRect(0, 0, 18, 18, 2).stroke({ color: tableCardColors.text, width: 1.5 })
    .moveTo(6, 0).lineTo(6, 18).moveTo(0, 6).lineTo(18, 6).stroke({ color: tableCardColors.text, width: 1.2 });
}

function displayTableTitle(name: string, width: number): string {
  const controlsWidth = widthControlInset + focusControlGap + 22;
  const availableTitleWidth = Math.max(42, width - titleX - controlsWidth);
  const maxTitleCharacters = Math.max(4, Math.floor(availableTitleWidth / 8.5));
  return name.length > maxTitleCharacters ? `${name.slice(0, Math.max(1, maxTitleCharacters - 1))}...` : name;
}

function markHeaderControl(control: Container): void {
  (control as Container & { [headerControlMarker]?: true })[headerControlMarker] = true;
}

function isHeaderControlTarget(target: unknown, boundary: Container): boolean {
  let current = target as (Container & { [headerControlMarker]?: true }) | null;
  while (current) {
    if (current[headerControlMarker]) return true;
    if (current === boundary) return false;
    current = current.parent as (Container & { [headerControlMarker]?: true }) | null;
  }
  return false;
}

function createFocusControl(tableId: string, width: number, onFocusTable: (tableId: string) => void): Container {
  const control = new Container();
  markHeaderControl(control);
  control.position.set(px(width - widthControlInset - focusControlGap), headerCenterY);
  control.eventMode = "static";
  control.cursor = "pointer";
  control.hitArea = { contains: (x: number, y: number) => Math.hypot(x, y) <= 17 };
  const hover = new Graphics();
  const glyph = new Graphics()
    .circle(0, 0, 10)
    .stroke({ color: tableCardColors.muted, width: 2 })
    .circle(0, 0, 2.25).fill(tableCardColors.text);
  control.addChild(hover, glyph);
  control.on("pointerover", () => hover.clear().circle(0, 0, 17).fill({ color: tableCardColors.selected, alpha: .1 }));
  control.on("pointerout", () => hover.clear());
  control.on("pointerdown", (event: FederatedPointerEvent) => event.stopPropagation());
  control.on("pointertap", (event: FederatedPointerEvent) => { event.stopPropagation(); onFocusTable(tableId); });
  return control;
}

function createWidthControl(tableId: string, width: number, onChangeWidth: (tableId: string) => void): Container {
  const control = new Container();
  markHeaderControl(control);
  control.position.set(px(width - widthControlInset), headerCenterY);
  control.eventMode = "static";
  control.cursor = "pointer";
  control.hitArea = { contains: (x: number, y: number) => x >= -18 && x <= 18 && y >= -17 && y <= 17 };
  const hover = new Graphics();
  const glyph = new Graphics()
    .moveTo(-6, -6).lineTo(-13, 0).lineTo(-6, 6)
    .moveTo(6, -6).lineTo(13, 0).lineTo(6, 6)
    .stroke({ color: tableCardColors.muted, width: 2.75 });
  control.addChild(hover, glyph);
  control.on("pointerover", () => hover.clear().roundRect(-18, -17, 36, 34, 6).fill({ color: tableCardColors.selected, alpha: .1 }));
  control.on("pointerout", () => hover.clear());
  control.on("pointerdown", (event: FederatedPointerEvent) => event.stopPropagation());
  control.on("pointertap", (event: FederatedPointerEvent) => { event.stopPropagation(); onChangeWidth(tableId); });
  return control;
}

export function createTableCard(options: TableCardOptions): TableCardRender {
  const {
    table, node, selected, highlighted, selectedColumnId, activeColor, connectedColumnIds, connectedPortSides,
    onPointerEnter, onPointerLeave, onPointerDown, onFocusTable, onChangeWidth, onSelectColumn, createPort,
  } = options;

  const card = new Container();
  card.position.set(px(node.x), px(node.y));
  card.eventMode = "static";
  card.cursor = "pointer";
  card.on("pointerenter", () => onPointerEnter(table.id));
  card.on("pointerleave", () => onPointerLeave(table.id));
  card.on("pointerdown", (event: FederatedPointerEvent) => {
    if (isHeaderControlTarget(event.target, card)) return;
    onPointerDown(event, card, node);
  });

  const accent = Number.parseInt(table.color.replace("#", ""), 16);
  const background = new Graphics();
  drawTableCardBackground(background, node.width, node.height, accent, selected || highlighted);
  card.addChild(background);

  const tableGlyph = createTableGlyph();
  tableGlyph.position.set(headerPaddingX, px(headerCenterY - tableGlyphSize / 2));
  card.addChild(tableGlyph);

  const title = new Text({ text: displayTableTitle(table.name, node.width), style: titleStyle });
  title.roundPixels = true;
  title.anchor.set(0, 0.5);
  title.position.set(titleX, headerCenterY);
  card.addChild(title);

  card.addChild(createFocusControl(table.id, node.width, onFocusTable));
  card.addChild(createWidthControl(table.id, node.width, onChangeWidth));

  const columnVisuals: TableCardRender["columnVisuals"] = [];
  const columnSelections: TableCardRender["columnSelections"] = [];

  table.columns.forEach((column, columnIndex) => {
    const y = 58 + columnIndex * 34;
    const connected = connectedColumnIds.has(column.id);
    const row = new Container();
    row.eventMode = "static";
    row.cursor = "pointer";
    row.hitArea = { contains: (x: number, py: number) => x >= 0 && x <= node.width && py >= 0 && py <= 32 };
    row.on("pointertap", (event) => { event.stopPropagation(); onSelectColumn(table.id, column.id); });
    row.position.set(0, px(y));

    const rowBackground = new Graphics();
    rowBackground.moveTo(0, 27).lineTo(node.width, 27).stroke({ color: tableCardColors.border, alpha: 0.7, width: 1 });
    row.addChild(rowBackground);

    const activeBackground = new Graphics();
    if (connected) activeBackground.rect(1, -7, node.width - 2, 33).fill({ color: activeColor, alpha: selected ? 0.34 : 0.22 });
    row.addChildAt(activeBackground, 0);

    const selectionBackground = new Graphics().rect(4, -5, node.width - 8, 30).fill({ color: activeColor, alpha: 0.2 });
    selectionBackground.visible = selectedColumnId === column.id;
    columnSelections.push({ columnId: column.id, graphic: selectionBackground });
    row.addChild(selectionBackground);

    if (column.primaryKey) {
      const key = new Text({ text: "PK", style: badgeStyle });
      key.roundPixels = true;
      key.position.set(14, 4);
      row.addChild(key);
    } else {
      row.addChild(new Graphics().circle(22, 10, 3).fill(column.nullable ? tableCardColors.type : tableCardColors.selected));
    }

    const name = new Text({ text: column.name, style: connected ? new TextStyle({ fontFamily: "Inter, system-ui, sans-serif", fontSize: 13, fontWeight: "600", fill: 0x69a7ff }) : tableColumnStyle });
    name.roundPixels = true;
    name.position.set(42, 0);
    row.addChild(name);

    const type = new Text({ text: column.dataType, style: connected ? new TextStyle({ fontFamily: "ui-monospace, SFMono-Regular, monospace", fontSize: 11, fill: 0x9bbfff }) : tableTypeStyle });
    type.roundPixels = true;
    type.anchor.set(1, 0);
    type.position.set(px(node.width - 16), 3);
    row.addChild(type);

    const portSides = selected ? new Set<AnchorSide>(["left", "right"]) : connectedPortSides.get(column.id);
    const leftPort = new Graphics().circle(0, 10, 8).fill(activeColor).stroke({ color: tableCardColors.canvas, width: 2 });
    const rightPort = new Graphics().circle(0, 10, 8).fill(activeColor).stroke({ color: tableCardColors.canvas, width: 2 });
    rightPort.position.x = node.width;
    leftPort.visible = Boolean(portSides?.has("left"));
    rightPort.visible = Boolean(portSides?.has("right"));
    row.addChild(leftPort, rightPort);

    columnVisuals.push({ columnId: column.id, visual: { tableId: table.id, activeBackground, name, type, leftPort, rightPort } });
    card.addChild(row);
  });

  table.columns.forEach((column, columnIndex) => {
    const y = 68 + columnIndex * 34;
    createPort(card, table.id, column.id, 0, y);
    createPort(card, table.id, column.id, node.width, y);
  });

  return { card, background: { graphics: background, node, accent }, columnVisuals, columnSelections };
}
