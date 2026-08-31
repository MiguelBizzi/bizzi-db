use async_trait::async_trait;

use crate::types::{DatabaseSchema, QueryExecutionResult};

#[derive(Clone)]
pub struct ConnectConfig {
    pub host: String,
    pub port: u16,
    pub database: String,
    pub user: String,
    pub password: String,
    pub ssl: bool,
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
            .field("ssl", &self.ssl)
            .field("pool_size", &self.pool_size)
            .finish()
    }
}

#[async_trait]
pub trait Session: Send + Sync {
    async fn introspect(&self) -> Result<DatabaseSchema, AdapterError>;
    async fn execute(
        &self,
        sql: &str,
        row_cap: usize,
    ) -> Result<QueryExecutionResult, AdapterError>;
    async fn preview(
        &self,
        schema: &str,
        table: &str,
        limit: i64,
        offset: i64,
    ) -> Result<QueryExecutionResult, AdapterError>;
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

#[cfg(test)]
mod tests {
    use super::ConnectConfig;

    fn sample() -> ConnectConfig {
        ConnectConfig {
            host: "db.example.com".into(),
            port: 5432,
            database: "app".into(),
            user: "postgres".into(),
            password: "s3cret-value".into(),
            ssl: true,
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
}
