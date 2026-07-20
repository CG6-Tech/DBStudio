# Realistic PostgreSQL Schema Upgrade

This is one complete migration-planning scenario. Both files define the same `fixture_shop` schema as independent database states:

- [`old/schema.sql`](old/schema.sql) is the current production schema.
- [`new/schema.sql`](new/schema.sql) is the desired upgraded schema.

Load the old file as the target database and the new file as the desired database.

## Expected Changes

| Area | Expected planner behavior | Risk |
| --- | --- | --- |
| `customers.name` to `full_name` | Suggest a column rename | review |
| `products.price` to `unit_price` | Suggest a column rename | review |
| `customers.legacy_reference` | Drop column | destructive |
| `updated_at` columns | Add required columns with defaults | safe |
| `orders.external_reference` | Require a backfill before `NOT NULL` | blocked until resolved |
| `orders.status` | Change text to `order_status` enum | review |
| `orders.shipping_address` | Add nullable JSONB column | safe |
| Product and order checks | Add constraints | safe |
| Old order indexes | Drop or replace indexes | review |
| Audit log | Create table and index | safe |
| Timestamp automation | Create function and three triggers | safe/review |
| Order-item pricing | Add required price and generated total | backfill/review |

## Execution

Each SQL file resets `fixture_shop`, so execute only one state in a database at a time. Docker and automated live-database comparison will be added later.
