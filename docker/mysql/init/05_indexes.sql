SET NAMES utf8mb4;
SET SESSION sql_mode = 'STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION,ERROR_FOR_DIVISION_BY_ZERO';

USE shop;

CREATE INDEX orders_user_status ON orders (user_id, status);
CREATE INDEX users_email_prefix ON users (email(20));
CREATE INDEX products_price_desc ON products (base_price DESC);
CREATE INDEX users_email_lower ON users ((LOWER(email)));
CREATE FULLTEXT INDEX products_search ON products (name, description);
CREATE INDEX users_org ON users (organization_id);
CREATE INDEX users_org_dup ON users (organization_id);
CREATE INDEX users_org_invisible ON users (organization_id) INVISIBLE;
CREATE INDEX products_tag_ids ON products ((CAST(tags AS UNSIGNED ARRAY)));

CREATE SPATIAL INDEX type_samples_where_at ON type_samples (where_at);

USE analytics;

CREATE INDEX events_name_occurred ON events (name, occurred_at);
