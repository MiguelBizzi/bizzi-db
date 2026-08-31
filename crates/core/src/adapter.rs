use async_trait::async_trait;

use crate::types::{DatabaseSchema, QueryExecutionResult};

#[derive(Debug, Clone)]
pub struct ConnectConfig {
    pub host: String,
    pub port: u16,
    pub database: String,
    pub user: String,
    pub password: String,
    pub ssl: bool,
    pub pool_size: u32,
}

#[async_trait]
pub trait Session: Send + Sync {
    async fn introspect(&self) -> Result<DatabaseSchema, AdapterError>;
    async fn execute(&self, sql: &str, row_cap: usize) -> Result<QueryExecutionResult, AdapterError>;
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
