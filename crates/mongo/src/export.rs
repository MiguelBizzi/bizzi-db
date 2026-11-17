use std::collections::HashMap;

use db_core::{DocValue, DocumentExportFormat, ExtJsonMode};
use mongodb::bson::{Bson, Document};

use crate::values::to_doc_value;

/// Takes documents one at a time as the cursor yields them.
///
/// JSON formats append each document's bytes immediately. CSV needs every
/// top-level key before the header can be written, so it keeps each row as
/// already-formatted cells and writes header and rows in `finish`. That holds
/// about the size of the output in memory, not a `Document` per row, and
/// avoids a second query that could see different documents than the first.
pub struct Writer {
    format: DocumentExportFormat,
    mode: ExtJsonMode,
    out: Vec<u8>,
    count: usize,
    columns: Vec<String>,
    column_index: HashMap<String, usize>,
    rows: Vec<Vec<(usize, String)>>,
}

impl Writer {
    pub fn new(format: DocumentExportFormat, mode: ExtJsonMode) -> Self {
        let out = match format {
            DocumentExportFormat::JsonArray => b"[\n".to_vec(),
            _ => Vec::new(),
        };
        Writer {
            format,
            mode,
            out,
            count: 0,
            columns: Vec::new(),
            column_index: HashMap::new(),
            rows: Vec::new(),
        }
    }

    pub fn push(&mut self, doc: Document) {
        match self.format {
            DocumentExportFormat::JsonArray => {
                if self.count > 0 {
                    self.out.extend_from_slice(b",\n");
                }
                self.out
                    .extend_from_slice(ejson(Bson::Document(doc), self.mode).as_bytes());
            }
            DocumentExportFormat::Ndjson => {
                self.out
                    .extend_from_slice(ejson(Bson::Document(doc), self.mode).as_bytes());
                self.out.push(b'\n');
            }
            DocumentExportFormat::Csv => {
                let mut row = Vec::with_capacity(doc.len());
                for (key, value) in &doc {
                    let index = match self.column_index.get(key) {
                        Some(&index) => index,
                        None => {
                            self.columns.push(key.clone());
                            self.column_index
                                .insert(key.clone(), self.columns.len() - 1);
                            self.columns.len() - 1
                        }
                    };
                    row.push((index, csv_cell(value)));
                }
                self.rows.push(row);
            }
        }
        self.count += 1;
    }

    pub fn finish(mut self) -> Vec<u8> {
        match self.format {
            DocumentExportFormat::JsonArray => {
                if self.count > 0 {
                    self.out.push(b'\n');
                }
                self.out.extend_from_slice(b"]\n");
            }
            DocumentExportFormat::Ndjson => {}
            DocumentExportFormat::Csv if self.rows.is_empty() => {}
            DocumentExportFormat::Csv => {
                let header: Vec<&str> = self.columns.iter().map(String::as_str).collect();
                write_csv_line(&mut self.out, &header);
                let mut cells = vec![""; self.columns.len()];
                for row in &self.rows {
                    cells.fill("");
                    for (index, cell) in row {
                        cells[*index] = cell;
                    }
                    write_csv_line(&mut self.out, &cells);
                }
            }
        }
        self.out
    }
}

fn ejson(value: Bson, mode: ExtJsonMode) -> String {
    let json = match mode {
        ExtJsonMode::Relaxed => value.into_relaxed_extjson(),
        ExtJsonMode::Canonical => value.into_canonical_extjson(),
    };
    json.to_string()
}

/// Scalars as their plain text; null as an empty cell; anything without a
/// plain form as relaxed Extended JSON.
fn csv_cell(value: &Bson) -> String {
    match to_doc_value(value) {
        DocValue::Null => String::new(),
        DocValue::Bool { v } => v.to_string(),
        DocValue::Int32 { v }
        | DocValue::Int64 { v }
        | DocValue::Double { v }
        | DocValue::Decimal128 { v }
        | DocValue::String { v }
        | DocValue::ObjectId { v }
        | DocValue::Date { v } => v,
        _ => ejson(value.clone(), ExtJsonMode::Relaxed),
    }
}

