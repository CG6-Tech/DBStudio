import { useEffect, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  Blocks,
  Check,
  ChevronRight,
  CircleDot,
  Code2,
  Database,
  Download,
  FileCode2,
  Files,
  FolderOpen,
  GitBranch,
  GitFork,
  KeyRound,
  Laptop,
  LayoutDashboard,
  LockKeyhole,
  Menu,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  Split,
  Table2,
  TerminalSquare,
  Undo2,
  Workflow,
  X,
} from "lucide-react";
import { BrandLogo } from "../components/BrandLogo";
import "./marketing.css";

const SITE_LINKS = {
  download: "#download",
  github: "",
  releases: "#download",
  documentation: "#faq",
  privacy: "#security",
  feedback: "mailto:feedback@dbstudio.dev",
};

const features = [
  [Database, "PostgreSQL + MySQL", "Work across both supported SQL dialects."],
  [FolderOpen, "Whole workspaces", "Open one SQL file or a complete schema folder."],
  [GitBranch, "Visual relationships", "See foreign keys and cardinality at a glance."],
  [Table2, "Schema editing", "Shape tables, fields, keys, and constraints."],
  [Workflow, "Routine flows", "Trace triggers, conditions, reads, and writes."],
  [LayoutDashboard, "Canvas organization", "Use areas, notes, and deliberate layouts."],
  [Undo2, "Undo and redo", "Explore structural edits without losing your place."],
  [Sparkles, "Automatic layout", "Arrange large schemas, then refine them manually."],
  [Code2, "SQL preview", "Review the generated SQL before anything is saved."],
  [Files, "Portable workspace data", "Move layout metadata without replacing SQL."],
  [Save, "Guarded local saves", "Validate and protect source-aware file changes."],
  [Split, "Migration export", "Export ordered SQL and a reviewable plan report."],
] as const;

const faqs = [
  [
    "Does DBStudio connect directly to my production database?",
    "The beta is centered on local SQL files and workspaces. Migration planning compares schema sources and exports a plan; it does not silently connect to or modify production.",
  ],
  [
    "Does DBStudio replace my SQL files?",
    "No proprietary model replaces your project. SQL remains the source of truth, while portable workspace data stores visual organization such as positions, areas, and notes.",
  ],
  ["Which databases are supported?", "The current beta supports PostgreSQL and MySQL schema workflows."],
  [
    "Can I use DBStudio without an account?",
    "Yes. Core local editing, preview, migration planning, import, export, and saving are available without signing in.",
  ],
  [
    "Does DBStudio execute migrations automatically?",
    "No. DBStudio helps you compare, review, resolve, and export migration SQL. You remain responsible for reviewing and applying it through your normal deployment process.",
  ],
  ["Which operating systems are supported?", "The cross-platform beta is planned for macOS, Windows, and Linux."],
] as const;

function ActionLink({ href, className, children }: { href: string; className: string; children: ReactNode }) {
  if (!href) {
    return <span className={`${className} is-disabled`} aria-disabled="true" title="Repository link coming with the beta release">{children}</span>;
  }
  return <a href={href} className={className}>{children}</a>;
}

function Status({ kind, children }: { kind: "safe" | "review" | "blocked" | "logic"; children: ReactNode }) {
  const icon = kind === "safe" ? <Check size={11} /> : kind === "blocked" ? <AlertTriangle size={11} /> : <CircleDot size={11} />;
  return <span className={`mk-status ${kind}`}>{icon}{children}</span>;
}

