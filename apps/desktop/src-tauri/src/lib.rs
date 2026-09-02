mod ssh_tunnel;

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use db_core::{
    connect_config_from_profile, history_item_from_result, new_connection_requires_password,
    overlay_schema, profile_from_save_input, resolve_connection_password, ssh_secret_key,
    ssh_tunnel_from_profile, ssh_tunnel_from_save, validate_folder_name, validate_save_input,
    ActivityLogItem, Adapter, AppSettings, ConnectionFolder, ConnectionProfile,
    ConnectionStatus, DatabaseSchema, ExecuteQueryRequest, QueryExecuteResponse,
    QueryExecutionResult, SaveConnectionInput, SaveFolderInput, SavedQuery, Session,
    SshAuthMethod, TablePreviewRequest, TestConnectionResult, WorkspaceState, DEFAULT_ROW_CAP,
};
use db_postgres::PostgresAdapter;
use db_storage::{DualSecretStore, FileSecrets, KeychainSecrets, Storage};
use ssh_tunnel::SshTunnel;
use tauri::{AppHandle, Manager, State};
use uuid::Uuid;

type AppSecrets = DualSecretStore<KeychainSecrets, FileSecrets>;

pub struct AppState {
    storage: Mutex<Storage>,
    secrets: AppSecrets,
    sessions: tokio::sync::Mutex<HashMap<String, Arc<dyn Session>>>,
    tunnels: tokio::sync::Mutex<HashMap<String, SshTunnel>>,
}

fn map_err(err: impl std::fmt::Display) -> String {
    err.to_string()
}

fn keychain_enabled(state: &AppState) -> Result<bool, String> {
    Ok(state
        .storage
        .lock()
        .map_err(map_err)?
        .load_app_settings()
        .map_err(map_err)?
        .keychain_enabled)
}

fn secret_keys_for(connection_id: &str) -> [String; 2] {
    [connection_id.to_string(), ssh_secret_key(connection_id)]
}

fn delete_connection_secrets(state: &AppState, connection_id: &str) -> Result<(), String> {
    let enabled = keychain_enabled(state)?;
    for key in secret_keys_for(connection_id) {
        state.secrets.delete(enabled, &key).map_err(map_err)?;
    }
    Ok(())
}

fn store_connection_secrets(
    state: &AppState,
    profile_id: &str,
    input: &SaveConnectionInput,
    keychain_enabled: bool,
) -> Result<(), String> {
    if !input.password.is_empty() {
        state
            .secrets
            .set(keychain_enabled, profile_id, &input.password)
            .map_err(map_err)?;
    }
    let ssh_secret = match input.ssh_auth {
        SshAuthMethod::Password => input.ssh_password.as_str(),
        SshAuthMethod::PrivateKey => input.ssh_passphrase.as_str(),
    };
    if !ssh_secret.is_empty() {
        state
            .secrets
            .set(keychain_enabled, &ssh_secret_key(profile_id), ssh_secret)
            .map_err(map_err)?;
    }
    Ok(())
}

fn profile_from_input(input: SaveConnectionInput) -> ConnectionProfile {
    let id = input
        .id
        .clone()
        .unwrap_or_else(|| format!("conn_{}", Uuid::new_v4()));
    profile_from_save_input(input, id)
}

async fn drop_session(state: &AppState, id: &str) {
    state.sessions.lock().await.remove(id);
    state.tunnels.lock().await.remove(id);
}

#[tauri::command]
async fn connections_list(state: State<'_, AppState>) -> Result<Vec<ConnectionProfile>, String> {
    let mut list = {
        let storage = state.storage.lock().map_err(map_err)?;
        storage.list_connections().map_err(map_err)?
    };
    let sessions = state.sessions.lock().await;
    for item in &mut list {
        item.status = if sessions.contains_key(&item.id) {
            ConnectionStatus::Connected
        } else {
            ConnectionStatus::Disconnected
        };
    }
    Ok(list)
}

