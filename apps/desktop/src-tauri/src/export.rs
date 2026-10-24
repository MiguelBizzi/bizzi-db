use std::path::{Path, PathBuf};

/// Save dialogs on some platforms return the typed name without the filter's
/// extension, so a missing one is added rather than writing an extensionless file.
fn with_extension(path: PathBuf, extension: &str) -> PathBuf {
    if path.extension().is_some() {
        path
    } else {
        path.with_extension(extension)
    }
}

fn write_file(path: &Path, content: &[u8]) -> Result<(), String> {
    std::fs::write(path, content).map_err(|e| format!("Could not write {}: {e}", path.display()))
}

/// `Ok(None)` means the user cancelled the dialog and nothing was written.
pub async fn save_with_dialog(
    file_name: &str,
    filter_label: &str,
    extension: &str,
    content: &[u8],
) -> Result<Option<String>, String> {
    let Some(handle) = rfd::AsyncFileDialog::new()
        .set_title("Export data")
        .set_file_name(file_name)
        .add_filter(filter_label, &[extension])
        .save_file()
        .await
    else {
        return Ok(None);
    };
    let path = with_extension(handle.path().to_path_buf(), extension);
    write_file(&path, content)?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn adds_missing_extension() {
        assert_eq!(
            with_extension(PathBuf::from("/tmp/users"), "csv"),
            PathBuf::from("/tmp/users.csv")
        );
    }

    #[test]
    fn keeps_existing_extension() {
        assert_eq!(
            with_extension(PathBuf::from("/tmp/users.txt"), "csv"),
            PathBuf::from("/tmp/users.txt")
        );
    }

    #[test]
    fn writes_utf8_content_exactly() {
        let dir = std::env::temp_dir().join(format!("bizzi-export-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("out.csv");
        let content = "\u{FEFF}id,name\n1,\"Zoë, \"\"Jr\"\"\"\n";
        write_file(&path, content.as_bytes()).unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), content);
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn writes_binary_content_exactly() {
        let dir = std::env::temp_dir().join(format!("bizzi-export-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("out.png");
        let content = [0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0x0d, 0x0a];
        write_file(&path, &content).unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), content);
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn write_failure_names_the_path() {
        let path = std::env::temp_dir()
            .join(format!("bizzi-missing-{}", uuid::Uuid::new_v4()))
            .join("out.csv");
        let err = write_file(&path, b"x").unwrap_err();
        assert!(err.contains("out.csv"), "{err}");
    }
}
