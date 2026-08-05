import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowDownToLine, ArrowLeftRight, Check, ChevronDown, ChevronRight, CircleAlert, FileCode2, GitCompareArrows, Search, ShieldAlert, Upload, X } from "lucide-react";
import type { SchemaDocument } from "../domain/types";
import { type MigrationChange, type MigrationPlan, type MigrationPlanDecisions, type MigrationRisk, type MigrationStrategy } from "../domain/migrationPlanner";
import { migrationSnapshotFromDocument, type MigrationSnapshot } from "../domain/migrationSnapshot";
import { generateMigrationSql } from "../domain/migrationSql";
import { exportTextFile } from "../platform/desktop";
import { SqlText } from "./ui/SqlText";
import { Empty, Panel } from "./ui/SidebarPrimitives";
import { MigrationConnectionDialog } from "./MigrationConnectionDialog";
import { introspectDatabase, type MigrationConnectionProfile, type MigrationEnvironment } from "../domain/migrationConnections";
import { parseSchemaDocument } from "../domain/schemaParser";
import { useMigrationPlan } from "../domain/useMigrationPlan";
import { calculateVirtualTableRange, virtualTableOffset, type VirtualTableMetrics } from "../domain/virtualTableList";
import { MigrationSourceDialog } from "./MigrationSourceDialog";
import { useUiStore } from "../state/uiStore";
import { changeNeedsBackfill, migrationRequirements, type MigrationRequirement } from "../domain/migrationRequirements";
import { DraftChangeSection } from "./ai/DraftChangeSection";

export interface MigrationSource {
  id: string;
  label: string;
  snapshot: MigrationSnapshot;
  environment?: MigrationEnvironment;
  detail?: string;
}

interface Props {
  current: SchemaDocument;
  baseline: SchemaDocument;
  onChooseSource: () => Promise<MigrationSource | null>;
  onChooseFile: () => Promise<MigrationSource | null>;
  onPlanChange?: (plan: MigrationPlan | null, decisions: MigrationPlanDecisions) => void;
}

const strategyLabels: Record<MigrationStrategy, string> = {
  standard: "Standard",
  "low-lock": "Low lock",
  "expand-contract": "Expand / contract",
};

const riskLabels: Record<MigrationRisk, string> = { safe: "Safe", review: "Review", blocked: "Approval" };

function changeTitle(change: MigrationChange): string {
  return change.kind.split("-").map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");
}

function changeValueSummary(value: unknown): string {
  if (!value || typeof value !== "object") return value === undefined ? "Not present" : String(value);
  const item = value as Record<string, unknown>;
  if (typeof item.dataType === "string") return [item.name, item.dataType, item.nullable === false ? "NOT NULL" : null, item.defaultExpression ? `DEFAULT ${item.defaultExpression}` : null].filter(Boolean).join(" · ");
  if (Array.isArray(item.columns)) return `${item.name ?? "Index"} · ${item.unique ? "UNIQUE · " : ""}${item.method ?? "btree"} (${item.columns.join(", ")})`;
  if (typeof item.expression === "string") return item.expression;
  if (typeof item.sourceColumn === "string") return `${item.sourceColumn} → ${item.targetTable}.${item.targetColumn}`;
  if (typeof item.name === "string") return String(item.name);
  return "Schema object";
}

function SourceControl({ role, source, fallbackLabel, onChoose, onChooseDatabase, onReset }: { role: "Desired" | "Target"; source: MigrationSource; fallbackLabel: string; onChoose: () => void; onChooseDatabase: () => void; onReset: () => void }) {
  const external = source.id.startsWith("external:");
  return <div className="migration-source">
    <span>{role}</span>
    <strong title={source.label}>{source.label}</strong>
    <small title={source.detail}>{source.detail ?? `${source.snapshot.tables.length} tables · ${source.snapshot.dialect === "postgresql" ? "PostgreSQL" : "MySQL"}`}</small>
    <div><button onClick={onChoose}><FileCode2 size={12} /> SQL</button><button onClick={onChooseDatabase}><GitCompareArrows size={12} /> DB</button>{external && <button className="icon-only" aria-label={`Use ${fallbackLabel}`} title={`Use ${fallbackLabel}`} onClick={onReset}><X size={12} /></button>}</div>
  </div>;
}

