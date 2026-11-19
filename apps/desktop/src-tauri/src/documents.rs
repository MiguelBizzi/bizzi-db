use std::sync::Arc;
use std::time::Instant;

use db_core::{
    ActivityLogItem, ConnectionProfile, DocValue, DocumentAdapter, DocumentCommandResult,
    DocumentExportFormat, DocumentExportRequest, DocumentPage, DocumentSession, FieldSample,
    FindRequest, HistoryQueryType, HistoryStatus, IndexDraft, Namespace, SqlRange,
};
use tauri::State;
use uuid::Uuid;

use crate::{document_adapter_for, document_session_for, map_err, AppState};

fn now() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

pub(crate) fn history_item_from_document(
    id: String,
    profile: &ConnectionProfile,
    result: &DocumentCommandResult,
    adapter: &dyn DocumentAdapter,
) -> ActivityLogItem {
    let rows = match (&result.documents, result.affected) {
        (Some(documents), _) => documents.len() as u64,
        (None, Some(affected)) => affected,
        (None, None) => 0,
    };
    ActivityLogItem {
        id,
        timestamp: result.timestamp.clone(),
        database_name: profile.name.clone(),
        query: result.command.clone(),
        query_type: adapter.classify(&result.command),
        execution_time_ms: result.execution_time_ms,
        rows_affected: rows,
        status: if result.error.is_some() {
            HistoryStatus::Error
        } else {
            HistoryStatus::Success
        },
        error_message: result.error.clone(),
        user: profile.user.clone(),
    }
}

/// `description` must never carry document bodies or field values: history is
/// stored in plain text.
fn mutation_history_item(
    profile: &ConnectionProfile,
    query_type: HistoryQueryType,
    description: String,
    rows_affected: u64,
    started: Instant,
) -> ActivityLogItem {
    ActivityLogItem {
        id: format!("log_{}", Uuid::new_v4()),
        timestamp: now(),
        database_name: profile.name.clone(),
        query: description,
        query_type,
        execution_time_ms: started.elapsed().as_millis() as u64,
        rows_affected,
        status: HistoryStatus::Success,
        error_message: None,
        user: profile.user.clone(),
    }
}

fn ns_label(ns: &Namespace) -> String {
    format!("{}.{}", ns.database, ns.collection)
}

/// Takes no document text, so a replacement body cannot reach history.
fn replace_description(ns: &Namespace) -> String {
    format!("replaceOne {} {{_id: …}}", ns_label(ns))
}

fn insert_history(state: &AppState, item: &ActivityLogItem) -> Result<(), String> {
    state
        .storage
        .lock()
        .map_err(map_err)?
        .insert_history(item)
        .map_err(map_err)
}

fn profile_for(state: &AppState, id: &str) -> Result<ConnectionProfile, String> {
    state
        .storage
        .lock()
        .map_err(map_err)?
        .get_connection(id)
        .map_err(map_err)?
        .ok_or_else(|| "Connection not found".to_string())
}

async fn session_and_profile(
    state: &AppState,
    id: &str,
) -> Result<(Arc<dyn DocumentSession>, ConnectionProfile), String> {
    let profile = profile_for(state, id)?;
    Ok((document_session_for(state, id).await?, profile))
}

fn export_format(format: DocumentExportFormat) -> (&'static str, &'static str) {
    match format {
        DocumentExportFormat::JsonArray => ("JSON", "json"),
        DocumentExportFormat::Ndjson => ("NDJSON", "ndjson"),
        DocumentExportFormat::Csv => ("CSV", "csv"),
    }
}

#[tauri::command]
pub async fn documents_find(
    state: State<'_, AppState>,
    input: FindRequest,
) -> Result<DocumentPage, String> {
    let session = document_session_for(&state, &input.connection_id).await?;
    session.find(&input).await.map_err(map_err)
}

#[tauri::command]
pub async fn documents_sample_fields(
    state: State<'_, AppState>,
    connection_id: String,
    ns: Namespace,
    size: u32,
) -> Result<FieldSample, String> {
    let session = document_session_for(&state, &connection_id).await?;
    session.sample_fields(&ns, size).await.map_err(map_err)
}

