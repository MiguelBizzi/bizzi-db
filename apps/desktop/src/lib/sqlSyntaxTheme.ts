import { HighlightStyle } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

// Colours come from the --syntax-* variables in index.css so the editor follows
// the app's light/dark theme without a second palette to keep in sync.
export const sqlHighlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: 'var(--syntax-keyword)', fontWeight: '500' },
  { tag: [t.string, t.special(t.string)], color: 'var(--syntax-string)' },
  { tag: [t.number, t.bool, t.null], color: 'var(--syntax-constant)' },
  { tag: t.standard(t.name), color: 'var(--syntax-function)' },
  { tag: t.typeName, color: 'var(--syntax-type)' },
  { tag: t.operator, color: 'var(--syntax-operator)' },
  { tag: [t.punctuation, t.paren, t.squareBracket, t.brace], color: 'var(--syntax-punctuation)' },
  { tag: [t.lineComment, t.blockComment], color: 'var(--syntax-comment)', fontStyle: 'italic' },
  { tag: t.invalid, color: 'var(--destructive)' },
]);
