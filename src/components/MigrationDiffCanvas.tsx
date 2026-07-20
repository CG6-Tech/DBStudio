import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Braces, Check, CircleAlert, Cog, Eye, EyeOff, LayoutDashboard, ShieldAlert, TableProperties, Zap } from "lucide-react";
import type { MigrationChange, MigrationPlan, MigrationPlanDecisions, MigrationRisk } from "../domain/migrationPlanner";
import { projectMigrationDiff, type MigrationDiffCard, type MigrationDiffLane } from "../domain/migrationDiffProjection";
import { changeNeedsBackfill, migrationRequirementForChange, type MigrationRequirement } from "../domain/migrationRequirements";
import { useUiStore } from "../state/uiStore";
import { CanvasControlToolbar } from "./CanvasToolbar";
import { CanvasMinimap, boundsForNodes } from "./canvas/CanvasMinimap";
import { useCanvasKeyboardZoom } from "./canvas/useCanvasKeyboardZoom";
import { useCanvasViewport } from "./canvas/useCanvasViewport";

interface CardPosition { x: number; y: number }

const cardWidth = 330;
const rowHeight = 34;
const maxVisibleRows = 16;
const laneOrder: MigrationDiffLane[] = ["added", "changed", "removed", "unchanged"];
const laneLabels: Record<MigrationDiffLane, string> = { added: "Added", changed: "Changed", removed: "Removed", unchanged: "Unchanged" };

function loadViewport(key: string) {
  try {
    const value = JSON.parse(localStorage.getItem(`${key}:viewport`) ?? "null") as { x?: number; y?: number; scale?: number } | null;
    if (value && Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.scale)) return { x: value.x!, y: value.y!, scale: value.scale! };
  } catch { /* Use the default viewport. */ }
  return { x: 28, y: 28, scale: 0.9 };
}

function loadPositions(key: string, fallback: Map<string, CardPosition>): Map<string, CardPosition> {
  try {
    const value = JSON.parse(localStorage.getItem(`${key}:positions`) ?? "null") as Record<string, CardPosition> | null;
    if (!value) return fallback;
    const result = new Map(fallback);
    Object.entries(value).forEach(([id, position]) => { if (result.has(id) && Number.isFinite(position.x) && Number.isFinite(position.y)) result.set(id, position); });
    return result;
  } catch { return fallback; }
}

function savePositions(key: string, positions: Map<string, CardPosition>): void {
  localStorage.setItem(`${key}:positions`, JSON.stringify(Object.fromEntries(positions)));
}

function shownRows(card: MigrationDiffCard, showUnchanged: boolean) {
  return card.rows.filter((row) => showUnchanged || row.state !== "unchanged").slice(0, maxVisibleRows);
}

function cardHeight(card: MigrationDiffCard, showUnchanged: boolean): number {
  const total = card.rows.filter((row) => showUnchanged || row.state !== "unchanged").length;
  return 68 + Math.min(total, maxVisibleRows) * rowHeight + (total > maxVisibleRows ? 24 : 0);
}

function arrange(cards: readonly MigrationDiffCard[], showUnchanged: boolean): Map<string, CardPosition> {
  const positions = new Map<string, CardPosition>();
  laneOrder.forEach((lane, laneIndex) => {
    let y = 86;
    cards.filter((card) => card.lane === lane).forEach((card) => {
      positions.set(card.id, { x: 76 + laneIndex * 390, y });
      y += cardHeight(card, showUnchanged) + 42;
    });
  });
  return positions;
}

function riskIcon(risk: MigrationRisk) {
  if (risk === "safe") return <Check size={13} />;
  if (risk === "review") return <CircleAlert size={13} />;
  return <ShieldAlert size={13} />;
}

function objectIcon(card: MigrationDiffCard) {
  if (card.objectKind === "table") return <TableProperties size={16} />;
  if (card.objectKind === "routine") return <Cog size={16} />;
  if (card.objectKind === "trigger") return <Zap size={16} />;
  return <Braces size={16} />;
}

