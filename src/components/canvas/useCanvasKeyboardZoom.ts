import { useEffect } from "react";

function editableTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return Boolean(element?.isContentEditable || element?.closest("input, textarea, select"));
}

export function useCanvasKeyboardZoom({ zoomBy, fit }: { zoomBy: (delta: number) => void; fit: () => void }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (editableTarget(event.target)) return;
      if (event.key === "+" || event.key === "=") { event.preventDefault(); zoomBy(0.1); }
      else if (event.key === "-") { event.preventDefault(); zoomBy(-0.1); }
      else if (event.key === "0") { event.preventDefault(); fit(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });
}
