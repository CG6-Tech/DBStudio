-- DBStudio sample commerce schema
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE addresses (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id),
  label TEXT NOT NULL,
  city TEXT NOT NULL,
  country TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE products (
  id BIGSERIAL PRIMARY KEY,
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  price NUMERIC(10, 2) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE orders (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id),
  shipping_address_id BIGINT REFERENCES addresses(id),
  status TEXT NOT NULL,
  total NUMERIC(10, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE order_items (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id),
  product_id BIGINT NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL,
  unit_price NUMERIC(10, 2) NOT NULL
);

CREATE TABLE payments (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id),
  provider TEXT NOT NULL,
  status TEXT NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  paid_at TIMESTAMPTZ
);

CREATE TABLE shipments (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id),
  carrier TEXT NOT NULL,
  tracking_number TEXT,
  shipped_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ
);

CREATE OR REPLACE FUNCTION recalculate_order_total(p_order_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE orders
  SET total = COALESCE((
    SELECT SUM(quantity * unit_price)
    FROM order_items
    WHERE order_items.order_id = p_order_id
  ), 0)
  WHERE orders.id = p_order_id;
END;
$$;

CREATE OR REPLACE FUNCTION sync_order_payment_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM recalculate_order_total(NEW.order_id);
  IF NEW.status = 'paid' THEN
    UPDATE orders
    SET status = 'paid'
    WHERE orders.id = NEW.order_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER payments_sync_order
AFTER INSERT OR UPDATE ON payments
FOR EACH ROW
EXECUTE FUNCTION sync_order_payment_status();

CREATE OR REPLACE FUNCTION refresh_order_from_item()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM recalculate_order_total(NEW.order_id);
  UPDATE products
  SET active = active
  WHERE products.id = NEW.product_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER order_items_refresh_order
AFTER INSERT OR UPDATE ON order_items
FOR EACH ROW
EXECUTE FUNCTION refresh_order_from_item();

CREATE OR REPLACE FUNCTION mark_order_shipped()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.shipped_at IS NOT NULL THEN
    UPDATE orders
    SET status = 'shipped'
    WHERE orders.id = NEW.order_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER shipments_mark_order
AFTER INSERT OR UPDATE ON shipments
FOR EACH ROW
EXECUTE FUNCTION mark_order_shipped();
