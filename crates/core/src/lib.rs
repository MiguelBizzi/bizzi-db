mod adapter;
mod profiles;
mod sql;
mod types;

pub use adapter::{Adapter, AdapterError, ConnectConfig, Session};
pub use profiles::{
    clamp_pool_size, history_item_from_result, new_connection_requires_password, overlay_schema,
    profile_from_save_input, validate_save_input, MAX_POOL_SIZE, MIN_POOL_SIZE,
};
pub use sql::{
    clamp_preview_page, classify_sql, split_sql_statements, QueryKind, DEFAULT_PREVIEW_LIMIT,
    DEFAULT_ROW_CAP,
};
pub use types::*;
