-- Indexes for exercising index management: every access method, key options,
-- partial/covering/expression indexes, storage parameters, indexes owned by
-- constraints (read-only in the UI), and redundant/duplicate indexes that the
-- Indexes tab flags.
--
-- Idempotent: safe to re-run against an existing database
--   docker exec -i db-manager-postgres psql -U postgres -d postgres -v ON_ERROR_STOP=1 < docker/postgres/init/05_indexes.sql

-- ---------------------------------------------------------------------------
-- Small tables whose constraints own indexes
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ops.api_keys (
  id            bigserial PRIMARY KEY,
  owner_id      bigint REFERENCES shop.users (id),
  label         text NOT NULL,
  prefix        text NOT NULL,
  revoked_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT api_keys_prefix_key UNIQUE (prefix)
);
COMMENT ON TABLE ops.api_keys IS 'API keys; owner_id is NULL for shared keys.';

INSERT INTO ops.api_keys (owner_id, label, prefix, revoked_at) VALUES
  (1, 'CI', 'bz_ci_01', NULL),
  (1, 'Deploy', 'bz_dep_01', NULL),
  (1, 'Old deploy', 'bz_dep_00', now() - interval '30 days'),
  (2, 'CI', 'bz_ci_02', NULL),
  (NULL, 'Shared reporting', 'bz_shr_01', NULL)
ON CONFLICT (prefix) DO NOTHING;

CREATE TABLE IF NOT EXISTS ops.maintenance_windows (
  id            bigserial PRIMARY KEY,
  title         text NOT NULL,
  during        tstzrange NOT NULL,
  CONSTRAINT maintenance_windows_no_overlap EXCLUDE USING gist (during WITH &&)
);

INSERT INTO ops.maintenance_windows (title, during)
SELECT title, during
FROM (VALUES
  ('Database upgrade', tstzrange('2026-11-01 02:00+00', '2026-11-01 04:00+00')),
  ('Index rebuild', tstzrange('2026-11-08 02:00+00', '2026-11-08 03:00+00'))
) AS v(title, during)
WHERE NOT EXISTS (SELECT 1 FROM ops.maintenance_windows);

-- ---------------------------------------------------------------------------
-- B-tree options
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_users_email_lower ON shop.users (lower(email));

CREATE INDEX IF NOT EXISTS idx_orders_user_status
  ON shop.orders (user_id, status) INCLUDE (total) WITH (fillfactor = 90);

CREATE INDEX IF NOT EXISTS idx_users_last_login
  ON shop.users (last_login_at DESC NULLS LAST) WHERE is_active;

CREATE INDEX IF NOT EXISTS idx_jobs_finished ON ops.background_jobs (finished_at NULLS FIRST);

-- Non-default operator class (LIKE 'prefix%' lookups).
CREATE INDEX IF NOT EXISTS idx_products_name_pattern ON shop.products (name text_pattern_ops);

CREATE INDEX IF NOT EXISTS idx_categories_name_c ON shop.categories (name COLLATE "C");

CREATE INDEX IF NOT EXISTS idx_events_user_time
  ON analytics.events (user_id, occurred_at DESC) WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS "IdxOrders PlacedDay"
  ON shop.orders (((placed_at AT TIME ZONE 'UTC')::date));

-- Unique expression index with NULLS NOT DISTINCT (PostgreSQL 15+):
-- a label is unique per owner, and shared keys (NULL owner) count as one owner.
CREATE UNIQUE INDEX IF NOT EXISTS uq_api_keys_owner_label
  ON ops.api_keys (owner_id, lower(label)) NULLS NOT DISTINCT;

-- Partial unique index (a WHERE on a unique index; the full-table
-- uniqueness comes from api_keys_prefix_key).
CREATE UNIQUE INDEX IF NOT EXISTS uq_api_keys_live_prefix
  ON ops.api_keys (prefix) WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_payments_status
  ON shop.payments (status) WITH (deduplicate_items = off);

CREATE INDEX IF NOT EXISTS idx_mv_revenue_day ON shop.mv_revenue_by_day (day DESC);

-- ---------------------------------------------------------------------------
-- Other access methods
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_payments_provider_hash ON shop.payments USING hash (provider);

CREATE INDEX IF NOT EXISTS idx_audit_payload
  ON ops.audit_log USING gin (payload jsonb_path_ops) WITH (fastupdate = off);

CREATE INDEX IF NOT EXISTS idx_reviews_body_fts
  ON shop.reviews USING gist (to_tsvector('english', COALESCE(body, '')));

CREATE INDEX IF NOT EXISTS idx_sessions_ip ON analytics.sessions USING spgist (ip);

CREATE INDEX IF NOT EXISTS idx_page_views_viewed_brin
  ON analytics.page_views USING brin (viewed_at) WITH (pages_per_range = 32, autosummarize = on);

-- ---------------------------------------------------------------------------
-- Indexes the Indexes tab should flag
-- ---------------------------------------------------------------------------

-- Makes idx_order_items_order (order_id) redundant: same leading key.
CREATE INDEX IF NOT EXISTS idx_order_items_order_variant ON shop.order_items (order_id, variant_id);

-- Exact duplicate of idx_reviews_product.
CREATE INDEX IF NOT EXISTS idx_reviews_product_dup ON shop.reviews (product_id);

ANALYZE ops.api_keys, ops.maintenance_windows;
