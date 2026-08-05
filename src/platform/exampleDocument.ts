import type { DiagramArea, DiagramNote, SchemaDocument, Table } from "../domain/types";

const color = {
  customer: "#79b8ff",
  catalog: "#c9a9ef",
  orders: "#7ee0b5",
  note: "#f5bd69",
} as const;

function byName(document: SchemaDocument): Map<string, Table> {
  return new Map(document.tables.map((table) => [table.name, table]));
}

function tableIds(tables: Map<string, Table>, names: string[]): string[] {
  return names.flatMap((name) => tables.get(name)?.id ?? []);
}

function logicNode(id: string | undefined, x: number, y: number): NonNullable<SchemaDocument["logicLayout"]>["nodes"][number][] {
  return id ? [{ id, position: { x, y }, pinned: true }] : [];
}

function positionTable(table: Table | undefined, x: number, y: number, patch: Partial<Table> = {}): Table | undefined {
  return table ? { ...table, ...patch, position: { x, y } } : undefined;
}

export function enrichExampleDocument(document: SchemaDocument): SchemaDocument {
  const tables = byName(document);
  const positioned = [
    positionTable(tables.get("users"), 70, 70, {
      color: color.customer,
      comment: "Customer account root. Orders and addresses hang from this table.",
      commentVisible: true,
      commentColor: color.customer,
      commentOffset: { x: -241, y: 7 },
    }),
    positionTable(tables.get("addresses"), 410, 70, { color: color.customer }),
    positionTable(tables.get("products"), 410, 552, {
      color: color.catalog,
      comment: "Catalog table with a unique SKU. Try changing a field type and preview SQL.",
      commentVisible: true,
      commentColor: color.catalog,
      commentOffset: { x: -246, y: -3 },
    }),
    positionTable(tables.get("orders"), 877, 121, { color: color.orders, widthScale: 1.5 }),
    positionTable(tables.get("order_items"), 1342, 112, { color: color.orders }),
    positionTable(tables.get("payments"), 1345, 429, { color: color.orders }),
    positionTable(tables.get("shipments"), 986, 435, { color: color.orders }),
  ].filter((table): table is Table => Boolean(table));

  const tableById = new Map(positioned.map((table) => [table.id, table]));
  const nextTables = document.tables.map((table) => tableById.get(table.id) ?? table);
  const routines = new Map(document.routines.map((routine) => [routine.name, routine]));
  const triggers = new Map(document.triggers.map((trigger) => [trigger.name, trigger]));

  const notes: DiagramNote[] = [
    {
      id: "note:example-start",
      text: "Start here: drag tables, open SQL preview, then try undo/redo.",
      color: color.note,
      x: 617,
      y: -169,
    },
    {
      id: "note:example-areas",
      text: "Areas group tables without changing SQL. Move an area to carry its tables.",
      color: color.orders,
      x: 1560,
      y: -40,
    },
    {
      id: "note:example-safety",
      text: "DBStudio saves guarded SQL changes. Review generated SQL before applying it anywhere.",
      color: color.customer,
      x: 77,
      y: 286,
    },
  ];

  const areas: DiagramArea[] = [
    {
      id: "area:example-customers",
      name: "Customer context",
      color: color.customer,
      x: 20,
      y: 20,
      width: 701.769453349141,
      height: 427.2331190383727,
      tableIds: tableIds(tables, ["users", "addresses"]),
      noteIds: ["note:example-safety"],
      locked: false,
      collapsed: false,
      moveContents: true,
    },
    {
      id: "area:example-order-flow",
      name: "Order flow",
      color: color.orders,
      x: 821.5096600398415,
      y: 8.266103052099425,
      width: 831.4388576256454,
      height: 738.5904328821641,
      tableIds: tableIds(tables, ["orders", "order_items", "payments", "shipments"]),
      noteIds: [],
      locked: false,
      collapsed: false,
      moveContents: true,
    },
    {
      id: "area:example-catalog",
      name: "Catalog",
      color: color.catalog,
      x: 360.30258420109806,
      y: 502.1710170248007,
      width: 360,
      height: 362,
      tableIds: tableIds(tables, ["products"]),
      noteIds: [],
      locked: false,
      collapsed: false,
      moveContents: true,
    },
  ];

  return {
    ...document,
    hasSavedLayout: true,
    tables: nextTables,
    areas,
    notes,
    logicLayout: {
      nodes: [
        ...logicNode(tables.get("payments")?.id, 70, 70),
        ...logicNode(triggers.get("payments_sync_order")?.id, 390, 70),
        ...logicNode(routines.get("sync_order_payment_status")?.id, 720, 70),
        ...logicNode(routines.get("recalculate_order_total")?.id, 1050, 250),
        ...logicNode(tables.get("orders")?.id, 1400, 190),
        ...logicNode(tables.get("order_items")?.id, 70, 390),
        ...logicNode(triggers.get("order_items_refresh_order")?.id, 390, 390),
        ...logicNode(routines.get("refresh_order_from_item")?.id, 720, 390),
        ...logicNode(tables.get("products")?.id, 1050, 520),
        ...logicNode(tables.get("shipments")?.id, 70, 710),
        ...logicNode(triggers.get("shipments_mark_order")?.id, 390, 710),
        ...logicNode(routines.get("mark_order_shipped")?.id, 720, 710),
      ],
      viewport: { x: 28, y: 34, scale: 0.78 },
      algorithmVersion: 2,
    },
  };
}
