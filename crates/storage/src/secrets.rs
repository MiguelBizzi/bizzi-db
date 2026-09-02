use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

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

pub struct FileSecrets {
    path: PathBuf,
    inner: Mutex<HashMap<String, String>>,
}

impl FileSecrets {
    pub fn open(path: &Path) -> Result<Self, StorageError> {
        if let Some(parent) = path.parent() {
            if !parent.as_os_str().is_empty() {
                std::fs::create_dir_all(parent).map_err(|e| StorageError::msg(e.to_string()))?;
                #[cfg(unix)]
                restrict_unix_mode(parent, 0o700)?;
            }
        }
        let inner = if path.exists() {
            let data =
                std::fs::read_to_string(path).map_err(|e| StorageError::msg(e.to_string()))?;
            serde_json::from_str(&data).unwrap_or_default()
        } else {
            HashMap::new()
        };
        let store = Self {
            path: path.to_path_buf(),
            inner: Mutex::new(inner),
        };
        store.persist()?;
        Ok(store)
    }

    fn persist(&self) -> Result<(), StorageError> {
        let map = self
            .inner
            .lock()
            .map_err(|e| StorageError::msg(e.to_string()))?;
        self.write_unlocked(&map)
    }

    fn write_unlocked(&self, map: &HashMap<String, String>) -> Result<(), StorageError> {
        let json = serde_json::to_string(map).map_err(|e| StorageError::msg(e.to_string()))?;
        std::fs::write(&self.path, json).map_err(|e| StorageError::msg(e.to_string()))?;
        #[cfg(unix)]
        restrict_unix_mode(&self.path, 0o600)?;
        Ok(())
    }
}

impl SecretStore for FileSecrets {
    fn set_password(&self, connection_id: &str, password: &str) -> Result<(), StorageError> {
        let mut map = self
            .inner
            .lock()
            .map_err(|e| StorageError::msg(e.to_string()))?;
        map.insert(connection_id.to_string(), password.to_string());
        self.write_unlocked(&map)
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
        let mut map = self
            .inner
            .lock()
            .map_err(|e| StorageError::msg(e.to_string()))?;
        map.remove(connection_id);
        self.write_unlocked(&map)
    }
}

#[cfg(unix)]
fn restrict_unix_mode(path: &Path, mode: u32) -> Result<(), StorageError> {
    use std::os::unix::fs::PermissionsExt;
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(mode))
        .map_err(|e| StorageError::msg(e.to_string()))
}

pub struct DualSecretStore<K: SecretStore, L: SecretStore> {
    pub keychain: K,
    pub local: L,
}

impl<K: SecretStore, L: SecretStore> DualSecretStore<K, L> {
    pub fn new(keychain: K, local: L) -> Self {
        Self { keychain, local }
    }

    fn preferred(&self, keychain_enabled: bool) -> &dyn SecretStore {
        if keychain_enabled {
            &self.keychain
        } else {
            &self.local
        }
    }

    fn other(&self, keychain_enabled: bool) -> &dyn SecretStore {
        if keychain_enabled {
            &self.local
        } else {
            &self.keychain
        }
    }

    pub fn set(
        &self,
        keychain_enabled: bool,
        key: &str,
        value: &str,
    ) -> Result<(), StorageError> {
        self.preferred(keychain_enabled).set_password(key, value)
    }

    pub fn get(
        &self,
        keychain_enabled: bool,
        key: &str,
    ) -> Result<Option<String>, StorageError> {
        if let Some(value) = self.preferred(keychain_enabled).get_password(key)? {
            return Ok(Some(value));
        }
        match self.other(keychain_enabled).get_password(key)? {
            Some(value) => {
                self.preferred(keychain_enabled)
                    .set_password(key, &value)?;
                Ok(Some(value))
            }
            None => Ok(None),
        }
    }

    pub fn delete(&self, keychain_enabled: bool, key: &str) -> Result<(), StorageError> {
        if keychain_enabled {
            let _ = self.keychain.delete_password(key);
        }
        self.local.delete_password(key)
    }

    pub fn copy_keychain_into_local(&self, keys: &[String]) -> Result<(), StorageError> {
        for key in keys {
            if self.local.get_password(key)?.is_some() {
                continue;
            }
            match self.keychain.get_password(key) {
                Ok(Some(value)) => self.local.set_password(key, &value)?,
                Ok(None) => {}
                Err(e) => return Err(e),
            }
        }
        Ok(())
    }

