mod adapter;
#[cfg(feature = "conformance")]
pub mod conformance;
mod profiles;
mod query_error;
mod sql;
mod types;

pub use adapter::{
    schema_cache_is_fresh, Adapter, AdapterError, ConnectConfig, Session, SshTunnelAuth,
    SshTunnelConfig,
};
pub use profiles::{
    clamp_pool_size, connect_config_from_profile, database_required, dialect_is_supported,
    dialect_label, history_item_from_result, new_connection_requires_password, overlay_schema,
    profile_from_save_input, resolve_connection_password, resolve_optional_secret, ssh_secret_key,
    ssh_tunnel_from_profile, ssh_tunnel_from_save, validate_folder_name, validate_save_input,
    validate_ssh_save_input, MAX_POOL_SIZE, MIN_POOL_SIZE,
};
pub use query_error::*;
pub use sql::{
    clamp_preview_page, classify_sql, count_select_sql, paged_select_sql, split_sql_ranges,
    split_sql_statements, PostgresSql, QueryKind, SqlDialect, SqlRange, DEFAULT_PREVIEW_LIMIT,
};
pub use types::*;
