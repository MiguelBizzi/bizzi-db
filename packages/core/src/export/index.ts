import { invoke } from '@tauri-apps/api/core';

export interface ExportFile {
  fileName: string;
  filterLabel: string;
  extension: string;
  content: string;
}

/** Resolves to the saved path, or `null` when the user cancels the save dialog. */
export function exportSaveFile(file: ExportFile): Promise<string | null> {
  return invoke('export_save_file', { ...file });
}

export function exportReveal(path: string): Promise<void> {
  return invoke('export_reveal', { path });
}

export function exportSaveBytes(file: Omit<ExportFile, 'content'>, bytes: Uint8Array): Promise<string | null> {
  return invoke('export_save_bytes', bytes, {
    headers: {
      'x-file-name': encodeURIComponent(file.fileName),
      'x-filter-label': encodeURIComponent(file.filterLabel),
      'x-extension': encodeURIComponent(file.extension),
    },
  });
}
