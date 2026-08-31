CREATE SCHEMA shop;
CREATE SCHEMA analytics;
CREATE SCHEMA ops;

CREATE TYPE shop.user_role AS ENUM ('admin', 'staff', 'customer');
CREATE TYPE shop.order_status AS ENUM ('pending', 'paid', 'shipped', 'delivered', 'cancelled');
CREATE TYPE shop.payment_status AS ENUM ('pending', 'succeeded', 'failed', 'refunded');
CREATE TYPE ops.job_status AS ENUM ('queued', 'running', 'succeeded', 'failed');

-- ---------------------------------------------------------------------------
-- shop
-- ---------------------------------------------------------------------------

CREATE TABLE shop.organizations (
  id            bigserial PRIMARY KEY,
  name          text NOT NULL,
  slug          text NOT NULL UNIQUE,
  plan          text NOT NULL DEFAULT 'free',
  country       char(2) NOT NULL DEFAULT 'US',
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE shop.users (
  id            bigserial PRIMARY KEY,
  organization_id bigint NOT NULL REFERENCES shop.organizations (id),
  email         text NOT NULL UNIQUE,
  full_name     text NOT NULL,
  role          shop.user_role NOT NULL DEFAULT 'customer',
  is_active     boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE shop.addresses (
  id            bigserial PRIMARY KEY,
  user_id       bigint NOT NULL REFERENCES shop.users (id) ON DELETE CASCADE,
  label         text NOT NULL DEFAULT 'home',
  line1         text NOT NULL,
  line2         text,
  city          text NOT NULL,
  region        text,
  postal_code   text NOT NULL,
  country       char(2) NOT NULL DEFAULT 'US',
  is_default    boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE shop.categories (
  id            bigserial PRIMARY KEY,
  parent_id     bigint REFERENCES shop.categories (id),
  name          text NOT NULL,
  slug          text NOT NULL UNIQUE,
  description   text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE shop.products (
  id            bigserial PRIMARY KEY,
  organization_id bigint NOT NULL REFERENCES shop.organizations (id),
  category_id   bigint NOT NULL REFERENCES shop.categories (id),
  sku           text NOT NULL UNIQUE,
  name          text NOT NULL,
  description   text,
  base_price    numeric(10, 2) NOT NULL,
  currency      char(3) NOT NULL DEFAULT 'USD',
  tags          text[] NOT NULL DEFAULT '{}',
  attributes    jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_published  boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE shop.product_variants (
  id            bigserial PRIMARY KEY,
  product_id    bigint NOT NULL REFERENCES shop.products (id) ON DELETE CASCADE,
  sku           text NOT NULL UNIQUE,
  title         text NOT NULL,
  price         numeric(10, 2) NOT NULL,
  weight_grams  integer,
  options       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE shop.warehouses (
  id            bigserial PRIMARY KEY,
  code          text NOT NULL UNIQUE,
  name          text NOT NULL,
  city          text NOT NULL,
  country       char(2) NOT NULL,
  is_active     boolean NOT NULL DEFAULT true
);

CREATE TABLE shop.inventory (
  id            bigserial PRIMARY KEY,
  warehouse_id  bigint NOT NULL REFERENCES shop.warehouses (id),
  variant_id    bigint NOT NULL REFERENCES shop.product_variants (id) ON DELETE CASCADE,
  quantity      integer NOT NULL DEFAULT 0,
  reserved      integer NOT NULL DEFAULT 0,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (warehouse_id, variant_id)
);

CREATE TABLE shop.orders (
  id            bigserial PRIMARY KEY,
  user_id       bigint NOT NULL REFERENCES shop.users (id),
  shipping_address_id bigint REFERENCES shop.addresses (id),
  status        shop.order_status NOT NULL DEFAULT 'pending',
  subtotal      numeric(12, 2) NOT NULL,
  tax           numeric(12, 2) NOT NULL DEFAULT 0,
  shipping      numeric(12, 2) NOT NULL DEFAULT 0,
  total         numeric(12, 2) NOT NULL,
  notes         text,
  placed_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE shop.order_items (
  id            bigserial PRIMARY KEY,
  order_id      bigint NOT NULL REFERENCES shop.orders (id) ON DELETE CASCADE,
  variant_id    bigint NOT NULL REFERENCES shop.product_variants (id),
  quantity      integer NOT NULL CHECK (quantity > 0),
  unit_price    numeric(10, 2) NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE shop.payments (
  id            bigserial PRIMARY KEY,
  order_id      bigint NOT NULL REFERENCES shop.orders (id) ON DELETE CASCADE,
  status        shop.payment_status NOT NULL DEFAULT 'pending',
  provider      text NOT NULL DEFAULT 'stripe',
  amount        numeric(12, 2) NOT NULL,
  currency      char(3) NOT NULL DEFAULT 'USD',
  reference     text NOT NULL UNIQUE,
  raw_response  jsonb,
  processed_at  timestamptz
);

CREATE TABLE shop.reviews (
  id            bigserial PRIMARY KEY,
  product_id    bigint NOT NULL REFERENCES shop.products (id) ON DELETE CASCADE,
  user_id       bigint NOT NULL REFERENCES shop.users (id),
  rating        smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title         text,
  body          text,
  is_verified   boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- analytics
-- ---------------------------------------------------------------------------

CREATE TABLE analytics.sessions (
  id            bigserial PRIMARY KEY,
  user_id       bigint REFERENCES shop.users (id),
  started_at    timestamptz NOT NULL DEFAULT now(),
  ended_at      timestamptz,
  ip            inet,
  user_agent    text,
  locale        text NOT NULL DEFAULT 'en-US'
);

CREATE TABLE analytics.page_views (
  id            bigserial PRIMARY KEY,
  session_id    bigint NOT NULL REFERENCES analytics.sessions (id) ON DELETE CASCADE,
  path          text NOT NULL,
  referrer      text,
  duration_ms   integer,
  viewed_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE analytics.events (
  id            bigserial PRIMARY KEY,
  session_id    bigint NOT NULL REFERENCES analytics.sessions (id) ON DELETE CASCADE,
  user_id       bigint REFERENCES shop.users (id),
  name          text NOT NULL,
  properties    jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at   timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- ops
-- ---------------------------------------------------------------------------

CREATE TABLE ops.feature_flags (
  id            bigserial PRIMARY KEY,
  key           text NOT NULL UNIQUE,
  description   text,
  enabled       boolean NOT NULL DEFAULT false,
  rollout_pct   smallint NOT NULL DEFAULT 0 CHECK (rollout_pct BETWEEN 0 AND 100),
  rules         jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ops.background_jobs (
  id            bigserial PRIMARY KEY,
  kind          text NOT NULL,
  status        ops.job_status NOT NULL DEFAULT 'queued',
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempts      integer NOT NULL DEFAULT 0,
  last_error    text,
  run_at        timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz
);

CREATE TABLE ops.audit_log (
  id            bigserial PRIMARY KEY,
  actor_id      bigint REFERENCES shop.users (id),
  action        text NOT NULL,
  entity        text NOT NULL,
  entity_id     text,
  payload       jsonb,
  ip            inet,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- indexes
-- ---------------------------------------------------------------------------

CREATE INDEX idx_users_org ON shop.users (organization_id);
CREATE INDEX idx_users_role ON shop.users (role) WHERE is_active;
CREATE INDEX idx_addresses_user ON shop.addresses (user_id);
CREATE INDEX idx_products_category ON shop.products (category_id);
CREATE INDEX idx_products_org ON shop.products (organization_id);
CREATE INDEX idx_products_tags ON shop.products USING gin (tags);
CREATE INDEX idx_products_attributes ON shop.products USING gin (attributes);
CREATE INDEX idx_variants_product ON shop.product_variants (product_id);
CREATE INDEX idx_inventory_variant ON shop.inventory (variant_id);
CREATE INDEX idx_orders_user ON shop.orders (user_id);
CREATE INDEX idx_orders_placed ON shop.orders (placed_at DESC);
CREATE INDEX idx_orders_open ON shop.orders (placed_at) WHERE status IN ('pending', 'paid');
CREATE INDEX idx_order_items_order ON shop.order_items (order_id);
CREATE INDEX idx_order_items_variant ON shop.order_items (variant_id);
CREATE INDEX idx_payments_order ON shop.payments (order_id);
CREATE INDEX idx_reviews_product ON shop.reviews (product_id);
CREATE INDEX idx_sessions_user ON analytics.sessions (user_id);
CREATE INDEX idx_sessions_started ON analytics.sessions (started_at);
CREATE INDEX idx_page_views_session ON analytics.page_views (session_id);
CREATE INDEX idx_page_views_path ON analytics.page_views (path);
CREATE INDEX idx_events_name_time ON analytics.events (name, occurred_at DESC);
CREATE INDEX idx_events_properties ON analytics.events USING gin (properties);
CREATE INDEX idx_jobs_status_run ON ops.background_jobs (status, run_at);
CREATE INDEX idx_audit_entity ON ops.audit_log (entity, created_at DESC);

-- ---------------------------------------------------------------------------
-- comments (shown in schema introspection)
-- ---------------------------------------------------------------------------

COMMENT ON SCHEMA shop IS 'Storefront catalog, customers, and commerce.';
COMMENT ON SCHEMA analytics IS 'Product analytics events and traffic.';
COMMENT ON SCHEMA ops IS 'Internal flags, jobs, and audit trail.';

COMMENT ON TABLE shop.organizations IS 'Merchant accounts that own catalog and staff users.';
COMMENT ON TABLE shop.users IS 'Storefront customers and merchant staff.';
COMMENT ON TABLE shop.addresses IS 'Shipping and billing addresses per user.';
COMMENT ON TABLE shop.categories IS 'Hierarchical product taxonomy.';
COMMENT ON TABLE shop.products IS 'Sellable catalog items with JSON attributes and tags.';
COMMENT ON TABLE shop.product_variants IS 'SKU-level options (size, color) for a product.';
COMMENT ON TABLE shop.warehouses IS 'Fulfillment locations.';
COMMENT ON TABLE shop.inventory IS 'On-hand and reserved stock per variant and warehouse.';
COMMENT ON TABLE shop.orders IS 'Customer checkouts.';
COMMENT ON TABLE shop.order_items IS 'Line items on an order.';
COMMENT ON TABLE shop.payments IS 'Payment attempts against an order.';
COMMENT ON TABLE shop.reviews IS 'Customer ratings and written reviews.';
COMMENT ON TABLE analytics.sessions IS 'Browser sessions, optionally tied to a user.';
COMMENT ON TABLE analytics.page_views IS 'Page hits within a session.';
COMMENT ON TABLE analytics.events IS 'Named product analytics events with JSON properties.';
COMMENT ON TABLE ops.feature_flags IS 'Runtime feature toggles.';
COMMENT ON TABLE ops.background_jobs IS 'Async worker queue.';
COMMENT ON TABLE ops.audit_log IS 'Mutating actions taken by staff or system.';

COMMENT ON COLUMN shop.users.metadata IS 'Profile extras: locale, marketing opt-in, etc.';
COMMENT ON COLUMN shop.products.attributes IS 'Free-form specs (material, wattage, dimensions).';
COMMENT ON COLUMN shop.products.tags IS 'Searchable labels used by storefront filters.';
COMMENT ON COLUMN shop.payments.raw_response IS 'Provider webhook / charge payload.';
COMMENT ON COLUMN analytics.events.properties IS 'Event-specific payload (path, sku, value).';