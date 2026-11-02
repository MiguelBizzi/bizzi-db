USE shop;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'ix_users_active' AND object_id = OBJECT_ID(N'dbo.users')
)
CREATE INDEX ix_users_active ON dbo.users (email) WHERE is_active = 1;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'ix_users_email_inc' AND object_id = OBJECT_ID(N'dbo.users')
)
CREATE INDEX ix_users_email_inc ON dbo.users (email) INCLUDE (full_name);
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'ix_users_name' AND object_id = OBJECT_ID(N'dbo.users')
)
CREATE INDEX ix_users_name ON dbo.users (full_name DESC, email ASC);
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'ix_events_cs' AND object_id = OBJECT_ID(N'dbo.events')
)
CREATE NONCLUSTERED COLUMNSTORE INDEX ix_events_cs ON dbo.events (n, label);
GO
