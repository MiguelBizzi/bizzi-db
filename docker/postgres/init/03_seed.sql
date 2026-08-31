-- Deterministic bulk seed. IDs follow insertion order (empty serials).

INSERT INTO shop.organizations (name, slug, plan, country, metadata, created_at)
SELECT
  format(
    '%s %s %s',
    (ARRAY['North','Bright','Cedar','Harbor','Summit','Lumen','Nimbus','Forge','Atlas','Pine'])[1 + ((i - 1) % 10)],
    (ARRAY['Labs','Goods','Studio','Market','Works','Supply','Collective','House'])[1 + (((i - 1) / 10) % 8)],
    i
  ),
  'org-' || i,
  (ARRAY['free','starter','growth','enterprise'])[1 + ((i - 1) % 4)],
  (ARRAY['US','BR','GB','DE','CA','AU','NL','JP'])[1 + ((i - 1) % 8)],
  jsonb_build_object(
    'employees', 8 + (i % 420),
    'industry', (ARRAY['retail','home','fashion','electronics'])[1 + ((i - 1) % 4)]
  ),
  timestamptz '2023-03-01' + (i || ' days')::interval
FROM generate_series(1, 40) AS s(i);

INSERT INTO shop.users (organization_id, email, full_name, role, is_active, last_login_at, metadata, created_at)
SELECT
  1 + ((i - 1) % 40),
  format('user.%s@shop.test', i),
  format(
    '%s %s',
    (ARRAY['Ada','Grace','Alan','Linus','Barbara','Ken','Edsger','Donald','Leslie','Frances','Margaret','Dennis','Bjarne','Guido','Brendan','Radia','Tim','James','Anders','Yukihiro'])[1 + ((i - 1) % 20)],
    (ARRAY['Lovelace','Hopper','Turing','Torvalds','Liskov','Thompson','Dijkstra','Knuth','Lamport','Allen','Hamilton','Ritchie','Stroustrup','van Rossum','Eich','Perlman','Berners-Lee','Gosling','Hejlsberg','Matsumoto'])[1 + (((i - 1) / 20) % 20)]
  ),
  CASE
    WHEN i <= 40 THEN 'admin'::shop.user_role
    WHEN i <= 140 THEN 'staff'::shop.user_role
    ELSE 'customer'::shop.user_role
  END,
  (i % 17) <> 0,
  CASE
    WHEN i % 9 = 0 THEN NULL
    ELSE timestamptz '2026-01-01' + ((i % 4000) || ' minutes')::interval
  END,
  jsonb_build_object(
    'locale', (ARRAY['en-US','pt-BR','en-GB','de-DE'])[1 + ((i - 1) % 4)],
    'marketing_opt_in', (i % 3) <> 0
  ),
  timestamptz '2023-06-01' + ((i * 3) || ' hours')::interval
FROM generate_series(1, 1200) AS s(i);

INSERT INTO shop.addresses (user_id, label, line1, line2, city, region, postal_code, country, is_default, created_at)
SELECT
  1 + ((i - 1) % 1200),
  (ARRAY['home','work','parents','cabin'])[1 + ((i - 1) % 4)],
  format('%s %s', 10 + (i % 890), (ARRAY['Oak St','Pine Ave','Market Rd','Harbor Blvd','Cedar Ln'])[1 + ((i - 1) % 5)]),
  CASE WHEN i % 5 = 0 THEN 'Apt ' || (i % 40) ELSE NULL END,
  (ARRAY['Austin','Lisbon','Berlin','Toronto','Seattle','Recife','London','Osaka'])[1 + ((i - 1) % 8)],
  (ARRAY['TX','LIS','BE','ON','WA','PE','LDN','OS'])[1 + ((i - 1) % 8)],
  lpad((10000 + (i % 90000))::text, 5, '0'),
  (ARRAY['US','PT','DE','CA','US','BR','GB','JP'])[1 + ((i - 1) % 8)],
  (i % 3) = 1,
  timestamptz '2023-07-01' + ((i * 2) || ' hours')::interval
FROM generate_series(1, 1800) AS s(i);

INSERT INTO shop.categories (name, slug, description, created_at)
SELECT
  (ARRAY[
    'Lighting','Seating','Tables','Storage','Textiles','Kitchen','Outdoor','Office',
    'Bedroom','Bath','Decor','Electronics'
  ])[1 + ((i - 1) % 12)] || ' ' || ((i - 1) / 12 + 1),
  'cat-' || i,
  'Browse ' || i || ' in the storefront taxonomy.',
  timestamptz '2023-01-15' + (i || ' days')::interval
