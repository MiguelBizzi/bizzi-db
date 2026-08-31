CREATE VIEW shop.v_order_summary AS
SELECT
  o.id,
  o.status,
  o.placed_at,
  u.email AS customer_email,
  u.full_name AS customer_name,
  org.name AS merchant,
  o.subtotal,
  o.tax,
  o.shipping,
  o.total,
  (
    SELECT COUNT(*)::int
    FROM shop.order_items oi
    WHERE oi.order_id = o.id
  ) AS item_count
FROM shop.orders o
JOIN shop.users u ON u.id = o.user_id
JOIN shop.organizations org ON org.id = u.organization_id;

COMMENT ON VIEW shop.v_order_summary IS 'Orders with customer and merchant labels.';

CREATE VIEW shop.v_product_catalog AS
SELECT
  p.id,
  p.sku,
  p.name,
  c.name AS category,
  p.base_price,
  p.tags,
  p.is_published,
  COUNT(v.id) AS variant_count,
  COALESCE(SUM(i.quantity), 0)::int AS on_hand
FROM shop.products p
JOIN shop.categories c ON c.id = p.category_id
LEFT JOIN shop.product_variants v ON v.product_id = p.id
LEFT JOIN shop.inventory i ON i.variant_id = v.id
GROUP BY p.id, c.name;

COMMENT ON VIEW shop.v_product_catalog IS 'Published catalog with variant and stock totals.';

CREATE VIEW analytics.v_daily_traffic AS
SELECT
  date_trunc('day', viewed_at)::date AS day,
  COUNT(*)::bigint AS views,
  COUNT(DISTINCT session_id)::bigint AS sessions
FROM analytics.page_views
GROUP BY 1;

COMMENT ON VIEW analytics.v_daily_traffic IS 'Daily page-view and session counts.';

CREATE MATERIALIZED VIEW shop.mv_revenue_by_day AS
SELECT
  date_trunc('day', placed_at)::date AS day,
  status,
  COUNT(*)::bigint AS orders,
  SUM(total)::numeric(14, 2) AS revenue
FROM shop.orders
GROUP BY 1, 2
WITH NO DATA;

COMMENT ON MATERIALIZED VIEW shop.mv_revenue_by_day IS 'Daily order volume and revenue by status.';
