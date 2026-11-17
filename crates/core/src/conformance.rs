//! Checks every engine session has to pass against the shared seed.
//!
//! Enabled with the `conformance` feature so engine crates can call it from
//! their ignored live tests without pulling it into the default library build.

use crate::document::{DocValue, DocumentPage, DocumentSession, FindRequest, Namespace};
use crate::query_error::QueryErrorCategory;
use crate::types::{FilterOperator, TableFilter};
use crate::Session;

/// What the shared seed looks like to a session test. SQL that is not portable
/// (`syntax_sql`, `reference_sql`, `constraint_sql`, `dml_sql`) is supplied by
/// the engine, because the failure has to be real on that server.
pub struct ConformanceSeed {
    pub schema: &'static str,
    pub table: &'static str,
    pub text_column: &'static str,
    /// A substring of `text_column` that matches at least one row.
    pub text_like: &'static str,
    pub min_rows: u64,
    pub syntax_sql: &'static str,
    pub reference_sql: &'static str,
    pub constraint_sql: &'static str,
    /// A statement that changes rows but not the catalog.
    pub dml_sql: &'static str,
}

pub async fn assert_session(session: &dyn Session, seed: &ConformanceSeed) -> Result<(), String> {
    let select = session
        .execute("SELECT 1 AS n", None)
        .await
        .map_err(|err| err.to_string())?;
    let select = select
        .into_iter()
        .next()
        .ok_or("SELECT 1 returned nothing")?;
    if select.error.is_some() {
        return Err(format!("SELECT 1 failed: {:?}", select.error));
    }
    if select.rows.as_ref().map(|rows| rows.len()) != Some(1) {
        return Err("SELECT 1 did not return one row".into());
    }

    let paged = session
        .query_page(
            &format!("SELECT * FROM {}.{}", seed.schema, seed.table),
            10,
            0,
            true,
        )
        .await
        .map_err(|err| err.to_string())?;
    if paged.error.is_some() {
        return Err(format!("paging failed: {:?}", paged.error));
    }
    let page_len = paged.rows.as_ref().map(|rows| rows.len()).unwrap_or(0);
    if page_len == 0 || page_len > 10 {
        return Err(format!("expected a page of 1..=10 rows, got {page_len}"));
    }
    let total = paged.total_rows.ok_or("paging did not count rows")?;
    if total < seed.min_rows {
        return Err(format!(
            "{} rows in {}.{}, expected at least {}",
            total, seed.schema, seed.table, seed.min_rows
        ));
    }

    let filtered = session
        .preview(
            seed.schema,
            seed.table,
            20,
            0,
            &[TableFilter {
                column: seed.text_column.into(),
                operator: FilterOperator::ILike,
                value: seed.text_like.into(),
            }],
        )
        .await
        .map_err(|err| err.to_string())?;
    if filtered.error.is_some() {
        return Err(format!("preview filter failed: {:?}", filtered.error));
    }
    let matches = filtered.total_rows.unwrap_or(0);
    if matches == 0 {
        return Err("ILIKE preview matched no rows".into());
    }

    for operator in [
        FilterOperator::Eq,
        FilterOperator::NotEq,
        FilterOperator::Like,
        FilterOperator::IsNull,
        FilterOperator::IsNotNull,
        FilterOperator::In,
        FilterOperator::Gt,
        FilterOperator::Lt,
        FilterOperator::Gte,
        FilterOperator::Lte,
    ] {
        let value = seed.text_like.to_string();
        let result = session
            .preview(
                seed.schema,
                seed.table,
                5,
                0,
                &[TableFilter {
                    column: seed.text_column.into(),
                    operator,
                    value,
                }],
            )
            .await
            .map_err(|err| err.to_string())?;
        if result.error.is_some() {
            return Err(format!("{operator:?} preview failed: {:?}", result.error));
        }
    }

    expect_category(session, seed.syntax_sql, QueryErrorCategory::Syntax).await?;
    expect_category(session, seed.reference_sql, QueryErrorCategory::Reference).await?;
    expect_category(session, seed.constraint_sql, QueryErrorCategory::Constraint).await?;

    let before = session
        .schema_fingerprint()
        .await
        .map_err(|err| err.to_string())?;
    let dml = session
        .execute(seed.dml_sql, None)
        .await
        .map_err(|err| err.to_string())?;
    if dml.iter().any(|result| result.error.is_some()) {
        return Err(format!("dml failed: {dml:?}"));
    }
    let after = session
        .schema_fingerprint()
        .await
        .map_err(|err| err.to_string())?;
    if before != after {
        return Err("fingerprint changed after a data-only statement".into());
    }

    let schema = session.introspect().await.map_err(|err| err.to_string())?;
    if !schema
        .tables
        .iter()
        .any(|table| table.schema == seed.schema && table.name == seed.table)
    {
        return Err(format!(
            "introspection did not find {}.{}",
            seed.schema, seed.table
        ));
    }
    Ok(())
}

