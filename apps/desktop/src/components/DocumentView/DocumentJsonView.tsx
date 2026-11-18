import { useMemo } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { syntaxHighlighting } from '@codemirror/language';
import type { DocValue } from '@db/shared';
import { formatEditable } from '../../lib/document/docTree';
import { sqlHighlightStyle } from '../../lib/sqlSyntaxTheme';
import { BASIC_SETUP_WITHOUT_KEYMAPS } from '../../lib/editorKeymap';
import { sqlEditorTheme } from '../SqlEditor/editorTheme';

const extensions = [
  javascript(),
  syntaxHighlighting(sqlHighlightStyle),
  sqlEditorTheme,
  EditorState.readOnly.of(true),
  EditorView.contentAttributes.of({ 'aria-label': 'Documents as JSON' }),
];

/** The page as the editable text of each document, comma-separated like a JSON array body. */
export function DocumentJsonView({ documents }: { documents: DocValue[] }) {
  const text = useMemo(() => documents.map(formatEditable).join(',\n'), [documents]);
  return (
    <div className="flex-1 min-h-0">
      <CodeMirror
        value={text}
        theme="none"
        indentWithTab={false}
        editable={false}
        height="100%"
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: false,
          highlightActiveLineGutter: false,
          autocompletion: false,
          ...BASIC_SETUP_WITHOUT_KEYMAPS,
        }}
        extensions={extensions}
        className="h-full text-xs"
      />
    </div>
  );
}
