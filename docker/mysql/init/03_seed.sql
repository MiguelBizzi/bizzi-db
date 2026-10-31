SET NAMES utf8mb4;
SET SESSION sql_mode = 'STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION,ERROR_FOR_DIVISION_BY_ZERO';

USE shop;

-- 1..100000. Five digits cross-joined so we never raise cte_max_recursion_depth.
CREATE TABLE _n (n INT NOT NULL PRIMARY KEY);
INSERT INTO _n (n)
SELECT seq.n
FROM (
  SELECT a.d + b.d * 10 + c.d * 100 + d.d * 1000 + e.d * 10000 + 1 AS n
  FROM
    (SELECT 0 AS d UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) a
    CROSS JOIN (SELECT 0 AS d UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) b
    CROSS JOIN (SELECT 0 AS d UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) c
    CROSS JOIN (SELECT 0 AS d UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) d
    CROSS JOIN (SELECT 0 AS d UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) e
) seq;

INSERT INTO organizations (id, name, slug, plan, country, metadata, created_at)
SELECT
  n,
  CONCAT('Org ', n),
  CONCAT('org-', n),
  IF(n % 5 = 0, 'pro', 'free'),
  IF(n % 2 = 0, 'BR', 'US'),
  JSON_OBJECT('seats', n),
  TIMESTAMP('2022-01-01') + INTERVAL n DAY
FROM _n WHERE n <= 40;

INSERT INTO users (id, organization_id, email, full_name, role, is_active, last_login_at, metadata, created_at)
SELECT
  n,
  1 + ((n - 1) % 40),
  CONCAT('user.', n, '@shop.test'),
  CONCAT('User ', n),
  CASE WHEN n <= 40 THEN 'admin' WHEN n <= 140 THEN 'staff' ELSE 'customer' END,
  (n % 17) <> 0,
  IF(n % 9 = 0, NULL, TIMESTAMP('2026-01-01') + INTERVAL (n % 4000) MINUTE),
  JSON_OBJECT('locale', 'en-US', 'marketing_opt_in', (n % 3) <> 0),
  TIMESTAMP('2023-06-01') + INTERVAL (n * 3) HOUR
FROM _n WHERE n <= 1200;

UPDATE users SET full_name = 'Yuki 😀' WHERE id = 1;

INSERT INTO addresses (id, user_id, label, line1, line2, city, region, postal_code, country, is_default, created_at)
SELECT
  n,
  1 + ((n - 1) % 1200),
  ELT(1 + ((n - 1) % 4), 'home', 'work', 'parents', 'cabin'),
  CONCAT(n, ' Market St'),
  IF(n % 4 = 0, NULL, CONCAT('Apt ', n % 20)),
  'Lisbon',
  NULL,
  LPAD(n % 10000, 5, '0'),
  'PT',
  n % 3 = 0,
  TIMESTAMP('2024-01-01') + INTERVAL n HOUR
FROM _n WHERE n <= 1800;

INSERT INTO categories (id, parent_id, name, slug, description, created_at)
SELECT n, NULL, CONCAT('Category ', n), CONCAT('cat-', n), NULL, TIMESTAMP('2022-03-01')
FROM _n WHERE n <= 48;

INSERT INTO products (
  id, organization_id, category_id, sku, name, description, base_price, currency,
  tags, attributes, is_published, created_at, updated_at
)
SELECT
  n,
  1 + ((n - 1) % 40),
  1 + ((n - 1) % 48),
  CONCAT('SKU-', n),
  CONCAT('Product ', n),
  IF(n % 11 = 0, NULL, CONCAT('Description ', n)),
  ROUND(1 + (n % 5000) / 10, 2),
  'USD',
  JSON_ARRAY(n % 7, n % 3),
  JSON_OBJECT('color', IF(n % 2 = 0, 'red', 'blue')),
  n % 13 <> 0,
  TIMESTAMP('2023-01-01') + INTERVAL n HOUR,
  TIMESTAMP('2024-01-01') + INTERVAL n HOUR
FROM _n WHERE n <= 2500;

INSERT INTO product_variants (id, product_id, sku, title, price, weight_grams, options, created_at)
SELECT
  (p.n - 1) * 3 + k.n,
  p.n,
  CONCAT('SKU-', p.n, '-', k.n),
  CONCAT('Variant ', k.n),
  ROUND(1 + (p.n % 2000) / 10, 2),
  100 + k.n,
  JSON_OBJECT('size', k.n),
  TIMESTAMP('2023-02-01')
FROM _n p
CROSS JOIN (SELECT 1 AS n UNION ALL SELECT 2 UNION ALL SELECT 3) k
WHERE p.n <= 2500;

INSERT INTO warehouses (id, code, name, city, country, is_active) VALUES
  (1, 'LIS', 'Lisbon', 'Lisbon', 'PT', TRUE),
  (2, 'NYC', 'New York', 'New York', 'US', TRUE),
  (3, 'GRU', 'Guarulhos', 'Sao Paulo', 'BR', FALSE);

INSERT INTO inventory (warehouse_id, variant_id, quantity, reserved, updated_at)
SELECT
  1 + ((n - 1) % 3),
  n,
  n % 50,
  n % 5,
  TIMESTAMP('2025-01-01')
FROM _n WHERE n <= 3000;

INSERT INTO orders (id, user_id, shipping_address_id, status, subtotal, tax, shipping, total, notes, placed_at)
SELECT
  n,
  1 + ((n - 1) % 1200),
  1 + ((n - 1) % 1800),
  ELT(1 + (n % 5), 'pending', 'paid', 'shipped', 'delivered', 'cancelled'),
  10 + (n % 100),
  1,
  2,
  13 + (n % 100),
  IF(n % 20 = 0, NULL, 'ok'),
  TIMESTAMP('2025-06-01') + INTERVAL n MINUTE