/// RFC 4180 quoting; lines end in `\n` like the grid's CSV export.
fn write_csv_line(out: &mut Vec<u8>, cells: &[&str]) {
    for (i, cell) in cells.iter().enumerate() {
        if i > 0 {
            out.push(b',');
        }
        if cell.contains([',', '"', '\n', '\r']) {
            out.push(b'"');
            out.extend_from_slice(cell.replace('"', "\"\"").as_bytes());
            out.push(b'"');
        } else {
            out.extend_from_slice(cell.as_bytes());
        }
    }
    out.push(b'\n');
}

/// `Writer` over a slice; the session drives `Writer` from the async cursor.
#[cfg(test)]
pub fn write<'a>(
    format: DocumentExportFormat,
    mode: ExtJsonMode,
    docs: impl IntoIterator<Item = &'a Document>,
) -> Vec<u8> {
    let mut writer = Writer::new(format, mode);
    for doc in docs {
        writer.push(doc.clone());
    }
    writer.finish()
}

#[cfg(test)]
mod tests {
    use super::*;
    use mongodb::bson::{doc, DateTime};

    fn text(bytes: Vec<u8>) -> String {
        String::from_utf8(bytes).unwrap()
    }

    #[test]
    fn export_json_array_canonical_keeps_int64() {
        let docs = [doc! { "_id": 1, "n": 5_i64 }, doc! { "n": 7_i64 }];
        let out = text(write(
            DocumentExportFormat::JsonArray,
            ExtJsonMode::Canonical,
            &docs,
        ));
        assert_eq!(
            out,
            "[\n{\"_id\":{\"$numberInt\":\"1\"},\"n\":{\"$numberLong\":\"5\"}},\n{\"n\":{\"$numberLong\":\"7\"}}\n]\n"
        );
        let relaxed = text(write(
            DocumentExportFormat::JsonArray,
            ExtJsonMode::Relaxed,
            &docs,
        ));
        assert_eq!(relaxed, "[\n{\"_id\":1,\"n\":5},\n{\"n\":7}\n]\n");
        assert_eq!(
            text(write(
                DocumentExportFormat::JsonArray,
                ExtJsonMode::Relaxed,
                &[]
            )),
            "[\n]\n"
        );
    }

    #[test]
    fn export_ndjson_is_one_document_per_line() {
        let docs = [doc! { "b": 1, "a": DateTime::from_millis(0) }, doc! {}];
        let out = text(write(
            DocumentExportFormat::Ndjson,
            ExtJsonMode::Relaxed,
            &docs,
        ));
        assert_eq!(
            out,
            "{\"b\":1,\"a\":{\"$date\":\"1970-01-01T00:00:00Z\"}}\n{}\n"
        );
    }

    #[test]
    fn export_csv_unions_keys_and_quotes() {
        let docs = [
            doc! { "a": 1, "b": "x,y" },
            doc! { "c": { "d": 1 }, "a": "say \"hi\"" },
            doc! { "b": "line\nbreak", "e": [1, "two"], "f": null, "g": 5_i64, "h": true },
            doc! { "x,y": DateTime::from_millis(0) },
        ];
        let out = text(write(
            DocumentExportFormat::Csv,
            ExtJsonMode::Relaxed,
            &docs,
        ));
        assert_eq!(
            out,
            concat!(
                "a,b,c,e,f,g,h,\"x,y\"\n",
                "1,\"x,y\",,,,,,\n",
                "\"say \"\"hi\"\"\",,\"{\"\"d\"\":1}\",,,,,\n",
                ",\"line\nbreak\",,\"[1,\"\"two\"\"]\",,5,true,\n",
                ",,,,,,,1970-01-01T00:00:00.000Z\n",
            )
        );
        assert!(write(DocumentExportFormat::Csv, ExtJsonMode::Relaxed, &[]).is_empty());
    }
}
