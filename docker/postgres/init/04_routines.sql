-- Functions and procedures for exercising routine management: every
-- parameter mode, return shape, attribute and body style the UI handles,
-- plus routines other objects depend on (so their drop is refused).
--
-- Idempotent: safe to re-run against an existing database
--   docker exec -i db-manager-postgres psql -U postgres -d postgres -v ON_ERROR_STOP=1 < docker/postgres/init/04_routines.sql

-- ---------------------------------------------------------------------------
-- shop
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION shop.order_total(p_subtotal numeric, p_tax numeric DEFAULT 0, p_shipping numeric DEFAULT 0)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT p_subtotal + p_tax + p_shipping
$$;
COMMENT ON FUNCTION shop.order_total(numeric, numeric, numeric) IS 'Grand total of an order.';

CREATE OR REPLACE FUNCTION shop.user_order_stats(p_user_id bigint, OUT order_count bigint, OUT lifetime_value numeric)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  SELECT count(*), COALESCE(sum(total), 0)
    INTO order_count, lifetime_value
    FROM shop.orders
   WHERE user_id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION shop.orders_by_status(p_status shop.order_status)
RETURNS TABLE (order_id bigint, user_id bigint, total numeric)
LANGUAGE sql
STABLE
ROWS 50
AS $$
  SELECT id, user_id, total FROM shop.orders WHERE status = p_status
$$;

CREATE OR REPLACE FUNCTION shop.recent_orders(p_limit integer DEFAULT 10)
RETURNS SETOF shop.orders
LANGUAGE sql
STABLE
ROWS 10
AS $$
  SELECT * FROM shop.orders ORDER BY placed_at DESC LIMIT p_limit
$$;
COMMENT ON FUNCTION shop.recent_orders(integer) IS 'Latest orders first.';

CREATE OR REPLACE FUNCTION shop.format_price(p_amount numeric)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT to_char(p_amount, 'FM999G999G990D00')
$$;

CREATE OR REPLACE FUNCTION shop.format_price(p_amount numeric, p_currency text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT p_currency || ' ' || shop.format_price(p_amount)
$$;

CREATE OR REPLACE FUNCTION shop.is_valid_email(p_email text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
LEAKPROOF
PARALLEL SAFE
AS $$
  SELECT p_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
$$;

-- SQL-standard body (PostgreSQL 14+): shown read-only in the editor.
CREATE OR REPLACE FUNCTION shop.order_item_total(p_quantity integer, p_unit_price numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
BEGIN ATOMIC
  SELECT p_quantity * p_unit_price;
END;

CREATE OR REPLACE FUNCTION shop.category_path(p_category_id bigint)
RETURNS text
LANGUAGE plpgsql
STABLE
COST 500
AS $$
DECLARE
  v_path text;
BEGIN
  WITH RECURSIVE chain AS (
    SELECT id, parent_id, name, 1 AS depth
      FROM shop.categories
     WHERE id = p_category_id
    UNION ALL
    SELECT c.id, c.parent_id, c.name, chain.depth + 1
      FROM shop.categories c
      JOIN chain ON c.id = chain.parent_id
  )
  SELECT string_agg(name, ' › ' ORDER BY depth DESC) INTO v_path FROM chain;
  RETURN v_path;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'category_path(%) failed: %', p_category_id, SQLERRM;
    RETURN NULL;
END;
$$;

-- ---------------------------------------------------------------------------
-- analytics
-- ---------------------------------------------------------------------------

-- Used by the view below, so DROP FUNCTION is refused (no CASCADE).
CREATE OR REPLACE FUNCTION analytics.session_duration(p_started timestamptz, p_ended timestamptz)
RETURNS interval
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(p_ended, p_started) - p_started
$$;

CREATE OR REPLACE VIEW analytics.v_session_lengths AS
SELECT id, user_id, started_at, analytics.session_duration(started_at, ended_at) AS duration
FROM analytics.sessions;

CREATE OR REPLACE FUNCTION analytics."DailyActiveUsers"(p_day date)
RETURNS bigint
LANGUAGE sql
STABLE
AS $$
  SELECT count(DISTINCT user_id)
    FROM analytics.sessions
   WHERE started_at >= p_day AND started_at < p_day + 1
$$;

-- ---------------------------------------------------------------------------
-- ops
-- ---------------------------------------------------------------------------

-- Trigger function, attached below, so DROP FUNCTION is refused.
CREATE OR REPLACE FUNCTION ops.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_products_touch ON shop.products;
CREATE TRIGGER trg_products_touch
  BEFORE UPDATE ON shop.products
  FOR EACH ROW EXECUTE FUNCTION ops.touch_updated_at();

DROP TRIGGER IF EXISTS trg_inventory_touch ON shop.inventory;
CREATE TRIGGER trg_inventory_touch
  BEFORE UPDATE ON shop.inventory
  FOR EACH ROW EXECUTE FUNCTION ops.touch_updated_at();

CREATE OR REPLACE FUNCTION ops.join_nonempty(p_separator text, VARIADIC p_parts text[])
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT string_agg(part, p_separator) FROM unnest(p_parts) AS part WHERE part <> ''
$$;

CREATE OR REPLACE FUNCTION ops.first_present(anyelement, anyelement)
RETURNS anyelement
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE($1, $2)
$$;

CREATE OR REPLACE FUNCTION ops.record_audit(p_action text, p_entity text, p_entity_id text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO ops.audit_log (action, entity, entity_id)
  VALUES (p_action, p_entity, p_entity_id);
END;
$$;
COMMENT ON FUNCTION ops.record_audit(text, text, text) IS 'Writes an audit row with the owner''s privileges.';

CREATE OR REPLACE PROCEDURE ops.purge_audit_log(p_older_than interval DEFAULT '90 days')
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM ops.audit_log WHERE created_at < now() - p_older_than;
END;
$$;

CREATE OR REPLACE PROCEDURE ops.requeue_failed_jobs(INOUT p_requeued integer DEFAULT 0)
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE ops.background_jobs
     SET status = 'queued', attempts = attempts + 1, run_at = now()
   WHERE status = 'failed';
  GET DIAGNOSTICS p_requeued = ROW_COUNT;
END;
$$;
COMMENT ON PROCEDURE ops.requeue_failed_jobs(integer) IS 'CALL ops.requeue_failed_jobs(NULL);';

-- ---------------------------------------------------------------------------
-- public
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.app_schema_version()
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT '2026.10'
$$;