#[tauri::command]
fn connections_save(
    state: State<'_, AppState>,
    input: SaveConnectionInput,
) -> Result<ConnectionProfile, String> {
    if new_connection_requires_password(&input) {
        return Err("Password is required".into());
    }
    let keychain_enabled = keychain_enabled(&state)?;
    validate_save_input(&input, keychain_enabled)?;
    let mut profile = profile_from_input(input.clone());
    store_connection_secrets(&state, &profile.id, &input, keychain_enabled)?;
    state
        .storage
        .lock()
        .map_err(map_err)?
        .upsert_connection(&profile)
        .map_err(map_err)?;
    profile.status = ConnectionStatus::Disconnected;
    Ok(profile)
}

#[tauri::command]
fn folders_list(state: State<'_, AppState>) -> Result<Vec<ConnectionFolder>, String> {
    state
        .storage
        .lock()
        .map_err(map_err)?
        .list_folders()
        .map_err(map_err)
}

#[tauri::command]
fn folders_save(
    state: State<'_, AppState>,
    input: SaveFolderInput,
) -> Result<ConnectionFolder, String> {
    let name = validate_folder_name(&input.name)?;
    let folder = ConnectionFolder {
        id: input
            .id
            .unwrap_or_else(|| format!("folder_{}", Uuid::new_v4())),
        name,
    };
    state
        .storage
        .lock()
        .map_err(map_err)?
        .upsert_folder(&folder)
        .map_err(map_err)?;
    Ok(folder)
}

#[tauri::command]
async fn folders_delete(
    state: State<'_, AppState>,
    id: String,
    delete_connections: bool,
) -> Result<(), String> {
    let member_ids = {
        let storage = state.storage.lock().map_err(map_err)?;
        storage
            .list_connection_ids_in_folder(&id)
            .map_err(map_err)?
    };
    if delete_connections {
        for connection_id in &member_ids {
            drop_session(&state, connection_id).await;
            delete_connection_secrets(&state, connection_id)?;
        }
    }
    state
        .storage
        .lock()
        .map_err(map_err)?
        .delete_folder(&id, delete_connections)
        .map_err(map_err)?;
    Ok(())
}

#[tauri::command]
fn connections_move(
    state: State<'_, AppState>,
    id: String,
    folder_id: Option<String>,
    before_id: Option<String>,
) -> Result<(), String> {
    state
        .storage
        .lock()
        .map_err(map_err)?
        .place_connection(&id, folder_id.as_deref(), before_id.as_deref())
        .map_err(map_err)
}

#[tauri::command]
async fn connections_delete(state: State<'_, AppState>, id: String) -> Result<(), String> {
    drop_session(&state, &id).await;
    delete_connection_secrets(&state, &id)?;
    state
        .storage
        .lock()
        .map_err(map_err)?
        .delete_connection(&id)
        .map_err(map_err)
}

#[tauri::command]
async fn connections_test(
    state: State<'_, AppState>,
    input: SaveConnectionInput,
) -> Result<TestConnectionResult, String> {
    let keychain_enabled = keychain_enabled(&state)?;
    validate_save_input(&input, keychain_enabled)?;
    let stored = match &input.id {
        Some(id) => state.secrets.get(keychain_enabled, id).map_err(map_err)?,
        None => None,
    };
    let password = resolve_connection_password(&input, stored)?;
    let stored_ssh = match &input.id {
        Some(id) => state
            .secrets
            .get(keychain_enabled, &ssh_secret_key(id))
            .map_err(map_err)?,
        None => None,
    };
    let tunnel_cfg = ssh_tunnel_from_save(&input, stored_ssh)?;
    let _tunnel = match tunnel_cfg {
        Some(cfg) => Some(
            SshTunnel::open(&cfg, &input.host, input.port)
                .await
                .map_err(map_err)?,
        ),
        None => None,
    };
    let profile = profile_from_input(input);
    let adapter = PostgresAdapter;
    let cfg = connect_config_from_profile(
        &profile,
        password,
        _tunnel.as_ref().map(SshTunnel::local_port),
    );
    match adapter.test_connection(&cfg).await {
        Ok((latency_ms, version)) => Ok(TestConnectionResult {
            ok: true,
            latency_ms,
            message: format!("Connected ({version})"),
        }),
        Err(err) => Ok(TestConnectionResult {
            ok: false,
            latency_ms: 0,
            message: err.to_string(),
        }),
    }
}

