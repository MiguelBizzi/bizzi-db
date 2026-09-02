use crate::adapter::{ConnectConfig, SshTunnelAuth, SshTunnelConfig};
use crate::sql::classify_sql;
use crate::types::{
    ActivityLogItem, ConnectionProfile, ConnectionStatus, DatabaseSchema, HistoryStatus,
    QueryExecutionResult, SaveConnectionInput, SshAuthMethod,
};

pub const MIN_POOL_SIZE: u32 = 1;
pub const MAX_POOL_SIZE: u32 = 32;

pub fn clamp_pool_size(size: u32) -> u32 {
    size.clamp(MIN_POOL_SIZE, MAX_POOL_SIZE)
}

pub fn validate_folder_name(name: &str) -> Result<String, String> {
    let trimmed = name.trim().to_string();
    if trimmed.is_empty() {
        return Err("Folder name is required".into());
    }
    Ok(trimmed)
}

pub fn validate_save_input(
    input: &SaveConnectionInput,
    keychain_enabled: bool,
) -> Result<(), String> {
    if input.host.trim().is_empty() {
        return Err("Host is required".into());
    }
    if input.port == 0 {
        return Err("Port must be between 1 and 65535".into());
    }
    if input.database.trim().is_empty() {
        return Err("Database is required".into());
    }
    if input.user.trim().is_empty() {
        return Err("Username is required".into());
    }
    validate_ssh_save_input(input, keychain_enabled)?;
    Ok(())
}

pub fn validate_ssh_save_input(
    input: &SaveConnectionInput,
    keychain_enabled: bool,
) -> Result<(), String> {
    if !input.ssh_enabled {
        return Ok(());
    }
    if input.ssh_host.trim().is_empty() {
        return Err("SSH host is required".into());
    }
    if input.ssh_port == 0 {
        return Err("SSH port must be between 1 and 65535".into());
    }
    if input.ssh_user.trim().is_empty() {
        return Err("SSH username is required".into());
    }
    match input.ssh_auth {
        SshAuthMethod::Password => {
            if !keychain_enabled {
                return Err("SSH password authentication requires the system keychain".into());
            }
            if input.ssh_password.is_empty() && input.id.is_none() {
                return Err("SSH password is required".into());
            }
        }
        SshAuthMethod::PrivateKey => {
            if input
                .ssh_key_path
                .as_deref()
                .map(str::trim)
                .unwrap_or("")
                .is_empty()
            {
                return Err("SSH private key is required".into());
            }
        }
    }
    Ok(())
}

pub fn ssh_secret_key(connection_id: &str) -> String {
    format!("{connection_id}:ssh")
}

pub fn resolve_optional_secret(typed: &str, stored: Option<String>) -> Option<String> {
    if !typed.is_empty() {
        Some(typed.to_string())
    } else {
        stored
    }
}

pub fn ssh_tunnel_from_save(
    input: &SaveConnectionInput,
    stored_ssh_secret: Option<String>,
) -> Result<Option<SshTunnelConfig>, String> {
    if !input.ssh_enabled {
        return Ok(None);
    }
    let secret = resolve_optional_secret(
        match input.ssh_auth {
            SshAuthMethod::Password => &input.ssh_password,
            SshAuthMethod::PrivateKey => &input.ssh_passphrase,
        },
        stored_ssh_secret,
    );
    let auth = match input.ssh_auth {
        SshAuthMethod::Password => {
            let password = secret.ok_or_else(|| "SSH password is required".to_string())?;
            SshTunnelAuth::Password { password }
        }
        SshAuthMethod::PrivateKey => {
            let path = input
                .ssh_key_path
                .as_deref()
                .map(str::trim)
                .filter(|path| !path.is_empty())
                .ok_or_else(|| "SSH private key is required".to_string())?
                .to_string();
            SshTunnelAuth::PrivateKey {
                path,
                passphrase: secret,
            }
        }
    };
    Ok(Some(SshTunnelConfig {
        host: input.ssh_host.trim().to_string(),
        port: input.ssh_port,
        user: input.ssh_user.trim().to_string(),
        auth,
    }))
}

