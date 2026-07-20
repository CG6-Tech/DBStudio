import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { panViewport, syncCanvasGrid, wheelViewport, zoomViewportAtCenter, type CanvasPoint, type CanvasViewport } from "./canvasViewport";

interface CanvasViewportControllerOptions {
  initialViewport: CanvasViewport;
  onScaleChange?: (scale: number) => void;
  onViewportCommit?: (viewport: CanvasViewport) => void;
  saveDelayMs?: number;
}

export function useCanvasViewport({ initialViewport, onScaleChange, onViewportCommit, saveDelayMs = 250 }: CanvasViewportControllerOptions) {
  const [viewport, setViewport] = useState(initialViewport);
  const hostRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef(initialViewport);
  const gridLevelRef = useRef(1);
  const saveTimerRef = useRef<number | null>(null);

  const syncViewport = useCallback((next: CanvasViewport) => {
    viewportRef.current = next;
    setViewport(next);
    onScaleChange?.(next.scale);
    gridLevelRef.current = syncCanvasGrid(hostRef.current, next, gridLevelRef.current);
  }, [onScaleChange]);

  const commitViewport = useCallback((next = viewportRef.current) => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    onViewportCommit?.(next);
  }, [onViewportCommit]);

  const scheduleViewportCommit = useCallback(() => {
    if (!onViewportCommit) return;
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      onViewportCommit(viewportRef.current);
    }, saveDelayMs);
  }, [onViewportCommit, saveDelayMs]);

  const handleWheel = useCallback((event: WheelEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const host = hostRef.current;
    if (!host) return;
    syncViewport(wheelViewport(viewportRef.current, event, host.getBoundingClientRect()));
    scheduleViewportCommit();
  }, [scheduleViewportCommit, syncViewport]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    host.addEventListener("wheel", handleWheel, { passive: false });
    return () => host.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  const panFrom = useCallback((startViewport: CanvasViewport, startPointer: CanvasPoint, currentPointer: CanvasPoint) => {
    const next = panViewport(startViewport, startPointer, currentPointer);
    syncViewport(next);
    return next;
  }, [syncViewport]);

  const zoomBy = useCallback((delta: number) => {
    const rect = hostRef.current?.getBoundingClientRect();
    const next = zoomViewportAtCenter(viewportRef.current, rect ?? { width: 0, height: 0 }, viewportRef.current.scale + delta);
    syncViewport(next);
    commitViewport(next);
    return next;
  }, [commitViewport, syncViewport]);

  const setViewportNow = useCallback((next: CanvasViewport, commit = false) => {
    syncViewport(next);
    if (commit) commitViewport(next);
    return next;
  }, [commitViewport, syncViewport]);

  const beginPan = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    return { startPointer: { x: event.clientX, y: event.clientY }, startViewport: viewportRef.current };
  }, []);

  useEffect(() => {
    syncViewport(viewportRef.current);
    return () => {
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    };
  }, [syncViewport]);

  return {
    beginPan,
    commitViewport,
    hostRef,
    panFrom,
    scheduleViewportCommit,
    setViewportNow,
    viewport,
    viewportRef,
    zoomBy,
  };
}
