import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { dialectModule } from '@db/database';
import { sql, MySQL, PostgreSQL } from '@codemirror/lang-sql';
import { autocompletion, type CompletionContext } from '@codemirror/autocomplete';
import { linter, lintGutter } from '@codemirror/lint';
import { keymap, EditorView } from '@codemirror/view';
import { Prec } from '@codemirror/state';
import { syntaxHighlighting } from '@codemirror/language';
import { sqlCompletions, type SqlSchemaTable } from '../../lib/sqlComplete';
import { sqlDiagnostics } from '../../lib/sqlDiagnostics';
import { sqlHighlightStyle } from '../../lib/sqlSyntaxTheme';
import { sqlEditorTheme } from './editorTheme';
import { BASIC_SETUP_WITHOUT_KEYMAPS, EDITOR_KEYMAP, editorShortcuts } from '../../lib/editorKeymap';
import type { DatabaseDialect } from '../../types';
import type { RunMode, RunSelection } from '../../lib/runTarget';

const CODEMIRROR_DIALECT = { PostgreSQL, MySQL } as const;

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
  dialect?: DatabaseDialect;
  onChange: (value: string) => void;
  /** Fires when the editor gains or loses a non-blank selection. */
  onSelectionChange?: (hasSelection: boolean) => void;
  /** The editor view once it exists, and `null` when it is destroyed. */
  onViewReady?: (view: EditorView | null) => void;
  /** Cmd/Ctrl+Enter (`'auto'`) and Cmd/Ctrl+Shift+Enter (`'all'`) pressed in the editor. */
  onRunKey?: (mode: RunMode) => void;
}

export const SqlCodeEditor = forwardRef<SqlCodeEditorHandle, SqlCodeEditorProps>(
  function SqlCodeEditor(
    { value, tables, dialect = 'PostgreSQL', onChange, onSelectionChange, onViewReady, onRunKey },
    ref,
  ) {
    const viewRef = useRef<EditorView | null>(null);
    const onSelectionChangeRef = useRef(onSelectionChange);
    const onViewReadyRef = useRef(onViewReady);
    const onRunKeyRef = useRef(onRunKey);
    const hasSelectionRef = useRef(false);
    const tablesRef = useRef(tables);
    const dialectRef = useRef(dialect);
    dialectRef.current = dialect;
    const meta = dialectModule(dialect);
    onSelectionChangeRef.current = onSelectionChange;
    onViewReadyRef.current = onViewReady;
    onRunKeyRef.current = onRunKey;
    tablesRef.current = tables;

    useEffect(
      () => () => {
        viewRef.current = null;
        onViewReadyRef.current?.(null);
      },
      []
    );

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
        sql({ dialect: CODEMIRROR_DIALECT[meta?.editorDialect ?? 'PostgreSQL'] }),
        syntaxHighlighting(sqlHighlightStyle),
        lintGutter(),
        linter((view) =>
          sqlDiagnostics(view.state.doc.toString(), {
            dollarQuotes: meta?.capabilities.dollarQuotes,
            hashComments: meta?.capabilities.hashComments,
          }).map((diag) => ({
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
                tablesRef.current,
                dialectRef.current,
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
        // Ctrl-Space, plus Mod-Enter / Mod-Shift-Enter, which run the query rather than
        // defaultKeymap's insertBlankLine. The page sees these keys before the native menu, so the
        // editor handles them itself (through the same path as Query > Run) and preventDefaults
        // them: the menu item does not also fire, and the query runs exactly once.
        Prec.highest(
          keymap.of(
            editorShortcuts((mode) => {
              const run = onRunKeyRef.current;
              if (!run) return false;
              run(mode);
              return true;
            })
          )
        ),
        // basicSetup's keymaps (turned off below) minus bindings on menu accelerators, which would
        keymap.of(EDITOR_KEYMAP),
        sqlEditorTheme,
      ],
      [dialect, meta]
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
          ...BASIC_SETUP_WITHOUT_KEYMAPS,
        }}
        extensions={extensions}
        onChange={onChange}
        onCreateEditor={(view) => {
          viewRef.current = view;
          onViewReadyRef.current?.(view);
        }}
        onUpdate={(update) => {
          if (!update.selectionSet && !update.docChanged) return;
          const { from, to } = update.state.selection.main;
          const has = update.state.sliceDoc(from, to).trim() !== '';
          if (has === hasSelectionRef.current) return;
          hasSelectionRef.current = has;
          onSelectionChangeRef.current?.(has);
        }}
        className="h-full w-full text-xs bg-background"
      />
    );
  }
);
