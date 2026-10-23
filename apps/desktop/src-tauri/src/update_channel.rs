use std::path::Path;

use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InstallKind {
    Native,
    AppImage,
    Deb,
    Other,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateChannel {
    pub self_update: bool,
    /// Manifest key for `check({ target })`; `None` keeps the plugin default (the AppImage key on Linux).
    pub target: Option<String>,
}

/// `dpkg_list_exists` is what separates a real package install from a copy merely placed under `/usr/`.
pub fn install_kind(
    os: &str,
    appimage_env: bool,
    appdir: Option<&Path>,
    exe: &Path,
    dpkg_list_exists: bool,
) -> InstallKind {
    if os != "linux" {
        return InstallKind::Native;
    }
    if appimage_env && !crate::platform::inherited_appimage(appdir, exe) {
        return InstallKind::AppImage;
    }
    if exe.starts_with("/usr/") && dpkg_list_exists {
        return InstallKind::Deb;
    }
    InstallKind::Other
}

pub fn update_channel(kind: InstallKind, arch: &str) -> UpdateChannel {
    match kind {
        InstallKind::Native | InstallKind::AppImage => UpdateChannel {
            self_update: true,
            target: None,
        },
        InstallKind::Deb => UpdateChannel {
            self_update: true,
            target: Some(format!("linux-{arch}-deb")),
        },
        InstallKind::Other => UpdateChannel {
            self_update: false,
            target: None,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const X64: &str = "x86_64";

    #[test]
    fn deb_install_updates_through_the_deb_key() {
        let kind = install_kind("linux", false, None, Path::new("/usr/bin/db-desktop"), true);
        assert_eq!(kind, InstallKind::Deb);
        assert_eq!(
            update_channel(kind, X64),
            UpdateChannel {
                self_update: true,
                target: Some("linux-x86_64-deb".into())
            }
        );
    }

    #[test]
    fn appimage_uses_the_default_key() {
        let kind = install_kind(
            "linux",
            true,
            Some(Path::new("/tmp/.mount_x")),
            Path::new("/tmp/.mount_x/usr/bin/db-desktop"),
            false,
        );
        assert_eq!(kind, InstallKind::AppImage);
        assert_eq!(
            update_channel(kind, X64),
            UpdateChannel {
                self_update: true,
                target: None
            }
        );
    }

    #[test]
    fn other_install_never_self_updates() {
        let off = UpdateChannel {
            self_update: false,
            target: None,
        };
        let src = install_kind(
            "linux",
            false,
            None,
            Path::new("/home/u/src/target/release/db-desktop"),
            false,
        );
        assert_eq!(update_channel(src, X64), off);
        let unpackaged = install_kind(
            "linux",
            false,
            None,
            Path::new("/usr/bin/db-desktop"),
            false,
        );
        assert_eq!(unpackaged, InstallKind::Other);
        let outside_usr = install_kind("linux", false, None, Path::new("/opt/db-desktop"), true);
        assert_eq!(outside_usr, InstallKind::Other);
    }

    #[test]
    fn inherited_appimage_outside_the_mount_is_not_an_appimage() {
        let mount = Some(Path::new("/tmp/.mount_CursorX"));
        let deb = install_kind("linux", true, mount, Path::new("/usr/bin/db-desktop"), true);
        assert_eq!(deb, InstallKind::Deb);
        let src = install_kind(
            "linux",
            true,
            None,
            Path::new("/home/u/src/target/release/db-desktop"),
            false,
        );
        assert_eq!(src, InstallKind::Other);
    }

    #[test]
    fn macos_and_windows_are_native() {
        for os in ["macos", "windows"] {
            let kind = install_kind(os, false, None, Path::new("/x/db-desktop"), false);
            assert_eq!(kind, InstallKind::Native);
            assert_eq!(
                update_channel(kind, X64),
                UpdateChannel {
                    self_update: true,
                    target: None
                }
            );
        }
    }

    #[test]
    fn channel_serializes_in_camel_case() {
        let json = serde_json::to_value(update_channel(InstallKind::Deb, X64)).unwrap();
        assert_eq!(
            json,
            serde_json::json!({ "selfUpdate": true, "target": "linux-x86_64-deb" })
        );
    }
}
