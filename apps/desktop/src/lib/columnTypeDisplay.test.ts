import { describe, expect, test } from 'bun:test';
import { shortColumnType } from './columnTypeDisplay';

describe('shortColumnType', () => {
  test('shortens timestamp with time zone, keeping precision', () => {
    expect(shortColumnType('timestamp with time zone')).toBe('timestamptz');
    expect(shortColumnType('timestamp(3) with time zone')).toBe('timestamptz(3)');
    expect(shortColumnType('timestamp(0) with time zone')).toBe('timestamptz(0)');
  });

  test('drops the verbose without-time-zone suffix', () => {
    expect(shortColumnType('timestamp without time zone')).toBe('timestamp');
    expect(shortColumnType('timestamp(6) without time zone')).toBe('timestamp(6)');
    expect(shortColumnType('time without time zone')).toBe('time');
    expect(shortColumnType('time(3) without time zone')).toBe('time(3)');
  });

  test('shortens time with time zone', () => {
    expect(shortColumnType('time with time zone')).toBe('timetz');
    expect(shortColumnType('time(3) with time zone')).toBe('timetz(3)');
  });

  test('preserves array markers', () => {
    expect(shortColumnType('timestamp with time zone[]')).toBe('timestamptz[]');
    expect(shortColumnType('timestamp(3) with time zone[]')).toBe('timestamptz(3)[]');
  });

  test('leaves already-short types unchanged', () => {
    expect(shortColumnType('timestamptz')).toBe('timestamptz');
    expect(shortColumnType('timestamp')).toBe('timestamp');
    expect(shortColumnType('varchar(255)')).toBe('varchar(255)');
    expect(shortColumnType('text')).toBe('text');
  });
});
