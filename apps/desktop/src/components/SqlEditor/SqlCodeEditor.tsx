import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { sql, PostgreSQL } from '@codemirror/lang-sql';
import { autocompletion, type CompletionContext } from '@codemirror/autocomplete';
import { linter, lintGutter } from '@codemirror/lint';
import { keymap, EditorView } from '@codemirror/view';
import { Prec } from '@codemirror/state';
import { syntaxHighlighting } from '@codemirror/language';
import { sqlCompletions, type SqlSchemaTable } from '../../lib/sqlComplete';
import { sqlDiagnostics } from '../../lib/sqlDiagnostics';
import { sqlHighlightStyle } from '../../lib/sqlSyntaxTheme';
import { BASIC_SETUP_WITHOUT_KEYMAPS, EDITOR_KEYMAP, editorShortcuts } from '../../lib/editorKeymap';
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
  /** Fires when the editor gains or loses a non-blank selection. */
  onSelectionChange?: (hasSelection: boolean) => void;
  /** The editor view once it exists, and `null` when it is destroyed. */
  onViewReady?: (view: EditorView | null) => void;
  /** Cmd/Ctrl+Enter (`'auto'`) and Cmd/Ctrl+Shift+Enter (`'all'`) pressed in the editor. */
  onRunKey?: (mode: RunMode) => void;
}

export const SqlCodeEditor = forwardRef<SqlCodeEditorHandle, SqlCodeEditorProps>(
  function SqlCodeEditor({ value, tables, onChange, onSelectionChange, onViewReady, onRunKey }, ref) {
    const viewRef = useRef<EditorView | null>(null);
    const onSelectionChangeRef = useRef(onSelectionChange);
    const onViewReadyRef = useRef(onViewReady);
    const onRunKeyRef = useRef(onRunKey);
    const hasSelectionRef = useRef(false);
    const tablesRef = useRef(tables);
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
        // otherwise pre-empt the menu (e.g. Mod-Alt-\ indentSelection vs Split Pane Right).
        keymap.of(EDITOR_KEYMAP),
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
