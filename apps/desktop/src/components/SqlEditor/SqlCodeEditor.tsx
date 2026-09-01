import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { sql, PostgreSQL } from '@codemirror/lang-sql';
import {
  autocompletion,
  startCompletion,
  type CompletionContext,
} from '@codemirror/autocomplete';
import { linter, lintGutter } from '@codemirror/lint';
import { keymap, EditorView } from '@codemirror/view';
import { Prec } from '@codemirror/state';
import { syntaxHighlighting } from '@codemirror/language';
import { oneDarkHighlightStyle } from '@codemirror/theme-one-dark';
import { sqlCompletions, type SqlSchemaTable } from '../../lib/sqlComplete';
import { sqlDiagnostics } from '../../lib/sqlDiagnostics';

export interface SqlCodeEditorHandle {
  insertAtCursor: (text: string) => void;
}

interface SqlCodeEditorProps {
  value: string;
  tables: SqlSchemaTable[];
  onChange: (value: string) => void;
  onRun: () => void;
}

export const SqlCodeEditor = forwardRef<SqlCodeEditorHandle, SqlCodeEditorProps>(
  function SqlCodeEditor({ value, tables, onChange, onRun }, ref) {
    const viewRef = useRef<EditorView | null>(null);
    const onRunRef = useRef(onRun);
    const tablesRef = useRef(tables);
    onRunRef.current = onRun;
    tablesRef.current = tables;

    useImperativeHandle(ref, () => ({
      insertAtCursor: (text: string) => {
        const view = viewRef.current;
        if (!view) {
          onChange(value + text);
          return;
        }
        view.dispatch(view.state.replaceSelection(text));
        view.focus();
      },
    }));

    const extensions = useMemo(
      () => [
        sql({ dialect: PostgreSQL }),
        syntaxHighlighting(oneDarkHighlightStyle, { fallback: true }),
        lintGutter(),
        linter((view) =>
          sqlDiagnostics(view.state.doc.toString()).map((diag) => ({
            from: diag.from,
            to: Math.min(diag.to, view.state.doc.length),
            severity: diag.severity,
            message: diag.message,
          }))
        ),
        autocompletion({
          activateOnTyping: true,
          override: [
            (context: CompletionContext) => {
              const items = sqlCompletions(
                context.state.doc.toString(),
                context.pos,
                tablesRef.current
              );
              const word = context.matchBefore(/[\w."]*$/);
              if (!word && !context.explicit) return null;
              if (items.length === 0 && !context.explicit) return null;
              return {
                from: word?.from ?? context.pos,
                options: items.map((item) => ({
                  label: item.label,
                  apply: item.apply,
                  type: item.type,
                  detail: item.detail,
                  boost: item.boost,
                })),
              };
            },
          ],
        }),
        Prec.highest(
          keymap.of([
            {
              key: 'Mod-Enter',
              run: () => {
                onRunRef.current();
                return true;
              },
            },
            {
              key: 'Ctrl-Space',
              run: startCompletion,
            },
          ])
        ),
        EditorView.theme(
          {
            '&': {
              height: '100%',
              backgroundColor: 'transparent',
              color: 'var(--foreground)',
            },
            '.cm-content': { caretColor: 'var(--foreground)' },
            '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--foreground)' },
            '.cm-scroller': {
              overflow: 'auto',
              fontFamily: 'JetBrains Mono, ui-monospace, monospace',
              backgroundColor: 'transparent',
            },
            '.cm-gutters': {
              backgroundColor: 'color-mix(in oklch, var(--muted) 40%, transparent)',
              color: 'var(--muted-foreground)',
              border: 'none',
            },
            '.cm-activeLineGutter': { backgroundColor: 'transparent' },
            '.cm-activeLine': { backgroundColor: 'transparent' },
          },
          { dark: true }
        ),
      ],
      []
    );

    return (
      <CodeMirror
        value={value}
        height="100%"
        theme="none"
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          autocompletion: false,
        }}
        extensions={extensions}
        onChange={onChange}
        onCreateEditor={(view) => {
          viewRef.current = view;
        }}
        className="h-full w-full text-xs bg-background"
      />
    );
  }
);