#[tauri::command]
pub async fn documents_run(
    state: State<'_, AppState>,
    connection_id: String,
    database: String,
    text: String,
    page_size: i64,
    record_history: bool,
) -> Result<Vec<DocumentCommandResult>, String> {
    let (session, profile) = session_and_profile(&state, &connection_id).await?;
    let results = session
        .run(&database, &text, page_size)
        .await
        .map_err(map_err)?;
    if record_history {
        let adapter = document_adapter_for(profile.dialect)?;
        for result in &results {
            let item = history_item_from_document(
                format!("log_{}", Uuid::new_v4()),
                &profile,
                result,
                adapter,
            );
            insert_history(&state, &item)?;
        }
    }
    Ok(results)
}

#[tauri::command]
pub async fn documents_insert(
    state: State<'_, AppState>,
    connection_id: String,
    ns: Namespace,
    document: String,
) -> Result<DocValue, String> {
    let (session, profile) = session_and_profile(&state, &connection_id).await?;
    let started = Instant::now();
    let id = session.insert(&ns, &document).await.map_err(map_err)?;
    let item = mutation_history_item(
        &profile,
        HistoryQueryType::Insert,
        format!("insertOne {}", ns_label(&ns)),
        1,
        started,
    );
    insert_history(&state, &item)?;
    Ok(id)
}

#[tauri::command]
pub async fn documents_replace(
    state: State<'_, AppState>,
    connection_id: String,
    ns: Namespace,
    original: String,
    replacement: String,
) -> Result<(), String> {
    let (session, profile) = session_and_profile(&state, &connection_id).await?;
    let started = Instant::now();
    session
        .replace(&ns, &original, &replacement)
        .await
        .map_err(map_err)?;
    let item = mutation_history_item(
        &profile,
        HistoryQueryType::Update,
        replace_description(&ns),
        1,
        started,
    );
    insert_history(&state, &item)
}

#[tauri::command]
pub async fn documents_delete(
    state: State<'_, AppState>,
    connection_id: String,
    ns: Namespace,
    ids: Vec<String>,
) -> Result<u64, String> {
    let (session, profile) = session_and_profile(&state, &connection_id).await?;
    let started = Instant::now();
    let deleted = session.delete(&ns, &ids).await.map_err(map_err)?;
    let item = mutation_history_item(
        &profile,
        HistoryQueryType::Delete,
        format!("deleteMany {} ({})", ns_label(&ns), ids.len()),
        deleted,
        started,
    );
    insert_history(&state, &item)?;
    Ok(deleted)
}

#[tauri::command]
pub async fn documents_export(
    state: State<'_, AppState>,
    input: DocumentExportRequest,
) -> Result<Option<String>, String> {
    let session = document_session_for(&state, &input.connection_id).await?;
    let bytes = session.export(&input).await.map_err(map_err)?;
    let (label, extension) = export_format(input.format);
    crate::export::save_with_dialog(&input.file_name, label, extension, &bytes).await
}

#[tauri::command]
pub fn document_statement_ranges(
    state: State<'_, AppState>,
    connection_id: String,
    text: String,
) -> Result<Vec<SqlRange>, String> {
    let profile = profile_for(&state, &connection_id)?;
    Ok(document_adapter_for(profile.dialect)?.statement_ranges(&text))
}

#[tauri::command]
pub async fn collection_create(
    state: State<'_, AppState>,
    connection_id: String,
    ns: Namespace,
) -> Result<(), String> {
    let (session, profile) = session_and_profile(&state, &connection_id).await?;
    let started = Instant::now();
    session.create_collection(&ns).await.map_err(map_err)?;
    let item = mutation_history_item(
        &profile,
        HistoryQueryType::Ddl,
        format!("createCollection {}", ns_label(&ns)),
        0,
        started,
    );
    insert_history(&state, &item)
}

#[tauri::command]
pub async fn collection_drop(
    state: State<'_, AppState>,
    connection_id: String,
    ns: Namespace,
) -> Result<(), String> {
    let (session, profile) = session_and_profile(&state, &connection_id).await?;
    let started = Instant::now();
    session.drop_collection(&ns).await.map_err(map_err)?;
    let item = mutation_history_item(
        &profile,
        HistoryQueryType::Ddl,
        format!("dropCollection {}", ns_label(&ns)),
        0,
        started,
    );
    insert_history(&state, &item)
}

#[tauri::command]
pub async fn collection_index_create(
    state: State<'_, AppState>,
    connection_id: String,
    ns: Namespace,
    draft: IndexDraft,
) -> Result<String, String> {
    let (session, profile) = session_and_profile(&state, &connection_id).await?;
    let started = Instant::now();
    let name = session.create_index(&ns, &draft).await.map_err(map_err)?;
    let item = mutation_history_item(
        &profile,
        HistoryQueryType::Ddl,
        format!("createIndex {} {}", ns_label(&ns), name),
        0,
        started,
    );
    insert_history(&state, &item)?;
    Ok(name)
}

