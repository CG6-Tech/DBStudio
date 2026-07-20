import { create } from "zustand";
import type { Selection } from "../domain/types";

interface UiState {
  selection: Selection;
  previewOpen: boolean;
  status: string;
  zoom: number;
  fitRequest: number;
  zoomInRequest: number;
  zoomOutRequest: number;
  focusRequest: number;
  autoLayoutRequest: number;
  snapToGrid: boolean;
  minimapVisible: boolean;
  tableCommentsVisible: boolean;
  searchOpen: boolean;
  activePanel: "open" | "tables" | "relationships" | "logic" | "visuals" | "types" | "migration" | "validation" | "changes";
  visualsTab: "areas" | "notes";
  logicSelectionId: string | null;
  routineFlowId: string | null;
  relationshipFocus: { relationshipId: string; columnId: string } | null;
  referencesMode: "browse" | "create" | "analyze";
  migrationView: "canvas" | "list";
  migrationSelectedChangeId: string | null;
  migrationShowUnchanged: boolean;
  hoveredRelationshipId: string | null;
  tableEditorFocus: { tableId: string; request: number } | null;
  setSelection: (selection: Selection) => void;
  setPreviewOpen: (open: boolean) => void;
  setStatus: (status: string) => void;
  setZoom: (zoom: number) => void;
  requestFit: () => void;
  requestZoomIn: () => void;
  requestZoomOut: () => void;
  requestFocus: () => void;
  requestAutoLayout: () => void;
  toggleSnapToGrid: () => void;
  toggleMinimap: () => void;
  toggleTableComments: () => void;
  setSearchOpen: (open: boolean) => void;
  setActivePanel: (panel: UiState["activePanel"]) => void;
  setVisualsTab: (tab: UiState["visualsTab"]) => void;
  setLogicSelection: (id: string | null) => void;
  openRoutineFlow: (id: string) => void;
  closeRoutineFlow: () => void;
  focusRelationship: (relationshipId: string, columnId: string) => void;
  setReferencesMode: (mode: UiState["referencesMode"]) => void;
  setMigrationView: (view: UiState["migrationView"]) => void;
  setMigrationSelectedChangeId: (id: string | null) => void;
  toggleMigrationUnchanged: () => void;
  setHoveredRelationshipId: (relationshipId: string | null) => void;
  focusTableEditor: (tableId: string) => void;
}

export const useUiStore = create<UiState>((set) => ({
  selection: null,
  previewOpen: false,
  status: "Ready",
  zoom: 1,
  fitRequest: 0,
  zoomInRequest: 0,
  zoomOutRequest: 0,
  focusRequest: 0,
  autoLayoutRequest: 0,
  snapToGrid: false,
  minimapVisible: true,
  tableCommentsVisible: true,
  searchOpen: false,
  activePanel: "tables",
  visualsTab: "areas",
  logicSelectionId: null,
  routineFlowId: null,
  relationshipFocus: null,
  referencesMode: "browse",
  migrationView: "canvas",
  migrationSelectedChangeId: null,
  migrationShowUnchanged: false,
  hoveredRelationshipId: null,
  tableEditorFocus: null,
  setSelection: (selection) => set({ selection }),
  setPreviewOpen: (previewOpen) => set({ previewOpen }),
  setStatus: (status) => set({ status }),
  setZoom: (zoom) => set({ zoom }),
  requestFit: () => set((state) => ({ fitRequest: state.fitRequest + 1 })),
  requestZoomIn: () => set((state) => ({ zoomInRequest: state.zoomInRequest + 1 })),
  requestZoomOut: () => set((state) => ({ zoomOutRequest: state.zoomOutRequest + 1 })),
  requestFocus: () => set((state) => ({ focusRequest: state.focusRequest + 1 })),
  requestAutoLayout: () => set((state) => ({ autoLayoutRequest: state.autoLayoutRequest + 1 })),
  toggleSnapToGrid: () => set((state) => ({ snapToGrid: !state.snapToGrid })),
  toggleMinimap: () => set((state) => ({ minimapVisible: !state.minimapVisible })),
  toggleTableComments: () => set((state) => ({ tableCommentsVisible: !state.tableCommentsVisible })),
  setSearchOpen: (searchOpen) => set({ searchOpen }),
  setActivePanel: (activePanel) => set({ activePanel }),
  setVisualsTab: (visualsTab) => set({ visualsTab }),
  setLogicSelection: (logicSelectionId) => set({ logicSelectionId }),
  openRoutineFlow: (routineFlowId) => set({ routineFlowId, logicSelectionId: routineFlowId, activePanel: "logic" }),
  closeRoutineFlow: () => set({ routineFlowId: null }),
  focusRelationship: (relationshipId, columnId) => set({ relationshipFocus: { relationshipId, columnId }, activePanel: "relationships" }),
  setReferencesMode: (referencesMode) => set({ referencesMode }),
  setMigrationView: (migrationView) => set({ migrationView }),
  setMigrationSelectedChangeId: (migrationSelectedChangeId) => set({ migrationSelectedChangeId }),
  toggleMigrationUnchanged: () => set((state) => ({ migrationShowUnchanged: !state.migrationShowUnchanged })),
  setHoveredRelationshipId: (hoveredRelationshipId) => set({ hoveredRelationshipId }),
  focusTableEditor: (tableId) => set((state) => ({
    selection: { kind: "table", tableId },
    activePanel: "tables",
    focusRequest: state.focusRequest + 1,
    tableEditorFocus: { tableId, request: (state.tableEditorFocus?.request ?? 0) + 1 },
  })),
}));
