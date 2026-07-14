import { Focus, Grid3X3, LayoutDashboard, Map, Maximize, Minus, Plus, Search } from "lucide-react";

export function CanvasToolbar({ onFit }: { onFit: () => void }) {
  return (
    <div className="canvas-toolbar" aria-label="Canvas controls">
      <button title="Search"><Search size={17} /></button>
      <span />
      <button title="Zoom out"><Minus size={17} /></button>
      <strong>100%</strong>
      <button title="Zoom in"><Plus size={17} /></button>
      <span />
      <button title="Fit workspace" onClick={onFit}><Maximize size={17} /></button>
      <button title="Focus selection"><Focus size={17} /></button>
      <button title="Auto layout"><LayoutDashboard size={17} /></button>
      <button title="Snap to grid"><Grid3X3 size={17} /></button>
      <button title="Toggle minimap"><Map size={17} /></button>
    </div>
  );
}
