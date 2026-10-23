pub fn platform_init_script(os: &str) -> Option<String> {
    match os {
        "macos" | "windows" | "linux" => Some(format!("window.__BIZZI_PLATFORM__=\"{os}\";")),
        _ => None,
    }
}

pub fn init<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    let builder = tauri::plugin::Builder::new("bizzi-platform");
    match platform_init_script(std::env::consts::OS) {
        Some(script) => builder.js_init_script(script),
        None => builder,
    }
    .build()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn init_script_names_known_platforms() {
        for os in ["linux", "macos", "windows"] {
            assert_eq!(
                platform_init_script(os),
                Some(format!("window.__BIZZI_PLATFORM__=\"{os}\";"))
            );
        }
    }

    #[test]
    fn init_script_skips_unknown() {
        assert_eq!(platform_init_script("freebsd"), None);
    }
}
