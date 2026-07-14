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
  searchOpen: boolean;
  activePanel: "open" | "tables" | "relationships" | "visuals" | "types" | "validation" | "changes";
  relationshipFocus: { relationshipId: string; columnId: string } | null;
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
  setSearchOpen: (open: boolean) => void;
  setActivePanel: (panel: UiState["activePanel"]) => void;
  focusRelationship: (relationshipId: string, columnId: string) => void;
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
  searchOpen: false,
  activePanel: "tables",
  relationshipFocus: null,
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
  setSearchOpen: (searchOpen) => set({ searchOpen }),
  setActivePanel: (activePanel) => set({ activePanel }),
  focusRelationship: (relationshipId, columnId) => set({ relationshipFocus: { relationshipId, columnId }, activePanel: "relationships" }),
}));