FROM generate_series(1, 48) AS s(i);

UPDATE shop.categories
SET parent_id = 1 + ((id - 9) % 8)
WHERE id > 8;

INSERT INTO shop.products (
  organization_id, category_id, sku, name, description, base_price, currency,
  tags, attributes, is_published, created_at, updated_at
)
SELECT
  1 + ((i - 1) % 40),
  1 + ((i - 1) % 48),
  'SKU-' || lpad(i::text, 6, '0'),
  format(
    '%s %s',
    (ARRAY['Aurora','Nimbus','Cedar','Harbor','Lumen','Forge','Atlas','Pine','Quartz','Willow'])[1 + ((i - 1) % 10)],
    (ARRAY['Lamp','Chair','Desk','Shelf','Throw','Kettle','Planter','Monitor','Mirror','Rug'])[1 + (((i - 1) / 10) % 10)]
  ),
  CASE
    WHEN i % 50 = 0 THEN repeat('Hand-finished piece. ', 12)
    ELSE 'In-stock catalog item ' || i || ' for schema and grid testing.'
  END,
  (19.00 + ((i * 7) % 480) + ((i % 100) * 0.13))::numeric(10, 2),
  'USD',
  ARRAY[
    (ARRAY['new','sale','bestseller','limited'])[1 + ((i - 1) % 4)],
    (ARRAY['indoor','outdoor','kids','pro'])[1 + (((i - 1) / 4) % 4)]
  ],
  jsonb_build_object(
    'color', (ARRAY['ink','sand','oak','slate','ivory'])[1 + ((i - 1) % 5)],
    'weight_kg', round((0.4 + (i % 25) * 0.35)::numeric, 2),
    'warranty_months', (ARRAY[12, 24, 36])[1 + ((i - 1) % 3)]
  ),
  (i % 13) <> 0,
  timestamptz '2024-01-01' + ((i * 5) || ' hours')::interval,
  timestamptz '2024-01-01' + ((i * 5 + 12) || ' hours')::interval
FROM generate_series(1, 2500) AS s(i);

INSERT INTO shop.product_variants (product_id, sku, title, price, weight_grams, options, created_at)
SELECT
  p.id,
  p.sku || '-V' || k,
  (ARRAY['Small','Medium','Large'])[k],
  (p.base_price + ((k - 1) * 6.50))::numeric(10, 2),
  180 + (k * 90) + ((p.id % 700))::int,
  jsonb_build_object(
    'size', (ARRAY['S','M','L'])[k],
    'color', (ARRAY['ink','sand','oak','slate'])[1 + ((p.id + k) % 4)]
  ),
  p.created_at + (k || ' minutes')::interval
FROM shop.products p
CROSS JOIN generate_series(1, 3) AS k;

INSERT INTO shop.warehouses (code, name, city, country, is_active)
VALUES
  ('AUS-1', 'Austin DC', 'Austin', 'US', true),
  ('LIS-1', 'Lisbon DC', 'Lisbon', 'PT', true),
  ('BER-1', 'Berlin DC', 'Berlin', 'DE', true),
  ('YYZ-1', 'Toronto DC', 'Toronto', 'CA', true),
  ('SEA-1', 'Seattle DC', 'Seattle', 'US', true),
  ('REC-1', 'Recife DC', 'Recife', 'BR', true),
  ('LHR-1', 'London DC', 'London', 'GB', true),
  ('KIX-1', 'Osaka DC', 'Osaka', 'JP', false);

INSERT INTO shop.inventory (warehouse_id, variant_id, quantity, reserved, updated_at)
SELECT
  1 + ((v.id - 1) % 7),
  v.id,
  4 + (v.id % 380),
  (v.id % 12),
  now() - ((v.id % 2000) || ' minutes')::interval
FROM shop.product_variants v;

