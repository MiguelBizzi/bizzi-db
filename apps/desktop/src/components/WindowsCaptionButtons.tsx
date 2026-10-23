import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { captionButtons } from "../lib/windowChrome";
import { CAPTION_GLYPHS, runCaptionAction } from "./captionGlyphs";

const IS_TAURI =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export function WindowsCaptionButtons() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!IS_TAURI) return;
    const win = getCurrentWindow();
    const sync = () => {
      void win
        .isMaximized()
        .then(setMaximized)
        .catch(() => {});
    };
    sync();
    const unlisten = win.onResized(sync);
    return () => {
      void unlisten.then((off) => off()).catch(() => {});
    };
  }, []);

  return (
    <div data-no-drag className="flex h-full items-stretch self-stretch">
      {captionButtons(maximized).map(({ action, label }) => (
        <button
          key={action}
          type="button"
          aria-label={label}
          title={label}
          onClick={() => {
            void runCaptionAction(action, getCurrentWindow()).catch((error) => {
              console.error(`Window control "${action}" failed`, error);
            });
          }}
          className={`flex h-full w-[46px] items-center justify-center text-foreground outline-none transition-colors ${
            action === "close"
              ? "hover:bg-[#c42b1c] hover:text-white"
              : "hover:bg-foreground/10"
          }`}
        >
          <svg
            viewBox="0 0 10 10"
            aria-hidden="true"
            className="h-[10px] w-[10px]"
            fill="none"
            stroke="currentColor"
            strokeWidth={1}
          >
            {CAPTION_GLYPHS[action]}
          </svg>
        </button>
      ))}
    </div>
  );
}
