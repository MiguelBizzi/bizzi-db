mod adapter;
#[cfg(feature = "conformance")]
pub mod conformance;
mod document;
mod engines;
mod profiles;
mod query_error;
mod sql;
mod types;

pub use adapter::{
    schema_cache_is_fresh, Adapter, AdapterError, ConnectConfig, Session, SshTunnelAuth,
    SshTunnelConfig,
};
pub use document::{
    CollectionKind, CollectionSchema, DocValue, DocumentAdapter, DocumentCommandResult,
    DocumentExportFormat, DocumentExportRequest, DocumentIndex, DocumentPage, DocumentSession,
    ExtJsonMode, FieldSample, FieldSummary, FindRequest, IndexDraft, Namespace,
};
pub use engines::{
    dialect_from_label, engine_specs, paradigm_of, validate_params, EngineSpec, Paradigm,
    ParamKind, ParamRule,
};
pub use profiles::{
    clamp_pool_size, connect_config_from_profile, database_required, dialect_is_supported,
    dialect_label, history_item_from_result, new_connection_requires_password, overlay_schema,
    password_required, profile_from_save_input, resolve_connection_password,
    resolve_optional_secret, resolve_stored_password, ssh_secret_key, ssh_tunnel_from_profile,
    ssh_tunnel_from_save, validate_folder_name, validate_save_input, validate_ssh_save_input,
    MAX_POOL_SIZE, MIN_POOL_SIZE,
};
pub use query_error::*;
pub use sql::{
    clamp_preview_page, classify_sql, count_select_sql, paged_select_sql, split_sql_ranges,
    split_sql_statements, PostgresSql, QueryKind, SqlDialect, SqlRange, DEFAULT_PREVIEW_LIMIT,
};
pub use types::*;