#[tauri::command]
pub async fn collection_index_drop(
    state: State<'_, AppState>,
    connection_id: String,
    ns: Namespace,
    name: String,
) -> Result<(), String> {
    let (session, profile) = session_and_profile(&state, &connection_id).await?;
    let started = Instant::now();
    session.drop_index(&ns, &name).await.map_err(map_err)?;
    let item = mutation_history_item(
        &profile,
        HistoryQueryType::Ddl,
        format!("dropIndex {} {}", ns_label(&ns), name),
        0,
        started,
    );
    insert_history(&state, &item)
}

#[cfg(test)]
mod tests {
    use super::*;
    use db_core::{
        profile_from_save_input, DatabaseDialect, Environment, SaveConnectionInput, SshAuthMethod,
        SslMode,
    };

    fn profile() -> ConnectionProfile {
        profile_from_save_input(
            SaveConnectionInput {
                id: Some("c1".into()),
                name: "Local Mongo".into(),
                dialect: DatabaseDialect::MongoDB,
                host: "127.0.0.1".into(),
                port: 27017,
                database: String::new(),
                user: "root".into(),
                password: String::new(),
                ssl_mode: SslMode::Disabled,
                pool_size: 4,
                environment: Environment::Development,
                folder_id: None,
                ssh_enabled: false,
                ssh_host: String::new(),
                ssh_port: 22,
                ssh_user: String::new(),
                ssh_auth: SshAuthMethod::Password,
                ssh_password: String::new(),
                ssh_key_path: None,
                ssh_passphrase: String::new(),
                params: Default::default(),
            },
            "c1".into(),
        )
    }

    fn result(command: &str) -> DocumentCommandResult {
        DocumentCommandResult {
            id: "r1".into(),
            command: command.into(),
            timestamp: "2026-01-01T00:00:00.000Z".into(),
            execution_time_ms: 7,
            documents: None,
            value: None,
            affected: None,
            error: None,
            error_info: None,
        }
    }

    #[test]
    fn history_item_from_document_uses_classifier() {
        let adapter = document_adapter_for(DatabaseDialect::MongoDB).unwrap();
        let profile = profile();

        let mut find = result("db.users.find({})");
        find.documents = Some(vec![DocValue::Null, DocValue::Null]);
        let item = history_item_from_document("a".into(), &profile, &find, adapter);
        assert_eq!(item.query_type, HistoryQueryType::Select);
        assert_eq!(item.rows_affected, 2);
        assert_eq!(item.query, "db.users.find({})");
        assert_eq!(item.database_name, "Local Mongo");
        assert_eq!(item.user, "root");
        assert_eq!(item.status, HistoryStatus::Success);

        let mut delete = result("db.users.deleteMany({})");
        delete.affected = Some(5);
        let item = history_item_from_document("b".into(), &profile, &delete, adapter);
        assert_eq!(item.query_type, HistoryQueryType::Delete);
        assert_eq!(item.rows_affected, 5);

        let mut failed = result("db.users.find({");
        failed.error = Some("boom".into());
        let item = history_item_from_document("c".into(), &profile, &failed, adapter);
        assert_eq!(item.status, HistoryStatus::Error);
        assert_eq!(item.error_message.as_deref(), Some("boom"));
        assert_eq!(item.rows_affected, 0);
    }

    #[test]
    fn history_omits_document_body() {
        let ns = Namespace {
            database: "shop".into(),
            collection: "users".into(),
        };
        let replacement = r#"{"_id": 1, "password": "hunter2"}"#;
        let description = replace_description(&ns);
        assert_eq!(description, "replaceOne shop.users {_id: …}");
        assert!(!description.contains("hunter2"));
        assert!(!description.contains(replacement));
    }

    #[test]
    fn export_formats_map_to_label_and_extension() {
        assert_eq!(
            export_format(DocumentExportFormat::JsonArray),
            ("JSON", "json")
        );
        assert_eq!(
            export_format(DocumentExportFormat::Ndjson),
            ("NDJSON", "ndjson")
        );
        assert_eq!(export_format(DocumentExportFormat::Csv), ("CSV", "csv"));
    }
}