function RiskSummary({ changes }: { changes: MigrationChange[] }) {
  const counts = changes.reduce<Record<MigrationRisk, number>>((result, change) => { result[change.risk] += 1; return result; }, { safe: 0, review: 0, blocked: 0 });
  return <div className="migration-summary">
    {(["safe", "review", "blocked"] as const).map((risk) => <div key={risk} className={risk}><strong>{counts[risk]}</strong><span>{riskLabels[risk]}</span></div>)}
  </div>;
}

function RequiredActions({ requirements, onSelect }: { requirements: MigrationRequirement[]; onSelect: (requirement: MigrationRequirement) => void }) {
  const unresolved = requirements.filter((requirement) => !requirement.resolved).length;
  if (!requirements.length) return null;
  return <section className={`migration-section migration-required-actions${unresolved ? "" : " ready"}`}>
    <header><strong>Required actions</strong><span>{unresolved ? `${unresolved} remaining` : "Ready to export"}</span></header>
    {requirements.map((requirement) => <button key={requirement.id} className={`${requirement.kind}${requirement.resolved ? " resolved" : ""}`} onClick={() => onSelect(requirement)}>
      <i>{requirement.resolved ? <Check size={13} /> : requirement.kind === "approval" ? <ShieldAlert size={13} /> : requirement.kind === "backfill" ? <FileCode2 size={13} /> : <ArrowLeftRight size={13} />}</i>
      <span><strong>{requirement.label}</strong><small>{requirement.detail}</small></span>
      <ChevronRight size={13} />
    </button>)}
  </section>;
}

