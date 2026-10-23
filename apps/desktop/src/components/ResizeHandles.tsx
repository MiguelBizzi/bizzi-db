import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { currentPlatform } from "../lib/commands/shortcutLabel";
import { resizeEdges } from "../lib/windowChrome";

const IS_TAURI =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
const IS_LINUX = currentPlatform() === "linux";

export function ResizeHandles() {
  const [state, setState] = useState({ maximized: false, fullscreen: false });

  useEffect(() => {
    if (!IS_TAURI || !IS_LINUX) return;
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

  if (!IS_LINUX) return null;

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