function MiniSchema() {
  return (
    <div className="mini-schema" aria-label="Schema diagram showing users, orders, and products tables">
      <div className="mini-grid" />
      <span className="schema-line line-a" />
      <span className="schema-line line-b" />
      <article className="schema-table users">
        <header><Table2 size={12} /><strong>users</strong><span>4</span></header>
        <p><KeyRound size={9} />id <em>bigint</em></p>
        <p>email <em>text</em></p>
        <p>created_at <em>timestamp</em></p>
      </article>
      <article className="schema-table orders">
        <header><Table2 size={12} /><strong>orders</strong><span>7</span></header>
        <p><KeyRound size={9} />id <em>bigint</em></p>
        <p>user_id <em>bigint</em></p>
        <p>status <em>text</em></p>
      </article>
      <article className="schema-table products">
        <header><Table2 size={12} /><strong>products</strong><span>5</span></header>
        <p><KeyRound size={9} />id <em>bigint</em></p>
        <p>sku <em>varchar</em></p>
        <p>price <em>numeric</em></p>
      </article>
    </div>
  );
}

function LogicFlow() {
  return (
    <div className="logic-flow" aria-label="Database routine flow from trigger to validation and insert">
      <div className="mk-logic-node trigger"><span><Sparkles size={13} /></span><div><small>TRIGGER</small><strong>orders_before_insert</strong></div></div>
      <span className="flow-arrow first"><ArrowDown size={13} /></span>
      <div className="mk-logic-node condition"><span><GitBranch size={13} /></span><div><small>CONDITION</small><strong>NEW.total &gt; 0</strong></div></div>
      <span className="flow-arrow second"><ArrowDown size={13} /></span>
      <div className="mk-logic-node write"><span><Database size={13} /></span><div><small>INSERT</small><strong>audit_log</strong></div></div>
      <div className="logic-chips"><Status kind="logic">CALLS 1</Status><Status kind="safe">WRITES 1</Status></div>
    </div>
  );
}

function MiniMigration() {
  return (
    <div className="mini-migration" aria-label="Migration plan with safe, review, and blocked changes">
      <div className="migration-topline"><span>DESIRED</span><ArrowRight size={13} /><span>TARGET</span></div>
      <div className="migration-counts">
        <div><strong>12</strong><Status kind="safe">Safe</Status></div>
        <div><strong>3</strong><Status kind="review">Review</Status></div>
        <div><strong>1</strong><Status kind="blocked">Blocked</Status></div>
      </div>
      <div className="migration-rows">
        <p><Status kind="safe">SAFE</Status><span>Add index</span><code>orders.created_at</code></p>
        <p><Status kind="review">REVIEW</Status><span>Alter type</span><code>users.status</code></p>
        <p><Status kind="blocked">BLOCKED</Status><span>Drop column</span><code>orders.legacy_id</code></p>
      </div>
    </div>
  );
}

function MigrationWorkspace() {
  return (
    <div className="migration-workspace" aria-label="DBStudio migration planning interface">
      <aside>
        <div className="migration-brand"><BrandLogo /><span>Migration plan</span></div>
        <div className="source-pair">
          <div><small>DESIRED</small><strong>schema-v2</strong><span>PostgreSQL · 42 tables</span></div>
          <button aria-label="Swap desired and target"><RefreshCw size={13} /></button>
          <div><small>TARGET</small><strong>production</strong><span>PostgreSQL · 41 tables</span></div>
        </div>
        <label className="strategy-label">STRATEGY <span>Low-lock</span></label>
        <div className="strategy-tabs"><span>Standard</span><strong>Low-lock</strong><span>Expand / contract</span></div>
        <div className="plan-summary">
          <div><b>12</b><Status kind="safe">Safe</Status></div>
          <div><b>3</b><Status kind="review">Review</Status></div>
          <div><b>1</b><Status kind="blocked">Blocked</Status></div>
        </div>
        <div className="required-action"><AlertTriangle size={14} /><span><strong>1 decision required</strong><small>Resolve before export</small></span><ChevronRight size={14} /></div>
      </aside>
      <section className="plan-board">
        <header><div><small>PHASE 02</small><strong>Constraints and indexes</strong></div><span>4 steps</span></header>
        <div className="plan-step selected"><Status kind="review">REVIEW</Status><div><strong>Alter users.status type</strong><code>varchar(16) → user_status</code></div><span>02.1</span></div>
        <div className="plan-step"><Status kind="safe">SAFE</Status><div><strong>Create index</strong><code>idx_orders_created_at</code></div><span>02.2</span></div>
        <div className="plan-step"><Status kind="safe">SAFE</Status><div><strong>Validate constraint</strong><code>orders_total_positive</code></div><span>02.3</span></div>
        <div className="plan-step blocked"><Status kind="blocked">BLOCKED</Status><div><strong>Drop legacy column</strong><code>orders.legacy_id</code></div><span>02.4</span></div>
      </section>
      <aside className="sql-review">
        <div className="sql-review-head"><span>SQL PREVIEW</span><Status kind="review">Review</Status></div>
        <pre><span>ALTER TYPE</span> user_status{`\n`}  <span>ADD VALUE</span> <b>'paused'</b>;{`\n\n`}<span>ALTER TABLE</span> users{`\n`}  <span>ALTER COLUMN</span> status{`\n`}  <span>TYPE</span> user_status{`\n`}  <span>USING</span> status::user_status;</pre>
        <div className="sql-note"><ShieldCheck size={15} /><span><strong>Review required</strong><small>Type conversion may lock this table.</small></span></div>
        <button disabled><Download size={13} /> Resolve 1 decision to export</button>
      </aside>
    </div>
  );
}

