USE shop;
GO

CREATE OR ALTER TRIGGER dbo.users_after
ON dbo.users
AFTER INSERT
AS
BEGIN
  SET NOCOUNT ON;
END
GO

CREATE OR ALTER TRIGGER sales.orders_instead
ON sales.orders
INSTEAD OF DELETE
AS
BEGIN
  SET NOCOUNT ON;
  UPDATE sales.orders
  SET status = N'void'
  FROM sales.orders AS o
  INNER JOIN deleted AS d ON d.id = o.id AND d.line_no = o.line_no;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.sequences WHERE name = N'order_seq' AND schema_id = SCHEMA_ID(N'sales'))
CREATE SEQUENCE sales.order_seq AS int START WITH 1 INCREMENT BY 1;
GO

IF NOT EXISTS (SELECT 1 FROM sys.synonyms WHERE name = N'people')
CREATE SYNONYM dbo.people FOR dbo.users;
GO
