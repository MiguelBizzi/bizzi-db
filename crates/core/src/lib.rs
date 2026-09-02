mod adapter;
mod profiles;
mod sql;
mod types;

pub use adapter::{
    Adapter, AdapterError, ConnectConfig, Session, SshTunnelAuth, SshTunnelConfig,
};
pub use profiles::{
    clamp_pool_size, history_item_from_result, new_connection_requires_password, overlay_schema,
    profile_from_save_input, resolve_connection_password, resolve_optional_secret,
    ssh_secret_key, ssh_tunnel_from_profile, ssh_tunnel_from_save, validate_folder_name,
    validate_save_input, validate_ssh_save_input, connect_config_from_profile, MAX_POOL_SIZE,
    MIN_POOL_SIZE,
};
pub use sql::{
    clamp_preview_page, classify_sql, split_sql_statements, QueryKind, DEFAULT_PREVIEW_LIMIT,
    DEFAULT_ROW_CAP,
};
pub use types::*;
