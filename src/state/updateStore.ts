import { create } from "zustand";
import type { AvailableUpdate } from "../platform/updater";

export type UpdatePhase = "idle" | "checking" | "current" | "available" | "deferred" | "downloading" | "installing" | "failed" | "unavailable";

interface UpdateState {
  phase: UpdatePhase;
  update: AvailableUpdate | null;
  progress: number | null;
  downloaded: number;
  total: number | null;
  error: string | null;
  dialogOpen: boolean;
  manual: boolean;
  setChecking: (manual: boolean) => void;
  setCurrent: () => void;
  setUnavailable: () => void;
  setAvailable: (update: AvailableUpdate) => void;
  setDeferred: () => void;
  setDownloading: () => void;
  setProgress: (downloaded: number, total?: number, percent?: number) => void;
  setInstalling: () => void;
  setFailed: (error: string, open?: boolean) => void;
  closeDialog: () => void;
}

export const useUpdateStore = create<UpdateState>((set) => ({
  phase: "idle",
  update: null,
  progress: null,
  downloaded: 0,
  total: null,
  error: null,
  dialogOpen: false,
  manual: false,
  setChecking: (manual) => set({ phase: "checking", manual, update: null, error: null, dialogOpen: manual, progress: null, downloaded: 0, total: null }),
  setCurrent: () => set((state) => ({ phase: "current", update: null, error: null, dialogOpen: state.manual })),
  setUnavailable: () => set((state) => ({ phase: "unavailable", update: null, dialogOpen: state.manual })),
  setAvailable: (update) => set({ phase: "available", update, error: null, dialogOpen: true, progress: null, downloaded: 0, total: update.size ?? null }),
  setDeferred: () => set({ phase: "deferred", dialogOpen: false, update: null }),
  setDownloading: () => set({ phase: "downloading", error: null, dialogOpen: true, progress: 0, downloaded: 0 }),
  setProgress: (downloaded, total, percent) => set({ downloaded, total: total ?? null, progress: percent ?? null }),
  setInstalling: () => set({ phase: "installing", progress: 100 }),
  setFailed: (error, open = true) => set({ phase: "failed", error, dialogOpen: open }),
  closeDialog: () => set((state) => state.update?.mandatory ? state : { dialogOpen: false }),
}));
