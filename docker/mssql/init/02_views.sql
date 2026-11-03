USE shop;
GO

CREATE OR ALTER VIEW dbo.active_users
AS
SELECT id, email, full_name
FROM dbo.users
WHERE is_active = 1;
GO

IF OBJECT_ID(N'sales.order_totals', N'V') IS NULL
EXEC(N'
CREATE VIEW sales.order_totals
WITH SCHEMABINDING
AS
SELECT customer_id, COUNT_BIG(*) AS n, SUM(ISNULL(total, 0)) AS total
FROM sales.orders
GROUP BY customer_id
');
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'ix_order_totals' AND object_id = OBJECT_ID(N'sales.order_totals')
)
CREATE UNIQUE CLUSTERED INDEX ix_order_totals ON sales.order_totals (customer_id);
GO
