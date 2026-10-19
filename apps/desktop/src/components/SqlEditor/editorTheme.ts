import { EditorView } from '@codemirror/view';

export const sqlEditorTheme = EditorView.theme(
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
);
