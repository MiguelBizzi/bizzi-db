import { useEffect, useImperativeHandle, useMemo, useRef, type Ref } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { autocompletion, type Completion } from '@codemirror/autocomplete';
import { EditorSelection, Prec } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { syntaxHighlighting } from '@codemirror/language';
import { sqlHighlightStyle } from '../../lib/sqlSyntaxTheme';
import { BASIC_SETUP_WITHOUT_KEYMAPS, EDITOR_KEYMAP, editorShortcuts } from '../../lib/editorKeymap';
import type { ShellCompletion, ShellCompletionType } from '../../lib/document/shellComplete';
import type { RunMode, RunSelection } from '../../lib/runTarget';
import { sqlEditorTheme } from '../SqlEditor/editorTheme';

export interface DocumentRunRequest {
  mode: RunMode;
  doc: string;
  selection: RunSelection;
}

export interface DocumentCodeEditorHandle {
  runRequest: (mode: RunMode) => DocumentRunRequest | null;
  /** Puts the caret at `offset` and focuses the editor. */
  jumpTo: (offset: number) => void;
}

interface DocumentCodeEditorProps {
  ref?: Ref<DocumentCodeEditorHandle>;
  value: string;
  onChange: (value: string) => void;
  complete: (text: string, caret: number) => Promise<{ from: number; options: ShellCompletion[] } | null>;
  /** Cmd/Ctrl+Enter (`'auto'`) and Cmd/Ctrl+Shift+Enter (`'all'`) pressed in the editor. */
  onRunKey: (mode: RunMode) => void;
  onViewReady: (view: EditorView | null) => void;
  onSelectionChange: (hasSelection: boolean) => void;
}

const COMPLETION_TYPE: Record<ShellCompletionType, string> = {
  collection: 'class',
  method: 'method',
  operator: 'keyword',
  field: 'property',
  keyword: 'keyword',
};

export function DocumentCodeEditor({
  ref,
  value,
  onChange,
  complete,
  onRunKey,
  onViewReady,
  onSelectionChange,
}: DocumentCodeEditorProps) {
  const viewRef = useRef<EditorView | null>(null);
  const hasSelectionRef = useRef(false);
  const completeRef = useRef(complete);
  completeRef.current = complete;
  const onRunKeyRef = useRef(onRunKey);
  onRunKeyRef.current = onRunKey;
  const onViewReadyRef = useRef(onViewReady);
  onViewReadyRef.current = onViewReady;
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;

  useEffect(
    () => () => {
      viewRef.current = null;
      onViewReadyRef.current(null);
    },
    [],
  );

  useImperativeHandle(
    ref,
    () => ({
      runRequest: (mode) => {
        const view = viewRef.current;
        if (!view) return null;
        const { from, to } = view.state.selection.main;
        return { mode, doc: view.state.doc.toString(), selection: { from, to } };
      },
      jumpTo: (offset) => {
        const view = viewRef.current;
        if (!view) return;
        view.dispatch({
          selection: EditorSelection.cursor(Math.min(offset, view.state.doc.length)),
          scrollIntoView: true,
        });
        view.focus();
      },
    }),
    [],
  );

  const extensions = useMemo(
    () => [
      javascript(),
      syntaxHighlighting(sqlHighlightStyle),
      autocompletion({
        activateOnTyping: true,
        override: [
          async (context) => {
            const found = await completeRef.current(context.state.doc.toString(), context.pos);
            if (!found) return null;
            if (found.from === context.pos && !context.explicit && !/[.$({,]\s*$/.test(context.state.sliceDoc(0, context.pos))) {
              return null;
            }
            return {
              from: found.from,
              // The completions are already filtered; CodeMirror's fuzzy matcher would also
              // reject the quoted form of a field path.
              filter: false,
              options: found.options.map(
                (option): Completion => ({
                  label: option.label,
                  apply: option.apply,
                  type: COMPLETION_TYPE[option.type],
                }),
              ),
            };
          },
        ],
      }),
      // The page sees Mod-Enter before the native menu, so the editor runs the statement itself and
      // consumes the key; the menu's Run item then does not also fire.
      Prec.highest(
        keymap.of(
          editorShortcuts((mode) => {
            onRunKeyRef.current(mode);
            return true;
          }),
        ),
      ),
      keymap.of(EDITOR_KEYMAP),
      sqlEditorTheme,
    ],
    [],
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
        onViewReadyRef.current(view);
      }}
      onUpdate={(update) => {
        if (!update.selectionSet && !update.docChanged) return;
        const { from, to } = update.state.selection.main;
        const has = update.state.sliceDoc(from, to).trim() !== '';
        if (has === hasSelectionRef.current) return;
        hasSelectionRef.current = has;
        onSelectionChangeRef.current(has);
      }}
      className="h-full w-full text-xs bg-background"
    />
  );
}
