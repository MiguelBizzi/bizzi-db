use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use db_core::{
    history_item_from_result, new_connection_requires_password, overlay_schema,
    profile_from_save_input, ActivityLogItem, Adapter, ConnectConfig, ConnectionProfile,
    ConnectionStatus, DatabaseSchema, ExecuteQueryRequest, QueryExecutionResult,
    SaveConnectionInput, SavedQuery, Session, TablePreviewRequest, TestConnectionResult,
    WorkspaceState, DEFAULT_ROW_CAP,
};
use db_postgres::PostgresAdapter;
use db_storage::{KeychainSecrets, SecretStore, Storage};
use tauri::{AppHandle, Manager, State};
use uuid::Uuid;

pub struct AppState {
    storage: Mutex<Storage>,
    secrets: KeychainSecrets,
    sessions: tokio::sync::Mutex<HashMap<String, Arc<dyn Session>>>,
}

fn map_err(err: impl std::fmt::Display) -> String {
    err.to_string()
}

fn connect_config(profile: &ConnectionProfile, password: String) -> ConnectConfig {
    ConnectConfig {
        host: profile.host.clone(),
        port: profile.port,
        database: profile.database.clone(),
        user: profile.user.clone(),
        password,
        ssl: profile.ssl,
        pool_size: profile.pool_size,
    }
}

fn profile_from_input(input: SaveConnectionInput) -> ConnectionProfile {
    let id = input
        .id
        .clone()
        .unwrap_or_else(|| format!("conn_{}", Uuid::new_v4()));
    profile_from_save_input(input, id)
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
    let mut profile = profile_from_input(input.clone());
    if !input.password.is_empty() {
        state
            .secrets
            .set_password(&profile.id, &input.password)
            .map_err(map_err)?;
    } else if input.id.is_some() {
        // keep existing secret
    }
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
async fn connections_delete(state: State<'_, AppState>, id: String) -> Result<(), String> {
    {
        let mut sessions = state.sessions.lock().await;
        sessions.remove(&id);
    }
    let _ = state.secrets.delete_password(&id);
    state
        .storage
        .lock()
        .map_err(map_err)?
        .delete_connection(&id)
        .map_err(map_err)
}

#[tauri::command]
async fn connections_test(input: SaveConnectionInput) -> Result<TestConnectionResult, String> {
    let profile = profile_from_input(input.clone());
    let adapter = PostgresAdapter;
    match adapter
        .test_connection(&connect_config(&profile, input.password))
        .await
    {
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
        .get_password(&id)
        .map_err(map_err)?
        .ok_or_else(|| "No password in keychain for this connection".to_string())?;
    let adapter = PostgresAdapter;
    let session = adapter
        .connect(&connect_config(&profile, password))
        .await
        .map_err(map_err)?;
    state.sessions.lock().await.insert(id, Arc::from(session));
    profile.status = ConnectionStatus::Connected;
    Ok(profile)
}

#[tauri::command]
async fn connections_disconnect(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state.sessions.lock().await.remove(&id);
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
) -> Result<QueryExecutionResult, String> {
    let profile = state
        .storage
        .lock()
        .map_err(map_err)?
        .get_connection(&input.connection_id)
        .map_err(map_err)?
        .ok_or_else(|| "Connection not found".to_string())?;
    let session = session_for(&state, &input.connection_id).await?;
    let result = session
        .execute(&input.sql, DEFAULT_ROW_CAP)
        .await
        .map_err(map_err)?;
    if input.record_history {
        record_history(&state, &profile, &result)?;
    }
    Ok(result)
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

fn db_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(map_err)?;
    Ok(dir.join("workspace.sqlite"))
}

#[cfg(target_os = "macos")]
mod macos;

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let path = db_path(app.handle())?;
            let storage = Storage::open(&path).map_err(|e| e.to_string())?;
            app.manage(AppState {
                storage: Mutex::new(storage),
                secrets: KeychainSecrets::new("com.dbpro.studio"),
                sessions: tokio::sync::Mutex::new(HashMap::new()),
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
            connections_test,
            connections_connect,
            connections_disconnect,
            schema_introspect,
            table_preview,
            query_execute,
            history_list,
            saved_queries_list,
            saved_queries_save,
            saved_queries_delete,
            saved_queries_update_tags,
            workspace_load,
            workspace_save
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
