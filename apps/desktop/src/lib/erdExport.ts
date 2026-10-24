import { exportSaveBytes } from '@db/core';
import { toPng } from 'html-to-image';

export function erdExportFileName(databaseName: string): string {
  const cleaned = databaseName.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '');
  return `${cleaned || 'schema'}_erd.png`;
}

export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const match = dataUrl.match(/^data:[^;,]*;base64,(.*)$/s);
  if (!match) throw new Error('Expected a base64 data URL');
  const binary = atob(match[1]);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export function saveErdPng(dataUrl: string, fileName: string): Promise<string | null> {
  return exportSaveBytes(
    { fileName, filterLabel: 'PNG image', extension: 'png' },
    dataUrlToBytes(dataUrl)
  );
}

export async function snapshotErdPng(element: HTMLElement): Promise<string> {
  const bg = getComputedStyle(element).backgroundColor;
  return toPng(element, {
    pixelRatio: 2,
    cacheBust: true,
    backgroundColor: bg && bg !== 'rgba(0, 0, 0, 0)' ? bg : undefined,
  });
}
