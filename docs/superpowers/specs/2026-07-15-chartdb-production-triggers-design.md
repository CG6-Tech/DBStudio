# ChartDB Production Triggers Design

## Goal

Extend `/Users/cg/Downloads/chartdb-folder-test` with five PostgreSQL triggers that enforce realistic business rules and provide useful Logic-graph test data. Three triggers are simple to moderate and two are complex.

## Delivery

Add `business_logic.sql`. Preserve the current table files and use idempotent `ALTER TABLE`, supporting tables, `CREATE OR REPLACE FUNCTION`, and trigger replacement statements.

## Trigger Set

1. `users_normalize_email` (`BEFORE INSERT OR UPDATE`): trim and lowercase email addresses, reject empty or malformed addresses, and rely on a unique email constraint.
2. `orders_validate_order` (`BEFORE INSERT OR UPDATE`): require quantity of at least one and enforce product/user references through added foreign keys.
3. `reviews_validate_review` (`BEFORE INSERT OR UPDATE`): add user, rating, body, and timestamp fields; require ratings from one through five, normalize review text, and prevent multiple reviews by the same user for one product.
4. `orders_apply_inventory` (`AFTER INSERT OR UPDATE OR DELETE`): add stock and unit-price data, calculate the order line total, lock the affected product row, decrement or restore stock for inserts, quantity/product changes, and deletes, and reject insufficient inventory without allowing negative stock.
5. `audit_business_changes` (`AFTER INSERT OR UPDATE OR DELETE` on users, products, orders, and reviews): expand the audit table with actor, entity, operation, before/after JSON, changed fields, transaction ID, and timestamp; avoid recursive auditing and record session actor metadata when available.

## Safety and Error Handling

- Invalid writes raise explicit PostgreSQL exceptions.
- Inventory updates lock affected product rows to prevent concurrent overselling.
- Product changes on an existing order restore old stock before reserving new stock in one transaction.
- Audit failures participate in the originating transaction; incomplete audit entries are not silently accepted.
- Trigger functions use explicit schemas and defensive `search_path` settings.
- The script is safe to apply repeatedly without duplicating triggers or columns.

## Verification

- Confirm ViewDB parses the original tables plus all five triggers and their functions.
- Confirm trigger targets and executed functions resolve in the Logic graph.
- Check SQL formatting and idempotent object creation.
- If a local PostgreSQL client/server is unavailable, report that runtime execution was not tested rather than claiming it.
