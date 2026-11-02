-- shop is the connection database. analytics is a second database so a shop
-- connection cannot see it. Schemas inside shop are what the sidebar lists.
IF DB_ID(N'shop') IS NULL CREATE DATABASE shop;
GO
IF DB_ID(N'analytics') IS NULL CREATE DATABASE analytics;
GO

USE shop;
GO

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'sales') EXEC(N'CREATE SCHEMA sales');
GO
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'hr') EXEC(N'CREATE SCHEMA hr');
GO
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'ops') EXEC(N'CREATE SCHEMA ops');
GO
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'analytics') EXEC(N'CREATE SCHEMA analytics');
GO

IF OBJECT_ID(N'dbo.organizations', N'U') IS NULL
CREATE TABLE dbo.organizations (
  id int IDENTITY(1, 1) NOT NULL PRIMARY KEY,
  name nvarchar(200) NOT NULL,
  slug nvarchar(200) NOT NULL,
  [plan] nvarchar(32) NOT NULL CONSTRAINT df_organizations_plan DEFAULT (N'free'),
  created_at datetime2(7) NOT NULL CONSTRAINT df_organizations_created DEFAULT (SYSUTCDATETIME()),
  CONSTRAINT organizations_slug_key UNIQUE (slug)
);
GO

IF OBJECT_ID(N'dbo.users', N'U') IS NULL
CREATE TABLE dbo.users (
  id int IDENTITY(1, 1) NOT NULL PRIMARY KEY,
  organization_id int NOT NULL,
  email nvarchar(255) NOT NULL,
  full_name nvarchar(255) NOT NULL,
  is_active bit NOT NULL CONSTRAINT df_users_active DEFAULT (1),
  last_login_at datetime2(7) NULL,
  full_name_upper AS (UPPER(full_name)),
  full_name_stored AS (UPPER(full_name)) PERSISTED,
  row_version rowversion NOT NULL,
  created_at datetime2(7) NOT NULL CONSTRAINT df_users_created DEFAULT (SYSUTCDATETIME()),
  CONSTRAINT users_email_key UNIQUE (email),
  CONSTRAINT users_email_chk CHECK (email LIKE N'%@%'),
  CONSTRAINT users_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES dbo.organizations (id)
);
GO

IF OBJECT_ID(N'dbo.addresses', N'U') IS NULL
CREATE TABLE dbo.addresses (
  id int IDENTITY(1, 1) NOT NULL PRIMARY KEY,
  user_id int NOT NULL,
  label nvarchar(32) NOT NULL CONSTRAINT df_addresses_label DEFAULT (N'home'),
  line1 nvarchar(255) NOT NULL,
  city nvarchar(255) NOT NULL,
  CONSTRAINT addresses_user_id_fkey FOREIGN KEY (user_id) REFERENCES dbo.users (id) ON DELETE CASCADE
);
GO

IF OBJECT_ID(N'dbo.categories', N'U') IS NULL
CREATE TABLE dbo.categories (
  id int IDENTITY(1, 1) NOT NULL PRIMARY KEY,
  parent_id int NULL,
  name nvarchar(255) NOT NULL,
  CONSTRAINT categories_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES dbo.categories (id)
);
GO

IF OBJECT_ID(N'sales.orders', N'U') IS NULL
CREATE TABLE sales.orders (
  id int NOT NULL,
  line_no int NOT NULL,
  customer_id int NULL,
  status nvarchar(32) NOT NULL CONSTRAINT df_orders_status DEFAULT (N'open'),
  total decimal(12, 2) NOT NULL CONSTRAINT df_orders_total DEFAULT (0),
  note nvarchar(200) NULL,
  CONSTRAINT orders_pk PRIMARY KEY (id, line_no),
  CONSTRAINT orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES dbo.users (id) ON DELETE SET NULL,
  CONSTRAINT orders_status_chk CHECK (status IN (N'open', N'paid', N'void'))
);
GO

IF OBJECT_ID(N'sales.shipments', N'U') IS NULL
CREATE TABLE sales.shipments (
  id int IDENTITY(1000, 10) NOT NULL PRIMARY KEY,
  order_id int NOT NULL,
  line_no int NOT NULL,
  carrier nvarchar(40) NULL CONSTRAINT df_shipments_carrier DEFAULT (N'ground'),
  CONSTRAINT shipments_order_fkey FOREIGN KEY (order_id, line_no) REFERENCES sales.orders (id, line_no) ON DELETE CASCADE ON UPDATE CASCADE
);
GO

