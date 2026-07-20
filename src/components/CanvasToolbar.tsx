import { useEffect, useMemo, useRef, useState } from "react";
import type * as React from "react";
import { Focus, Grid3X3, LayoutDashboard, Map, Maximize, MessageCircle, Minus, Plus, Search } from "lucide-react";
import { searchCanvas } from "../domain/canvasSearch";
import type { SchemaDocument } from "../domain/types";
import { useUiStore } from "../state/uiStore";

interface CanvasControlAction {
  title: string;
  icon: React.ReactNode;
  onClick: () => void;
  pressed?: boolean;
  disabled?: boolean;
}

function isEditable(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return Boolean(element?.isContentEditable || element?.closest("input, textarea, select"));
}

export function CanvasControlToolbar({ label, zoom, onZoomOut, onZoomIn, onFit, actions = [] }: { label: string; zoom: number; onZoomOut: () => void; onZoomIn: () => void; onFit: () => void; actions?: CanvasControlAction[] }) {
  return <div className="canvas-toolbar-wrap"><div className="canvas-toolbar" aria-label={label}>
    <button title="Zoom out (-)" onClick={onZoomOut}><Minus size={17} /></button>
    <strong>{Math.round(zoom * 100)}%</strong>
    <button title="Zoom in (+)" onClick={onZoomIn}><Plus size={17} /></button>
    <span />
    <button title="Fit workspace (0)" onClick={onFit}><Maximize size={17} /></button>
    {actions.map((action) => <button key={action.title} title={action.title} onClick={action.onClick} aria-pressed={action.pressed} disabled={action.disabled}>{action.icon}</button>)}
  </div></div>;
}

export function CanvasToolbar({ document }: { document: SchemaDocument }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const zoom = useUiStore((state) => state.zoom);
  const selection = useUiStore((state) => state.selection);
  const searchOpen = useUiStore((state) => state.searchOpen);
  const snapToGrid = useUiStore((state) => state.snapToGrid);
  const minimapVisible = useUiStore((state) => state.minimapVisible);
  const tableCommentsVisible = useUiStore((state) => state.tableCommentsVisible);
  const setSelection = useUiStore((state) => state.setSelection);
  const setSearchOpen = useUiStore((state) => state.setSearchOpen);
  const requestFit = useUiStore((state) => state.requestFit);
  const requestFocus = useUiStore((state) => state.requestFocus);
  const requestZoomIn = useUiStore((state) => state.requestZoomIn);
  const requestZoomOut = useUiStore((state) => state.requestZoomOut);
  const requestAutoLayout = useUiStore((state) => state.requestAutoLayout);
  const toggleSnapToGrid = useUiStore((state) => state.toggleSnapToGrid);
  const toggleMinimap = useUiStore((state) => state.toggleMinimap);
  const toggleTableComments = useUiStore((state) => state.toggleTableComments);
  const results = useMemo(() => searchCanvas(document, query), [document, query]);
  const focusableSelection = selection?.kind === "table" || selection?.kind === "column";

  useEffect(() => {
    if (searchOpen) requestAnimationFrame(() => inputRef.current?.focus());
  }, [searchOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setSearchOpen(true);
        return;
      }
      if (isEditable(event.target)) return;
      if (event.key === "+" || event.key === "=") { event.preventDefault(); requestZoomIn(); }
      else if (event.key === "-") { event.preventDefault(); requestZoomOut(); }
      else if (event.key === "0") { event.preventDefault(); requestFit(); }
      else if (event.key.toLowerCase() === "f" && focusableSelection) { event.preventDefault(); requestFocus(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focusableSelection, requestFit, requestFocus, requestZoomIn, requestZoomOut, setSearchOpen]);

  const choose = (index: number) => {
    const result = results[index];
    if (!result) return;
    setSelection(result.selection);
    setSearchOpen(false);
    requestFocus();
  };

  return (
    <div className="canvas-toolbar-wrap">
      {searchOpen && <div className="canvas-search" role="search">
        <div><Search size={16} /><input ref={inputRef} value={query} placeholder="Find table or column…" onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }} onKeyDown={(event) => {
          if (event.key === "Escape") setSearchOpen(false);
          else if (event.key === "ArrowDown") { event.preventDefault(); setActiveIndex((current) => Math.min(results.length - 1, current + 1)); }
          else if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((current) => Math.max(0, current - 1)); }
          else if (event.key === "Enter") { event.preventDefault(); choose(activeIndex); }
        }} /></div>
        {query && <div className="canvas-search-results">
          {results.map((result, index) => <button key={result.key} className={index === activeIndex ? "active" : ""} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(index)}>
            <strong>{result.columnName ?? result.tableName}</strong><small>{result.columnName ? result.tableName : "Table"}</small>
          </button>)}
          {results.length === 0 && <p>No tables or columns found</p>}
        </div>}
      </div>}
      <div className="canvas-toolbar" aria-label="Canvas controls">
      <button title="Search (⌘F)" onClick={() => setSearchOpen(!searchOpen)} aria-pressed={searchOpen}><Search size={17} /></button>
      <span />
      <button title="Zoom out (-)" onClick={requestZoomOut}><Minus size={17} /></button>
      <strong>{Math.round(zoom * 100)}%</strong>
      <button title="Zoom in (+)" onClick={requestZoomIn}><Plus size={17} /></button>
      <span />
      <button title="Fit workspace (0)" onClick={requestFit}><Maximize size={17} /></button>
      <button title="Focus selection (F)" onClick={requestFocus} disabled={!focusableSelection}><Focus size={17} /></button>
      <button title="Auto layout" onClick={requestAutoLayout}><LayoutDashboard size={17} /></button>
      <button title="Snap to grid" onClick={toggleSnapToGrid} aria-pressed={snapToGrid}><Grid3X3 size={17} /></button>
      <button title="Toggle table comments" onClick={toggleTableComments} aria-pressed={tableCommentsVisible} disabled={!document.tables.some((table) => table.comment?.trim())}><MessageCircle size={17} /></button>
      <button title="Toggle minimap" onClick={toggleMinimap} aria-pressed={minimapVisible}><Map size={17} /></button>
      </div>
    </div>
  );
}
