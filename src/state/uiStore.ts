import { create } from "zustand";
import type { Selection } from "../domain/types";

interface UiState {
  selection: Selection;
  previewOpen: boolean;
  status: string;
  fitRequest: number;
  activePanel: "open" | "tables" | "relationships" | "visuals" | "types" | "validation" | "changes";
  setSelection: (selection: Selection) => void;
  setPreviewOpen: (open: boolean) => void;
  setStatus: (status: string) => void;
  requestFit: () => void;
  setActivePanel: (panel: UiState["activePanel"]) => void;
}

export const useUiStore = create<UiState>((set) => ({
  selection: null,
  previewOpen: false,
  status: "Ready",
  fitRequest: 0,
  activePanel: "tables",
  setSelection: (selection) => set({ selection }),
  setPreviewOpen: (previewOpen) => set({ previewOpen }),
  setStatus: (status) => set({ status }),
  requestFit: () => set((state) => ({ fitRequest: state.fitRequest + 1 })),
  setActivePanel: (activePanel) => set({ activePanel }),
}));
