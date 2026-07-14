# ViewDB

A minimal, source-preserving PostgreSQL ER editor built with the production stack: Tauri 2, Rust, React, TypeScript, PixiJS 8, RBush, ELK.js, Zustand, and `libpg_query` through the Rust `pg_query` crate.

The sample opens two related tables and provides a dark, canvas-first workspace for editing schema structure and layout. Tables can be moved freely, colored, and grouped inside movable, resizable colored areas. The workspace also supports notes, relationship editing, SQL preview, undo/redo, and safe local saves.

## Run the browser preview

```sh
npm install
npm run dev
```

The browser preview includes the complete canvas and editing flow. Its Save action downloads the generated SQL because browsers cannot overwrite arbitrary local files safely.

## Run the desktop app

Install the [Rust prerequisites for Tauri](https://v2.tauri.app/start/prerequisites/), then run:

```sh
npm install
npm run tauri dev
```

The desktop build enables native file selection, PostgreSQL parser validation, external-change detection, timestamped backups, and atomic writes.

## Verify

```sh
npm test
npm run build
cd src-tauri && cargo test
```

## Current sample scope

- Add, rename, recolor, and delete tables and fields.
- Edit PostgreSQL field types, primary keys, nullability, and relationships.
- Drag tables freely around the PixiJS canvas.
- Create, move, resize, recolor, lock, and delete grouping areas.
- Drop tables into an area; moving the area can move its grouped tables.
- Add colored canvas notes.
- Persist canvas metadata in `workspace.sql-erd.json` beside the SQL file.
- Preview generated SQL and save with parser validation, external-change protection, backups, and atomic replacement.