#[tauri::command]
async fn connections_connect(
    state: State<'_, AppState>,
    id: String,
) -> Result<ConnectionProfile, String> {
    let mut profile = state
        .storage
        .lock()
        .map_err(map_err)?
        .get_connection(&id)
        .map_err(map_err)?
        .ok_or_else(|| "Connection not found".to_string())?;
    let password = state
        .secrets
        .get(keychain_enabled(&state)?, &id)
        .map_err(map_err)?
        .ok_or_else(|| "No password stored for this connection".to_string())?;
    let ssh_secret = state
        .secrets
        .get(keychain_enabled(&state)?, &ssh_secret_key(&id))
        .map_err(map_err)?;
    let tunnel_cfg = ssh_tunnel_from_profile(&profile, ssh_secret)?;
    let tunnel = match tunnel_cfg {
        Some(cfg) => Some(
            SshTunnel::open(&cfg, &profile.host, profile.port)
                .await
                .map_err(map_err)?,
        ),
        None => None,
    };
    let adapter = PostgresAdapter;
    let session = adapter
        .connect(&connect_config_from_profile(
            &profile,
            password,
            tunnel.as_ref().map(SshTunnel::local_port),
        ))
        .await
        .map_err(map_err)?;
    state.sessions.lock().await.insert(id.clone(), Arc::from(session));
    if let Some(tunnel) = tunnel {
        state.tunnels.lock().await.insert(id, tunnel);
    }
    profile.status = ConnectionStatus::Connected;
    Ok(profile)
}

#[tauri::command]
async fn connections_disconnect(state: State<'_, AppState>, id: String) -> Result<(), String> {
    drop_session(&state, &id).await;
    Ok(())
}

async fn session_for(state: &AppState, id: &str) -> Result<Arc<dyn Session>, String> {
    state
        .sessions
        .lock()
        .await
        .get(id)
        .cloned()
        .ok_or_else(|| "Not connected".to_string())
}

#[tauri::command]
async fn schema_introspect(
    state: State<'_, AppState>,
    connection_id: String,
) -> Result<DatabaseSchema, String> {
    let profile = state
        .storage
        .lock()
        .map_err(map_err)?
        .get_connection(&connection_id)
        .map_err(map_err)?
        .ok_or_else(|| "Connection not found".to_string())?;
    let session = session_for(&state, &connection_id).await?;
    let schema = session.introspect().await.map_err(map_err)?;
    Ok(overlay_schema(schema, &profile))
}

#[tauri::command]
async fn table_preview(
    state: State<'_, AppState>,
    input: TablePreviewRequest,
) -> Result<QueryExecutionResult, String> {
    let session = session_for(&state, &input.connection_id).await?;
    session
        .preview(&input.schema, &input.table, input.limit, input.offset)
        .await
        .map_err(map_err)
}

fn record_history(
    state: &AppState,
    profile: &ConnectionProfile,
    result: &QueryExecutionResult,
) -> Result<(), String> {
    let item = history_item_from_result(format!("log_{}", Uuid::new_v4()), profile, result);
    state
        .storage
        .lock()
        .map_err(map_err)?
        .insert_history(&item)
        .map_err(map_err)
}

#[tauri::command]
async fn query_execute(
    state: State<'_, AppState>,
    input: ExecuteQueryRequest,
) -> Result<QueryExecuteResponse, String> {
    let profile = state
        .storage
        .lock()
        .map_err(map_err)?
        .get_connection(&input.connection_id)
        .map_err(map_err)?
        .ok_or_else(|| "Connection not found".to_string())?;
    let session = session_for(&state, &input.connection_id).await?;
    let results = session
        .execute(&input.sql, DEFAULT_ROW_CAP)
        .await
        .map_err(map_err)?;
    if input.record_history {
        for result in &results {
            record_history(&state, &profile, result)?;
        }
    }
    Ok(QueryExecuteResponse { results })
}

#[tauri::command]
fn history_list(state: State<'_, AppState>) -> Result<Vec<ActivityLogItem>, String> {
    state
        .storage
        .lock()
        .map_err(map_err)?
        .list_history()
        .map_err(map_err)
}

#[tauri::command]
fn saved_queries_list(state: State<'_, AppState>) -> Result<Vec<SavedQuery>, String> {
    state
        .storage
        .lock()
        .map_err(map_err)?
        .list_saved_queries()
        .map_err(map_err)
}

