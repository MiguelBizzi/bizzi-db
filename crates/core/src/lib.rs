mod adapter;
mod profiles;
mod sql;
mod types;

pub use adapter::{Adapter, AdapterError, ConnectConfig, Session};
pub use profiles::{
    history_item_from_result, new_connection_requires_password, overlay_schema,
    profile_from_save_input,
};
pub use sql::{classify_sql, QueryKind, DEFAULT_PREVIEW_LIMIT, DEFAULT_ROW_CAP};
pub use types::*;
