export type ShellCompletionType = 'collection' | 'method' | 'operator' | 'field' | 'keyword';

export interface ShellCompletion {
  label: string;
  type: ShellCompletionType;
  /** Text to insert when it differs from `label` (a field path that needs quotes). */
  apply?: string;
}

export interface ShellCompletionContext {
  collections: string[];
  fields: string[];
}

// What `parse_command` in crates/mongo accepts.
const METHODS = [
  'find',
  'findOne',
  'aggregate',
  'countDocuments',
  'estimatedDocumentCount',
  'distinct',
  'insertOne',
  'insertMany',
  'updateOne',
  'updateMany',
  'replaceOne',
  'deleteOne',
  'deleteMany',
  'createIndex',
  'dropIndex',
  'getIndexes',
  'drop',
];
const CURSOR_CHAIN = ['sort', 'limit', 'skip', 'project', 'projection'];
const DB_HELPERS = ['getCollection', 'runCommand', 'adminCommand', 'getCollectionNames'];
const KEYWORDS = ['db', 'use', 'show dbs', 'show collections'];
const SHOW_TARGETS = ['dbs', 'databases', 'collections'];

const QUERY_OPERATORS = [
  '$eq', '$ne', '$gt', '$gte', '$lt', '$lte', '$in', '$nin', '$exists', '$type', '$regex',
  '$and', '$or', '$nor', '$not', '$elemMatch', '$size', '$all',
];
const UPDATE_OPERATORS = ['$set', '$unset', '$inc', '$push', '$pull', '$addToSet', '$rename'];
const ACCUMULATORS = ['$sum', '$avg', '$min', '$max', '$first', '$last'];
const STAGES = [
  '$match', '$project', '$group', '$sort', '$limit', '$skip', '$unwind', '$lookup', '$addFields',
  '$count', '$facet',
];

const IDENT = /^[A-Za-z_$][\w$]*$/;
const COLLECTION_NAME = /^[A-Za-z_$][\w$]*(\.[\w$]+)*$/;
const COLLECTION_REF = String.raw`db(?:\[\s*(['"])(.*?)\1\s*\]|\.getCollection\(\s*(['"])(.*?)\3\s*\))`;
const BRACKET_METHOD = new RegExp(String.raw`^${COLLECTION_REF}\.(\w*)$`, 's');
const FIND_CALL = new RegExp(
  String.raw`^(?:${COLLECTION_REF}|db\.[\w$.]+?)\.find\s*\(`,
  's',
);

interface Scan {
  stack: { ch: string; at: number }[];
  inString: boolean;
  inComment: boolean;
  /** Where the statement the end of the text belongs to begins. */
  stmtStart: number;
}

const CLOSERS: Record<string, string> = { ')': '(', ']': '[', '}': '{' };

// A newline ends a statement unless it sits inside brackets or the next line continues the chain
// with a leading `.`, the same rule as `split_ranges` in crates/mongo.
function scan(text: string): Scan {
  const stack: Scan['stack'] = [];
  let quote: string | null = null;
  let lineComment = false;
  let blockComment = false;
  let stmtStart = 0;
  let lastSig: string | null = null;
  let pendingNew = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (lineComment) {
      if (c !== '\n') continue;
      lineComment = false;
    } else if (blockComment) {
      if (c === '*' && text[i + 1] === '/') {
        blockComment = false;
        i++;
      }
      continue;
    } else if (quote) {
      if (c === '\\') {
        i++;
        continue;
      }
      if (c === quote) {
        quote = null;
        continue;
      }
      // A newline ends an unterminated '…' or "…" string, as in the Rust splitter.
      if (c !== '\n' || quote === '`') continue;
      quote = null;
    }
    if (c === '\n') {
      if (stack.length === 0) pendingNew = lastSig !== null && lastSig !== '.';
      continue;
    }
    if (/\s/.test(c)) continue;
    if (c === '/' && text[i + 1] === '/') {
      lineComment = true;
      continue;
    }
    if (c === '/' && text[i + 1] === '*') {
      blockComment = true;
      i++;
      continue;
    }
    if (pendingNew && stack.length === 0 && c !== '.') stmtStart = i;
    pendingNew = false;
    lastSig = c;
    if (c === "'" || c === '"' || c === '`') quote = c;
    else if (c === '(' || c === '[' || c === '{') stack.push({ ch: c, at: i });
    else if (CLOSERS[c]) {
      if (stack[stack.length - 1]?.ch === CLOSERS[c]) stack.pop();
    } else if (c === ';' && stack.length === 0) stmtStart = i + 1;
  }
  return { stack, inString: quote !== null, inComment: lineComment || blockComment, stmtStart };
}

