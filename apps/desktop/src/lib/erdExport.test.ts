import { describe, expect, test } from 'bun:test';
import { erdExportFileName } from './erdExport';

describe('erdExportFileName', () => {
  test('sanitizes the database name and uses a png extension', () => {
    expect(erdExportFileName('My App / Prod')).toBe('My_App_Prod_erd.png');
    expect(erdExportFileName('')).toBe('schema_erd.png');
  });
});
