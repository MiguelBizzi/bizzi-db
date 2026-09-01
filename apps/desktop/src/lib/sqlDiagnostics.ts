export interface SqlDiagnostic {
  from: number;
  to: number;
  severity: 'error' | 'warning';
  message: string;
}

export function sqlDiagnostics(sql: string): SqlDiagnostic[] {
  const diags: SqlDiagnostic[] = [];
  diags.push(...delimiterErrors(sql));
  diags.push(...logicWarnings(sql));
  return diags;
}

function delimiterErrors(sql: string): SqlDiagnostic[] {
  const diags: SqlDiagnostic[] = [];
  const chars = [...sql];
  let i = 0;
  const parenStack: number[] = [];
  while (i < chars.length) {
    const c = chars[i];
    if (c === '-' && chars[i + 1] === '-') {
      while (i < chars.length && chars[i] !== '\n') i += 1;
      continue;
    }
    if (c === '/' && chars[i + 1] === '*') {
      i += 2;
      while (i < chars.length && !(chars[i] === '*' && chars[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    if (c === '$') {
      const tag = readDollarTag(chars, i);
      if (tag) {
        const start = i;
        i += tag.length;
        let closed = false;
        while (i + tag.length <= chars.length) {
          if (chars.slice(i, i + tag.length).join('') === tag) {
            i += tag.length;
            closed = true;
            break;
          }
          i += 1;
        }
        if (!closed) {
          diags.push({
            from: start,
            to: sql.length,
            severity: 'error',
            message: 'Unclosed dollar-quoted string',
          });
        }
        continue;
      }
    }
    if (c === '\'' || c === '"') {
      const quote = c;
      const start = i;
      i += 1;
      let closed = false;
      while (i < chars.length) {
        if (chars[i] === quote) {
          if (chars[i + 1] === quote) {
            i += 2;
            continue;
          }
          closed = true;
          i += 1;
          break;
        }
        i += 1;
      }
      if (!closed) {
        diags.push({
          from: start,
          to: sql.length,
          severity: 'error',
          message: quote === "'" ? 'Unclosed string quote' : 'Unclosed identifier quote',
        });
      }
      continue;
    }
    if (c === '(') {
      parenStack.push(i);
      i += 1;
      continue;
    }
    if (c === ')') {
      parenStack.pop();
      i += 1;
      continue;
    }
    i += 1;
  }
  if (parenStack.length > 0) {
    const from = parenStack[0] ?? 0;
    diags.push({
      from,
      to: sql.length,
      severity: 'error',
      message: 'Unbalanced parentheses',
    });
  }
  return diags;
}

function logicWarnings(sql: string): SqlDiagnostic[] {
  const diags: SqlDiagnostic[] = [];
  const upper = stripStringsAndComments(sql).toUpperCase();
  const first = firstKeyword(upper);
  if (
    (first === 'UPDATE' || first === 'DELETE' || first === 'TRUNCATE') &&
    !/\bWHERE\b/.test(upper)
  ) {
    diags.push({
      from: 0,
      to: Math.min(sql.length, 12),
      severity: 'warning',
      message: `${first} without WHERE`,
    });
  }
  return diags;
}

function firstKeyword(sql: string): string {
  return sql.trim().split(/\s+/)[0] ?? '';
}

function readDollarTag(chars: string[], start: number): string | null {
  if (chars[start] !== '$') return null;
  let i = start + 1;
  while (i < chars.length) {
    const c = chars[i];
    if (c === '$') return chars.slice(start, i + 1).join('');
    if (!/[A-Za-z0-9_]/.test(c)) return null;
    i += 1;
  }
  return null;
}

function stripStringsAndComments(sql: string): string {
  const chars = [...sql];
  let out = '';
  let i = 0;
  while (i < chars.length) {
    const c = chars[i];
    if (c === '-' && chars[i + 1] === '-') {
      while (i < chars.length && chars[i] !== '\n') i += 1;
      continue;
    }
    if (c === '/' && chars[i + 1] === '*') {
      i += 2;
      while (i < chars.length && !(chars[i] === '*' && chars[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    if (c === '\'' || c === '"') {
      const quote = c;
      i += 1;
      while (i < chars.length) {
        if (chars[i] === quote) {
          if (chars[i + 1] === quote) {
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}
