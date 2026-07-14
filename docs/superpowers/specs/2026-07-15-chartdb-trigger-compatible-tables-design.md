# ChartDB Trigger-Compatible Tables Design

## Goal

Update `/Users/cg/Downloads/chartdb-folder-test` so its base `CREATE TABLE` definitions natively contain every column and constraint required by the five functions and five triggers in `business_logic.sql`. Remove redundant migration-style schema changes from the business-logic file.

## File Ownership

- `users.sql`: users table, timestamp field.
- `test/products.sql`: products table, inventory/pricing fields and checks.
- `test/orders.sql`: orders table, keys, required references, totals, and timestamps.
- `reviews.sql`: reviews table, user/product references, rating/body fields, validation checks, and timestamps.
- `analytics.sql`: page views and the complete structured audit table.
- `schema_support.sql`: expression and partial unique indexes that do not belong inside `CREATE TABLE` syntax.
- `business_logic.sql`: only trigger functions and exactly five trigger declarations.

## Declarative Schema

Users gain `updated_at`. Products gain nonnegative `unit_price`, nonnegative `stock_quantity`, and `updated_at`. Orders gain a primary key, required quantity/product/user fields, foreign keys, quantity check, line total, and timestamps. Reviews gain required user, product, rating, and normalized body fields, timestamps, foreign keys, rating check, and body-length check; legacy `"Test"` remains nullable as trigger fallback input. Audit log gains an identity key, action/entity/operation/actor fields, JSON before/after snapshots, changed-field array, transaction ID, and timestamp default.

`schema_support.sql` creates the case-insensitive unique user-email index and the unique user/product review index.

## Business Logic Cleanup

Remove the opening transaction, all `ALTER TABLE`, sequence, index, constraint setup, and final commit from `business_logic.sql`. Retain the five functions, trigger replacement statements, and five trigger declarations unchanged except where required to match the declarative column constraints.

## Validation

- Parse the complete folder as PostgreSQL with ViewDB.
- Confirm five tables used by the logic expose all referenced columns.
- Confirm order/review foreign keys resolve.
- Confirm exactly five routines and five triggers parse.
- Confirm trigger targets, executed routines, and routine table effects resolve.
- Report that PostgreSQL runtime execution was not tested if no local server/client is available.
