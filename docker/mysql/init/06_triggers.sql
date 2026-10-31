SET NAMES utf8mb4;
SET SESSION sql_mode = 'STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION,ERROR_FOR_DIVISION_BY_ZERO';

USE shop;

CREATE TABLE user_touch (
  user_id BIGINT NOT NULL PRIMARY KEY,
  touched_at DATETIME(6) NOT NULL
) ENGINE=InnoDB;

DELIMITER $$

CREATE TRIGGER users_before_update
BEFORE UPDATE ON users
FOR EACH ROW
BEGIN
  INSERT INTO user_touch (user_id, touched_at) VALUES (NEW.id, CURRENT_TIMESTAMP(6))
  ON DUPLICATE KEY UPDATE touched_at = CURRENT_TIMESTAMP(6);
END$$

CREATE TRIGGER orders_audit
AFTER INSERT ON orders
FOR EACH ROW
BEGIN
  INSERT INTO ops.audit_log (actor_id, action, entity, entity_id, payload, created_at)
  VALUES (NEW.user_id, 'order.insert', 'orders', CAST(NEW.id AS CHAR), JSON_OBJECT('total', NEW.total), CURRENT_TIMESTAMP(6));
END$$

DELIMITER ;