    pub fn migrate(&self, keychain_enabled: bool, keys: &[String]) -> Result<(), StorageError> {
        if keychain_enabled {
            for key in keys {
                if let Some(value) = self.get(true, key)? {
                    self.set(true, key, &value)?;
                }
            }
        } else {
            self.copy_keychain_into_local(keys)?;
        }
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

    #[test]
    fn file_secrets_round_trip_and_persist() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("secrets.json");
        {
            let store = FileSecrets::open(&path).unwrap();
            store.set_password("c1", "secret").unwrap();
            store.set_password("c1:ssh", "ssh-secret").unwrap();
        }
        let store = FileSecrets::open(&path).unwrap();
        assert_eq!(store.get_password("c1").unwrap().as_deref(), Some("secret"));
        assert_eq!(
            store.get_password("c1:ssh").unwrap().as_deref(),
            Some("ssh-secret")
        );
        store.delete_password("c1").unwrap();
        assert_eq!(store.get_password("c1").unwrap(), None);
    }

    #[cfg(unix)]
    #[test]
    fn file_secrets_are_owner_readable_only() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("secrets.json");
        FileSecrets::open(&path).unwrap();
        let mode = std::fs::metadata(&path).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o600);
    }

    #[test]
    fn dual_store_writes_preferred_and_reads_fallback() {
        let store = DualSecretStore::new(InMemorySecrets::default(), InMemorySecrets::default());
        store.set(false, "c1", "local").unwrap();
        assert_eq!(store.get(false, "c1").unwrap().as_deref(), Some("local"));
        assert_eq!(store.get(true, "c1").unwrap().as_deref(), Some("local"));

        store.set(true, "c1", "keychain").unwrap();
        assert_eq!(
            store.get(true, "c1").unwrap().as_deref(),
            Some("keychain")
        );
        assert_eq!(store.get(false, "c1").unwrap().as_deref(), Some("local"));
    }

    #[test]
    fn dual_store_migrate_copies_into_preferred_backend() {
        let store = DualSecretStore::new(InMemorySecrets::default(), InMemorySecrets::default());
        store.set(false, "c1", "local").unwrap();
        store.set(false, "c1:ssh", "ssh").unwrap();
        store
            .migrate(true, &["c1".into(), "c1:ssh".into()])
            .unwrap();
        assert_eq!(
            store.keychain.get_password("c1").unwrap().as_deref(),
            Some("local")
        );
        assert_eq!(
            store.keychain.get_password("c1:ssh").unwrap().as_deref(),
            Some("ssh")
        );

        store.delete(true, "c1").unwrap();
        assert_eq!(store.get(false, "c1").unwrap(), None);
        assert_eq!(store.get(true, "c1").unwrap(), None);
    }

    #[test]
    fn dual_store_reads_keychain_when_disabled_and_copies_local() {
        let store = DualSecretStore::new(InMemorySecrets::default(), InMemorySecrets::default());
        store.set(true, "c1", "from-keychain").unwrap();
        assert_eq!(
            store.get(false, "c1").unwrap().as_deref(),
            Some("from-keychain")
        );
        assert_eq!(
            store.local.get_password("c1").unwrap().as_deref(),
            Some("from-keychain")
        );
    }

    #[test]
    fn dual_store_never_writes_keychain_while_disabled() {
        let store = DualSecretStore::new(ReadOnlySecrets, InMemorySecrets::default());
        store.set(false, "c1", "local").unwrap();
        assert_eq!(store.get(false, "c1").unwrap().as_deref(), Some("local"));
        store.delete(false, "c1").unwrap();
        assert_eq!(store.get(false, "c1").unwrap(), None);
    }

    #[test]
    fn copy_keychain_into_local_surfaces_keychain_errors() {
        let store = DualSecretStore::new(FailingSecrets, InMemorySecrets::default());
        let err = store
            .copy_keychain_into_local(&["c1".into()])
            .unwrap_err();
        assert!(err.to_string().contains("locked"));
    }

    struct ReadOnlySecrets;

    impl SecretStore for ReadOnlySecrets {
        fn set_password(&self, _key: &str, _value: &str) -> Result<(), StorageError> {
            panic!("keychain should not be written while disabled");
        }
        fn get_password(&self, _key: &str) -> Result<Option<String>, StorageError> {
            Ok(None)
        }
        fn delete_password(&self, _key: &str) -> Result<(), StorageError> {
            panic!("keychain should not be deleted while disabled");
        }
    }

    struct FailingSecrets;

    impl SecretStore for FailingSecrets {
        fn set_password(&self, _key: &str, _value: &str) -> Result<(), StorageError> {
            Ok(())
        }
        fn get_password(&self, _key: &str) -> Result<Option<String>, StorageError> {
            Err(StorageError::msg("locked"))
        }
        fn delete_password(&self, _key: &str) -> Result<(), StorageError> {
            Ok(())
        }
    }
}