export function MigrationPlannerPanel({ current, baseline, onChooseSource, onChooseFile, onPlanChange }: Props) {
  const currentSource = useMemo<MigrationSource>(() => ({ id: "current", label: "Current edits", snapshot: migrationSnapshotFromDocument(current, "current", "Current edits") }), [current]);
  const baselineSource = useMemo<MigrationSource>(() => ({ id: "baseline", label: "Original schema", snapshot: migrationSnapshotFromDocument(baseline, "baseline", "Original schema") }), [baseline]);
  const [desiredOverride, setDesiredOverride] = useState<MigrationSource | null>(null);
  const [targetOverride, setTargetOverride] = useState<MigrationSource | null>(null);
  const [swapped, setSwapped] = useState(false);
  const [strategy, setStrategy] = useState<MigrationStrategy>("standard");
  const [decisions, setDecisions] = useState<MigrationPlanDecisions>({});
  const [expandedChangeId, setExpandedChangeId] = useState<string | null>(null);
  const [sqlOpen, setSqlOpen] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [connectionRole, setConnectionRole] = useState<"desired" | "target" | null>(null);
  const [sourceDialogOpen, setSourceDialogOpen] = useState(true);
  const [planQuery, setPlanQuery] = useState("");
  const [riskFilter, setRiskFilter] = useState<"all" | MigrationRisk>("all");
  const [phaseFilter, setPhaseFilter] = useState<"all" | MigrationChange["phase"]>("all");
  const [kindFilter, setKindFilter] = useState<"all" | MigrationChange["objectKind"]>("all");
  const [changeScrollTop, setChangeScrollTop] = useState(0);
  const [changeViewportHeight, setChangeViewportHeight] = useState(360);
  const changeListRef = useRef<HTMLDivElement>(null);
  const migrationView = useUiStore((state) => state.migrationView);
  const setMigrationView = useUiStore((state) => state.setMigrationView);
  const selectedChangeId = useUiStore((state) => state.migrationSelectedChangeId);
  const setSelectedChangeId = useUiStore((state) => state.setMigrationSelectedChangeId);
  const naturalDesired = desiredOverride ?? currentSource;
  const naturalTarget = targetOverride ?? baselineSource;
  const desired = swapped ? naturalTarget : naturalDesired;
  const target = swapped ? naturalDesired : naturalTarget;
  const planResult = useMigrationPlan(desired.snapshot, target.snapshot, strategy, decisions);
  const sqlResult = useMemo(() => planResult.plan ? generateMigrationSql(planResult.plan, decisions) : null, [decisions, planResult.plan]);
  const migrationChanges = useMemo(() => {
    const normalized = planQuery.trim().toLocaleLowerCase("en");
    return (planResult.plan?.changes ?? []).filter((change) =>
      (riskFilter === "all" || change.risk === riskFilter)
      && (phaseFilter === "all" || change.phase === phaseFilter)
      && (kindFilter === "all" || change.objectKind === kindFilter)
      && (!normalized || `${change.kind} ${change.objectKind} ${change.objectKey} ${change.reason}`.toLocaleLowerCase("en").includes(normalized)));
  }, [kindFilter, phaseFilter, planQuery, planResult.plan, riskFilter]);
  const expandedChangeIndex = expandedChangeId ? migrationChanges.findIndex((change) => change.id === expandedChangeId) : -1;
  const changeMetrics: VirtualTableMetrics = { count: migrationChanges.length, rowHeight: 48, expandedIndex: expandedChangeIndex, expandedExtraHeight: 150 };
  const changeRange = calculateVirtualTableRange(changeMetrics, changeScrollTop, changeViewportHeight, 192);
  const selectedChange = planResult.plan?.changes.find((change) => change.id === selectedChangeId) ?? null;
  const planDialect = planResult.plan?.desired.dialect ?? "postgresql";
  const siblingTable = (change: MigrationChange) => planResult.plan?.desired.tables.find((table) => table.key === change.tableKey);
  const requirements = useMemo(() => planResult.plan ? migrationRequirements(planResult.plan, decisions) : [], [decisions, planResult.plan]);
  const unresolvedRequirements = requirements.filter((requirement) => !requirement.resolved);
  const selectedSql = useMemo(() => {
    if (!selectedChange || !planResult.plan) return "";
    const result = generateMigrationSql({ ...planResult.plan, changes: [selectedChange] }, decisions);
    return result.blockedChangeIds.includes(selectedChange.id) ? "" : result.sql;
  }, [decisions, planResult.plan, selectedChange]);

  useEffect(() => { onPlanChange?.(planResult.plan ?? null, decisions); }, [decisions, onPlanChange, planResult.plan]);

  useLayoutEffect(() => {
    const list = changeListRef.current;
    if (!list) return;
    const update = () => setChangeViewportHeight(list.clientHeight || 360);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(list);
    return () => observer.disconnect();
  }, [planResult.plan?.fingerprint]);

  useEffect(() => {
    setDecisions({});
    setExpandedChangeId(null);
    setSelectedChangeId(null);
  }, [desired.id, target.id]);

  useEffect(() => {
    setChangeScrollTop(0);
    if (changeListRef.current) changeListRef.current.scrollTop = 0;
  }, [kindFilter, phaseFilter, planQuery, riskFilter]);

  const choose = async (role: "desired" | "target") => {
    try {
      const selected = await onChooseFile();
      if (!selected) return;
      const external = { ...selected, id: `external:${selected.id}` };
      if (role === "desired") setDesiredOverride(external); else setTargetOverride(external);
      setSourceError(null);
    } catch (error) {
      setSourceError(error instanceof Error ? error.message : String(error));
    }
  };
  const chooseDatabase = async (profile: MigrationConnectionProfile, password?: string) => {
    if (!connectionRole) return;
    const result = await introspectDatabase(profile, password);
    const snapshot = migrationSnapshotFromDocument(parseSchemaDocument(result.source, result.dialect), `db:${profile.id}`, result.sourceLabel, result.engineVersion);
    const source: MigrationSource = { id: `external:db:${profile.id}:${snapshot.fingerprint}`, label: profile.name, snapshot, environment: profile.environment, detail: `${profile.environment} · ${profile.host}/${profile.database} · ${result.engineVersion}` };
    if (connectionRole === "desired") setDesiredOverride(source); else setTargetOverride(source);
    setConnectionRole(null);
    setSourceError(null);
  };

  const decideRename = (id: string, value: "accepted" | "rejected") => setDecisions((currentValue) => ({ ...currentValue, renames: { ...currentValue.renames, [id]: value } }));
  const approve = (id: string, approved: boolean) => setDecisions((currentValue) => ({ ...currentValue, approvals: { ...currentValue.approvals, [id]: { approved } } }));
  const setBackfill = (id: string, value: string) => setDecisions((currentValue) => ({ ...currentValue, backfills: { ...currentValue.backfills, [id]: value } }));
  const exportSql = async () => { if (sqlResult?.exportable) await exportTextFile(sqlResult.sql, "dbstudio-migration.sql", "sql"); };
  const exportPlan = async () => {
    if (!planResult.plan || !sqlResult?.exportable) return;
    const artifact = { format: "dbstudio-migration-plan", version: 1, createdAt: new Date().toISOString(), plan: planResult.plan, decisions, sqlFingerprint: planResult.plan.fingerprint };
    await exportTextFile(`${JSON.stringify(artifact, null, 2)}\n`, "dbstudio-migration-plan.json", "json");
  };
  const compareSources = (oldSource: MigrationSource, newSource: MigrationSource) => {
    setTargetOverride(oldSource.id === "baseline" ? null : oldSource);
    setDesiredOverride(newSource.id === "current" ? null : newSource);
    setSwapped(false);
    setSourceDialogOpen(false);
  };
  const selectRequirement = (requirement: MigrationRequirement) => {
    if (requirement.changeId) {
      setSelectedChangeId(requirement.changeId);
      setMigrationView("canvas");
      return;
    }
    if (requirement.suggestionId) document.getElementById(`migration-${requirement.suggestionId}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  };

  return <Panel title="Migration planner" icon={<GitCompareArrows size={17} />}>
    <div className="migration-direction">
      <SourceControl role="Desired" source={desired} fallbackLabel="current edits" onChoose={() => void choose(swapped ? "target" : "desired")} onChooseDatabase={() => setConnectionRole(swapped ? "target" : "desired")} onReset={() => swapped ? setTargetOverride(null) : setDesiredOverride(null)} />
      <button className="migration-swap" aria-label="Swap desired and target" title="Swap direction" onClick={() => setSwapped((value) => !value)}><ArrowLeftRight size={15} /></button>
      <SourceControl role="Target" source={target} fallbackLabel="original schema" onChoose={() => void choose(swapped ? "desired" : "target")} onChooseDatabase={() => setConnectionRole(swapped ? "desired" : "target")} onReset={() => swapped ? setDesiredOverride(null) : setTargetOverride(null)} />
    </div>
    <button className="migration-compare-sources" onClick={() => setSourceDialogOpen(true)}><GitCompareArrows size={13} /> Compare schemas</button>
    {target.environment === "production" && <div className="migration-production-target"><ShieldAlert size={13} /><span>Production target: review every generated step carefully. DBStudio will not execute this plan.</span></div>}
    {(sourceError || planResult.error) && <div className="migration-error"><CircleAlert size={13} />{sourceError ?? planResult.error}</div>}
    {planResult.pending && <div className="migration-planning"><span />Comparing schemas…</div>}
    <div className="migration-strategy-label"><span>Strategy</span><small>SQL generation mode</small></div>
    <div className="segmented migration-strategies">
      {(Object.keys(strategyLabels) as MigrationStrategy[]).map((item) => <button key={item} className={strategy === item ? "active" : ""} onClick={() => setStrategy(item)}>{strategyLabels[item]}</button>)}
    </div>
    {planResult.plan && <>
      <div className="segmented migration-view-switch"><button className={migrationView === "canvas" ? "active" : ""} onClick={() => setMigrationView("canvas")}>Canvas</button><button className={migrationView === "list" ? "active" : ""} onClick={() => setMigrationView("list")}>List</button></div>
      <RiskSummary changes={planResult.plan.changes} />
      <RequiredActions requirements={requirements} onSelect={selectRequirement} />
      {planResult.plan.renameSuggestions.length > 0 && <section className="migration-section">
        <header><strong>Rename candidates</strong><span>{planResult.plan.unresolvedRenameIds.length} unresolved</span></header>
        {planResult.plan.renameSuggestions.map((suggestion) => <div className="rename-candidate" id={`migration-${suggestion.id}`} key={suggestion.id}>
          <div><strong>{suggestion.targetKey}</strong><ArrowDownToLine size={11} /><strong>{suggestion.desiredKey}</strong><small>{Math.round(suggestion.score * 100)}% match</small></div>
          <div><button className={decisions.renames?.[suggestion.id] === "accepted" ? "accept selected" : "accept"} onClick={() => decideRename(suggestion.id, "accepted")}><Check size={12} /> Rename</button><button className={decisions.renames?.[suggestion.id] === "rejected" ? "reject selected" : "reject"} onClick={() => decideRename(suggestion.id, "rejected")}><X size={12} /> Separate</button></div>
        </div>)}
      </section>}
      {migrationView === "list" && <section className="migration-section migration-change-section">
        <header><strong>Plan</strong><span>{migrationChanges.length === planResult.plan.changes.length ? `${migrationChanges.length} changes` : `${migrationChanges.length} of ${planResult.plan.changes.length}`}</span></header>
        {planResult.plan.changes.length > 0 && <div className="migration-plan-filters">
          <label><Search size={12} /><input value={planQuery} onChange={(event) => setPlanQuery(event.target.value)} placeholder="Filter changes" /></label>
          <div><select aria-label="Risk filter" value={riskFilter} onChange={(event) => setRiskFilter(event.target.value as typeof riskFilter)}><option value="all">All risks</option><option value="safe">Safe</option><option value="review">Review</option><option value="blocked">Approval</option></select><select aria-label="Phase filter" value={phaseFilter} onChange={(event) => setPhaseFilter(event.target.value as typeof phaseFilter)}><option value="all">All phases</option><option value="expand">Expand</option><option value="migrate">Migrate</option><option value="contract">Contract</option></select><select aria-label="Object filter" value={kindFilter} onChange={(event) => setKindFilter(event.target.value as typeof kindFilter)}><option value="all">All objects</option>{["table", "column", "index", "foreign-key", "check", "type", "routine", "trigger"].map((kind) => <option key={kind} value={kind}>{kind}</option>)}</select></div>
        </div>}
        {planResult.plan.changes.length === 0 ? <Empty icon={<Check size={21} />} title="Schemas match" text="No structural migration is required." /> : migrationChanges.length === 0 ? <div className="migration-no-results">No changes match these filters.</div> : <div className="migration-change-list" ref={changeListRef} onScroll={(event) => setChangeScrollTop(event.currentTarget.scrollTop)}>
          <div className="migration-change-spacer" style={{ height: changeRange.totalHeight }}>
          {migrationChanges.slice(changeRange.start, changeRange.end).map((change, visibleIndex) => {
            const changeIndex = changeRange.start + visibleIndex;
            const expanded = expandedChangeId === change.id;
            const needsBackfill = changeNeedsBackfill(change);
            return <article className={`migration-change ${change.risk}${selectedChangeId === change.id ? " selected" : ""}`} key={change.id} style={{ top: virtualTableOffset(changeIndex, changeMetrics), height: 48 + (expanded ? 150 : 0) }}>
              <button className="migration-change-main" onClick={() => { setSelectedChangeId(change.id); setExpandedChangeId(expanded ? null : change.id); }}>
                {change.risk === "safe" ? <Check size={13} /> : change.risk === "review" ? <AlertTriangle size={13} /> : <ShieldAlert size={13} />}
                <span><strong>{changeTitle(change)}</strong><small title={change.objectKey}>{change.objectKey}</small></span>
                {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              </button>
              {expanded && <div className="migration-change-details">
                <p>{change.reason}</p>
                <div><span>Phase</span><b>{change.phase}</b></div>
                {needsBackfill && <><label><span>Backfill expression</span><input value={decisions.backfills?.[change.id] ?? ""} placeholder="SQL expression" onChange={(event) => setBackfill(change.id, event.target.value)} /></label><DraftChangeSection change={change} dialect={planDialect} table={siblingTable(change)} mode="backfill" onAccept={(expr) => setBackfill(change.id, expr)} /></>}
                {change.risk === "blocked" && !needsBackfill && <><label className="migration-approval"><input type="checkbox" checked={Boolean(decisions.approvals?.[change.id]?.approved)} onChange={(event) => approve(change.id, event.target.checked)} /><span>I approve this destructive change</span></label><DraftChangeSection change={change} dialect={planDialect} mode="blocked" /></>}
              </div>}
            </article>;
          })}
          </div>
        </div>}
      </section>}
      {migrationView === "canvas" && <section className="migration-section migration-inspector-section">
        <header><strong>Selected change</strong><span>{selectedChange ? changeTitle(selectedChange) : "Canvas"}</span></header>
        {selectedChange ? <div className={`migration-selected-change ${selectedChange.risk}`}>
          <strong title={selectedChange.objectKey}>{selectedChange.objectKey}</strong>
          <p>{selectedChange.reason}</p>
          <div className="migration-before-after"><span><small>Old</small><b title={changeValueSummary(selectedChange.before)}>{changeValueSummary(selectedChange.before)}</b></span><ArrowDownToLine size={12} /><span><small>New</small><b title={changeValueSummary(selectedChange.after)}>{changeValueSummary(selectedChange.after)}</b></span></div>
          <dl><div><dt>Phase</dt><dd>{selectedChange.phase}</dd></div><div><dt>Risk</dt><dd>{riskLabels[selectedChange.risk]}</dd></div><div><dt>Reversible</dt><dd>{selectedChange.reversible ? "Yes" : "No"}</dd></div></dl>
          {changeNeedsBackfill(selectedChange) && <><label><span>Backfill expression</span><input value={decisions.backfills?.[selectedChange.id] ?? ""} placeholder="SQL expression for existing rows" onChange={(event) => setBackfill(selectedChange.id, event.target.value)} /></label><DraftChangeSection change={selectedChange} dialect={planDialect} table={siblingTable(selectedChange)} mode="backfill" onAccept={(expr) => setBackfill(selectedChange.id, expr)} /></>}
          {selectedChange.risk === "blocked" && !changeNeedsBackfill(selectedChange) && <><label className="migration-approval"><input type="checkbox" checked={Boolean(decisions.approvals?.[selectedChange.id]?.approved)} onChange={(event) => approve(selectedChange.id, event.target.checked)} /><span>I approve this destructive change</span></label><DraftChangeSection change={selectedChange} dialect={planDialect} mode="blocked" /></>}
          {selectedSql && <details><summary>SQL statement</summary><SqlText sql={selectedSql} className="migration-selected-sql" maxHeight={180} /></details>}
        </div> : <div className="migration-canvas-hint">Select a changed row on the canvas to inspect its old and new values.</div>}
      </section>}
      <section className="migration-section migration-sql-section">
        <button className="migration-sql-toggle" onClick={() => setSqlOpen((value) => !value)}>{sqlOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}<span>Generated SQL</span><small>{strategyLabels[strategy]}</small></button>
        {sqlOpen && sqlResult && <SqlText sql={sqlResult.sql} className="migration-sql" maxHeight={280} />}
      </section>
      {sqlResult && !sqlResult.exportable && <div className="migration-export-warning"><ShieldAlert size={13} /><span>{unresolvedRequirements.length ? `Complete ${unresolvedRequirements.length} required action${unresolvedRequirements.length === 1 ? "" : "s"} before export.` : "The plan still contains an unsupported blocking change."}</span></div>}
      <div className="migration-actions"><button disabled={!sqlResult?.exportable} onClick={() => void exportSql()}><Upload size={13} /> SQL</button><button disabled={!sqlResult?.exportable} onClick={() => void exportPlan()}><Upload size={13} /> Plan JSON</button></div>
    </>}
    {connectionRole && <MigrationConnectionDialog onClose={() => setConnectionRole(null)} onSelect={chooseDatabase} />}
    {sourceDialogOpen && <MigrationSourceDialog oldSource={target} newSource={desired} onChooseFile={onChooseFile} onChooseFolder={onChooseSource} onCompare={compareSources} onClose={() => setSourceDialogOpen(false)} />}
  </Panel>;
}
