use objc2_app_kit::{NSWindow, NSWindowButton};
use tauri::{AppHandle, Manager, RunEvent, WebviewWindow, WindowEvent};

/// The traffic lights are drawn by the webview (`WindowControls`) so they can match
/// the flat look of other Mac apps. This only hides the native AppKit buttons.
pub fn install(window: &WebviewWindow) {
    hide_native_traffic_lights(window);
    let target = window.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            // macOS convention: closing the window keeps the app running in the Dock.
            // Cmd+Q still quits, and a Dock click brings the window back.
            api.prevent_close();
            let _ = target.hide();
        }
    });
}

/// Reopens the main window when the Dock icon is clicked while it is hidden.
pub fn handle_run_event(app: &AppHandle, event: &RunEvent) {
    if let RunEvent::Reopen {
        has_visible_windows: false,
        ..
    } = event
    {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.show();
            let _ = window.unminimize();
            let _ = window.set_focus();
        }
    }
}

fn hide_native_traffic_lights(window: &WebviewWindow) {
    let Ok(ptr) = window.ns_window() else {
        return;
    };
    if ptr.is_null() {
        return;
    }
    unsafe {
        let ns_window = &*ptr.cast::<NSWindow>();
        for kind in [
            NSWindowButton::NSWindowCloseButton,
            NSWindowButton::NSWindowMiniaturizeButton,
            NSWindowButton::NSWindowZoomButton,
        ] {
            if let Some(button) = ns_window.standardWindowButton(kind) {
                button.setHidden(true);
            }
        }
    }
}
