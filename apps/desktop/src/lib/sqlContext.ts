// Works out what the user is expected to type next at a cursor position.
// It tokenises the surrounding statement, finds the clause the cursor sits in
// and reports the kind of thing that makes sense there (a table, a column, or
// one of a short list of keywords). Schema lookups and ranking live in
// sqlComplete.ts.

export interface TableRef {
  schema?: string;
  name: string;
  alias?: string;
  aliasQuoted?: boolean;
}

export interface KeywordHint {
  label: string;
  boost: number;
  detail?: string;
}

export type SqlExpectation = 'none' | 'table' | 'column' | 'insert-column' | 'keyword';

export interface SqlContext {
  expects: SqlExpectation;
  keywords: KeywordHint[];
  /** Tables of the cursor's query level, falling back to the enclosing queries. */
  refs: TableRef[];
  /** Every table visible from the cursor, including enclosing queries. */
  scopeRefs: TableRef[];
  /** Identifier parts of the token being typed, e.g. `u.em` -> ['u', 'em']. */
  parts: string[];
  prefix: string;
  inQuote: boolean;
  /** The typed token up to and including its last dot, kept when applying. */
  qualifier: string;
  keywordUpper: boolean;
}

type Clause =
  | 'SELECT'
  | 'FROM'
  | 'JOIN'
  | 'ON'
  | 'WHERE'
  | 'GROUP BY'
  | 'ORDER BY'
  | 'HAVING'
  | 'LIMIT'
  | 'OFFSET'
  | 'SET'
  | 'RETURNING'
  | 'VALUES'
  | 'INTO'
  | 'UPDATE'
  | 'USING'
  | 'TABLE'
  | 'START';

const CLAUSES: Record<string, Clause> = {
  SELECT: 'SELECT',
  FROM: 'FROM',
  JOIN: 'JOIN',
  ON: 'ON',
  WHERE: 'WHERE',
  HAVING: 'HAVING',
  LIMIT: 'LIMIT',
  OFFSET: 'OFFSET',
  SET: 'SET',
  RETURNING: 'RETURNING',
  VALUES: 'VALUES',
  INTO: 'INTO',
  UPDATE: 'UPDATE',
  USING: 'USING',
  TABLE: 'TABLE',
  TRUNCATE: 'TABLE',
  WITH: 'START',
  UNION: 'START',
  INTERSECT: 'START',
  EXCEPT: 'START',
};

const TABLE_CLAUSES = new Set<Clause>(['FROM', 'JOIN', 'INTO', 'UPDATE', 'USING', 'TABLE']);

const RESERVED = new Set(
  (
    'SELECT FROM WHERE JOIN LEFT RIGHT INNER OUTER FULL CROSS NATURAL ON AND OR NOT IN IS NULL AS ' +
    'ORDER GROUP BY HAVING LIMIT OFFSET INSERT INTO VALUES UPDATE SET DELETE CREATE ALTER DROP ' +
    'TABLE INDEX VIEW WITH DISTINCT UNION INTERSECT EXCEPT ALL EXISTS CASE WHEN THEN ELSE END ' +
    'RETURNING TRUNCATE EXPLAIN USING LIKE ILIKE BETWEEN ASC DESC NULLS TRUE FALSE ANY SOME LATERAL'
  ).split(' ')
);

const EXPECTS_OPERAND = new Set(
  'AND OR NOT WHEN THEN ELSE CASE DISTINCT ALL ANY SOME EXISTS IN LIKE ILIKE BETWEEN BY ON SELECT WHERE HAVING'.split(
    ' '
  )
);

const LEADING_STARTERS = [
  'SELECT',
  'INSERT INTO',
  'UPDATE',
  'DELETE FROM',
  'WITH',
  'CREATE',
  'ALTER',
  'DROP',
  'TRUNCATE',
  'EXPLAIN',
];

const COMPARISONS = ['=', '<>', '>=', '<=', '>', '<'];
const PREDICATES = ['AND', 'OR', 'IN', 'IS', 'NOT', 'LIKE', 'ILIKE', 'BETWEEN'];

type TokenType = 'word' | 'qident' | 'string' | 'number' | 'punct' | 'comment' | 'group';

interface Token {
  t: TokenType;
  /** Source text; for quoted identifiers the unquoted name. */
  v: string;
  /** Upper-cased text for words, empty otherwise. */
  u: string;
  start: number;
  end: number;
  /** A string, quoted identifier or block comment that never closed. */
  open?: boolean;
  group?: Group;
}

