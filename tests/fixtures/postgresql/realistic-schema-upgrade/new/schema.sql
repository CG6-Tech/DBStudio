-- Fixture: realistic-schema-upgrade-new
-- Schema: fixture_shop
-- Role: desired upgraded state
-- Expected risk: mixed safe, review, and destructive changes

DROP SCHEMA IF EXISTS fixture_shop CASCADE;
CREATE SCHEMA fixture_shop;
SET search_path TO fixture_shop, public;

CREATE TYPE fixture_shop.order_status
  AS ENUM ('pending', 'paid', 'fulfilled', 'cancelled');

CREATE TABLE fixture_shop.customers (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email text NOT NULL UNIQUE,
  full_name text NOT NULL,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE fixture_shop.products (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sku text NOT NULL UNIQUE,
  name text NOT NULL,
  unit_price numeric(12, 2) NOT NULL,
  stock_quantity integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT products_unit_price_check CHECK (unit_price >= 0),
  CONSTRAINT products_stock_check CHECK (stock_quantity >= 0)
);

CREATE TABLE fixture_shop.orders (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id bigint NOT NULL,
  external_reference text NOT NULL UNIQUE,
  status fixture_shop.order_status NOT NULL DEFAULT 'pending',
  total numeric(12, 2) NOT NULL DEFAULT 0,
  shipping_address jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orders_customer_fk
    FOREIGN KEY (customer_id) REFERENCES fixture_shop.customers(id),
  CONSTRAINT orders_total_check CHECK (total >= 0)
);

CREATE TABLE fixture_shop.order_items (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id bigint NOT NULL,
  product_id bigint NOT NULL,
  quantity integer NOT NULL,
  unit_price numeric(12, 2) NOT NULL,
  line_total numeric(12, 2)
    GENERATED ALWAYS AS (quantity * unit_price) STORED,
  CONSTRAINT order_items_order_fk
    FOREIGN KEY (order_id) REFERENCES fixture_shop.orders(id) ON DELETE CASCADE,
  CONSTRAINT order_items_product_fk
    FOREIGN KEY (product_id) REFERENCES fixture_shop.products(id),
  CONSTRAINT order_items_quantity_check CHECK (quantity > 0),
  CONSTRAINT order_items_unit_price_check CHECK (unit_price >= 0),
  CONSTRAINT order_items_order_product_key UNIQUE (order_id, product_id)
);

CREATE TABLE fixture_shop.audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  table_name text NOT NULL,
  row_id bigint NOT NULL,
  operation text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  changed_by text NOT NULL DEFAULT session_user,
  before_data jsonb,
  after_data jsonb,
  CONSTRAINT audit_log_operation_check
    CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE'))
);

CREATE INDEX orders_customer_created_idx
  ON fixture_shop.orders (customer_id, created_at DESC);
CREATE INDEX orders_open_status_idx
  ON fixture_shop.orders (status, created_at DESC)
  WHERE status IN ('pending', 'paid');
CREATE INDEX order_items_product_idx
  ON fixture_shop.order_items (product_id);
CREATE INDEX audit_log_lookup_idx
  ON fixture_shop.audit_log (table_name, row_id, changed_at DESC);

CREATE FUNCTION fixture_shop.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, fixture_shop
AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

CREATE TRIGGER customers_touch_updated_at
BEFORE UPDATE ON fixture_shop.customers
FOR EACH ROW
EXECUTE FUNCTION fixture_shop.touch_updated_at();
CREATE TRIGGER products_touch_updated_at
BEFORE UPDATE ON fixture_shop.products
FOR EACH ROW
EXECUTE FUNCTION fixture_shop.touch_updated_at();

CREATE TRIGGER orders_touch_updated_at
BEFORE UPDATE ON fixture_shop.orders
FOR EACH ROW
EXECUTE FUNCTION fixture_shop.touch_updated_at();
