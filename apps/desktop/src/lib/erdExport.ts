import { toPng } from 'html-to-image';

export function erdExportFileName(databaseName: string): string {
  const cleaned = databaseName.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '');
  return `${cleaned || 'schema'}_erd.png`;
}

export function downloadDataUrl(dataUrl: string, fileName: string): void {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = fileName;
  link.click();
}

export async function snapshotErdPng(element: HTMLElement): Promise<string> {
  const bg = getComputedStyle(element).backgroundColor;
  return toPng(element, {
    pixelRatio: 2,
    cacheBust: true,
    backgroundColor: bg && bg !== 'rgba(0, 0, 0, 0)' ? bg : undefined,
  });
}
