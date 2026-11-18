import { useImperativeHandle, useMemo, useRef, type Ref } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { EditorSelection, EditorState, Prec } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { syntaxHighlighting } from '@codemirror/language';
import { sqlHighlightStyle } from '../../lib/sqlSyntaxTheme';
import { BASIC_SETUP_WITHOUT_KEYMAPS, EDITOR_KEYMAP } from '../../lib/editorKeymap';
import { sqlEditorTheme } from '../SqlEditor/editorTheme';

export interface ShellInputHandle {
  focus(): void;
  /** Replaces the text and puts the caret at `caret`, then focuses the input. */
  setText(text: string, caret: number): void;
}

interface ShellInputProps {
  ref?: Ref<ShellInputHandle>;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder: string;
  'aria-label': string;
  className?: string;
}

const NEWLINES = /\s*\r?\n\s*/g;

// Pasted multi-line documents are folded onto one line, with the caret kept on the same character.
const singleLine = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged || tr.newDoc.lines === 1) return tr;
  const head = tr.newSelection.main.head;
  const before = tr.newDoc.sliceString(0, head).replace(NEWLINES, ' ');
  const text = before + tr.newDoc.sliceString(head).replace(NEWLINES, ' ');
  return [
    tr,
    {
      changes: { from: 0, to: tr.newDoc.length, insert: text },
      selection: EditorSelection.cursor(before.length),
      sequential: true,
    },
  ];
});

const singleLineTheme = EditorView.theme({
  '&': { height: 'auto' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { overflow: 'hidden', lineHeight: '20px' },
  '.cm-content': { padding: '4px 0' },
  '.cm-line': { padding: '0 8px' },
  '.cm-placeholder': { color: 'var(--muted-foreground)' },
});

/** One-line shell-syntax input (`{ age: { $gt: 30 } }`) where Enter applies instead of breaking the line. */
export function ShellInput({
  ref,
  value,
  onChange,
  onSubmit,
  placeholder,
  'aria-label': ariaLabel,
  className,
}: ShellInputProps) {
  const viewRef = useRef<EditorView | null>(null);
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;

  useImperativeHandle(
    ref,
    () => ({
      focus: () => viewRef.current?.focus(),
      setText: (text, caret) => {
        const view = viewRef.current;
        if (!view) return;
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: text },
          selection: EditorSelection.cursor(Math.min(caret, text.length)),
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
      sqlEditorTheme,
      singleLineTheme,
      singleLine,
      EditorView.contentAttributes.of({ 'aria-label': ariaLabel }),
      Prec.highest(
        keymap.of([
          {
            key: 'Enter',
            run: () => {
              onSubmitRef.current();
              return true;
            },
          },
          { key: 'Shift-Enter', run: () => true },
        ]),
      ),
      keymap.of(EDITOR_KEYMAP),
    ],
    [ariaLabel],
  );

  return (
    <CodeMirror
      value={value}
      theme="none"
      indentWithTab={false}
      placeholder={placeholder}
      basicSetup={{
        lineNumbers: false,
        foldGutter: false,
        highlightActiveLine: false,
        highlightActiveLineGutter: false,
        autocompletion: false,
        ...BASIC_SETUP_WITHOUT_KEYMAPS,
      }}
      extensions={extensions}
      onChange={onChange}
      onCreateEditor={(view) => {
        viewRef.current = view;
      }}
      className={`min-w-0 bg-background border border-border rounded-lg text-xs focus-within:border-primary transition-colors ${className ?? ''}`}
    />
  );
}
