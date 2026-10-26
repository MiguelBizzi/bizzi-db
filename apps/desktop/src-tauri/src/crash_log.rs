use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use tauri::{AppHandle, Manager};

const FILE_NAME: &str = "crash.log";
/// Past this size the log starts over, so a crash loop cannot fill the disk.
const MAX_BYTES: u64 = 1024 * 1024;

static LOG_PATH: OnceLock<PathBuf> = OnceLock::new();

/// Records Rust panics in the crash log. Release builds have no terminal, so the default
/// hook's stderr output is lost.
pub fn install(app: &AppHandle) {
    let Ok(dir) = app.path().app_log_dir() else {
        return;
    };
    let _ = LOG_PATH.set(dir.join(FILE_NAME));
    let default_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        if let Some(path) = LOG_PATH.get() {
            let backtrace = std::backtrace::Backtrace::force_capture();
            let _ = append(path, "rust-panic", &format!("{info}\n{backtrace}"));
        }
        default_hook(info);
    }));
}

pub fn record(source: &str, details: &str) -> Result<(), String> {
    let path = LOG_PATH.get().ok_or("crash log is not available")?;
    append(path, source, details).map_err(|e| e.to_string())
}

fn append(path: &Path, source: &str, details: &str) -> io::Result<()> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)?;
    }
    let too_big = fs::metadata(path)
        .map(|m| m.len() > MAX_BYTES)
        .unwrap_or(false);
    let mut options = OpenOptions::new();
    options.create(true);
    if too_big {
        options.write(true).truncate(true);
    } else {
        options.append(true);
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(path)?;
    let stamp = chrono::Utc::now().to_rfc3339();
    writeln!(
        file,
        "[{stamp}] {source} v{}\n{details}\n",
        env!("CARGO_PKG_VERSION")
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_log() -> PathBuf {
        std::env::temp_dir()
            .join(format!("bizzi-crash-{}", uuid::Uuid::new_v4()))
            .join(FILE_NAME)
    }

    #[test]
    fn appends_entries_with_source_and_details() {
        let path = temp_log();
        append(&path, "root", "TypeError: a").unwrap();
        append(&path, "tab:query", "TypeError: b").unwrap();
        let text = fs::read_to_string(&path).unwrap();
        assert!(text.contains("] root v"));
        assert!(text.contains("TypeError: a"));
        assert!(text.contains("] tab:query v"));
        assert!(text.contains("TypeError: b"));
        fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }

    #[test]
    fn starts_over_when_the_log_is_too_big() {
        let path = temp_log();
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(&path, vec![b'x'; MAX_BYTES as usize + 1]).unwrap();
        append(&path, "root", "fresh").unwrap();
        let text = fs::read_to_string(&path).unwrap();
        assert!(!text.contains('x'));
        assert!(text.contains("fresh"));
        fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn log_is_private_to_the_user() {
        use std::os::unix::fs::PermissionsExt;
        let path = temp_log();
        append(&path, "root", "x").unwrap();
        let mode = fs::metadata(&path).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o600);
        fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }
}