interface Group {
  open: Token | null;
  close: Token | null;
  token: Token | null;
  tokens: Token[];
  parent: Group | null;
}

interface Statement {
  group: Group;
  end: number;
}

interface Level {
  clause: Clause | null;
  segment: Token[];
  inherited: boolean;
}

interface Decision {
  expects: SqlExpectation;
  keywords: KeywordHint[];
}

const NONE: Decision = { expects: 'none', keywords: [] };

export function analyzeSql(sql: string, cursor: number): SqlContext {
  const at = Math.max(0, Math.min(cursor, sql.length));
  const typed = trailingIdentToken(sql.slice(0, at));
  const tokenStart = at - typed.length;
  const { parts, inQuote, qualifier } = parseIdentToken(typed);
  const prefix = (parts.at(-1) ?? '').replaceAll('"', '');

  // The partially typed token is blanked out so it is never read as a table or alias.
  const masked = sql.slice(0, tokenStart) + ' '.repeat(typed.length) + sql.slice(at);
  const tokens = tokenize(masked);
  const base: SqlContext = {
    expects: 'none',
    keywords: [],
    refs: [],
    scopeRefs: [],
    parts,
    prefix,
    inQuote,
    qualifier,
    keywordUpper: usesUpperCase(prefix, tokens, at),
  };
  if (tokens.some((token) => insideLiteral(token, at))) return base;

  const statements = buildStatements(tokens);
  const statement = statements.find((s) => at <= s.end) ?? statements[statements.length - 1];
  const group = groupAt(statement.group, at);
  const level = levelAt(group, at);
  const first = statement.group.tokens[0]?.u ?? '';
  const laterFrom = group.tokens.some((token) => token.start >= at && token.u === 'FROM');
  const decision = decide(level, first, laterFrom);

  const chain = groupChain(group);
  const own = scanRefs(group.tokens);
  const scopeRefs = chain.flatMap((g) => scanRefs(g.tokens));
  const refs = own.length > 0 ? own : (chain.map((g) => scanRefs(g.tokens)).find((r) => r.length > 0) ?? []);
  return { ...base, ...decision, refs, scopeRefs };
}

function decide(level: Level, first: string, laterFrom: boolean): Decision {
  const { clause, segment, inherited } = level;
  const last = segment.at(-1);

  const forced = last?.t === 'word' ? forcedAfter(last, segment.at(-2)) : null;
  if (forced) return keywordsOnly(forced);

  if (!clause || clause === 'START') return keywordsOnly(LEADING_STARTERS);

  if (TABLE_CLAUSES.has(clause)) {
    if (inherited) {
      if (clause === 'INTO') {
        return last && last.v !== ',' ? NONE : { expects: 'insert-column', keywords: [] };
      }
      return segment.length === 0 ? keywordsOnly(['SELECT']) : NONE;
    }
    const entry = afterLastComma(segment);
    if (entry.at(-1)?.u === 'AS') return NONE;
    if (countOperands(entry) === 0) {
      return first === 'CREATE' && clause === 'TABLE' ? NONE : { expects: 'table', keywords: [] };
    }
    return clause === 'TABLE' ? NONE : keywordsOnly(afterTable(clause, first));
  }

  if (clause === 'VALUES' || clause === 'OFFSET') return NONE;
  if (clause === 'LIMIT') return segment.length === 0 ? NONE : keywordsOnly(['OFFSET']);

  const state = operandState(segment);
  if (state === 'none') return NONE;
  if (state === 'expect') {
    return { expects: 'column', keywords: operandKeywords(clause, afterLastComma(segment)) };
  }
  return { expects: 'keyword', keywords: afterOperand(clause, segment, first, laterFrom) };
}

function forcedAfter(last: Token, prev: Token | undefined): string[] | null {
  switch (last.u) {
    case 'GROUP':
    case 'ORDER':
      return ['BY'];
    case 'LEFT':
    case 'RIGHT':
    case 'FULL':
      return ['JOIN', 'OUTER JOIN'];
    case 'INNER':
    case 'CROSS':
    case 'NATURAL':
    case 'OUTER':
      return ['JOIN'];
    case 'IS':
      return ['NOT', 'NULL', 'TRUE', 'FALSE'];
    case 'NOT':
      if (prev?.u === 'IS') return ['NULL', 'TRUE', 'FALSE'];
      return isOperand(prev) ? ['IN', 'LIKE', 'ILIKE', 'BETWEEN'] : null;
    case 'NULLS':
      return ['FIRST', 'LAST'];
    case 'INSERT':
      return ['INTO'];
    case 'DELETE':
      return ['FROM'];
    case 'CREATE':
      return ['TABLE', 'INDEX', 'VIEW'];
    case 'ALTER':
      return ['TABLE'];
    case 'DROP':
      return ['TABLE', 'INDEX', 'VIEW'];
    case 'EXPLAIN':
      return ['ANALYZE', 'SELECT'];
    default:
      return null;
  }
}

