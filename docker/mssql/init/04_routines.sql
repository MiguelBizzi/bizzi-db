USE shop;
GO

CREATE OR ALTER PROCEDURE dbo.touch_user
  @id int,
  @name nvarchar(255) OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SELECT @name = full_name FROM dbo.users WHERE id = @id;
END
GO

CREATE OR ALTER FUNCTION dbo.twice(@n int)
RETURNS int
AS
BEGIN
  RETURN @n * 2;
END
GO

CREATE OR ALTER FUNCTION sales.order_ids(@customer int)
RETURNS TABLE
AS
RETURN (
  SELECT id, line_no FROM sales.orders WHERE customer_id = @customer
);
GO

CREATE OR ALTER FUNCTION sales.order_list(@customer int)
RETURNS @rows TABLE (id int, line_no int)
AS
BEGIN
  INSERT INTO @rows (id, line_no)
  SELECT id, line_no FROM sales.orders WHERE customer_id = @customer;
  RETURN;
END
GO