export function MarketingPage() {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    document.title = "DBStudio — See your database. Shape it safely.";
    document.documentElement.classList.add("marketing-document");
    return () => document.documentElement.classList.remove("marketing-document");
  }, []);

  return (
    <div className="marketing-page">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="marketing-nav">
        <a className="marketing-brand" href="#top" aria-label="DBStudio home"><BrandLogo /><strong>DBStudio</strong><span>Beta</span></a>
        <button className="mobile-menu" aria-label={menuOpen ? "Close navigation" : "Open navigation"} aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>{menuOpen ? <X /> : <Menu />}</button>
        <nav className={menuOpen ? "nav-links open" : "nav-links"} aria-label="Main navigation">
          <a href="#features" onClick={() => setMenuOpen(false)}>Features</a>
          <a href="#migrations" onClick={() => setMenuOpen(false)}>Migrations</a>
          <a href="#security" onClick={() => setMenuOpen(false)}>Security</a>
          <ActionLink href={SITE_LINKS.github} className="nav-github"><GitFork size={15} /> GitHub</ActionLink>
          <a href={SITE_LINKS.download} className="nav-download" onClick={() => setMenuOpen(false)}>Download Beta <ArrowDown size={14} /></a>
        </nav>
      </header>

      <main id="main-content">
        <section className="hero" id="top">
          <div className="hero-glow" aria-hidden="true" />
          <div className="hero-copy reveal">
            <span className="eyebrow"><span /> Local-first database tooling</span>
            <h1><span>See your database.</span><em>Shape it safely.</em></h1>
            <p>Explore schemas visually, understand the logic behind them, and plan safer migrations—without giving up control of your SQL.</p>
            <div className="hero-actions">
              <a href={SITE_LINKS.download} className="button primary"><Download size={17} /> Download Beta</a>
              <ActionLink href={SITE_LINKS.github} className="button secondary"><GitFork size={17} /> View on GitHub</ActionLink>
            </div>
            <div className="platform-note"><Laptop size={15} /><span>Available for macOS, Windows, and Linux</span></div>
          </div>
          <div className="hero-product reveal delay-one">
            <div className="product-window">
              <div className="window-bar"><div><i /><i /><i /></div><span>DBStudio · commerce-schema</span><b>PostgreSQL</b></div>
              <img src="/dbstudio-app.png" alt="DBStudio showing a PostgreSQL schema with connected tables on a visual canvas" />
            </div>
            <div className="floating-tag tag-local"><ShieldCheck size={13} /> Local-first</div>
            <div className="floating-tag tag-source"><FileCode2 size={13} /> Source-preserving</div>
            <div className="floating-panel"><span>Migration reviewed</span><strong><Check size={14} /> 12 safe changes</strong></div>
          </div>
          <a href="#features" className="scroll-cue" aria-label="Explore DBStudio features"><span>Explore the workspace</span><ArrowDown size={14} /></a>
        </section>

        <section className="compatibility" aria-label="Compatibility">
          <p>Built for the stack you already use</p>
          <div><span><Database /> PostgreSQL</span><span><Database /> MySQL</span><span><Laptop /> macOS</span><span><Laptop /> Windows</span><span><TerminalSquare /> Linux</span><span><LockKeyhole /> Local-first</span></div>
        </section>

        <section className="section capabilities" id="features">
          <div className="section-heading">
            <span className="eyebrow">One workspace, three perspectives</span>
            <h2>From schema structure<br />to migration strategy.</h2>
            <p>Move between the views developers need without translating your database into somebody else’s abstraction.</p>
          </div>
          <div className="capability-grid">
            <article className="capability-card schema-card">
              <div className="card-copy"><span>01 · STRUCTURE</span><h3>Design the schema you can actually ship.</h3><p>Open SQL files or complete workspaces, inspect relationships on a fast visual canvas, and edit the structure with SQL still at the center.</p></div>
              <MiniSchema />
            </article>
            <article className="capability-card logic-card">
              <div className="card-copy"><span>02 · LOGIC</span><h3>Understand what the database does.</h3><p>Trace routines, triggers, reads, writes, conditions, and return paths through focused logic and flow views.</p></div>
              <LogicFlow />
            </article>
            <article className="capability-card migration-card">
              <div className="card-copy"><span>03 · CHANGE</span><h3>Turn differences into an explainable plan.</h3><p>Review dependency-aware steps, resolve possible renames, and export SQL only when required decisions are complete.</p></div>
              <MiniMigration />
            </article>
          </div>
        </section>

        <section className="section source-workflow">
          <div className="workflow-copy">
            <span className="eyebrow">Source-preserving workflow</span>
            <h2>Your SQL remains<br />the source of truth.</h2>
            <p>DBStudio is built around your existing schema files—not a proprietary cloud model.</p>
            <ol>
              <li><span>01</span><div><strong>Open your workspace</strong><p>Load a SQL file or a folder containing a complete schema.</p></div></li>
              <li><span>02</span><div><strong>Explore and edit visually</strong><p>Work with tables, relationships, areas, notes, routines, and database logic.</p></div></li>
              <li><span>03</span><div><strong>Review before saving</strong><p>Preview generated SQL and save through a guarded, source-aware workflow.</p></div></li>
            </ol>
          </div>
          <div className="source-visual" aria-label="SQL source connected to a visual database table">
            <div className="code-window">
              <header><FileCode2 size={13} /> schema.sql <span>PostgreSQL</span></header>
              <pre><i>CREATE TABLE</i> <b>orders</b> ({`\n`}  <em>id</em> bigint <i>PRIMARY KEY</i>,{`\n`}  <em>user_id</em> bigint <i>NOT NULL</i>,{`\n`}  <em>total</em> numeric(12,2),{`\n`}  <em>created_at</em> timestamptz{`\n`});</pre>
            </div>
            <div className="source-connector"><span /><ArrowRight size={18} /><span /></div>
            <div className="visual-table">
              <header><Table2 size={13} /><strong>orders</strong><span>4 fields</span></header>
              <p><KeyRound size={10} /><b>id</b><code>bigint</code></p>
              <p><GitBranch size={10} /><b>user_id</b><code>bigint</code></p>
              <p><i /><b>total</b><code>numeric</code></p>
              <p><i /><b>created_at</b><code>timestamptz</code></p>
            </div>
          </div>
        </section>

        <section className="migration-showcase" id="migrations">
          <div className="section migration-intro">
            <div className="section-heading">
              <span className="eyebrow">Safety-focused migrations</span>
              <h2>Know what changes,<br />and what could go wrong.</h2>
            </div>
            <div className="migration-intro-copy"><p>DBStudio orders schema changes by dependency, highlights operational risk, and keeps destructive actions visible instead of hiding them behind generated SQL.</p><div className="benefit-list"><span><Check /> Dependency-aware ordering</span><span><Check /> Explicit destructive approvals</span><span><Check /> Rename suggestions, never silent guesses</span><span><Check /> Exportable SQL and plan report</span></div></div>
          </div>
          <div className="migration-frame"><MigrationWorkspace /></div>
        </section>

        <section className="section feature-section">
          <div className="section-heading horizontal"><div><span className="eyebrow">Developer-grade details</span><h2>Built for real database work.</h2></div><p>Focused tools for understanding a schema today and changing it confidently tomorrow.</p></div>
          <div className="feature-grid">
            {features.map(([Icon, title, copy]) => <article key={title}><span><Icon size={17} /></span><div><h3>{title}</h3><p>{copy}</p></div></article>)}
          </div>
        </section>

        <section className="section security" id="security">
          <div className="security-visual" aria-hidden="true">
            <div className="shield-ring outer"><span /></div><div className="shield-ring middle"><span /></div>
            <div className="security-core"><ShieldCheck size={35} /><strong>LOCAL</strong><small>YOUR MACHINE</small></div>
            <span className="security-orbit orbit-one"><FileCode2 size={15} /></span><span className="security-orbit orbit-two"><Database size={15} /></span><span className="security-orbit orbit-three"><KeyRound size={15} /></span>
          </div>
          <div className="security-copy">
            <span className="eyebrow">Local by default</span>
            <h2>Your schema stays<br />under your control.</h2>
            <p>DBStudio works with local SQL projects and does not require an account for core editing workflows. Native saves use validation and guarded file replacement to reduce accidental damage.</p>
            <div className="proof-grid"><span><Check /> No account required</span><span><Check /> SQL stays on your machine</span><span><Check /> Parser validation before saves</span><span><Check /> Backup and change protection</span></div>
          </div>
        </section>

        <section className="download-section" id="download">
          <div className="download-glow" aria-hidden="true" />
          <span className="beta-label">DBSTUDIO BETA</span>
          <h2>Bring clarity to your<br />next schema change.</h2>
          <p>Download DBStudio for your platform and start with an existing PostgreSQL or MySQL workspace.</p>
          <div className="platform-cards">
            <article><Laptop size={22} /><div><strong>macOS</strong><span>Apple Silicon + Intel</span></div><small>Coming with beta</small></article>
            <article><Blocks size={22} /><div><strong>Windows</strong><span>Windows 10 and later</span></div><small>Coming with beta</small></article>
            <article><TerminalSquare size={22} /><div><strong>Linux</strong><span>AppImage + DEB</span></div><small>Coming with beta</small></article>
          </div>
          <div className="beta-warning"><AlertTriangle size={15} /><span>Beta software—review generated SQL before applying it to any database.</span></div>
          <ActionLink href={SITE_LINKS.github} className="button secondary"><GitFork size={17} /> Follow the beta on GitHub</ActionLink>
        </section>

        <section className="section faq" id="faq">
          <div className="section-heading"><span className="eyebrow">Straight answers</span><h2>Before you download.</h2></div>
          <div className="faq-list">
            {faqs.map(([question, answer], index) => <details key={question} open={index === 0}><summary>{question}<span><ChevronRight /></span></summary><p>{answer}</p></details>)}
          </div>
        </section>
      </main>

      <footer className="marketing-footer">
        <div><a className="marketing-brand" href="#top"><BrandLogo /><strong>DBStudio</strong></a><p>A visual workspace for understanding and evolving SQL databases.</p></div>
        <nav aria-label="Footer navigation"><ActionLink href={SITE_LINKS.github} className="footer-link">GitHub</ActionLink><a href={SITE_LINKS.documentation}>Documentation</a><a href={SITE_LINKS.releases}>Releases</a><a href={SITE_LINKS.privacy}>Privacy</a><a href={SITE_LINKS.feedback}>Feedback</a></nav>
        <span>© 2026 DBStudio</span>
      </footer>
    </div>
  );
}
