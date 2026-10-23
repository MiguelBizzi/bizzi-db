pub fn platform_init_script(os: &str) -> Option<String> {
    match os {
        "macos" | "windows" | "linux" => Some(format!("window.__BIZZI_PLATFORM__=\"{os}\";")),
        _ => None,
    }
}

/// Only sets the variable when the user has not: an explicit value, even `0`, wins.
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
pub fn webkit_env_default(
    nvidia: bool,
    current: Option<&std::ffi::OsStr>,
) -> Option<(&'static str, &'static str)> {
    (nvidia && current.is_none()).then_some(("WEBKIT_DISABLE_DMABUF_RENDERER", "1"))
}

/// The AppImage runtime sets `APPDIR` to its mount, so an exe outside it means `APPIMAGE` was
/// inherited from another AppImage app (a terminal in Cursor) and must not steer the updater.
pub fn inherited_appimage(appdir: Option<&std::path::Path>, exe: &std::path::Path) -> bool {
    !appdir.is_some_and(|dir| exe.starts_with(dir))
}

#[cfg(target_os = "linux")]
pub fn prepare_linux() {
    // tauri-plugin-updater overwrites the file `APPIMAGE` names, which may be another app's AppImage.
    if let Ok(exe) = std::env::current_exe() {
        let appdir = std::env::var_os("APPDIR").map(std::path::PathBuf::from);
        if inherited_appimage(appdir.as_deref(), &exe) {
            std::env::remove_var("APPIMAGE");
            std::env::remove_var("APPDIR");
        }
    }
    // WebKitGTK's DMA-BUF renderer shows a blank window on the proprietary NVIDIA driver.
    let nvidia = std::path::Path::new("/proc/driver/nvidia/version").exists();
    let current = std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER");
    if let Some((key, value)) = webkit_env_default(nvidia, current.as_deref()) {
        std::env::set_var(key, value);
    }
    // GTK derives the X11 WM_CLASS from the program name. It must equal the Wayland app id and the
    // desktop entry's StartupWMClass, or the shell cannot match the window to its launcher icon.
    glib::set_prgname(Some("com.bizzidb.app"));
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
    use std::ffi::OsStr;
    use std::path::Path;

    #[test]
    fn nvidia_without_a_user_value_gets_the_workaround() {
        assert_eq!(
            webkit_env_default(true, None),
            Some(("WEBKIT_DISABLE_DMABUF_RENDERER", "1"))
        );
    }

    #[test]
    fn user_value_is_never_overridden() {
        assert_eq!(webkit_env_default(true, Some(OsStr::new("0"))), None);
    }

    #[test]
    fn no_nvidia_no_change() {
        assert_eq!(webkit_env_default(false, None), None);
    }

    #[test]
    fn appimage_without_a_mount_is_inherited() {
        assert!(inherited_appimage(None, Path::new("/usr/bin/db-desktop")));
    }

    #[test]
    fn exe_outside_the_mount_is_inherited() {
        assert!(inherited_appimage(
            Some(Path::new("/tmp/.mount_CursorX")),
            Path::new("/usr/bin/db-desktop")
        ));
    }

    #[test]
    fn exe_inside_the_mount_is_ours() {
        assert!(!inherited_appimage(
            Some(Path::new("/tmp/.mount_BizziX")),
            Path::new("/tmp/.mount_BizziX/usr/bin/db-desktop")
        ));
    }

    #[test]
    fn desktop_entry_matches_the_identifier() {
        let conf: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        let identifier = conf["identifier"].as_str().unwrap();
        let entry = include_str!("../linux/bizzi-db.desktop");
        assert!(entry.contains(&format!("StartupWMClass={identifier}")));
        assert!(entry.contains("Terminal=false"));
        assert!(entry.contains("Type=Application"));
    }

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
