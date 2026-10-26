import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { EditorState } from '@codemirror/state';
import { sql, PostgreSQL } from '@codemirror/lang-sql';
import { autocompletion } from '@codemirror/autocomplete';
import { linter, lintGutter } from '@codemirror/lint';
import { keymap } from '@codemirror/view';
import { basicSetup } from '@uiw/react-codemirror';

// CodeMirror checks extensions and facets by object identity. A second copy of one of these
// packages in the bundle makes the editor throw when it mounts, which blanked the whole app.
const SINGLETONS = ['@codemirror/state', '@codemirror/view', '@codemirror/language'];

describe('CodeMirror packages', () => {
  test('the lockfile installs one copy of each singleton', () => {
    const lock = readFileSync(path.resolve(import.meta.dir, '../../../../bun.lock'), 'utf8');
    // bun.lock keys a nested install as "<parent>/<package>", e.g. "@codemirror/lint/@codemirror/view".
    const nested = [...lock.matchAll(/^\s*"([^"]+\/(@codemirror\/[a-z-]+))": \["[^"]+@([\d.]+)"/gm)]
      .filter(([, , name]) => SINGLETONS.includes(name))
      .map(([, key, , version]) => `${key}@${version}`);
    expect(nested).toEqual([]);
  });

  test('the SQL editor extensions build a state', () => {
    expect(() =>
      EditorState.create({
        doc: 'SELECT 1;',
        extensions: [
          basicSetup(),
          sql({ dialect: PostgreSQL }),
          lintGutter(),
          linter(() => []),
          autocompletion(),
          keymap.of([]),
        ],
      })
    ).not.toThrow();
  });
});
