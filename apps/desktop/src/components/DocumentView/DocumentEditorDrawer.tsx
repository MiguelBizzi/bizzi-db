import { useEffect, useMemo, useRef, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { Prec } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { syntaxHighlighting } from '@codemirror/language';
import { Check, FileJson, Loader2, RotateCcw, X } from 'lucide-react';
import { isConflictError } from '../../lib/document/documentEdits';
import { sqlHighlightStyle } from '../../lib/sqlSyntaxTheme';
import { BASIC_SETUP_WITHOUT_KEYMAPS, EDITOR_KEYMAP } from '../../lib/editorKeymap';
import { formatAccelerator } from '../../lib/commands/accelerator';
import { currentPlatform } from '../../lib/commands/shortcutLabel';
import { sqlEditorTheme } from '../SqlEditor/editorTheme';
import { Drawer, DrawerPanel } from '../ui/Drawer';
import { ErrorNotice } from '../ui/ErrorNotice';
import { OverlayPresence } from '../ui/OverlayPresence';

export type DocumentEditorMode = 'edit' | 'insert' | 'clone';

export interface DocumentEditorRequest {
  mode: DocumentEditorMode;
  text: string;
  /** Bumped when the text is replaced from the server, so the editor drops what was typed. */
  revision: number;
}

interface DocumentEditorDrawerProps {
  request: DocumentEditorRequest | null;
  namespace: string;
  /** Resolves to the server's error, or `null` once saved. */
  onSave: (text: string) => Promise<string | null>;
  /** Loads the stored document again after a conflict. */
  onReload: () => Promise<void>;
  onClose: () => void;
}

const TITLES: Record<DocumentEditorMode, string> = {
  edit: 'Edit document',
  insert: 'Insert document',
  clone: 'Clone document',
};

const SAVE_KEY = 'CmdOrCtrl+Enter';

function Body({ request, namespace, onSave, onReload, onClose }: DocumentEditorDrawerProps & { request: DocumentEditorRequest }) {
  const [text, setText] = useState(request.text);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const textRef = useRef(text);
  textRef.current = text;

  useEffect(() => {
    setText(request.text);
    setError(null);
  }, [request.text, request.revision]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      setError(await onSave(textRef.current));
    } finally {
      setBusy(false);
    }
  };
  const saveRef = useRef(save);
  saveRef.current = save;

  const reload = async () => {
    setBusy(true);
    try {
      await onReload();
    } finally {
      setBusy(false);
    }
  };

  const extensions = useMemo(
    () => [
      javascript(),
      syntaxHighlighting(sqlHighlightStyle),
      sqlEditorTheme,
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({ 'aria-label': 'Document' }),
      // The page sees Mod-Enter before the native menu, and the default keymap would insert a line.
      Prec.highest(
        keymap.of([
          {
            key: 'Mod-Enter',
            run: () => {
              void saveRef.current();
              return true;
            },
          },
        ]),
      ),
      keymap.of(EDITOR_KEYMAP),
    ],
    [],
  );

  const conflict = error !== null && request.mode === 'edit' && isConflictError(error);
  const saveLabel = request.mode === 'edit' ? 'Save' : 'Insert';
  return (
    <Drawer onScrimClick={busy ? undefined : onClose}>
      <DrawerPanel
        role="dialog"
        aria-modal="true"
        aria-labelledby="document-editor-title"
        className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl bg-popover border-l border-border shadow-2xl flex flex-col font-sans text-popover-foreground outline-none"
      >
        <header className="px-4 py-3 border-b border-border bg-background/60 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <FileJson className="w-4 h-4 text-emerald-400 shrink-0" />
            <div className="min-w-0">
              <div id="document-editor-title" className="font-mono text-xs font-bold text-foreground">
                {TITLES[request.mode]}
              </div>
              <div className="text-[10px] text-muted-foreground font-mono truncate">{namespace}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground"
            aria-label="Close document editor"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {error && (
          <div className="border-b bg-rose-500/10 border-rose-500/20 px-4 py-2 flex items-start gap-3">
            <ErrorNotice message={error} className="flex-1 text-[11px] font-mono text-rose-300" />
            {conflict && (
              <button
                type="button"
                onClick={() => void reload()}
                disabled={busy}
                className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg bg-background border border-border hover:bg-accent text-foreground text-[11px] font-medium disabled:opacity-50"
              >
                <RotateCcw className="w-3 h-3" /> Reload
              </button>
            )}
          </div>
        )}

        <div className="flex-1 min-h-0">
          <CodeMirror
            value={text}
            theme="none"
            height="100%"
            autoFocus
            basicSetup={{
              lineNumbers: true,
              foldGutter: true,
              highlightActiveLine: false,
              autocompletion: false,
              ...BASIC_SETUP_WITHOUT_KEYMAPS,
            }}
            extensions={extensions}
            onChange={setText}
            className="h-full text-xs"
          />
        </div>

        <footer className="px-4 py-3 border-t border-border bg-background/60 flex items-center justify-between gap-2 shrink-0">
          <span className="text-[10px] text-muted-foreground font-mono">
            Shell syntax works: ObjectId(…), ISODate(…), NumberLong(…)
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-2.5 py-1.5 rounded-lg bg-background hover:bg-accent text-foreground border border-border text-xs font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy}
              title={formatAccelerator(SAVE_KEY, currentPlatform())}
              className="pressable flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold shadow-md transition-colors disabled:opacity-50 bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              <span>{saveLabel}</span>
            </button>
          </div>
        </footer>
      </DrawerPanel>
    </Drawer>
  );
}

/** Edits a document as editable text; the server error stays inline and the drawer stays open. */
export function DocumentEditorDrawer(props: DocumentEditorDrawerProps) {
  return (
    <OverlayPresence isOpen={props.request !== null}>
      {props.request && <Body {...props} request={props.request} />}
    </OverlayPresence>
  );
}
