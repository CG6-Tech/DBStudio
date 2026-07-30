# DBStudio Animated Showreel Design

## Objective

Create a premium animated product showreel for DBStudio that turns the rough concept sketch into a clear, social-ready motion piece. The reel should quickly communicate why DBStudio matters: large SQL schemas are hard to understand as text alone, while DBStudio makes tables, relationships, notes, areas, triggers, procedures, and safe editing visible in one local-first workspace.

The first deliverable is a 16:9 master reel that can be used on the marketing website, LinkedIn, X, and YouTube. A 9:16 vertical crop can be derived after the master timing and visual rhythm feel right.

## Audience And Message

The reel is for backend developers, database engineers, technical founders, and product engineers who have dealt with growing PostgreSQL or MySQL schemas.

The message is:

> See your database. Shape it safely.

The reel should feel like a serious developer tool, not a generic SaaS promo. It should show real database concepts and avoid vague animation. The most important differentiator is that DBStudio visualizes not only tables and relationships, but also database logic such as triggers, routines, and procedures.

## Format

- Master aspect ratio: 16:9.
- Recommended duration: 40 to 45 seconds.
- Recommended output: MP4.
- Secondary export: 9:16 vertical crop after the master is approved.
- Audio for first version: none required.
- Text strategy: captions and short on-screen labels, so the reel works in autoplay feeds.

## Visual Direction

The reel uses DBStudio's existing dark visual language:

- dark canvas background with subtle grid;
- mint-green brand accents;
- blue schema highlights;
- violet logic highlights;
- amber review or note accents;
- restrained glow and depth;
- smooth camera moves, not flashy transitions.

Motion should feel precise and calm: slow zooms, directional pans, table cards settling into position, relationship paths drawing cleanly, and logic pulses moving along dependency lines.

The reel should use the real DBStudio app screenshot where useful, then layer editable HTML, CSS, and SVG animation over it for the parts that need movement.

## Production Approach

Build the reel as a local animated web page inside the repository. This keeps the animation editable and makes it easier to reuse real DBStudio visual assets.

The reel page will contain:

- an animated SQL scrolling scene;
- a DBStudio app-window frame;
- animated schema table cards;
- animated area boxes and notes;
- SVG relationship paths;
- trigger nodes and procedure/routine nodes;
- a safe-editing SQL preview scene;
- final logo and download call to action.

Once the web animation is approved, it can be captured as an MP4 using a browser-based recording flow.

## Storyboard

### Scene 1: SQL Becomes Too Much

Timing: 0:00 to 0:05

Visual: A large SQL file scrolls rapidly. Table definitions, foreign keys, triggers, procedures, routines, and comments move past in an endless stream.

On-screen text: `Large schemas are hard to understand in plain SQL.`

Purpose: Establish the pain quickly.

### Scene 2: Open DBStudio

Timing: 0:05 to 0:09

Visual: The SQL stream folds into a DBStudio app window. The DBStudio logo and beta badge appear. The canvas loads.

On-screen text: `Open your schema locally.`

Purpose: Introduce DBStudio as the local-first workspace.

### Scene 3: Tables, Areas, And Notes

Timing: 0:09 to 0:15

Visual: Tables animate into place: users, addresses, products, orders, order_items, payments, and shipments. Areas form around related groups. Notes appear near important regions.

On-screen text: `Tables. Areas. Notes.`

Purpose: Show the schema becoming organized and understandable.

### Scene 4: Relationships Come Alive

Timing: 0:15 to 0:22

Visual: Relationship lines draw between tables. The camera follows a path from users to orders to order_items to products and payments. Connected tables glow as the path moves.

On-screen text: `Navigate relationships visually.`

Purpose: Show DBStudio's canvas value for relationship exploration.

### Scene 5: Logic Layer

Timing: 0:22 to 0:33

Visual: A logic layer fades in. Trigger nodes attach to tables with labels such as `BEFORE INSERT`, `AFTER UPDATE`, and `ON DELETE`. Procedure and routine blocks appear as larger callable nodes. A pulse travels through a chain:

`orders` → `trg_orders_total_update` → `recalculate_order_total()` → `order_items` + `payments`

On-screen text: `See triggers, procedures, and routines in context.`

Purpose: Make the strongest differentiator obvious. DBStudio is not just an ERD viewer; it helps reveal database behavior.

### Scene 6: Safe Editing

Timing: 0:33 to 0:40

Visual: A table or relationship is edited. A SQL preview panel appears. A validation indicator checks the change. The Save button becomes available.

On-screen text: `Edit safely. SQL stays yours.`

Purpose: Communicate controlled editing and local-first trust.

### Scene 7: CTA

Timing: 0:40 to 0:45

Visual: The camera zooms out to the full DBStudio canvas with tables, areas, notes, relationships, triggers, and procedures visible as layers. The DBStudio logo and beta badge appear.

On-screen text:

`DBStudio beta is available now.`

`mydb-studio.web.app`

Purpose: Close with a clear download action.

## Component Boundaries

The reel should remain separate from the production app and marketing page runtime. It can reuse public images and brand styles, but it should not import DBStudio editor state or application modules.

Recommended location:

- `marketing-assets/showreel/`

Recommended assets:

- `index.html` for the reel preview;
- `showreel.css` for styling and animation;
- `showreel.js` for timing controls if CSS-only timing becomes too rigid;
- exported stills or screenshots copied into the same folder only when needed.

## Responsive And Export Plan

The first animation targets 16:9. The composition should keep key content within a central safe area so it can later be cropped to 9:16 without losing the main story.

For the vertical version, the camera path should focus more tightly on the app canvas, captions, and CTA. Full desktop UI details may be simplified because they become unreadable on mobile feeds.

## Acceptance Criteria

- The reel follows the approved seven-scene structure.
- The first version is viewable locally as a browser animation.
- The visual language matches DBStudio's current dark, mint-accented identity.
- The trigger and procedure scene clearly visualizes database logic in context.
- The reel works without voiceover.
- The 16:9 master can be captured as MP4.
- The implementation stays isolated from the production DBStudio editor code.
- No unsupported product claims, fake metrics, or invented integrations appear.

## Out Of Scope For The First Version

- Voiceover recording.
- Music and sound design.
- Full 3D animation.
- Automatic upload to social platforms.
- A final vertical export before the 16:9 master timing is approved.