pub fn ssh_tunnel_from_profile(
    profile: &ConnectionProfile,
    stored_ssh_secret: Option<String>,
) -> Result<Option<SshTunnelConfig>, String> {
    if !profile.ssh_enabled {
        return Ok(None);
    }
    let auth = match profile.ssh_auth {
        SshAuthMethod::Password => {
            let password =
                stored_ssh_secret.ok_or_else(|| "SSH password is required".to_string())?;
            SshTunnelAuth::Password { password }
        }
        SshAuthMethod::PrivateKey => {
            let path = profile
                .ssh_key_path
                .as_deref()
                .map(str::trim)
                .filter(|path| !path.is_empty())
                .ok_or_else(|| "SSH private key is required".to_string())?
                .to_string();
            SshTunnelAuth::PrivateKey {
                path,
                passphrase: stored_ssh_secret,
            }
        }
    };
    Ok(Some(SshTunnelConfig {
        host: profile.ssh_host.trim().to_string(),
        port: profile.ssh_port,
        user: profile.ssh_user.trim().to_string(),
        auth,
    }))
}

pub fn connect_config_from_profile(
    profile: &ConnectionProfile,
    password: String,
    tunnel_port: Option<u16>,
) -> ConnectConfig {
    ConnectConfig {
        host: if tunnel_port.is_some() {
            "127.0.0.1".into()
        } else {
            profile.host.clone()
        },
        port: tunnel_port.unwrap_or(profile.port),
        database: profile.database.clone(),
        user: profile.user.clone(),
        password,
        ssl_mode: profile.ssl_mode,
        pool_size: profile.pool_size,
    }
}

pub fn new_connection_requires_password(input: &SaveConnectionInput) -> bool {
    input.password.is_empty() && input.id.is_none()
}

pub fn resolve_connection_password(
    input: &SaveConnectionInput,
    stored: Option<String>,
) -> Result<String, String> {
    if !input.password.is_empty() {
        return Ok(input.password.clone());
    }
    if input.id.is_some() {
        return stored.ok_or_else(|| "No password stored for this connection".into());
    }
    Err("Password is required".into())
}

pub fn profile_from_save_input(input: SaveConnectionInput, id: String) -> ConnectionProfile {
    ConnectionProfile {
        id,
        name: input.name,
        dialect: input.dialect,
        host: input.host,
        port: input.port,
        database: input.database,
        user: input.user,
        ssl_mode: input.ssl_mode,
        pool_size: clamp_pool_size(input.pool_size),
        environment: input.environment,
        status: ConnectionStatus::Disconnected,
        folder_id: input.folder_id.and_then(|id| {
            let trimmed = id.trim().to_string();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed)
            }
        }),
        sort_order: 0,
        ssh_enabled: input.ssh_enabled,
        ssh_host: input.ssh_host.trim().to_string(),
        ssh_port: if input.ssh_port == 0 {
            22
        } else {
            input.ssh_port
        },
        ssh_user: input.ssh_user.trim().to_string(),
        ssh_auth: input.ssh_auth,
        ssh_key_path: input.ssh_key_path.and_then(|path| {
            let trimmed = path.trim().to_string();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed)
            }
        }),
    }
}

pub fn overlay_schema(mut schema: DatabaseSchema, profile: &ConnectionProfile) -> DatabaseSchema {
    schema.id = profile.id.clone();
    schema.name = profile.name.clone();
    schema.connection_host = profile.host.clone();
    schema.connection_port = profile.port;
    schema.environment = profile.environment;
    schema.status = ConnectionStatus::Connected;
    schema
}