function requirementTooltip(requirement: MigrationRequirement | undefined, change: MigrationChange | undefined, decisions: MigrationPlanDecisions): string {
  if (requirement?.kind === "approval") return `Approval required: ${requirement.detail}. Select this change and approve it in the sidebar.`;
  if (requirement?.kind === "backfill") return `Backfill required: ${requirement.detail}. Select this change and provide the SQL expression in the sidebar.`;
  if (requirement?.kind === "rename") return `Rename decision required: ${requirement.detail}. Choose Rename or Keep separate in the sidebar.`;
  if (change && changeNeedsBackfill(change) && decisions.backfills?.[change.id]?.trim()) return "Backfill supplied. This change no longer blocks export.";
  if (change?.risk === "blocked" && decisions.approvals?.[change.id]?.approved) return "Destructive change approved. This change no longer blocks export.";
  if (change?.risk === "review") return `Review recommended: ${change.reason}`;
  if (change?.risk === "blocked") return `Blocked: ${change.reason}`;
  return change ? `Safe change: ${change.reason}` : "No export action required";
}

export function MigrationDiffCanvas({ plan, decisions }: { plan: MigrationPlan; decisions: MigrationPlanDecisions }) {
  const projection = useMemo(() => projectMigrationDiff(plan), [plan]);
  const showUnchanged = useUiStore((state) => state.migrationShowUnchanged);
  const toggleUnchanged = useUiStore((state) => state.toggleMigrationUnchanged);
  const selectedChangeId = useUiStore((state) => state.migrationSelectedChangeId);
  const selectChange = useUiStore((state) => state.setMigrationSelectedChangeId);
  const minimapVisible = useUiStore((state) => state.minimapVisible);
  const toggleMinimap = useUiStore((state) => state.toggleMinimap);
  const visibleCards = useMemo(() => projection.cards.filter((card) => showUnchanged || card.lane !== "unchanged"), [projection.cards, showUnchanged]);
  const storageKey = `dbstudio:migration:${plan.fingerprint}:${showUnchanged ? "all" : "changed"}`;
  const [positions, setPositions] = useState(() => loadPositions(storageKey, arrange(visibleCards, showUnchanged)));
  const panRef = useRef<ReturnType<ReturnType<typeof useCanvasViewport>["beginPan"]> | null>(null);
  const dragRef = useRef<{ id: string; pointerId: number; startX: number; startY: number; origin: CardPosition } | null>(null);
  const { beginPan, commitViewport, hostRef, panFrom, setViewportNow, viewport, viewportRef, zoomBy } = useCanvasViewport({
    initialViewport: loadViewport(storageKey),
    onScaleChange: (scale) => useUiStore.getState().setZoom(scale),
    onViewportCommit: (next) => localStorage.setItem(`${storageKey}:viewport`, JSON.stringify(next)),
  });

  useEffect(() => {
    setPositions(loadPositions(storageKey, arrange(visibleCards, showUnchanged)));
    setViewportNow(loadViewport(storageKey));
  }, [plan.fingerprint, showUnchanged]);

  const minimapNodes = useMemo(() => visibleCards.flatMap((card) => {
    const position = positions.get(card.id);
    return position ? [{ id: card.id, className: card.state, x: position.x, y: position.y, width: cardWidth, height: cardHeight(card, showUnchanged) }] : [];
  }), [positions, showUnchanged, visibleCards]);
  const bounds = useMemo(() => boundsForNodes(minimapNodes), [minimapNodes]);

  const fit = useCallback(() => {
    const host = hostRef.current;
    if (!host || !minimapNodes.length) return;
    const rect = host.getBoundingClientRect();
    const width = Math.max(1, bounds.maxX - bounds.minX);
    const height = Math.max(1, bounds.maxY - bounds.minY);
    const scale = Math.min(1, Math.max(0.18, Math.min((rect.width - 100) / width, (rect.height - 100) / height)));
    setViewportNow({ x: (rect.width - width * scale) / 2 - bounds.minX * scale, y: (rect.height - height * scale) / 2 - bounds.minY * scale, scale }, true);
  }, [bounds, hostRef, minimapNodes.length, setViewportNow]);
  useCanvasKeyboardZoom({ zoomBy, fit });

  useEffect(() => { requestAnimationFrame(fit); }, [plan.fingerprint]);

  const centerOn = (point: { x: number; y: number }) => {
    const rect = hostRef.current?.getBoundingClientRect();
    if (!rect) return;
    setViewportNow({ ...viewportRef.current, x: rect.width / 2 - point.x * viewportRef.current.scale, y: rect.height / 2 - point.y * viewportRef.current.scale }, true);
  };

  const startCardDrag = (event: ReactPointerEvent<HTMLElement>, card: MigrationDiffCard) => {
    if ((event.target as HTMLElement).closest("button")) return;
    const origin = positions.get(card.id);
    if (!origin) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { id: card.id, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, origin };
  };
  const moveCard = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setPositions((current) => new Map(current).set(drag.id, { x: drag.origin.x + (event.clientX - drag.startX) / viewport.scale, y: drag.origin.y + (event.clientY - drag.startY) / viewport.scale }));
  };
  const stopCardDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) { dragRef.current = null; savePositions(storageKey, positions); }
  };

  const hostRect = hostRef.current?.getBoundingClientRect();
  const worldView = hostRect ? { left: (-viewport.x) / viewport.scale - 400, top: (-viewport.y) / viewport.scale - 400, right: (hostRect.width - viewport.x) / viewport.scale + 400, bottom: (hostRect.height - viewport.y) / viewport.scale + 400 } : null;
  const renderedCards = visibleCards.filter((card) => {
    if (!worldView) return true;
    const position = positions.get(card.id);
    if (!position) return false;
    const height = cardHeight(card, showUnchanged);
    return position.x + cardWidth >= worldView.left && position.x <= worldView.right && position.y + height >= worldView.top && position.y <= worldView.bottom;
  });
  const renderedIds = new Set(renderedCards.map((card) => card.id));

  return <div className="migration-diff-canvas canvas-grid" ref={hostRef}
    onPointerDown={(event) => { if ((event.target as HTMLElement).closest(".migration-diff-card,.canvas-toolbar-wrap,.minimap")) return; panRef.current = beginPan(event); }}
    onPointerMove={(event) => { if (panRef.current) panFrom(panRef.current.startViewport, panRef.current.startPointer, { x: event.clientX, y: event.clientY }); }}
    onPointerUp={() => { if (panRef.current) commitViewport(); panRef.current = null; }}
    onPointerCancel={() => { panRef.current = null; }}>
    <div className="migration-diff-scene" style={{ transform: `translate3d(${viewport.x}px,${viewport.y}px,0) scale(${viewport.scale})` }}>
      {laneOrder.filter((lane) => showUnchanged || lane !== "unchanged").map((lane, index) => <div className={`migration-lane-label ${lane}`} key={lane} style={{ left: 76 + index * 390 }}><strong>{laneLabels[lane]}</strong><span>{visibleCards.filter((card) => card.lane === lane).length}</span></div>)}
      <svg className="migration-diff-edges" aria-hidden="true">
        {projection.edges.filter((edge) => renderedIds.has(edge.sourceCardId) || renderedIds.has(edge.targetCardId)).map((edge) => {
          const source = positions.get(edge.sourceCardId);
          const target = positions.get(edge.targetCardId);
          const sourceCard = projection.cardById.get(edge.sourceCardId);
          const targetCard = projection.cardById.get(edge.targetCardId);
          if (!source || !target || !sourceCard || !targetCard) return null;
          const x1 = source.x + cardWidth;
          const y1 = source.y + cardHeight(sourceCard, showUnchanged) / 2;
          const x2 = target.x;
          const y2 = target.y + cardHeight(targetCard, showUnchanged) / 2;
          const bend = Math.max(70, Math.abs(x2 - x1) * 0.45);
          return <path key={edge.id} className={`${edge.state} ${edge.risk}${selectedChangeId === edge.changeId ? " selected" : ""}`} d={`M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`} />;
        })}
      </svg>
      {renderedCards.map((card) => {
        const position = positions.get(card.id)!;
        const rows = shownRows(card, showUnchanged);
        const totalRows = card.rows.filter((row) => showUnchanged || row.state !== "unchanged").length;
        const selected = card.changeIds.includes(selectedChangeId ?? "");
        const cardAction = card.changeIds.map((changeId) => migrationRequirementForChange(plan, decisions, changeId)).find(Boolean);
        const cardChange = card.changeIds.map((changeId) => projection.changeById.get(changeId)).find(Boolean);
        const cardTooltip = requirementTooltip(cardAction, cardChange, decisions);
        return <article key={card.id} className={`migration-diff-card ${card.state} ${card.risk}${selected ? " selected" : ""}`} style={{ left: position.x, top: position.y, width: cardWidth, height: cardHeight(card, showUnchanged) }} onDoubleClick={() => centerOn({ x: position.x + cardWidth / 2, y: position.y + cardHeight(card, showUnchanged) / 2 })}>
          <header onPointerDown={(event) => startCardDrag(event, card)} onPointerMove={moveCard} onPointerUp={stopCardDrag} onPointerCancel={stopCardDrag} onClick={() => card.changeIds[0] && selectChange(card.changeIds[0])}>
            <i>{objectIcon(card)}</i><span><strong>{card.subtitle}.{card.title}</strong><small>{card.changeIds.length} change{card.changeIds.length === 1 ? "" : "s"}</small></span><b className="migration-requirement-tooltip" data-tooltip={cardTooltip} tabIndex={0}>{riskIcon(card.risk)}</b>
          </header>
          <div className="migration-diff-rows">
            {rows.map((row) => {
              const change = row.changeId ? projection.changeById.get(row.changeId) : undefined;
              const requirement = row.changeId ? migrationRequirementForChange(plan, decisions, row.changeId) : undefined;
              return <button key={row.id} className={`${row.state}${selectedChangeId === row.changeId ? " selected" : ""}`} onClick={() => row.changeId && selectChange(row.changeId)} title={[row.before, row.after].filter(Boolean).join(" → ")}>
              <i>{row.state === "added" ? "+" : row.state === "removed" ? "−" : row.state === "modified" ? "~" : row.state === "renamed" ? "→" : ""}</i>
              <span><strong>{row.label}</strong><small>{row.state === "modified" || row.state === "renamed" ? `${row.before ?? ""} → ${row.after ?? ""}` : row.after ?? row.before}</small></span>
              {row.changeId && <b className="migration-requirement-tooltip" data-tooltip={requirementTooltip(requirement, change, decisions)} tabIndex={0}>{riskIcon(row.risk)}</b>}
            </button>})}
            {totalRows > maxVisibleRows && <p>{totalRows - maxVisibleRows} more changes</p>}
            {rows.length === 0 && <p>No row-level changes</p>}
          </div>
        </article>;
      })}
    </div>
    <CanvasControlToolbar label="Migration canvas controls" zoom={viewport.scale} onZoomOut={() => zoomBy(-0.1)} onZoomIn={() => zoomBy(0.1)} onFit={fit} actions={[
      { title: "Auto arrange", icon: <LayoutDashboard size={17} />, onClick: () => { const next = arrange(visibleCards, showUnchanged); setPositions(next); savePositions(storageKey, next); } },
      { title: showUnchanged ? "Hide unchanged" : "Show unchanged", icon: showUnchanged ? <EyeOff size={17} /> : <Eye size={17} />, onClick: toggleUnchanged, pressed: showUnchanged },
      { title: "Toggle minimap", icon: <TableProperties size={17} />, onClick: toggleMinimap, pressed: minimapVisible },
    ]} />
    {minimapVisible && <CanvasMinimap className="migration-diff-minimap" label="Migration diff minimap" nodes={minimapNodes} bounds={bounds} viewport={viewport} host={hostRef.current} onCenter={centerOn} />}
  </div>;
}
