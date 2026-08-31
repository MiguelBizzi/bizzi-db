use thiserror::Error;

#[derive(Debug, Error)]
pub enum StorageError {
    #[error("{0}")]
    Message(String),
}

impl StorageError {
    pub fn msg(msg: impl Into<String>) -> Self {
        Self::Message(msg.into())
    }
}

pub trait SecretStore: Send + Sync {
    fn set_password(&self, connection_id: &str, password: &str) -> Result<(), StorageError>;
    fn get_password(&self, connection_id: &str) -> Result<Option<String>, StorageError>;
    fn delete_password(&self, connection_id: &str) -> Result<(), StorageError>;
}

pub struct KeychainSecrets {
    service: String,
}

impl KeychainSecrets {
    pub fn new(service: impl Into<String>) -> Self {
        Self {
            service: service.into(),
        }
    }
}

impl SecretStore for KeychainSecrets {
    fn set_password(&self, connection_id: &str, password: &str) -> Result<(), StorageError> {
        let entry = keyring::Entry::new(&self.service, connection_id)
            .map_err(|e| StorageError::msg(e.to_string()))?;
        entry
            .set_password(password)
            .map_err(|e| StorageError::msg(e.to_string()))
    }

    fn get_password(&self, connection_id: &str) -> Result<Option<String>, StorageError> {
        let entry = keyring::Entry::new(&self.service, connection_id)
            .map_err(|e| StorageError::msg(e.to_string()))?;
        match entry.get_password() {
            Ok(p) => Ok(Some(p)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(StorageError::msg(e.to_string())),
        }
    }

    fn delete_password(&self, connection_id: &str) -> Result<(), StorageError> {
        let entry = keyring::Entry::new(&self.service, connection_id)
            .map_err(|e| StorageError::msg(e.to_string()))?;
        match entry.delete_password() {
            Ok(()) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(StorageError::msg(e.to_string())),
        }
    }
}

#[derive(Default)]
pub struct InMemorySecrets {
    inner: std::sync::Mutex<std::collections::HashMap<String, String>>,
}

impl SecretStore for InMemorySecrets {
    fn set_password(&self, connection_id: &str, password: &str) -> Result<(), StorageError> {
        self.inner
            .lock()
            .map_err(|e| StorageError::msg(e.to_string()))?
            .insert(connection_id.to_string(), password.to_string());
        Ok(())
    }

    fn get_password(&self, connection_id: &str) -> Result<Option<String>, StorageError> {
        Ok(self
            .inner
            .lock()
            .map_err(|e| StorageError::msg(e.to_string()))?
            .get(connection_id)
            .cloned())
    }

    fn delete_password(&self, connection_id: &str) -> Result<(), StorageError> {
        self.inner
            .lock()
            .map_err(|e| StorageError::msg(e.to_string()))?
            .remove(connection_id);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn memory_secrets_round_trip() {
        let store = InMemorySecrets::default();
        store.set_password("c1", "secret").unwrap();
        assert_eq!(store.get_password("c1").unwrap().as_deref(), Some("secret"));
        store.delete_password("c1").unwrap();
        assert_eq!(store.get_password("c1").unwrap(), None);
    }

    #[test]
    fn memory_secrets_overwrite_missing_and_idempotent_delete() {
        let store = InMemorySecrets::default();
        assert_eq!(store.get_password("missing").unwrap(), None);
        store.set_password("c1", "one").unwrap();
        store.set_password("c1", "two").unwrap();
        assert_eq!(store.get_password("c1").unwrap().as_deref(), Some("two"));
        store.delete_password("missing").unwrap();
        store.delete_password("c1").unwrap();
        store.delete_password("c1").unwrap();
        assert_eq!(store.get_password("c1").unwrap(), None);
    }
}
