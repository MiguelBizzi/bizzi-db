import { describe, expect, test } from 'bun:test';
import { dataUrlToBytes, erdExportFileName } from './erdExport';

describe('erdExportFileName', () => {
  test('sanitizes the database name and uses a png extension', () => {
    expect(erdExportFileName('My App / Prod')).toBe('My_App_Prod_erd.png');
    expect(erdExportFileName('')).toBe('schema_erd.png');
  });
});

describe('dataUrlToBytes', () => {
  test('decodes a base64 data url', () => {
    const bytes = dataUrlToBytes('data:image/png;base64,iVBORw0KGgo=');
    expect(Array.from(bytes)).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });

  test('rejects anything that is not a base64 data url', () => {
    expect(() => dataUrlToBytes('https://x/y.png')).toThrow();
    expect(() => dataUrlToBytes('data:image/png,abc')).toThrow();
  });
});
