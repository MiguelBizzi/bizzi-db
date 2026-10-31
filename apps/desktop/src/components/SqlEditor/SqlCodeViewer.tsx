import { useMemo } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { dialectModule } from '@db/database';
import { sql, MySQL, PostgreSQL } from '@codemirror/lang-sql';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { syntaxHighlighting } from '@codemirror/language';
import { sqlHighlightStyle } from '../../lib/sqlSyntaxTheme';
import { BASIC_SETUP_WITHOUT_KEYMAPS, EDITOR_KEYMAP } from '../../lib/editorKeymap';
import type { DatabaseDialect } from '../../types';
import { sqlEditorTheme } from './editorTheme';

const CODEMIRROR_DIALECT = { PostgreSQL, MySQL } as const;

interface SqlCodeViewerProps {
  value: string;
  dialect?: DatabaseDialect;
  /** Makes the code editable: plain editing, no autocomplete, lint or run keys. */
  onChange?: (value: string) => void;
  lineNumbers?: boolean;
  className?: string;
  'aria-label'?: string;
}

export function SqlCodeViewer({
  value,
  dialect = 'PostgreSQL',
  onChange,
  lineNumbers = true,
  className,
  'aria-label': ariaLabel,
}: SqlCodeViewerProps) {
  const editable = Boolean(onChange);
  const extensions = useMemo(
    () => [
      sql({
        dialect:
          CODEMIRROR_DIALECT[dialectModule(dialect)?.editorDialect ?? 'PostgreSQL'],
      }),
      syntaxHighlighting(sqlHighlightStyle),
      sqlEditorTheme,
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({ 'aria-label': ariaLabel ?? 'SQL' }),
      ...(editable
        ? [keymap.of(EDITOR_KEYMAP)]
        : [EditorState.readOnly.of(true), EditorView.editable.of(false)]),
    ],
    [editable, ariaLabel, dialect]
  );
  return (
    <CodeMirror
      value={value}
      theme="none"
      editable={editable}
      basicSetup={{
        lineNumbers,
        foldGutter: false,
        highlightActiveLine: false,
        highlightActiveLineGutter: false,
        autocompletion: false,
        ...BASIC_SETUP_WITHOUT_KEYMAPS,
      }}
      extensions={extensions}
      onChange={onChange}
      className={`text-xs ${className ?? ''}`}
    />
  );
}
