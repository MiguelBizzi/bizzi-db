import { useEffect, useState, type ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

const IS_APPLE_PLATFORM = /Mac|iPhone|iPad|iPod/i.test(
  typeof navigator === "undefined" ? "" : navigator.userAgent,
);
const IS_TAURI =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

type ControlAction = "close" | "minimize" | "fullscreen";

const CONTROLS: {
  action: ControlAction;
  label: string;
  fill: string;
  border: string;
  glyph: ReactNode;
}[] = [
  {
    action: "close",
    label: "Close",
    fill: "bg-[#ff5f57]",
    border: "border-[#e0443e]",
    glyph: <path d="M3.5 3.5l5 5M8.5 3.5l-5 5" />,
  },
  {
    action: "minimize",
    label: "Minimize",
    fill: "bg-[#febc2e]",
    border: "border-[#dea123]",
    glyph: <path d="M3 6h6" />,
  },
  {
    action: "fullscreen",
    label: "Enter Full Screen",
    fill: "bg-[#28c840]",
    border: "border-[#1aab29]",
    glyph: (
      <path d="M3.5 5.5V3.5h2M3.5 3.5l2 2M8.5 6.5v2h-2M8.5 8.5l-2-2" />
    ),
  },
];

async function runControl(action: ControlAction, altKey: boolean) {
  const win = getCurrentWindow();
  if (action === "close") return win.close();
  if (action === "minimize") return win.minimize();
  // Option-click zooms, a plain click toggles full screen, as on other Mac apps.
  if (altKey) return win.toggleMaximize();
  return win.setFullscreen(!(await win.isFullscreen()));
}

/**
 * macOS traffic lights drawn in the webview. The native buttons are hidden in
 * `macos.rs`, so these are the only ones on screen. Flat fills and no gloss.
 */
export function WindowControls() {
  const [focused, setFocused] = useState(true);

  useEffect(() => {
    if (!IS_APPLE_PLATFORM || !IS_TAURI) return;
    const win = getCurrentWindow();
    const unlisten = win.onFocusChanged(({ payload }) => setFocused(payload));
    return () => {
      void unlisten.then((off) => off()).catch(() => {});
    };
  }, []);

  if (!IS_APPLE_PLATFORM) return null;

  return (
    <div
      data-no-drag
      className="group/controls absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-2"
    >
      {CONTROLS.map(({ action, label, fill, border, glyph }) => (
        <button
          key={action}
          type="button"
          aria-label={label}
          title={label}
          onClick={(event) => {
            void runControl(action, event.altKey).catch((error) => {
              console.error(`Window control "${action}" failed`, error);
            });
          }}
          className={`relative flex h-3 w-3 items-center justify-center rounded-full border-[0.5px] outline-none active:brightness-90 ${
            focused
              ? `${fill} ${border}`
              : "bg-[#d6d6d6] border-[#c4c4c4] dark:bg-[#4a4a4a] dark:border-[#3a3a3a]"
          }`}
        >
          {focused && (
            <svg
              viewBox="0 0 12 12"
              aria-hidden="true"
              className="h-3 w-3 opacity-0 transition-opacity group-hover/controls:opacity-100 text-black/60"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {glyph}
            </svg>
          )}
        </button>
      ))}
    </div>
  );
}