function afterTable(clause: Clause, first: string): string[] {
  switch (clause) {
    case 'FROM':
      return first === 'DELETE'
        ? ['WHERE', 'USING', 'RETURNING']
        : [
            'WHERE',
            'JOIN',
            'LEFT JOIN',
            'INNER JOIN',
            'RIGHT JOIN',
            'FULL JOIN',
            'CROSS JOIN',
            'GROUP BY',
            'ORDER BY',
            'LIMIT',
          ];
    case 'JOIN':
      return ['ON', 'USING'];
    case 'USING':
      return ['WHERE', 'RETURNING'];
    case 'INTO':
      return ['VALUES', 'SELECT'];
    case 'UPDATE':
      return ['SET'];
    default:
      return [];
  }
}

function operandKeywords(clause: Clause, entry: Token[]): KeywordHint[] {
  switch (clause) {
    case 'SELECT':
      return hints(entry.length === 0 ? ['DISTINCT', 'CASE', 'NULL'] : ['CASE', 'NULL'], 0);
    case 'WHERE':
    case 'ON':
    case 'HAVING':
      return hints(['NOT', 'EXISTS', 'CASE', 'NULL', 'TRUE', 'FALSE'], 0);
    case 'SET':
      return entry.length === 0 ? [] : hints(['NULL', 'DEFAULT', 'TRUE', 'FALSE', 'CASE'], 0);
    default:
      return [];
  }
}

function afterOperand(
  clause: Clause,
  segment: Token[],
  first: string,
  laterFrom: boolean
): KeywordHint[] {
  const dml = first === 'INSERT' || first === 'UPDATE' || first === 'DELETE';
  const returning = dml ? ['RETURNING'] : [];
  const predicate = (next: string[]) => [
    ...hints(COMPARISONS, 30, 'operator'),
    ...hints([...PREDICATES, ...next], 20),
  ];
  switch (clause) {
    case 'SELECT':
      return hints(laterFrom ? ['AS'] : ['FROM', 'AS'], 20);
    case 'WHERE':
      return predicate(['GROUP BY', 'ORDER BY', 'LIMIT', ...returning]);
    case 'ON':
      return predicate(['JOIN', 'LEFT JOIN', 'WHERE']);
    case 'HAVING':
      return predicate(['ORDER BY', 'LIMIT']);
    case 'GROUP BY':
      return hints(['HAVING', 'ORDER BY', 'LIMIT'], 20);
    case 'ORDER BY':
      return hints(['ASC', 'DESC', 'NULLS FIRST', 'NULLS LAST', 'LIMIT'], 20);
    case 'SET':
      return afterLastComma(segment).length <= 1
        ? hints(['='], 30, 'operator')
        : hints(['WHERE', ...returning], 20);
    default:
      return [];
  }
}

function keywordsOnly(labels: string[]): Decision {
  return { expects: 'keyword', keywords: hints(labels, 20) };
}

function hints(labels: string[], boost: number, detail?: string): KeywordHint[] {
  return labels.map((label, index) => ({ label, boost: boost - index, detail }));
}

function operandState(segment: Token[]): 'expect' | 'after' | 'none' {
  const last = segment.at(-1);
  if (!last) return 'expect';
  switch (last.t) {
    case 'string':
    case 'number':
    case 'qident':
    case 'group':
      return 'after';
    case 'punct':
      if (last.v === '.' || last.v === '::') return 'none';
      if (last.v === '*') return isOperand(segment.at(-2)) ? 'expect' : 'after';
      return 'expect';
    case 'word':
      if (last.u === 'AS') return 'none';
      return EXPECTS_OPERAND.has(last.u) ? 'expect' : 'after';
    default:
      return 'none';
  }
}

function isOperand(token: Token | undefined): boolean {
  if (!token) return false;
  if (token.t === 'word') {
    return !RESERVED.has(token.u) || ['NULL', 'TRUE', 'FALSE', 'END'].includes(token.u);
  }
  return ['qident', 'string', 'number', 'group'].includes(token.t);
}

