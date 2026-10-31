SET NAMES utf8mb4;
SET SESSION sql_mode = 'STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION,ERROR_FOR_DIVISION_BY_ZERO';

USE shop;

CREATE FUNCTION user_label(uid BIGINT) RETURNS VARCHAR(255)
  DETERMINISTIC READS SQL DATA
  RETURN (SELECT email FROM users WHERE id = uid);

CREATE VIEW active_users AS
  SELECT id, email, full_name, role
  FROM users
  WHERE is_active = 1;

CREATE VIEW active_customers AS
  SELECT id, email, full_name
  FROM users
  WHERE is_active = 1 AND role = 'customer'
  WITH CHECK OPTION;

CREATE VIEW labeled_users AS
  SELECT id, user_label(id) AS label
  FROM users;
