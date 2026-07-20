-- Fixture: realistic-schema-upgrade-old
-- Schema: fixture_shop
-- Role: current production state
-- Expected risk: baseline

DROP SCHEMA IF EXISTS fixture_shop CASCADE;
CREATE SCHEMA fixture_shop;
SET search_path TO fixture_shop, public;

CREATE TABLE fixture_shop.customers (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  phone text,
  legacy_reference text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE fixture_shop.products (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sku text NOT NULL UNIQUE,
  name text NOT NULL,
  price numeric(12, 2) NOT NULL,
  stock_quantity integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE fixture_shop.orders (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id bigint NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  total numeric(12, 2) NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orders_customer_fk
    FOREIGN KEY (customer_id) REFERENCES fixture_shop.customers(id),
  CONSTRAINT orders_status_check
    CHECK (status IN ('pending', 'paid', 'cancelled'))
);

CREATE TABLE fixture_shop.order_items (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id bigint NOT NULL,
  product_id bigint NOT NULL,
  quantity integer NOT NULL,
  CONSTRAINT order_items_order_fk
    FOREIGN KEY (order_id) REFERENCES fixture_shop.orders(id) ON DELETE CASCADE,
  CONSTRAINT order_items_product_fk
    FOREIGN KEY (product_id) REFERENCES fixture_shop.products(id),
  CONSTRAINT order_items_quantity_check CHECK (quantity > 0),
  CONSTRAINT order_items_order_product_key UNIQUE (order_id, product_id)
);

CREATE INDEX orders_customer_idx
  ON fixture_shop.orders (customer_id);
CREATE INDEX orders_status_idx
  ON fixture_shop.orders (status);
CREATE INDEX order_items_product_idx
  ON fixture_shop.order_items (product_id);