function isName(token: Token | undefined): boolean {
  if (!token) return false;
  return token.t === 'qident' || (token.t === 'word' && !RESERVED.has(token.u));
}

function afterLastComma(segment: Token[]): Token[] {
  let from = 0;
  segment.forEach((token, i) => {
    if (token.t === 'punct' && token.v === ',') from = i + 1;
  });
  return segment.slice(from);
}

function countOperands(entry: Token[]): number {
  let count = 0;
  let joined = false;
  for (const token of entry) {
    if (token.t === 'punct' && token.v === '.') {
      joined = true;
    } else if (token.u === 'AS') {
      continue;
    } else if (isName(token) || token.t === 'group') {
      if (!joined) count += 1;
      joined = false;
    }
  }
  return count;
}

function levelAt(group: Group, pos: number): Level {
  const head = group.tokens.filter((token) => token.end <= pos);
  let clause: Clause | null = null;
  let index = -1;
  head.forEach((token, i) => {
    if (token.t !== 'word') return;
    if (token.u === 'BY') {
      const prev = head[i - 1];
      if (prev?.u === 'GROUP' || prev?.u === 'ORDER') {
        clause = prev.u === 'GROUP' ? 'GROUP BY' : 'ORDER BY';
        index = i;
      }
      return;
    }
    const found = CLAUSES[token.u];
    if (found) {
      clause = found;
      index = i;
    }
  });
  if (clause || !group.parent || !group.open) {
    return { clause, segment: head.slice(index + 1), inherited: false };
  }
  const parent = levelAt(group.parent, group.open.start);
  return { clause: parent.clause, segment: head, inherited: true };
}

function scanRefs(tokens: Token[]): TableRef[] {
  const refs: TableRef[] = [];
  tokens.forEach((token, i) => {
    if (token.t !== 'word') return;
    const list = token.u === 'FROM' || token.u === 'USING';
    if (!list && !['JOIN', 'UPDATE', 'INTO'].includes(token.u)) return;
    let next = i + 1;
    for (;;) {
      const read = readRef(tokens, next);
      if (!read) return;
      refs.push(read.ref);
      next = read.next;
      const comma = tokens[next];
      if (list && comma?.t === 'punct' && comma.v === ',') {
        next += 1;
        continue;
      }
      return;
    }
  });
  return refs;
}

function readRef(tokens: Token[], from: number): { ref: TableRef; next: number } | null {
  if (!isName(tokens[from])) return null;
  const names = [tokens[from].v];
  let next = from + 1;
  while (tokens[next]?.t === 'punct' && tokens[next].v === '.' && isName(tokens[next + 1])) {
    names.push(tokens[next + 1].v);
    next += 2;
  }
  if (tokens[next]?.u === 'AS') next += 1;
  const ref: TableRef = { name: names[names.length - 1] };
  if (names.length >= 2) ref.schema = names[names.length - 2];
  if (isName(tokens[next])) {
    ref.alias = tokens[next].v;
    ref.aliasQuoted = tokens[next].t === 'qident';
    next += 1;
  }
  return { ref, next };
}

function groupChain(group: Group): Group[] {
  const chain: Group[] = [];
  for (let g: Group | null = group; g; g = g.parent) chain.push(g);
  return chain;
}

function groupAt(root: Group, at: number): Group {
  let group = root;
  for (;;) {
    const child = group.tokens.find(
      (token) =>
        token.group?.open &&
        at >= token.group.open.end &&
        (!token.group.close || at <= token.group.close.start)
    )?.group;
    if (!child) return group;
    group = child;
  }
}

function buildStatements(tokens: Token[]): Statement[] {
  const statements: Statement[] = [];
  let root = newGroup(null, null);
  let current = root;
  for (const token of tokens) {
    if (token.t === 'comment') continue;
    if (token.t === 'punct') {
      if (token.v === '(') {
        const groupToken: Token = {
          t: 'group',
          v: '',
          u: '',
          start: token.start,
          end: Infinity,
        };
        const child = newGroup(token, current);
        child.token = groupToken;
        groupToken.group = child;
        current.tokens.push(groupToken);
        current = child;
        continue;
      }
      if (token.v === ')') {
        if (current.parent && current.token) {
          current.close = token;
          current.token.end = token.end;
          current = current.parent;
        }
        continue;
      }
      if (token.v === ';' && current === root) {
        statements.push({ group: root, end: token.start });
        root = newGroup(null, null);
        current = root;
        continue;
      }
    }
    current.tokens.push(token);
  }
  statements.push({ group: root, end: Infinity });
  return statements;
}