FROM _n WHERE n <= 8000;

INSERT INTO order_items (order_id, variant_id, quantity, unit_price, created_at)
SELECT
  o.n,
  1 + ((o.n + k.n) % 7500),
  k.n,
  5 + k.n,
  TIMESTAMP('2025-06-01')
FROM _n o
CROSS JOIN (SELECT 1 AS n UNION ALL SELECT 2 UNION ALL SELECT 3) k
WHERE o.n <= 8000;

INSERT INTO payments (order_id, status, provider, amount, currency, reference, raw_response, processed_at)
SELECT
  n,
  IF(n % 8 = 0, 'failed', 'succeeded'),
  'stripe',
  13 + (n % 100),
  'USD',
  CONCAT('pay-', n),
  JSON_OBJECT('ok', TRUE),
  TIMESTAMP('2025-06-02')
FROM _n WHERE n <= 8000;

INSERT INTO reviews (product_id, user_id, rating, title, body, is_verified, created_at)
SELECT
  1 + ((n - 1) % 2500),
  1 + ((n - 1) % 1200),
  1 + (n % 5),
  CONCAT('Review ', n),
  IF(n % 6 = 0, NULL, CONCAT('Body ', n)),
  n % 2 = 0,
  TIMESTAMP('2025-07-01') + INTERVAL n MINUTE
FROM _n WHERE n <= 5000;

INSERT INTO `order` (`key`, `Order`, `we``ird`) VALUES (1, 'first', 'tick');

INSERT INTO type_samples (
  signed_tiny, signed_small, signed_medium, signed_int, signed_big, unsigned_int,
  money, approx_float, approx_double, bits, flag, yr, day_on, when_at, clock,
  fixed_char, short_text, tiny_note, note, medium_note, long_note,
  tiny_blob, blob_col, raw_fixed, raw_var, payload, color, tags, where_at, shape, comment_col
) VALUES (
  -1, -2, -3, -4, -5, 6,
  1.2500, 1.5, 2.5, b'00001010', TRUE, 2026, '2026-10-30', '2026-10-30 12:00:00.123456', '01:02:03',
  'AB', 'emoji 😀', NULL, NULL, NULL, REPEAT('x', 8000),
  NULL, UNHEX('DEADBEEF'), UNHEX('01020304'), UNHEX('AA'),
  JSON_ARRAY(1, 'two'), 'green', 'a,c',
  ST_GeomFromText('POINT(0 0)', 4326), NULL, 'hello'
);

USE analytics;

INSERT INTO sessions (id, user_id, started_at, ended_at, ip, user_agent, locale)
SELECT
  n,
  IF(n % 10 = 0, NULL, 1 + ((n - 1) % 1200)),
  TIMESTAMP('2026-01-01') + INTERVAL n MINUTE,
  TIMESTAMP('2026-01-01') + INTERVAL (n + 5) MINUTE,
  '127.0.0.1',
  'seed',
  'en-US'
FROM shop._n WHERE n <= 15000;

INSERT INTO page_views (session_id, path, referrer, duration_ms, viewed_at)
SELECT
  1 + ((n - 1) % 15000),
  CONCAT('/p/', n),
  NULL,
  n % 10000,
  TIMESTAMP('2026-02-01') + INTERVAL n SECOND
FROM shop._n WHERE n <= 45000;

INSERT INTO events (session_id, user_id, name, properties, occurred_at)
SELECT
  1 + ((n - 1) % 15000),
  IF(n % 10 = 0, NULL, 1 + ((n - 1) % 1200)),
  ELT(1 + (n % 3), 'view', 'click', 'buy'),
  JSON_ARRAY(n),
  TIMESTAMP('2026-03-01') + INTERVAL n SECOND
FROM shop._n WHERE n <= 60000;

USE ops;

INSERT INTO feature_flags (flag_key, description, enabled, rollout_pct, rules, updated_at) VALUES
  ('new-checkout', 'Checkout rewrite', TRUE, 25, JSON_OBJECT(), CURRENT_TIMESTAMP(6)),
  ('dark-mode', 'Dark theme', FALSE, 0, JSON_OBJECT(), CURRENT_TIMESTAMP(6));

INSERT INTO background_jobs (kind, status, payload, attempts, last_error, run_at, finished_at)
SELECT
  'email',
  ELT(1 + (n % 4), 'queued', 'running', 'succeeded', 'failed'),
  JSON_OBJECT('n', n),
  n % 3,
  IF(n % 4 = 0, 'nope', NULL),
  TIMESTAMP('2026-04-01') + INTERVAL n MINUTE,
  NULL
FROM shop._n WHERE n <= 4000;

INSERT INTO audit_log (actor_id, action, entity, entity_id, payload, ip, created_at)
SELECT
  1 + ((n - 1) % 1200),
  'seed',
  'users',
  CAST(n AS CHAR),
  JSON_OBJECT('n', n),
  '127.0.0.1',
  TIMESTAMP('2026-05-01') + INTERVAL n SECOND
FROM shop._n WHERE n <= 12000;

INSERT INTO api_keys (owner_id, label, prefix, revoked_at) VALUES
  (1, 'ci', 'ck_live', NULL),
  (2, 'old', 'ck_old', TIMESTAMP('2025-01-01'));

INSERT INTO maintenance_windows (title, during_start, during_end) VALUES
  ('catalog rebuild', TIMESTAMP('2026-12-01 01:00:00'), TIMESTAMP('2026-12-01 03:00:00'));

DROP TABLE shop._n;