#[tauri::command]
fn saved_queries_save(state: State<'_, AppState>, query: SavedQuery) -> Result<SavedQuery, String> {
    state
        .storage
        .lock()
        .map_err(map_err)?
        .upsert_saved_query(&query)
        .map_err(map_err)?;
    Ok(query)
}

#[tauri::command]
fn saved_queries_delete(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state
        .storage
        .lock()
        .map_err(map_err)?
        .delete_saved_query(&id)
        .map_err(map_err)
}

#[tauri::command]
fn saved_queries_update_tags(
    state: State<'_, AppState>,
    id: String,
    tags: Vec<String>,
) -> Result<(), String> {
    state
        .storage
        .lock()
        .map_err(map_err)?
        .update_saved_query_tags(&id, &tags)
        .map_err(map_err)
}

#[tauri::command]
fn workspace_load(state: State<'_, AppState>) -> Result<WorkspaceState, String> {
    state
        .storage
        .lock()
        .map_err(map_err)?
        .load_workspace()
        .map_err(map_err)
}

#[tauri::command]
fn workspace_save(app_state: State<'_, AppState>, state: WorkspaceState) -> Result<(), String> {
    app_state
        .storage
        .lock()
        .map_err(map_err)?
        .save_workspace(&state)
        .map_err(map_err)
}

#[tauri::command]
fn settings_get(state: State<'_, AppState>) -> Result<AppSettings, String> {
    state
        .storage
        .lock()
        .map_err(map_err)?
        .load_app_settings()
        .map_err(map_err)
}

#[tauri::command]
fn settings_save(
    state: State<'_, AppState>,
    settings: AppSettings,
) -> Result<AppSettings, String> {
    let previous = state
        .storage
        .lock()
        .map_err(map_err)?
        .load_app_settings()
        .map_err(map_err)?;
    if previous.keychain_enabled != settings.keychain_enabled {
        let ids: Vec<String> = state
            .storage
            .lock()
            .map_err(map_err)?
            .list_connections()
            .map_err(map_err)?
            .into_iter()
            .map(|profile| profile.id)
            .collect();
        let keys: Vec<String> = ids
            .iter()
            .flat_map(|id| secret_keys_for(id).into_iter())
            .collect();
        state
            .secrets
            .migrate(settings.keychain_enabled, &keys)
            .map_err(map_err)?;
    }
    state
        .storage
        .lock()
        .map_err(map_err)?
        .save_app_settings(&settings)
        .map_err(map_err)?;
    Ok(settings)
}

#[tauri::command]
async fn ssh_pick_private_key() -> Result<Option<String>, String> {
    let file = rfd::AsyncFileDialog::new()
        .set_title("Select SSH private key")
        .pick_file()
        .await;
    Ok(file.map(|handle| handle.path().to_string_lossy().into_owned()))
}

fn db_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(map_err)?;
    Ok(dir.join("workspace.sqlite"))
}

fn secrets_path(db_path: &std::path::Path) -> PathBuf {
    db_path
        .parent()
        .map(|dir| dir.join("secrets.json"))
        .unwrap_or_else(|| PathBuf::from("secrets.json"))
}

#[cfg(target_os = "macos")]
mod macos;

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let path = db_path(app.handle())?;
            let storage = Storage::open(&path).map_err(|e| e.to_string())?;
            let secrets = DualSecretStore::new(
                KeychainSecrets::new("com.dbpro.studio"),
                FileSecrets::open(&secrets_path(&path)).map_err(|e| e.to_string())?,
            );
            app.manage(AppState {
                storage: Mutex::new(storage),
                secrets,
                sessions: tokio::sync::Mutex::new(HashMap::new()),
                tunnels: tokio::sync::Mutex::new(HashMap::new()),
            });
            #[cfg(target_os = "macos")]
            if let Some(window) = app.get_webview_window("main") {
                macos::install(&window);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            connections_list,
            connections_save,
            connections_delete,
            connections_move,
            connections_test,
            connections_connect,
            connections_disconnect,
            folders_list,
            folders_save,
            folders_delete,
            schema_introspect,
            table_preview,
            query_execute,
            history_list,
            saved_queries_list,
            saved_queries_save,
            saved_queries_delete,
            saved_queries_update_tags,
            workspace_load,
            workspace_save,
            settings_get,
            settings_save,
            ssh_pick_private_key
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