function newGroup(open: Token | null, parent: Group | null): Group {
  return { open, close: null, token: null, tokens: [], parent };
}

function insideLiteral(token: Token, at: number): boolean {
  if (token.start >= at) return false;
  if (token.t === 'comment') return token.v.startsWith('--') ? at <= token.end : !!token.open || at < token.end;
  if (token.t === 'string' || token.t === 'qident') return !!token.open || at < token.end;
  return false;
}

function usesUpperCase(prefix: string, tokens: Token[], at: number): boolean {
  if (prefix) return prefix !== prefix.toLowerCase();
  let last: Token | undefined;
  for (const token of tokens) {
    if (token.t === 'word' && token.end <= at && RESERVED.has(token.u)) last = token;
  }
  return last ? last.v === last.v.toUpperCase() : true;
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  const push = (t: TokenType, start: number, end: number, extra: Partial<Token> = {}) => {
    const v = extra.v ?? text.slice(start, end);
    tokens.push({ t, v, u: t === 'word' ? v.toUpperCase() : '', start, end, ...extra });
  };
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (/\s/.test(c)) {
      i += 1;
    } else if (c === '-' && text[i + 1] === '-') {
      let j = i;
      while (j < text.length && text[j] !== '\n') j += 1;
      push('comment', i, j);
      i = j;
    } else if (c === '/' && text[i + 1] === '*') {
      const close = text.indexOf('*/', i + 2);
      const j = close < 0 ? text.length : close + 2;
      push('comment', i, j, { open: close < 0 });
      i = j;
    } else if (c === "'") {
      const j = scanQuoted(text, i, "'");
      push('string', i, j.end, { open: !j.closed });
      i = j.end;
    } else if (c === '"') {
      const j = scanQuoted(text, i, '"');
      push('qident', i, j.end, { v: j.value, open: !j.closed });
      i = j.end;
    } else if (/[\p{L}_]/u.test(c)) {
      let j = i + 1;
      while (j < text.length && /[\p{L}\p{N}_$]/u.test(text[j])) j += 1;
      push('word', i, j);
      i = j;
    } else if (/[0-9]/.test(c)) {
      let j = i + 1;
      while (j < text.length && /[0-9_.]/.test(text[j])) j += 1;
      push('number', i, j);
      i = j;
    } else if (c === ':' && text[i + 1] === ':') {
      push('punct', i, i + 2);
      i += 2;
    } else {
      push('punct', i, i + 1);
      i += 1;
    }
  }
  return tokens;
}

function scanQuoted(
  text: string,
  start: number,
  quote: string
): { end: number; closed: boolean; value: string } {
  let value = '';
  let i = start + 1;
  while (i < text.length) {
    if (text[i] === quote) {
      if (text[i + 1] === quote) {
        value += quote;
        i += 2;
        continue;
      }
      return { end: i + 1, closed: true, value };
    }
    value += text[i];
    i += 1;
  }
  return { end: text.length, closed: false, value };
}

export function trailingIdentToken(before: string): string {
  let i = before.length;
  while (i > 0 && /[A-Za-z0-9_."]/.test(before[i - 1])) i -= 1;
  return before.slice(i);
}

function parseIdentToken(token: string): {
  parts: string[];
  inQuote: boolean;
  qualifier: string;
} {
  if (!token) return { parts: [''], inQuote: false, qualifier: '' };
  const parts: string[] = [];
  let i = 0;
  let inQuote = false;
  let qualifierEnd = 0;
  while (i < token.length) {
    if (token[i] === '.') {
      if (parts.length === 0) parts.push('');
      i += 1;
      qualifierEnd = i;
      if (i >= token.length) {
        parts.push('');
        inQuote = false;
      }
      continue;
    }
    if (token[i] === '"') {
      inQuote = true;
      i += 1;
      let buf = '';
      while (i < token.length && token[i] !== '"') {
        buf += token[i];
        i += 1;
      }
      if (i < token.length && token[i] === '"') {
        inQuote = false;
        i += 1;
      }
      parts.push(buf);
      continue;
    }
    inQuote = false;
    let buf = '';
    while (i < token.length && /[A-Za-z0-9_]/.test(token[i])) {
      buf += token[i];
      i += 1;
    }
    parts.push(buf);
  }
  return {
    parts: parts.length > 0 ? parts : [''],
    inQuote,
    qualifier: token.slice(0, qualifierEnd),
  };
}