IF OBJECT_ID(N'hr.employees', N'U') IS NULL
CREATE TABLE hr.employees (
  id int IDENTITY(1, 1) NOT NULL PRIMARY KEY,
  name nvarchar(200) NOT NULL,
  badge int NULL CONSTRAINT df_employees_badge DEFAULT (0),
  manager_id int NULL CONSTRAINT df_employees_manager DEFAULT (NULL),
  CONSTRAINT employees_manager_fkey FOREIGN KEY (manager_id) REFERENCES hr.employees (id)
);
GO

IF OBJECT_ID(N'hr.badges', N'U') IS NULL
CREATE TABLE hr.badges (
  id int IDENTITY(1, 1) NOT NULL PRIMARY KEY,
  employee_id int NULL CONSTRAINT df_badges_employee DEFAULT (NULL),
  label nvarchar(40) NOT NULL,
  CONSTRAINT badges_employee_fkey FOREIGN KEY (employee_id) REFERENCES hr.employees (id) ON DELETE SET DEFAULT
);
GO

IF OBJECT_ID(N'ops.notes', N'U') IS NULL
CREATE TABLE ops.notes (
  body nvarchar(max) NOT NULL,
  written_at datetime2(7) NOT NULL CONSTRAINT df_notes_written DEFAULT (SYSUTCDATETIME())
);
GO

IF OBJECT_ID(N'dbo.type_samples', N'U') IS NULL
CREATE TABLE dbo.type_samples (
  id int IDENTITY(1, 1) NOT NULL PRIMARY KEY,
  bit_col bit NULL,
  tiny_col tinyint NULL,
  small_col smallint NULL,
  big_col bigint NULL,
  dec_col decimal(10, 2) NULL,
  num_col numeric(8, 4) NULL,
  money_col money NULL,
  float_col float NULL,
  real_col real NULL,
  n_col nvarchar(50) NULL,
  n_max nvarchar(max) NULL,
  v_col varchar(40) NULL,
  v_max varchar(max) NULL,
  dt2 datetime2(7) NULL,
  d date NULL,
  t time(7) NULL,
  dto datetimeoffset(7) NULL,
  uid uniqueidentifier NULL,
  bin varbinary(16) NULL,
  bin_max varbinary(max) NULL,
  xml_col xml NULL,
  rv rowversion NOT NULL,
  doubled AS (dec_col * 2),
  doubled_stored AS (dec_col * 3) PERSISTED
);
GO

IF OBJECT_ID(N'[dbo].[order]', N'U') IS NULL
CREATE TABLE dbo.[order] (
  id int NOT NULL PRIMARY KEY,
  [a]]b] nvarchar(40) NULL,
  label nvarchar(40) NULL
);
GO

IF OBJECT_ID(N'[dbo].[订单]', N'U') IS NULL
CREATE TABLE dbo.[订单] (
  id int NOT NULL PRIMARY KEY,
  name nvarchar(50) NOT NULL
);
GO

IF OBJECT_ID(N'dbo.events', N'U') IS NULL
CREATE TABLE dbo.events (
  id int IDENTITY(1, 1) NOT NULL PRIMARY KEY,
  n int NOT NULL,
  label nvarchar(40) NOT NULL
);
GO

IF OBJECT_ID(N'dbo.wide', N'U') IS NULL
BEGIN
  DECLARE @cols nvarchar(max) = N'id int IDENTITY(1, 1) NOT NULL PRIMARY KEY';
  DECLARE @i int = 1;
  WHILE @i <= 100
  BEGIN
    SET @cols += N', c' + CONVERT(nvarchar(3), @i) + N' int NULL';
    SET @i += 1;
  END
  EXEC(N'CREATE TABLE dbo.wide (' + @cols + N')');
END
GO

USE analytics;
GO
IF OBJECT_ID(N'dbo.reports', N'U') IS NULL
CREATE TABLE dbo.reports (
  id int IDENTITY(1, 1) NOT NULL PRIMARY KEY,
  title nvarchar(100) NOT NULL
);
GO