pub fn history_item_from_result(
    id: String,
    profile: &ConnectionProfile,
    result: &QueryExecutionResult,
) -> ActivityLogItem {
    ActivityLogItem {
        id,
        timestamp: result.timestamp.clone(),
        database_name: profile.name.clone(),
        query: result.query.clone(),
        query_type: classify_sql(&result.query).into(),
        execution_time_ms: result.execution_time_ms,
        rows_affected: result.affected_rows.unwrap_or(0),
        status: if result.error.is_some() {
            HistoryStatus::Error
        } else {
            HistoryStatus::Success
        },
        error_message: result.error.clone(),
        user: profile.user.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{DatabaseDialect, Environment, HistoryQueryType, SshAuthMethod, SslMode};

    fn save_input(password: &str, id: Option<&str>, pool_size: u32) -> SaveConnectionInput {
        SaveConnectionInput {
            id: id.map(str::to_string),
            name: "Local".into(),
            dialect: DatabaseDialect::PostgreSQL,
            host: "127.0.0.1".into(),
            port: 5432,
            database: "app".into(),
            user: "postgres".into(),
            password: password.into(),
            ssl_mode: SslMode::Disabled,
            pool_size,
            environment: Environment::Development,
            folder_id: None,
            ssh_enabled: false,
            ssh_host: String::new(),
            ssh_port: 22,
            ssh_user: String::new(),
            ssh_auth: SshAuthMethod::Password,
            ssh_key_path: None,
            ssh_password: String::new(),
            ssh_passphrase: String::new(),
        }
    }

    fn profile() -> ConnectionProfile {
        profile_from_save_input(save_input("secret", Some("c1"), 8), "c1".into())
    }

    #[test]
    fn new_connection_requires_password_unless_updating() {
        assert!(new_connection_requires_password(&save_input("", None, 4)));
        assert!(!new_connection_requires_password(&save_input("x", None, 4)));
        assert!(!new_connection_requires_password(&save_input(
            "",
            Some("c1"),
            4
        )));
    }

    #[test]
    fn resolve_connection_password_prefers_typed_then_stored_on_update() {
        assert_eq!(
            resolve_connection_password(&save_input("typed", None, 4), None).unwrap(),
            "typed"
        );
        assert_eq!(
            resolve_connection_password(&save_input("", Some("c1"), 4), Some("stored".into()))
                .unwrap(),
            "stored"
        );
        assert_eq!(
            resolve_connection_password(&save_input("", None, 4), None).unwrap_err(),
            "Password is required"
        );
        assert_eq!(
            resolve_connection_password(&save_input("", Some("c1"), 4), None).unwrap_err(),
            "No password stored for this connection"
        );
    }

    #[test]
    fn profile_from_save_input_clamps_pool_size() {
        let profile = profile_from_save_input(save_input("secret", None, 0), "conn_1".into());
        assert_eq!(profile.pool_size, 1);
        assert_eq!(profile.status, ConnectionStatus::Disconnected);
        assert_eq!(profile.id, "conn_1");
        let huge = profile_from_save_input(save_input("secret", None, 10_000), "conn_2".into());
        assert_eq!(huge.pool_size, MAX_POOL_SIZE);
        assert_eq!(clamp_pool_size(8), 8);
        assert!(profile.folder_id.is_none());
        let mut with_folder = save_input("secret", None, 4);
        with_folder.folder_id = Some("  folder_1  ".into());
        let assigned = profile_from_save_input(with_folder, "conn_3".into());
        assert_eq!(assigned.folder_id.as_deref(), Some("folder_1"));
    }

    #[test]
    fn validate_folder_name_trims_and_rejects_blank() {
        assert_eq!(validate_folder_name("  Prod  ").unwrap(), "Prod");
        assert_eq!(
            validate_folder_name("   ").unwrap_err(),
            "Folder name is required"
        );
    }

    #[test]
    fn validate_save_input_rejects_empty_fields_and_port_zero() {
        let ok = save_input("secret", None, 8);
        assert!(validate_save_input(&ok, false).is_ok());

        let mut missing_host = ok.clone();
        missing_host.host = "  ".into();
        assert_eq!(
            validate_save_input(&missing_host, false).unwrap_err(),
            "Host is required"
        );

        let mut bad_port = ok.clone();
        bad_port.port = 0;
        assert!(validate_save_input(&bad_port, false)
            .unwrap_err()
            .contains("Port must be"));

        let mut missing_db = ok.clone();
        missing_db.database = String::new();
        assert_eq!(
            validate_save_input(&missing_db, false).unwrap_err(),
            "Database is required"
        );

        let mut missing_user = ok.clone();
        missing_user.user = " ".into();
        assert_eq!(
            validate_save_input(&missing_user, false).unwrap_err(),
            "Username is required"
        );
    }

    #[test]
    fn validate_save_input_requires_ssh_fields_and_keychain_for_password() {
        let mut ssh = save_input("secret", None, 8);
        ssh.ssh_enabled = true;
        ssh.ssh_host = "bastion".into();
        ssh.ssh_user = "jump".into();
        ssh.ssh_auth = SshAuthMethod::Password;
        ssh.ssh_password = "ssh-secret".into();
        assert_eq!(
            validate_save_input(&ssh, false).unwrap_err(),
            "SSH password authentication requires the system keychain"
        );
        assert!(validate_save_input(&ssh, true).is_ok());

        ssh.ssh_password.clear();
        assert_eq!(
            validate_save_input(&ssh, true).unwrap_err(),
            "SSH password is required"
        );

        ssh.id = Some("c1".into());
        assert!(validate_save_input(&ssh, true).is_ok());

        let mut key = save_input("secret", None, 8);
        key.ssh_enabled = true;
        key.ssh_host = "bastion".into();
        key.ssh_user = "jump".into();
        key.ssh_auth = SshAuthMethod::PrivateKey;
        assert_eq!(
            validate_save_input(&key, false).unwrap_err(),
            "SSH private key is required"
        );
        key.ssh_key_path = Some(" /tmp/id_ed25519 ".into());
        assert!(validate_save_input(&key, false).is_ok());
    }

    #[test]
    fn ssh_tunnel_from_save_builds_auth_and_skips_when_disabled() {
        let input = save_input("secret", None, 8);
        assert!(ssh_tunnel_from_save(&input, None).unwrap().is_none());

        let mut ssh = input.clone();
        ssh.ssh_enabled = true;
        ssh.ssh_host = " bastion ".into();
        ssh.ssh_user = " jump ".into();
        ssh.ssh_password = "typed".into();
        let tunnel = ssh_tunnel_from_save(&ssh, Some("stored".into()))
            .unwrap()
            .expect("tunnel");
        assert_eq!(tunnel.host, "bastion");
        assert_eq!(tunnel.user, "jump");
        match tunnel.auth {
            crate::adapter::SshTunnelAuth::Password { password } => {
                assert_eq!(password, "typed")
            }
            _ => panic!("expected password auth"),
        }

        ssh.ssh_password.clear();
        let stored = ssh_tunnel_from_save(&ssh, Some("stored".into()))
            .unwrap()
            .expect("tunnel");
        match stored.auth {
            crate::adapter::SshTunnelAuth::Password { password } => {
                assert_eq!(password, "stored")
            }
            _ => panic!("expected password auth"),
        }
    }

    #[test]
    fn ssh_secret_key_namespaces_per_connection() {
        assert_eq!(ssh_secret_key("c1"), "c1:ssh");
    }

    #[test]
    fn connect_config_from_profile_rewrites_host_through_tunnel() {
        let mut profile = profile();
        profile.host = "db.example.com".into();
        profile.port = 5432;
        let direct = connect_config_from_profile(&profile, "secret".into(), None);
        assert_eq!(direct.host, "db.example.com");
        assert_eq!(direct.port, 5432);
        assert_eq!(direct.ssl_mode, crate::types::SslMode::Disabled);

        let tunneled = connect_config_from_profile(&profile, "secret".into(), Some(61_001));
        assert_eq!(tunneled.host, "127.0.0.1");
        assert_eq!(tunneled.port, 61_001);
        assert_eq!(tunneled.password, "secret");
    }

    #[test]
    fn overlay_schema_copies_connection_identity() {
        let schema = overlay_schema(
            DatabaseSchema {
                id: "db".into(),
                name: "db".into(),
                dialect: DatabaseDialect::PostgreSQL,
                version: "16".into(),
                connection_host: String::new(),
                connection_port: 0,
                environment: Environment::Staging,
                status: ConnectionStatus::Disconnected,
                tables: vec![],
                total_size_mb: 0.0,
                active_connections: 0,
                queries_per_second: 0.0,
            },
            &profile(),
        );
        assert_eq!(schema.id, "c1");
        assert_eq!(schema.name, "Local");
        assert_eq!(schema.connection_host, "127.0.0.1");
        assert_eq!(schema.connection_port, 5432);
        assert_eq!(schema.environment, Environment::Development);
        assert_eq!(schema.status, ConnectionStatus::Connected);
    }

    #[test]
    fn history_item_classifies_sql_and_errors() {
        let ok = history_item_from_result(
            "log_1".into(),
            &profile(),
            &QueryExecutionResult {
                id: "r1".into(),
                query: "INSERT INTO t VALUES (1)".into(),
                timestamp: "2026-01-01T00:00:00Z".into(),
                execution_time_ms: 4,
                affected_rows: Some(1),
                columns: None,
                rows: None,
                error: None,
                truncated: None,
            },
        );
        assert_eq!(ok.query_type, HistoryQueryType::Insert);
        assert_eq!(ok.status, HistoryStatus::Success);

        let err = history_item_from_result(
            "log_2".into(),
            &profile(),
            &QueryExecutionResult {
                id: "r2".into(),
                query: "SELECT 1".into(),
                timestamp: "2026-01-01T00:00:00Z".into(),
                execution_time_ms: 1,
                affected_rows: None,
                columns: None,
                rows: None,
                error: Some("boom".into()),
                truncated: None,
            },
        );
        assert_eq!(err.status, HistoryStatus::Error);
        assert_eq!(err.error_message.as_deref(), Some("boom"));
        assert_eq!(err.rows_affected, 0);
    }
}
