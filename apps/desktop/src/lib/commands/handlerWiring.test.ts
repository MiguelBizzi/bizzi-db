import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { COMMANDS } from './registry';

// Menu items whose handlers live in components rather than App.tsx.
// A command that appears here but is never registered would be a dead menu
// item, so every registry id must be keyed in at least one of these files.
const SRC = join(import.meta.dir, '..', '..');
const HANDLER_FILES = [
  'App.tsx',
  'components/SqlEditor/SqlEditorTab.tsx',
  'components/TableView/TableDataGrid.tsx',
].map((file) => readFileSync(join(SRC, file), 'utf8'));

const isWired = (id: string) =>
  HANDLER_FILES.some(
    (source) => source.includes(`'${id}'`) || source.includes(`"${id}"`)
  );

describe('menu command handler wiring', () => {
  const tabCommands = COMMANDS.filter((c) => /^view\.tab\.\d$/.test(c.id));
  const literal = COMMANDS.filter((c) => !/^view\.tab\.\d$/.test(c.id));

  test('every registry command is keyed as a handler somewhere', () => {
    const dead = literal.filter((c) => !isWired(c.id)).map((c) => c.id);
    expect(dead).toEqual([]);
  });

  test('the generated Go to Tab commands have a handler generator', () => {
    expect(tabCommands).toHaveLength(9);
    const generated = HANDLER_FILES[0].includes('view.tab.${');
    expect(generated || tabCommands.every((c) => isWired(c.id))).toBe(true);
  });
});