const startsWith = (word: string) => (label: string) => label.toLowerCase().startsWith(word.toLowerCase());

function options(labels: string[], type: ShellCompletionType, word: string): ShellCompletion[] {
  return labels.filter(startsWith(word)).map((label) => ({ label, type }));
}

function result(caret: number, word: string, found: ShellCompletion[]) {
  return found.length === 0 ? null : { from: caret - word.length, options: found };
}

function keyCompletions(before: string, caret: number, scanned: Scan, ctx: ShellCompletionContext) {
  const word = /[$\w.]*$/.exec(before)![0];
  const prior = before.slice(0, before.length - word.length).trimEnd();
  if (!prior.endsWith('{') && !prior.endsWith(',')) return null;

  const { stack } = scanned;
  const n = stack.length;
  const stage =
    n >= 3 &&
    stack[n - 2].ch === '[' &&
    stack[n - 3].ch === '(' &&
    before.slice(0, stack[n - 3].at).trimEnd().endsWith('.aggregate');
  if (stage && (word === '' || word.startsWith('$'))) return result(caret, word, options(STAGES, 'operator', word));

  if (word.startsWith('$')) {
    const pipeline = /\.aggregate\s*\(/.test(before.slice(scanned.stmtStart));
    const operators = new Set([...QUERY_OPERATORS, ...UPDATE_OPERATORS, ...(pipeline ? ACCUMULATORS : [])]);
    return result(caret, word, options([...operators], 'operator', word));
  }
  const fields = ctx.fields.filter(startsWith(word)).map((label): ShellCompletion => {
    return IDENT.test(label) ? { label, type: 'field' } : { label, type: 'field', apply: JSON.stringify(label) };
  });
  return result(caret, word, fields);
}

function collectionCompletions(prefix: string, caret: number, ctx: ShellCompletionContext) {
  const names = ctx.collections.filter((name) => COLLECTION_NAME.test(name));
  return result(caret, prefix, [
    ...options(names, 'collection', prefix),
    ...options(DB_HELPERS, 'method', prefix),
  ]);
}

export function shellCompletions(
  text: string,
  caret: number,
  ctx: ShellCompletionContext,
): { from: number; options: ShellCompletion[] } | null {
  const before = text.slice(0, caret);
  const scanned = scan(before);
  if (scanned.inString || scanned.inComment) return null;

  const { stack } = scanned;
  if (stack.length > 0) {
    return stack[stack.length - 1].ch === '{' ? keyCompletions(before, caret, scanned, ctx) : null;
  }

  const stmt = before.slice(scanned.stmtStart).trimStart();

  const chain = /\)\s*\.(\w*)$/.exec(stmt);
  if (chain && FIND_CALL.test(stmt)) {
    return result(caret, chain[1], options(CURSOR_CHAIN, 'method', chain[1]));
  }

  const bracket = BRACKET_METHOD.exec(stmt);
  if (bracket) return result(caret, bracket[5], options(METHODS, 'method', bracket[5]));

  const dbDot = /^db\.([\w$.]*)$/.exec(stmt);
  if (dbDot) {
    const path = dbDot[1];
    const dot = path.lastIndexOf('.');
    if (dot < 0) return collectionCompletions(path, caret, ctx);
    const collection = path.slice(0, dot);
    const method = path.slice(dot + 1);
    const methods = () => result(caret, method, options(METHODS, 'method', method));
    if (ctx.collections.includes(collection)) return methods();
    if (ctx.collections.some((name) => name.startsWith(path))) return collectionCompletions(path, caret, ctx);
    return collection.includes('.') ? null : methods();
  }

  const show = /^show\s+(\w*)$/.exec(stmt);
  if (show) return result(caret, show[1], options(SHOW_TARGETS, 'keyword', show[1]));

  const word = /^\w*$/.exec(stmt);
  if (word) return result(caret, word[0], options(KEYWORDS, 'keyword', word[0]));
  return null;
}

const METHOD_ALTERNATION = METHODS.join('|');

/** The collection the statement at `caret` is working on, for sampling its fields. */
export function shellCollectionAt(text: string, caret: number): string | null {
  const before = text.slice(0, caret);
  const stmt = before.slice(scan(before).stmtStart).trimStart();
  const quoted = new RegExp(String.raw`^${COLLECTION_REF}\.(?:${METHOD_ALTERNATION})\b`, 's').exec(stmt);
  if (quoted) return quoted[2] ?? quoted[4];
  const dotted = new RegExp(String.raw`^db\.([\w$.]+?)\.(?:${METHOD_ALTERNATION})\b\s*\(`).exec(stmt);
  return dotted ? dotted[1] : null;
}
