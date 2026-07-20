# DBStudio Marketing Website Design

## Objective

Build a polished, responsive marketing website for DBStudio that persuades backend developers and database engineers to download the cross-platform beta. The page must present the product as a precise, local-first database workspace rather than a generic SaaS or AI platform.

The primary call to action is **Download Beta**. **View on GitHub** is secondary. The page must not use invented testimonials, customer logos, performance statistics, or unsupported product claims.

## Audience And Positioning

The primary audience is backend developers and database engineers who work directly with PostgreSQL or MySQL schemas and want a clearer way to understand structure, database logic, and migration risk.

The core promise is:

> See your database. Shape it safely.

Supporting positioning emphasizes three connected capabilities:

- visual schema exploration and editing;
- database routine and trigger-flow visualization;
- dependency-aware migration planning with explicit review gates.

SQL remains central to the workflow. DBStudio is presented as local-first tooling that works with existing SQL files and folders, not as a proprietary cloud model.

## Information Architecture

The site is a single-page marketing experience with anchored navigation:

1. Sticky navigation with Features, Migrations, Security, GitHub, and Download Beta.
2. Hero with the primary value proposition, platform availability, calls to action, and a realistic DBStudio interface composition.
3. Compatibility strip for PostgreSQL, MySQL, macOS, Windows, Linux, and local-first operation.
4. Three core capability panels: schema editing, database logic, and migration planning.
5. Source-preserving workflow showing SQL workspace input, visual editing, and reviewed SQL output.
6. Migration planner showcase explaining Desired-to-Target comparison, risk states, rename decisions, strategy choices, and export gating.
7. Compact developer feature grid.
8. Local-first privacy and guarded-save section.
9. Cross-platform beta download panel.
10. Accessible FAQ.
11. Minimal footer with product and project links.

## Content Requirements

The hero uses:

- eyebrow: **LOCAL-FIRST DATABASE TOOLING**;
- headline: **See your database. Shape it safely.**;
- description: **Explore schemas visually, understand the logic behind them, and plan safer migrations—without giving up control of your SQL.**;
- primary action: **Download Beta**;
- secondary action: **View on GitHub**;
- availability note: **Available for macOS, Windows, and Linux**.

The page describes only capabilities supported by the application or its approved beta direction. Migration planning is described as planning and SQL export, not automatic migration execution. Security copy avoids absolute guarantees.

The FAQ answers whether DBStudio connects directly to production, how it treats SQL files, supported database engines and operating systems, whether an account is required, and whether migrations are executed automatically.

## Visual Direction

The aesthetic is a restrained, premium developer tool inspired by a professional database IDE.

- Canvas background: `#0D1114` with a subtle dotted grid.
- Raised panels: `#151B1F` and `#1B2227`.
- Primary accent: mint green `#7EE0B5`.
- Supporting semantic colors: blue for schema objects, amber for review, coral for destructive warnings, and violet for logic flows.
- Typography: a clean geometric sans-serif for marketing copy and monospace for SQL, object names, metadata, and status labels.
- Components: thin slate borders, compact radii, precise spacing, restrained shadows, and minimal glow.
- Brand mark: three overlapping outlined rectangles, vertically offset and rotated approximately 30 degrees.

The site avoids excessive gradients, glassmorphism, pill-shaped containers, huge rounded cards, stock photography, cartoon illustrations, and neon cyberpunk effects.

## Product Visuals

Product showcases are purpose-built interface compositions based on DBStudio's existing visual language rather than screenshots that become unreadable at responsive sizes. They contain realistic table cards, relationship lines, sidebars, SQL panels, logic nodes, migration summaries, and explicit risk labels.

The hero product composition includes the dotted schema canvas, connected tables, a compact workspace sidebar, a dialect selector, and a migration status panel. The migration section includes Desired and Target sources, strategy selection, ordered changes, required decisions, SQL preview, and a visibly disabled export state until decisions are resolved.

On small screens, product visuals simplify and recompose instead of scaling an entire desktop interface down to illegibility.

## Interaction And Responsive Behavior

- Smooth anchored navigation.
- Subtle section entrance effects and relationship-line drawing.
- Small card elevation and clear button state changes.
- No distracting continuous background motion.
- Motion is disabled or simplified when reduced motion is requested.
- Desktop composition targets 1440-pixel layouts.
- Mobile composition targets 390-pixel layouts and uses a clear single-column narrative.
- Navigation collapses accessibly while the download action remains prominent.

## Accessibility

- Semantic landmarks and heading order.
- High contrast text and controls.
- Visible keyboard focus states.
- Generous touch targets.
- Risk status always combines color with text and iconography.
- Accessible accordion controls.
- Decorative visuals are hidden from assistive technology; meaningful visuals receive concise labels.

## Implementation Boundaries

The marketing site must remain isolated from the desktop application's editing state and domain modules. It may reuse the established brand palette and visual motifs but should use dedicated marketing components and styles. Download, GitHub, release-note, documentation, privacy, and feedback destinations must be defined in one configuration surface so release URLs can be updated safely.

The first implementation is a complete static marketing experience with responsive interactions. It does not add analytics, authentication, payments, a CMS, or a backend. Until installer URLs are supplied, download actions navigate to the download section and platform cards display **Coming with the beta release** instead of linking to nonexistent files.

## Acceptance Criteria

- The production build succeeds without breaking the existing desktop entry point.
- The page contains every approved section and uses factual DBStudio positioning.
- Primary and secondary calls to action are consistent across the page.
- Desktop and mobile layouts are visually coherent without horizontal overflow.
- Product visuals remain legible and communicate real database workflows.
- Keyboard navigation, visible focus, reduced motion, and non-color status cues are present.
- No fake social proof, unsupported metrics, or automatic-migration claims appear.
