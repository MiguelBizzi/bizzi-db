import type { ReactNode } from "react";
import type { CaptionAction } from "../lib/windowChrome";

export const CAPTION_GLYPHS: Record<CaptionAction, ReactNode> = {
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

export function runCaptionAction(action: CaptionAction, win: import("@tauri-apps/api/window").Window) {
  if (action === "minimize") return win.minimize();
  if (action === "close") return win.close();
  return win.toggleMaximize();
}
