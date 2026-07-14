# ViewDB

A minimal, source-preserving PostgreSQL ER editor built with the production stack: Tauri 2, Rust, React, TypeScript, PixiJS 8, RBush, ELK.js, Zustand, and `libpg_query` through the Rust `pg_query` crate.

The sample opens two related tables, lets you edit supported table and column properties, previews source-preserving SQL patches, and safely saves local SQL files with validation and backups.

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

The MVP supports `CREATE TABLE`, columns, primary keys, and single-column foreign keys. It can rename tables and columns, change column types, and toggle nullability. Structural additions and deletions are intentionally deferred.
