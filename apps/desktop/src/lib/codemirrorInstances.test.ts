import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { EditorState } from '@codemirror/state';
import { sql, PostgreSQL } from '@codemirror/lang-sql';
import { autocompletion } from '@codemirror/autocomplete';
import { linter, lintGutter } from '@codemirror/lint';
import { keymap } from '@codemirror/view';
import { basicSetup } from '@uiw/react-codemirror';
import { highlightTree } from '@lezer/highlight';
import { sqlHighlightStyle } from './sqlSyntaxTheme';

// CodeMirror checks extensions, facets and highlight tags by object identity. A second copy of
// one of these packages makes the editor throw when it mounts (which blanked the whole app) or
// leaves the parser's tags unmatched by the app's highlight style (no syntax colours).
const SINGLETONS = [
  '@codemirror/state',
  '@codemirror/view',
  '@codemirror/language',
  '@lezer/common',
  '@lezer/highlight',
  '@lezer/lr',
];

describe('CodeMirror packages', () => {
  test('the lockfile installs one copy of each singleton', () => {
    const lock = readFileSync(path.resolve(import.meta.dir, '../../../../bun.lock'), 'utf8');
    // bun.lock keys a nested install as "<parent>/<package>", e.g. "@codemirror/lint/@codemirror/view".
    const nested = [...lock.matchAll(/^\s*"([^"]+\/(@(?:codemirror|lezer)\/[a-z-]+))": \["[^"]+@([\d.]+)"/gm)]
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

  test('the SQL parser and the app highlight style share tags', () => {
    const doc = "SELECT name FROM users WHERE id = 1 AND note = 'x';";
    const tree = sql({ dialect: PostgreSQL }).language.parser.parse(doc);
    const classes: string[] = [];
    highlightTree(tree, sqlHighlightStyle, (_from, _to, cls) => classes.push(cls));
    expect(classes.length).toBeGreaterThan(0);
  });
});
