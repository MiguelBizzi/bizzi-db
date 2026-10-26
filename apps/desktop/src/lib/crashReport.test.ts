import { describe, expect, test } from 'bun:test';
import { crashDetails, crashMessage } from './crashReport';

describe('crashMessage', () => {
  test('names the error type', () => {
    expect(crashMessage(new TypeError("undefined is not an object (evaluating 'a.b')"))).toBe(
      "TypeError: undefined is not an object (evaluating 'a.b')"
    );
  });

  test('handles thrown non-errors', () => {
    expect(crashMessage('boom')).toBe('boom');
    expect(crashMessage({ code: 42 })).toBe('{"code":42}');
    expect(crashMessage(undefined)).toBe('Unknown error');
    expect(crashMessage(null)).toBe('Unknown error');
  });

  test('survives values that cannot be serialized', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(crashMessage(cyclic)).toBe('[object Object]');
    expect(crashMessage(Symbol('s'))).toBe('Symbol(s)');
  });

  test('an error without a message still says what it is', () => {
    expect(crashMessage(new RangeError())).toBe('RangeError');
  });
});

describe('crashDetails', () => {
  test('includes message, stack and component stack', () => {
    const error = new Error('bad cell');
    error.stack = 'Error: bad cell\n    at renderCell (grid.tsx:10)';
    const details = crashDetails(error, '\n    in Cell\n    in TableDataGrid');
    expect(details).toContain('Error: bad cell');
    expect(details).toContain('at renderCell (grid.tsx:10)');
    expect(details).toContain('in TableDataGrid');
  });

  test('does not repeat the message when the stack already starts with it', () => {
    const error = new Error('bad cell');
    error.stack = 'Error: bad cell\n    at x';
    expect(crashDetails(error).match(/bad cell/g)).toHaveLength(1);
  });

  test('works without a stack', () => {
    expect(crashDetails('boom')).toBe('boom');
  });
});
