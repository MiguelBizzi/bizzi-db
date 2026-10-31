-- MySQL 8.4 seed. Three databases mirror the Postgres schemas so the shared
-- conformance suite can look for shop.users. DDL commits implicitly; each
-- file is its own script.
SET NAMES utf8mb4;
SET SESSION sql_mode = 'STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION,ERROR_FOR_DIVISION_BY_ZERO';
SET GLOBAL sql_mode = 'STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION,ERROR_FOR_DIVISION_BY_ZERO';
-- GitHub's mysql service cannot override the image command, so function
-- creation on a binlog-enabled server is allowed from the seed itself.
SET GLOBAL log_bin_trust_function_creators = 1;

CREATE DATABASE IF NOT EXISTS shop CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE IF NOT EXISTS analytics CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE IF NOT EXISTS ops CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

USE shop;

CREATE TABLE organizations (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  plan VARCHAR(32) NOT NULL DEFAULT 'free',
  country CHAR(2) NOT NULL DEFAULT 'US',
  metadata JSON NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY organizations_slug_key (slug)
) ENGINE=InnoDB COMMENT='Tenant root';

CREATE TABLE users (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  organization_id BIGINT NOT NULL,
  email VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  role ENUM('admin', 'staff', 'customer') NOT NULL DEFAULT 'customer',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at DATETIME(6) NULL,
  metadata JSON NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  full_name_upper VARCHAR(255) AS (UPPER(full_name)) VIRTUAL,
  UNIQUE KEY users_email_key (email),
  CONSTRAINT users_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations (id),
  CONSTRAINT users_email_chk CHECK (email LIKE '%@%')
) ENGINE=InnoDB COMMENT='People who can sign in';