INSERT INTO shop.orders (
  user_id, shipping_address_id, status, subtotal, tax, shipping, total, notes, placed_at
)
SELECT
  uid,
  uid,
  (ARRAY['pending','paid','shipped','delivered','cancelled']::shop.order_status[])[1 + ((i - 1) % 5)],
  subtotal,
  round(subtotal * 0.08, 2),
  CASE WHEN i % 6 = 0 THEN 0 ELSE 8.50 END,
  round(subtotal * 1.08, 2) + CASE WHEN i % 6 = 0 THEN 0 ELSE 8.50 END,
  CASE WHEN i % 40 = 0 THEN repeat('Leave at the door. ', 10) ELSE NULL END,
  timestamptz '2024-06-01' + ((i * 80) || ' minutes')::interval
FROM (
  SELECT
    i,
    1 + ((i - 1) % 1200) AS uid,
    (24.00 + ((i * 11) % 260))::numeric(12, 2) AS subtotal
  FROM generate_series(1, 8000) AS s(i)
) o;

INSERT INTO shop.order_items (order_id, variant_id, quantity, unit_price, created_at)
SELECT
  o.id,
  1 + ((o.id * k * 17) % 7500),
  1 + (k % 3),
  (12.00 + ((o.id + k) % 180) + (k * 0.25))::numeric(10, 2),
  o.placed_at + (k || ' seconds')::interval
FROM shop.orders o
CROSS JOIN generate_series(1, 3) AS k;

INSERT INTO shop.payments (order_id, status, provider, amount, currency, reference, raw_response, processed_at)
SELECT
  o.id,
  CASE o.status
    WHEN 'cancelled' THEN 'refunded'::shop.payment_status
    WHEN 'pending' THEN (ARRAY['pending','failed']::shop.payment_status[])[1 + (o.id % 2)]
    ELSE 'succeeded'::shop.payment_status
  END,
  (ARRAY['stripe','adyen','paypal'])[1 + ((o.id - 1) % 3)],
  o.total,
  'USD',
  'pay_' || lpad(o.id::text, 8, '0'),
  jsonb_build_object('ok', o.status <> 'cancelled', 'attempt', 1 + (o.id % 3)),
  CASE WHEN o.status = 'pending' THEN NULL ELSE o.placed_at + interval '2 minutes' END
FROM shop.orders o;

INSERT INTO shop.reviews (product_id, user_id, rating, title, body, is_verified, created_at)
SELECT
  1 + ((i - 1) % 2500),
  141 + ((i - 1) % 1060),
  1 + (i % 5),
  (ARRAY['Great','Okay','Not as pictured','Perfect','Too small'])[1 + ((i - 1) % 5)],
  CASE
    WHEN i % 20 = 0 THEN repeat('Detailed review for UI wrapping. ', 15)
    ELSE 'Seeded review ' || i || '.'
  END,
  (i % 4) = 0,
  timestamptz '2024-08-01' + ((i * 45) || ' minutes')::interval
FROM generate_series(1, 5000) AS s(i);

INSERT INTO analytics.sessions (user_id, started_at, ended_at, ip, user_agent, locale)
SELECT
  CASE WHEN i % 7 = 0 THEN NULL ELSE 1 + ((i - 1) % 1200) END,
  started,
  CASE WHEN i % 11 = 0 THEN NULL ELSE started + ((3 + (i % 40)) || ' minutes')::interval END,
  ('10.' || ((i / 256) % 256) || '.' || (i % 256) || '.' || (1 + (i % 254)))::inet,
  (ARRAY[
    'Mozilla/5.0 (Macintosh; Intel Mac OS X) Safari/17',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128',
    'Mozilla/5.0 (X11; Linux x86_64) Firefox/129'
  ])[1 + ((i - 1) % 3)],
  (ARRAY['en-US','pt-BR','en-GB','de-DE'])[1 + ((i - 1) % 4)]
FROM (
  SELECT
    i,
    timestamptz '2025-12-01' + ((i * 12) || ' minutes')::interval AS started
  FROM generate_series(1, 15000) AS s(i)
) s;

INSERT INTO analytics.page_views (session_id, path, referrer, duration_ms, viewed_at)
SELECT
  1 + ((i - 1) % 15000),
  (ARRAY['/','/catalog','/product','/cart','/checkout','/account'])[1 + ((i - 1) % 6)]
    || CASE WHEN i % 6 = 3 THEN '/' || (1 + (i % 2500)) ELSE '' END,
  CASE
    WHEN i % 8 = 0 THEN NULL
    ELSE (ARRAY['https://google.com','https://bing.com','https://shop.test'])[1 + ((i - 1) % 3)]
  END,
  400 + (i % 12000),
  timestamptz '2025-12-01' + ((i * 4) || ' minutes')::interval