async fn expect_category(
    session: &dyn Session,
    sql: &str,
    category: QueryErrorCategory,
) -> Result<(), String> {
    let results = session
        .execute(sql, None)
        .await
        .map_err(|err| err.to_string())?;
    let result = results
        .into_iter()
        .next()
        .ok_or_else(|| format!("no result for {sql}"))?;
    let info = result
        .error_info
        .ok_or_else(|| format!("expected an error for {sql}, got {:?}", result.rows))?;
    if info.category != category {
        return Err(format!(
            "{sql} was {:?}, expected {category:?}",
            info.category
        ));
    }
    Ok(())
}

/// What the document seed looks like to a session test.
pub struct DocumentSeed {
    pub database: &'static str,
    pub collection: &'static str,
    pub text_field: &'static str,
    /// Matches `text_field` of at least one document, case-insensitively.
    pub text_like: &'static str,
    pub min_documents: u64,
    /// A filter the server or the parser rejects as malformed.
    pub bad_filter: &'static str,
}

pub async fn assert_document_session(
    session: &dyn DocumentSession,
    seed: &DocumentSeed,
) -> Result<(), String> {
    let schema = session.introspect().await.map_err(|err| err.to_string())?;
    if !schema
        .collections
        .iter()
        .any(|c| c.database == seed.database && c.name == seed.collection)
    {
        return Err(format!(
            "introspection did not find {}.{}",
            seed.database, seed.collection
        ));
    }

    let all = find(session, seed, "", 10, 0).await?;
    if all.documents.is_empty() || all.documents.len() > 10 {
        return Err(format!(
            "expected a page of 1..=10 documents, got {}",
            all.documents.len()
        ));
    }
    let total = all.total.ok_or("find did not count documents")?;
    if total < seed.min_documents {
        return Err(format!(
            "{total} documents in {}.{}, expected at least {}",
            seed.database, seed.collection, seed.min_documents
        ));
    }

    let regex = format!(
        "{{ {}: {{ $regex: {}, $options: \"i\" }} }}",
        seed.text_field,
        serde_json::to_string(seed.text_like).map_err(|err| err.to_string())?
    );
    if find(session, seed, &regex, 10, 0)
        .await?
        .documents
        .is_empty()
    {
        return Err(format!("{regex} matched no documents"));
    }

    let first = find(session, seed, "", 2, 0).await?;
    let second = find(session, seed, "", 2, 1).await?;
    if first.documents.len() != 2 || second.documents.len() != 2 {
        return Err("paging with limit 2 did not return two documents".into());
    }
    if first.documents == second.documents {
        return Err("skip 1 returned the same page as skip 0".into());
    }

    let bad = session
        .find(&request(seed, seed.bad_filter, 10, 0))
        .await
        .map_err(|err| err.to_string())?;
    let info = bad
        .error_info
        .ok_or_else(|| format!("expected an error for {}", seed.bad_filter))?;
    if info.category != QueryErrorCategory::Syntax {
        return Err(format!(
            "{} was {:?}, expected Syntax",
            seed.bad_filter, info.category
        ));
    }

    let ns = Namespace {
        database: seed.database.into(),
        collection: seed.collection.into(),
    };
    let before = session
        .schema_fingerprint()
        .await
        .map_err(|err| err.to_string())?;
    let id = session
        .insert(
            &ns,
            &format!("{{ \"{}\": \"conformance\" }}", seed.text_field),
        )
        .await
        .map_err(|err| err.to_string())?;
    let DocValue::ObjectId { v } = id else {
        return Err(format!("insert returned {id:?}, expected an ObjectId"));
    };
    let deleted = session
        .delete(&ns, &[format!("{{ \"$oid\": \"{v}\" }}")])
        .await
        .map_err(|err| err.to_string())?;
    if deleted != 1 {
        return Err(format!("deleted {deleted} documents, expected 1"));
    }
    let after = session
        .schema_fingerprint()
        .await
        .map_err(|err| err.to_string())?;
    if before != after {
        return Err("fingerprint changed after an insert and a delete".into());
    }
    Ok(())
}

fn request(seed: &DocumentSeed, filter: &str, limit: i64, skip: i64) -> FindRequest {
    FindRequest {
        connection_id: String::new(),
        ns: Namespace {
            database: seed.database.into(),
            collection: seed.collection.into(),
        },
        filter: filter.into(),
        projection: String::new(),
        sort: "{ _id: 1 }".into(),
        limit,
        skip,
    }
}

async fn find(
    session: &dyn DocumentSession,
    seed: &DocumentSeed,
    filter: &str,
    limit: i64,
    skip: i64,
) -> Result<DocumentPage, String> {
    let page = session
        .find(&request(seed, filter, limit, skip))
        .await
        .map_err(|err| err.to_string())?;
    match page.error {
        Some(error) => Err(format!("find {filter:?} failed: {error}")),
        None => Ok(page),
    }
}
