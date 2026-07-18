# Realistic Schema Upgrade Fixture Design

## Goal

Replace the broad PostgreSQL fixture corpus with one realistic before-and-after schema upgrade that DBStudio can compare directly.

## Structure

```text
tests/fixtures/postgresql/realistic-schema-upgrade/
  README.md
  old/schema.sql
  new/schema.sql
```

Both SQL files are independently executable and reset the same `fixture_shop` schema before creating their version of it.

## Old Schema

The old state contains a small commerce system with customers, products, orders, and order items. It uses basic text statuses, simple indexes, and no audit or timestamp automation.

## New Schema

The new state remains recognizably the same system while introducing realistic migration changes:

- rename `customers.name` to `customers.full_name`;
- rename `products.price` to `products.unit_price`;
- remove an obsolete customer column;
- add update timestamps and shipping metadata;
- introduce an `order_status` enum and use it on orders;
- add external order references and inventory constraints;
- add and replace indexes;
- add an audit table;
- add a reusable timestamp trigger function and triggers;
- add captured unit prices and generated line totals to order items.

This one comparison exercises table creation, column additions, removals, rename suggestions, type and metadata changes, custom types, indexes, constraints, routines, and triggers.

## Fixture Contract

- Both files use PostgreSQL SQL and schema-qualified names.
- Both begin with `DROP SCHEMA IF EXISTS fixture_shop CASCADE`.
- Neither depends on extensions, Docker, credentials, or external services.
- The old and new files describe complete states, not incremental migration scripts.
- `README.md` summarizes the expected planner changes and risks.

## Validation

Static checks confirm that exactly two SQL files exist, both use `fixture_shop`, required metadata is present, and no environment-specific settings appear. Live PostgreSQL execution remains deferred.
