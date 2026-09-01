import { describe, expect, test } from 'bun:test';
import { sqlDiagnostics } from './sqlDiagnostics';

describe('sqlDiagnostics', () => {
  test('flags unclosed quotes and dollar quotes as errors', () => {
    const quotes = sqlDiagnostics("SELECT 'oops");
    expect(quotes.some((d) => d.severity === 'error' && d.message.includes('quote'))).toBe(
      true
    );
    const dollars = sqlDiagnostics('SELECT $$oops');
    expect(dollars.some((d) => d.severity === 'error' && d.message.includes('dollar'))).toBe(
      true
    );
  });

  test('flags unbalanced parentheses as errors', () => {
    const diags = sqlDiagnostics('SELECT (1');
    expect(diags.some((d) => d.severity === 'error' && d.message.includes('parenthes'))).toBe(
      true
    );
  });

  test('does not warn on SELECT *', () => {
    expect(sqlDiagnostics('SELECT * FROM "analytics"."events";')).toEqual([]);
    expect(sqlDiagnostics('SELECT * FROM t')).toEqual([]);
  });

  test('warns on DML without WHERE', () => {
    expect(
      sqlDiagnostics('DELETE FROM t').some(
        (d) => d.severity === 'warning' && d.message.includes('WHERE')
      )
    ).toBe(true);
    expect(
      sqlDiagnostics('UPDATE t SET a = 1').some(
        (d) => d.severity === 'warning' && d.message.includes('WHERE')
      )
    ).toBe(true);
  });

  test('does not warn when WHERE is present', () => {
    expect(sqlDiagnostics('DELETE FROM t WHERE id = 1')).toEqual([]);
    expect(sqlDiagnostics('UPDATE t SET a = 1 WHERE id = 1')).toEqual([]);
  });
});
