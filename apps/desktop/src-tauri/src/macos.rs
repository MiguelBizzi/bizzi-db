use objc2_app_kit::{NSWindow, NSWindowButton};
use tauri::{WebviewWindow, WindowEvent};

/// Must match the CSS header (`h-13` = 52px) so the lights share its vertical center.
const HEADER_HEIGHT: f64 = 52.0;
const TRAFFIC_LIGHT_X: f64 = 16.0;

pub fn install(window: &WebviewWindow) {
    align(window);
    let window = window.clone();
    window.clone().on_window_event(move |event| {
        if matches!(
            event,
            WindowEvent::Resized(_)
                | WindowEvent::ScaleFactorChanged { .. }
                | WindowEvent::Focused(_)
        ) {
            align(&window);
        }
    });
}

fn align(window: &WebviewWindow) {
    let Ok(ptr) = window.ns_window() else {
        return;
    };
    if ptr.is_null() {
        return;
    }
    unsafe { position_traffic_lights(ptr, TRAFFIC_LIGHT_X, HEADER_HEIGHT) };
}

unsafe fn position_traffic_lights(ns_window_ptr: *mut std::ffi::c_void, x: f64, header_height: f64) {
    let ns_window = &*ns_window_ptr.cast::<NSWindow>();
    let Some(close) = ns_window.standardWindowButton(NSWindowButton::NSWindowCloseButton) else {
        return;
    };
    let Some(miniaturize) =
        ns_window.standardWindowButton(NSWindowButton::NSWindowMiniaturizeButton)
    else {
        return;
    };
    let Some(zoom) = ns_window.standardWindowButton(NSWindowButton::NSWindowZoomButton) else {
        return;
    };
    let Some(button_superview) = close.superview() else {
        return;
    };
    let Some(title_bar) = button_superview.superview() else {
        return;
    };

    let close_frame = close.frame();
    let button_height = close_frame.size.height;
    let space = miniaturize.frame().origin.x - close_frame.origin.x;

    let mut title_bar_frame = title_bar.frame();
    title_bar_frame.size.height = header_height;
    title_bar_frame.origin.y = ns_window.frame().size.height - header_height;
    title_bar.setFrame(title_bar_frame);

    // NSView origin is bottom-left; center the 12pt lights in the 52px header.
    let origin_y = (header_height - button_height) / 2.0;
    for (index, button) in [&close, &miniaturize, &zoom].into_iter().enumerate() {
        let mut rect = button.frame();
        rect.origin.x = x + (index as f64 * space);
        rect.origin.y = origin_y;
        button.setFrameOrigin(rect.origin);
    }
}
