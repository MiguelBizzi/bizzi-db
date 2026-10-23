import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { currentPlatform } from "../lib/commands/shortcutLabel";
import { resizeEdges, resizeHandlesEnabled } from "../lib/windowChrome";

const ENABLED = resizeHandlesEnabled(
  currentPlatform(),
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window,
);

export function ResizeHandles() {
  const [state, setState] = useState({ maximized: false, fullscreen: false });

  useEffect(() => {
    if (!ENABLED) return;
    const win = getCurrentWindow();
    const sync = () => {
      void Promise.all([win.isMaximized(), win.isFullscreen()])
        .then(([maximized, fullscreen]) => setState({ maximized, fullscreen }))
        .catch(() => {});
    };
    sync();
    const unlisten = win.onResized(sync);
    return () => {
      void unlisten.then((off) => off()).catch(() => {});
    };
  }, []);

  if (!ENABLED) return null;

  return (
    <>
      {resizeEdges(state).map(({ direction, cursor, className }) => (
        <div
          key={direction}
          data-no-drag
          className={className}
          style={{ cursor }}
          onMouseDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            void getCurrentWindow()
              .startResizeDragging(direction)
              .catch((error) => {
                console.error(`Resize "${direction}" failed`, error);
              });
          }}
        />
      ))}
    </>
  );
}
