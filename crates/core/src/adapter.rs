use async_trait::async_trait;

use crate::types::{DatabaseSchema, QueryExecutionResult, RoutineSource, SslMode, TableFilter};

#[derive(Clone)]
pub struct ConnectConfig {
    pub host: String,
    pub port: u16,
    pub database: String,
    pub user: String,
    pub password: String,
    pub ssl_mode: SslMode,
    pub pool_size: u32,
}

impl std::fmt::Debug for ConnectConfig {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ConnectConfig")
            .field("host", &self.host)
            .field("port", &self.port)
            .field("database", &self.database)
            .field("user", &self.user)
            .field("password", &"***")
            .field("ssl_mode", &self.ssl_mode)
            .field("pool_size", &self.pool_size)
            .finish()
    }
}

#[derive(Clone)]
pub struct SshTunnelConfig {
    pub host: String,
    pub port: u16,
    pub user: String,
    pub auth: SshTunnelAuth,
}

#[derive(Clone)]
pub enum SshTunnelAuth {
    Password {
        password: String,
    },
    PrivateKey {
        path: String,
        passphrase: Option<String>,
    },
}

impl std::fmt::Debug for SshTunnelConfig {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SshTunnelConfig")
            .field("host", &self.host)
            .field("port", &self.port)
            .field("user", &self.user)
            .field("auth", &self.auth)
            .finish()
    }
}

impl std::fmt::Debug for SshTunnelAuth {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Password { .. } => f
                .debug_struct("Password")
                .field("password", &"***")
                .finish(),
            Self::PrivateKey { path, passphrase } => f
                .debug_struct("PrivateKey")
                .field("path", path)
                .field("passphrase", &passphrase.as_ref().map(|_| "***"))
                .finish(),
        }
    }
}

#[async_trait]
pub trait Session: Send + Sync {
    async fn introspect(&self) -> Result<DatabaseSchema, AdapterError>;
    async fn schema_fingerprint(&self) -> Result<String, AdapterError>;
    /// Runs a script. Every row comes back unless `page_size` is set, which
    /// pages (and counts) single read-only statements.
    async fn execute(
        &self,
        sql: &str,
        page_size: Option<i64>,
    ) -> Result<Vec<QueryExecutionResult>, AdapterError>;
    /// One page of a single statement. Statements that can't be paged return every row.
    async fn query_page(
        &self,
        sql: &str,
        limit: i64,
        offset: i64,
        with_count: bool,
    ) -> Result<QueryExecutionResult, AdapterError>;
    /// One page of a table's rows. With `filters`, only matching rows are
    /// returned and `total_rows` counts every match, not just this page.
    async fn preview(
        &self,
        schema: &str,
        table: &str,
        limit: i64,
        offset: i64,
        filters: &[TableFilter],
    ) -> Result<QueryExecutionResult, AdapterError>;
    async fn routine_source(
        &self,
        _schema: &str,
        _oid: &str,
    ) -> Result<RoutineSource, AdapterError> {
        Err(AdapterError::msg(
            "Viewing routine source is not supported for this database",
        ))
    }
}

#[async_trait]
pub trait Adapter: Send + Sync {
    async fn test_connection(&self, cfg: &ConnectConfig) -> Result<(u64, String), AdapterError>;
    async fn connect(&self, cfg: &ConnectConfig) -> Result<Box<dyn Session>, AdapterError>;
}

#[derive(Debug, thiserror::Error)]
pub enum AdapterError {
    #[error("{0}")]
    Message(String),
}

impl AdapterError {
    pub fn msg(msg: impl Into<String>) -> Self {
        Self::Message(msg.into())
    }
}

/// Full introspection is skipped when a cheap catalog fingerprint matches
/// the last refresh. Force always reloads (manual refresh, connect, known DDL).
pub fn schema_cache_is_fresh(
    force: bool,
    last_fingerprint: Option<&str>,
    next_fingerprint: &str,
) -> bool {
    !force && last_fingerprint == Some(next_fingerprint)
}

#[cfg(test)]
mod tests {
    use super::{schema_cache_is_fresh, ConnectConfig, SshTunnelAuth, SshTunnelConfig};
    use crate::types::SslMode;

    fn sample() -> ConnectConfig {
        ConnectConfig {
            host: "db.example.com".into(),
            port: 5432,
            database: "app".into(),
            user: "postgres".into(),
            password: "s3cret-value".into(),
            ssl_mode: SslMode::Require,
            pool_size: 8,
        }
    }

    #[test]
    fn debug_redacts_password() {
        let rendered = format!("{:?}", sample());
        assert!(!rendered.contains("s3cret-value"));
        assert!(rendered.contains("***"));
        assert!(rendered.contains("db.example.com"));
    }

    #[test]
    fn debug_redacts_ssh_secrets() {
        let password = SshTunnelConfig {
            host: "bastion".into(),
            port: 22,
            user: "jump".into(),
            auth: SshTunnelAuth::Password {
                password: "ssh-s3cret".into(),
            },
        };
        let password_debug = format!("{password:?}");
        assert!(!password_debug.contains("ssh-s3cret"));
        assert!(password_debug.contains("***"));

        let key = SshTunnelConfig {
            host: "bastion".into(),
            port: 22,
            user: "jump".into(),
            auth: SshTunnelAuth::PrivateKey {
                path: "/tmp/id_ed25519".into(),
                passphrase: Some("key-phrase".into()),
            },
        };
        let key_debug = format!("{key:?}");
        assert!(!key_debug.contains("key-phrase"));
        assert!(key_debug.contains("/tmp/id_ed25519"));
        assert!(key_debug.contains("***"));
    }

    #[test]
    fn schema_cache_skips_unchanged_catalog() {
        assert!(schema_cache_is_fresh(false, Some("abc"), "abc"));
        assert!(!schema_cache_is_fresh(true, Some("abc"), "abc"));
        assert!(!schema_cache_is_fresh(false, None, "abc"));
        assert!(!schema_cache_is_fresh(false, Some("abc"), "def"));
    }
}