CREATE TABLE addresses (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  label VARCHAR(32) NOT NULL DEFAULT 'home',
  line1 VARCHAR(255) NOT NULL,
  line2 VARCHAR(255) NULL,
  city VARCHAR(255) NOT NULL,
  region VARCHAR(255) NULL,
  postal_code VARCHAR(32) NOT NULL,
  country CHAR(2) NOT NULL DEFAULT 'US',
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT addresses_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE categories (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  parent_id BIGINT NULL,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  description TEXT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY categories_slug_key (slug),
  CONSTRAINT categories_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES categories (id)
) ENGINE=InnoDB;

CREATE TABLE products (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  organization_id BIGINT NOT NULL,
  category_id BIGINT NOT NULL,
  sku VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  base_price DECIMAL(10, 2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  tags JSON NOT NULL,
  attributes JSON NOT NULL,
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  name_stored VARCHAR(255) AS (UPPER(name)) STORED,
  UNIQUE KEY products_sku_key (sku),
  CONSTRAINT products_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations (id),
  CONSTRAINT products_category_id_fkey FOREIGN KEY (category_id) REFERENCES categories (id),
  CONSTRAINT products_price_chk CHECK (base_price >= 0)
) ENGINE=InnoDB;

CREATE TABLE product_variants (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  product_id BIGINT NOT NULL,
  sku VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  weight_grams INT NULL,
  options JSON NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY product_variants_sku_key (sku),
  CONSTRAINT product_variants_product_id_fkey FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE warehouses (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(32) NOT NULL,
  name VARCHAR(255) NOT NULL,
  city VARCHAR(255) NOT NULL,
  country CHAR(2) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE KEY warehouses_code_key (code)
) ENGINE=InnoDB;

CREATE TABLE inventory (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  warehouse_id BIGINT NOT NULL,
  variant_id BIGINT NOT NULL,
  quantity INT NOT NULL DEFAULT 0,
  reserved INT NOT NULL DEFAULT 0,
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY inventory_warehouse_variant_key (warehouse_id, variant_id),
  CONSTRAINT inventory_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES warehouses (id),
  CONSTRAINT inventory_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES product_variants (id) ON DELETE CASCADE,
  CONSTRAINT inventory_quantity_chk CHECK (quantity >= 0 AND reserved >= 0)
) ENGINE=InnoDB;

CREATE TABLE orders (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  shipping_address_id BIGINT NULL,
  status ENUM('pending', 'paid', 'shipped', 'delivered', 'cancelled') NOT NULL DEFAULT 'pending',
  subtotal DECIMAL(12, 2) NOT NULL,
  tax DECIMAL(12, 2) NOT NULL DEFAULT 0,
  shipping DECIMAL(12, 2) NOT NULL DEFAULT 0,
  total DECIMAL(12, 2) NOT NULL,
  notes TEXT NULL,
  placed_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT orders_shipping_address_id_fkey FOREIGN KEY (shipping_address_id) REFERENCES addresses (id)
) ENGINE=InnoDB;

CREATE TABLE order_items (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_id BIGINT NOT NULL,
  variant_id BIGINT NOT NULL,
  quantity INT NOT NULL,
  unit_price DECIMAL(10, 2) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
  CONSTRAINT order_items_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES product_variants (id)
) ENGINE=InnoDB;

CREATE TABLE payments (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_id BIGINT NOT NULL,
  status ENUM('pending', 'succeeded', 'failed', 'refunded') NOT NULL DEFAULT 'pending',
  provider VARCHAR(32) NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  reference VARCHAR(64) NULL,
  raw_response JSON NULL,
  processed_at DATETIME(6) NULL,
  CONSTRAINT payments_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders (id)
) ENGINE=InnoDB;

CREATE TABLE reviews (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  product_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  rating TINYINT NOT NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT NULL,
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT reviews_product_id_fkey FOREIGN KEY (product_id) REFERENCES products (id),
  CONSTRAINT reviews_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT reviews_rating_chk CHECK (rating BETWEEN 1 AND 5)
) ENGINE=InnoDB;

-- Reserved words, mixed case, and a backtick inside an identifier.
CREATE TABLE `order` (
  `key` INT NOT NULL PRIMARY KEY,
  `Order` VARCHAR(64) NOT NULL,
  `we``ird` VARCHAR(64) NULL
) ENGINE=InnoDB COMMENT='Awkward identifiers for quoting tests';

CREATE TABLE type_samples (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  signed_tiny TINYINT NOT NULL,
  signed_small SMALLINT NOT NULL,
  signed_medium MEDIUMINT NOT NULL,
  signed_int INT NOT NULL,
  signed_big BIGINT NOT NULL,
  unsigned_int INT UNSIGNED NOT NULL,
  money DECIMAL(12, 4) NOT NULL,
  approx_float FLOAT NOT NULL,
  approx_double DOUBLE NOT NULL,
  bits BIT(8) NOT NULL,
  flag BOOLEAN NOT NULL,
  yr YEAR NOT NULL,
  day_on DATE NOT NULL,
  when_at DATETIME(6) NOT NULL,
  stamped TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  clock TIME NOT NULL,
  fixed_char CHAR(4) NOT NULL,
  short_text VARCHAR(32) NOT NULL,
  tiny_note TINYTEXT NULL,
  note TEXT NULL,
  medium_note MEDIUMTEXT NULL,
  long_note LONGTEXT NULL,
  tiny_blob TINYBLOB NULL,
  blob_col BLOB NULL,
  medium_blob MEDIUMBLOB NULL,
  long_blob LONGBLOB NULL,
  raw_fixed BINARY(4) NULL,
  raw_var VARBINARY(16) NULL,
  payload JSON NULL,
  color ENUM('red', 'green', 'blue') NOT NULL,
  tags SET('a', 'b', 'c') NOT NULL,
  where_at POINT NOT NULL SRID 4326,
  shape GEOMETRY NULL SRID 4326,
  comment_col VARCHAR(64) NULL COMMENT 'column comment',
  CONSTRAINT type_samples_unsigned_chk CHECK (unsigned_int >= 0)
) ENGINE=InnoDB COMMENT='One row of every common MySQL type';

USE analytics;

CREATE TABLE sessions (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NULL,
  started_at DATETIME(6) NOT NULL,
  ended_at DATETIME(6) NULL,
  ip VARCHAR(64) NULL,
  user_agent VARCHAR(512) NULL,
  locale VARCHAR(16) NOT NULL,
  CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES shop.users (id)
) ENGINE=InnoDB;

CREATE TABLE page_views (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  session_id BIGINT NOT NULL,
  path VARCHAR(512) NOT NULL,
  referrer VARCHAR(512) NULL,
  duration_ms INT NOT NULL,
  viewed_at DATETIME(6) NOT NULL,
  CONSTRAINT page_views_session_id_fkey FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE events (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  session_id BIGINT NOT NULL,
  user_id BIGINT NULL,
  name VARCHAR(64) NOT NULL,
  properties JSON NOT NULL,
  occurred_at DATETIME(6) NOT NULL,
  CONSTRAINT events_session_id_fkey FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE,
  CONSTRAINT events_user_id_fkey FOREIGN KEY (user_id) REFERENCES shop.users (id)
) ENGINE=InnoDB;

USE ops;

CREATE TABLE feature_flags (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  flag_key VARCHAR(128) NOT NULL,
  description VARCHAR(255) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  rollout_pct TINYINT UNSIGNED NOT NULL DEFAULT 0,
  rules JSON NOT NULL,
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY feature_flags_key_key (flag_key)
) ENGINE=InnoDB;

CREATE TABLE background_jobs (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  kind VARCHAR(64) NOT NULL,
  status ENUM('queued', 'running', 'succeeded', 'failed') NOT NULL DEFAULT 'queued',
  payload JSON NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT NULL,
  run_at DATETIME(6) NOT NULL,
  finished_at DATETIME(6) NULL
) ENGINE=InnoDB;

CREATE TABLE audit_log (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  actor_id BIGINT NULL,
  action VARCHAR(64) NOT NULL,
  entity VARCHAR(64) NOT NULL,
  entity_id VARCHAR(64) NULL,
  payload JSON NULL,
  ip VARCHAR(64) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB;

CREATE TABLE api_keys (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  owner_id BIGINT NOT NULL,
  label VARCHAR(64) NOT NULL,
  prefix VARCHAR(16) NOT NULL,
  revoked_at DATETIME(6) NULL
) ENGINE=InnoDB;

CREATE TABLE maintenance_windows (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(128) NOT NULL,
  during_start DATETIME(6) NOT NULL,
  during_end DATETIME(6) NOT NULL
) ENGINE=InnoDB;
