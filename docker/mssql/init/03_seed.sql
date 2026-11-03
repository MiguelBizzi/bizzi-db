USE shop;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.organizations)
INSERT INTO dbo.organizations (name, slug) VALUES (N'Bizzi', N'bizzi');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.users)
INSERT INTO dbo.users (organization_id, email, full_name)
SELECT 1, CONCAT(N'user', n.i, N'@example.com'), CONCAT(N'User ', n.i)
FROM (
  SELECT TOP (1200) ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS i
  FROM sys.all_objects AS a
  CROSS JOIN sys.all_objects AS b
) AS n;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.categories)
BEGIN
  INSERT INTO dbo.categories (parent_id, name) VALUES (NULL, N'Goods');
  INSERT INTO dbo.categories (parent_id, name)
  SELECT id, N'Books' FROM dbo.categories WHERE name = N'Goods';
END
GO

IF NOT EXISTS (SELECT 1 FROM sales.orders)
INSERT INTO sales.orders (id, line_no, customer_id, status, total, note)
VALUES
  (1, 1, 1, N'open', 12.50, N'héllo 你好'),
  (1, 2, 1, N'paid', 3.00, NULL);
GO

IF NOT EXISTS (SELECT 1 FROM hr.employees)
BEGIN
  INSERT INTO hr.employees (manager_id, name) VALUES (NULL, N'Ada');
  INSERT INTO hr.employees (manager_id, name)
  SELECT id, N'Grace' FROM hr.employees WHERE name = N'Ada';
END
GO

IF NOT EXISTS (SELECT 1 FROM ops.notes)
INSERT INTO ops.notes (body) VALUES (REPLICATE(N'long text ', 2000));
GO

IF NOT EXISTS (SELECT 1 FROM dbo.type_samples)
INSERT INTO dbo.type_samples (
  bit_col, tiny_col, small_col, big_col, dec_col, num_col, money_col, float_col, real_col,
  n_col, n_max, v_col, v_max, dt2, d, t, dto, uid, bin, bin_max, xml_col
) VALUES (
  1, 3, 4, 5, 123.45, -0.4500, 1.5000, 1.25, 2.5,
  N'café', CONVERT(nvarchar(max), REPLICATE(N'n', 4000)), 'plain', CONVERT(varchar(max), REPLICATE('v', 4000)),
  '2024-05-06 07:08:09.1234567', '2024-05-06', '07:08:09.1234567',
  '2024-05-06 07:08:09.1234567 -03:00', '0E984725-C51C-4BF4-9960-E1C80E27ABA0',
  0xDEAD, CONVERT(varbinary(max), REPLICATE(0xAB, 2000)), CONVERT(xml, N'<a/>')
);
GO

IF NOT EXISTS (SELECT 1 FROM dbo.[order])
INSERT INTO dbo.[order] (id, [a]]b], label) VALUES (1, N'bracket', N'order');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.[订单])
INSERT INTO dbo.[订单] (id, name) VALUES (1, N'北京');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.events)
INSERT INTO dbo.events (n, label)
SELECT TOP (200000)
  ROW_NUMBER() OVER (ORDER BY (SELECT NULL)),
  CONCAT(N'row', ROW_NUMBER() OVER (ORDER BY (SELECT NULL)))
FROM sys.all_objects AS a
CROSS JOIN sys.all_objects AS b
CROSS JOIN sys.all_objects AS c;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.wide)
INSERT INTO dbo.wide (c1) VALUES (1);
GO

USE analytics;
GO
IF NOT EXISTS (SELECT 1 FROM dbo.reports)
INSERT INTO dbo.reports (title) VALUES (N'isolated');
GO
