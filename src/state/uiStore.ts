import { create } from "zustand";
import type { Selection } from "../domain/types";

interface UiState {
  selection: Selection;
  previewOpen: boolean;
  status: string;
  fitRequest: number;
  setSelection: (selection: Selection) => void;
  setPreviewOpen: (open: boolean) => void;
  setStatus: (status: string) => void;
  requestFit: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  selection: null,
  previewOpen: false,
  status: "Ready",
  fitRequest: 0,
  setSelection: (selection) => set({ selection }),
  setPreviewOpen: (previewOpen) => set({ previewOpen }),
  setStatus: (status) => set({ status }),
  requestFit: () => set((state) => ({ fitRequest: state.fitRequest + 1 })),
}));
