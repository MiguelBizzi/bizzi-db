import { useEffect, useState, type ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { captionButtons, type CaptionAction } from "../lib/windowChrome";

const IS_TAURI =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const GLYPHS: Record<CaptionAction, ReactNode> = {
  minimize: <path d="M0 5h10" />,
  maximize: <rect x="0.5" y="0.5" width="9" height="9" />,
  restore: (
    <>
      <rect x="0.5" y="2.5" width="7" height="7" />
      <path d="M2.5 2.5v-2h7v7h-2" />
    </>
  ),
  close: <path d="M0 0l10 10M10 0L0 10" />,
};

function runAction(action: CaptionAction) {
  const win = getCurrentWindow();
  if (action === "minimize") return win.minimize();
  if (action === "close") return win.close();
  return win.toggleMaximize();
}

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
            void runAction(action).catch((error) => {
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
            {GLYPHS[action]}
          </svg>
        </button>
      ))}
    </div>
  );
}