FROM generate_series(1, 45000) AS s(i);

INSERT INTO analytics.events (session_id, user_id, name, properties, occurred_at)
SELECT
  1 + ((i - 1) % 15000),
  CASE WHEN i % 7 = 0 THEN NULL ELSE 1 + ((i - 1) % 1200) END,
  (ARRAY['view_item','add_to_cart','begin_checkout','purchase','search'])[1 + ((i - 1) % 5)],
  jsonb_build_object(
    'sku', 'SKU-' || lpad(((i % 2500) + 1)::text, 6, '0'),
    'value', round((10 + (i % 90) + (i % 10) * 0.15)::numeric, 2),
    'ok', (i % 19) <> 0
  ),
  timestamptz '2025-12-01' + ((i * 3) || ' minutes')::interval
FROM generate_series(1, 60000) AS s(i);

INSERT INTO ops.feature_flags (key, description, enabled, rollout_pct, rules, updated_at)
SELECT
  'flag.' || key,
  'Toggle for ' || key,
  enabled,
  rollout,
  jsonb_build_object('environments', ARRAY['development','staging'], 'sticky', enabled),
  now() - (rollout || ' days')::interval
FROM (
  VALUES
    ('new_checkout', true, 100),
    ('search_v2', true, 80),
    ('reviews_ai_summary', false, 10),
    ('dark_mode', true, 100),
    ('inventory_push', true, 50),
    ('erp_sync', false, 0),
    ('gift_cards', true, 25),
    ('multi_warehouse', true, 60),
    ('guest_checkout', true, 100),
    ('loyalty_points', false, 5),
    ('image_cdn', true, 100),
    ('slow_query_panel', true, 100),
    ('erd_beta', true, 40),
    ('csv_export_v2', false, 0),
    ('row_level_security', false, 0),
    ('query_history', true, 100),
    ('saved_views', true, 70),
    ('keyboard_grid', true, 90),
    ('json_editor', true, 100),
    ('metrics_live', false, 15),
    ('audit_export', true, 35),
    ('sso', false, 0),
    ('webhooks', true, 55),
    ('rate_limit_relax', false, 20)
) AS f(key, enabled, rollout);

INSERT INTO ops.background_jobs (kind, status, payload, attempts, last_error, run_at, finished_at)
SELECT
  (ARRAY['reindex','email.receipt','inventory.sync','search.reheat','report.daily'])[1 + ((i - 1) % 5)],
  (ARRAY['queued','running','succeeded','failed']::ops.job_status[])[1 + ((i - 1) % 4)],
  jsonb_build_object('n', i, 'shard', i % 16),
  i % 5,
  CASE WHEN i % 4 = 0 THEN 'timeout after 30s' ELSE NULL END,
  timestamptz '2026-01-01' + ((i * 8) || ' minutes')::interval,
  CASE WHEN i % 4 IN (1, 2) THEN NULL ELSE timestamptz '2026-01-01' + ((i * 8 + 3) || ' minutes')::interval END
FROM generate_series(1, 4000) AS s(i);

INSERT INTO ops.audit_log (actor_id, action, entity, entity_id, payload, ip, created_at)
SELECT
  CASE WHEN i % 15 = 0 THEN NULL ELSE 1 + ((i - 1) % 140) END,
  (ARRAY['create','update','delete','login','export'])[1 + ((i - 1) % 5)],
  (ARRAY['shop.products','shop.orders','shop.users','ops.feature_flags'])[1 + ((i - 1) % 4)],
  (1 + (i % 2500))::text,
  jsonb_build_object('source', 'seed', 'i', i),
  ('192.168.' || (i % 20) || '.' || (1 + (i % 250)))::inet,
  timestamptz '2025-09-01' + ((i * 6) || ' minutes')::interval
FROM generate_series(1, 12000) AS s(i);

REFRESH MATERIALIZED VIEW shop.mv_revenue_by_day;
ANALYZE;

DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT n.nspname AS schema_name, c.relname AS rel, c.reltuples::bigint AS est
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('shop', 'analytics', 'ops')
      AND c.relkind IN ('r', 'm')
    ORDER BY n.nspname, c.relname
  LOOP
    RAISE NOTICE 'seeded %.% ~ % rows', rec.schema_name, rec.rel, rec.est;
  END LOOP;
END $$;
