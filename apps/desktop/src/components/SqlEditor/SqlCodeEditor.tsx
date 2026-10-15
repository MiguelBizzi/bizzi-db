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
import { sqlCompletions, type SqlSchemaTable } from '../../lib/sqlComplete';
import { sqlDiagnostics } from '../../lib/sqlDiagnostics';
import { sqlHighlightStyle } from '../../lib/sqlSyntaxTheme';
import type { RunMode, RunSelection } from '../../lib/runTarget';

export interface SqlCodeEditorHandle {
  insertAtCursor: (text: string) => void;
  /** The current selection and script, as a run would see them. */
  runRequest: (mode: RunMode) => SqlRunRequest | null;
}

export interface SqlRunRequest {
  mode: RunMode;
  doc: string;
  selection: RunSelection;
}

function runRequest(view: EditorView, mode: RunMode): SqlRunRequest {
  const { from, to } = view.state.selection.main;
  return { mode, doc: view.state.doc.toString(), selection: { from, to } };
}

interface SqlCodeEditorProps {
  value: string;
  tables: SqlSchemaTable[];
  onChange: (value: string) => void;
  onRun: (request: SqlRunRequest) => void;
  /** Fires when the editor gains or loses a non-blank selection. */
  onSelectionChange?: (hasSelection: boolean) => void;
}

export const SqlCodeEditor = forwardRef<SqlCodeEditorHandle, SqlCodeEditorProps>(
  function SqlCodeEditor({ value, tables, onChange, onRun, onSelectionChange }, ref) {
    const viewRef = useRef<EditorView | null>(null);
    const onRunRef = useRef(onRun);
    const onSelectionChangeRef = useRef(onSelectionChange);
    const tablesRef = useRef(tables);
    onRunRef.current = onRun;
    onSelectionChangeRef.current = onSelectionChange;
    tablesRef.current = tables;

    useImperativeHandle(ref, () => ({
      runRequest: (mode: RunMode) =>
        viewRef.current ? runRequest(viewRef.current, mode) : null,
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
        syntaxHighlighting(sqlHighlightStyle),
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
                // sqlCompletions already filters and ranks; CodeMirror's fuzzy
                // matcher would also reject quoted identifiers like "shop"."us.
                filter: false,
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
              run: (view) => {
                onRunRef.current(runRequest(view, 'auto'));
                return true;
              },
            },
            {
              key: 'Mod-Shift-Enter',
              run: (view) => {
                onRunRef.current(runRequest(view, 'all'));
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
            '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
              backgroundColor: 'color-mix(in oklch, var(--primary) 28%, transparent)',
            },
            '.cm-tooltip': {
              backgroundColor: 'var(--popover)',
              color: 'var(--popover-foreground)',
              border: '1px solid var(--border)',
              borderRadius: 'calc(var(--radius) - 4px)',
              boxShadow: 'var(--shadow-lg)',
              overflow: 'hidden',
            },
            '.cm-tooltip.cm-tooltip-autocomplete > ul': {
              fontFamily: 'JetBrains Mono, ui-monospace, monospace',
              maxHeight: '15em',
            },
            '.cm-tooltip-autocomplete ul li[aria-selected]': {
              backgroundColor: 'var(--accent)',
              color: 'var(--accent-foreground)',
            },
            '.cm-completionIcon': { display: 'none' },
            '.cm-completionDetail': {
              color: 'var(--muted-foreground)',
              fontStyle: 'normal',
              marginLeft: '1em',
            },
            '.cm-completionMatchedText': { textDecoration: 'none', color: 'var(--primary)' },
          }
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
        onUpdate={(update) => {
          if (!update.selectionSet && !update.docChanged) return;
          const { from, to } = update.state.selection.main;
          onSelectionChangeRef.current?.(update.state.sliceDoc(from, to).trim() !== '');
        }}
        className="h-full w-full text-xs bg-background"
      />
    );
  }
);
