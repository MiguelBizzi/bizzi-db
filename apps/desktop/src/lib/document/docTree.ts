import type { DocValue } from '@db/shared';

/**
 * The editable text of a value. Must equal `format_editable` in `crates/mongo/src/values.rs`
 * byte for byte (the shared fixture in `crates/mongo/tests/fixtures/editable.json` checks it),
 * because the editor's original text is sent back as the replace filter.
 */
export function formatEditable(v: DocValue): string {
  return pretty(v, 0);
}

function indent(depth: number): string {
  return '\n' + '  '.repeat(depth);
}

function pretty(v: DocValue, depth: number): string {
  if (v.t === 'object' && v.entries.length > 0) {
    const lines = v.entries.map(([k, val]) => indent(depth + 1) + JSON.stringify(k) + ': ' + pretty(val, depth + 1));
    return '{' + lines.join(',') + indent(depth) + '}';
  }
  if (v.t === 'array' && v.items.length > 0) {
    const lines = v.items.map((item) => indent(depth + 1) + pretty(item, depth + 1));
    return '[' + lines.join(',') + indent(depth) + ']';
  }
  return inline(v);
}

const wrapper = (key: string, v: string) => `{"${key}": ${JSON.stringify(v)}}`;

function inline(v: DocValue): string {
  switch (v.t) {
    case 'null':
      return 'null';
    case 'bool':
      return v.v ? 'true' : 'false';
    case 'int32':
      return v.v;
    // A bare integer that fits in 32 bits would read back as Int32.
    case 'int64':
      return wrapper('$numberLong', v.v);
    case 'double':
      return v.v === 'NaN' || v.v === 'Infinity' || v.v === '-Infinity' ? wrapper('$numberDouble', v.v) : v.v;
    case 'decimal128':
      return wrapper('$numberDecimal', v.v);
    case 'string':
      return JSON.stringify(v.v);
    case 'objectId':
      return wrapper('$oid', v.v);
    case 'date':
      return wrapper('$date', v.v);
    case 'binary':
      return `{"$binary": {"base64": ${JSON.stringify(v.base64)}, "subType": "${v.subtype.toString(16).padStart(2, '0')}"}}`;
    case 'timestamp':
      return `{"$timestamp": {"t": ${v.seconds}, "i": ${v.increment}}}`;
    case 'regex':
      return `{"$regularExpression": {"pattern": ${JSON.stringify(v.pattern)}, "options": ${JSON.stringify(v.options)}}}`;
    case 'object':
      return '{' + v.entries.map(([k, val]) => JSON.stringify(k) + ': ' + inline(val)).join(', ') + '}';
    case 'array':
      return '[' + v.items.map(inline).join(', ') + ']';
    case 'minKey':
      return '{"$minKey": 1}';
    case 'maxKey':
      return '{"$maxKey": 1}';
    case 'undefined':
      return '{"$undefined": true}';
    case 'other':
      return v.ejson;
  }
}

const TYPE_LABELS: Record<Exclude<DocValue['t'], 'other'>, string> = {
  null: 'Null',
  bool: 'Boolean',
  int32: 'Int32',
  int64: 'Int64',
  double: 'Double',
  decimal128: 'Decimal128',
  string: 'String',
  objectId: 'ObjectId',
  date: 'Date',
  binary: 'Binary',
  timestamp: 'Timestamp',
  regex: 'Regex',
  object: 'Object',
  array: 'Array',
  minKey: 'MinKey',
  maxKey: 'MaxKey',
  undefined: 'Undefined',
};

const OTHER_LABELS: Record<string, string> = {
  $code: 'Code',
  $symbol: 'Symbol',
  $dbPointer: 'DBPointer',
  $date: 'Date',
};

export function typeLabel(v: DocValue): string {
  if (v.t !== 'other') return TYPE_LABELS[v.t];
  const key = /^\{\s*"(\$[A-Za-z]+)"/.exec(v.ejson)?.[1];
  return (key && OTHER_LABELS[key]) || 'Other';
}

const ALIAS_LABELS: Record<string, string> = {
  double: 'Double',
  string: 'String',
  object: 'Object',
  array: 'Array',
  binData: 'Binary',
  undefined: 'Undefined',
  objectId: 'ObjectId',
  bool: 'Boolean',
  date: 'Date',
  null: 'Null',
  regex: 'Regex',
  dbPointer: 'DBPointer',
  javascript: 'Code',
  symbol: 'Symbol',
  javascriptWithScope: 'Code',
  int: 'Int32',
  timestamp: 'Timestamp',
  long: 'Int64',
  decimal: 'Decimal128',
  minKey: 'MinKey',
  maxKey: 'MaxKey',
};

/** The `typeLabel` name for a BSON type alias as `documentsSampleFields` reports it. */
export function bsonAliasLabel(alias: string): string {
  return ALIAS_LABELS[alias] ?? alias;
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, Math.max(0, max - 1)) + '…' : text;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function previewText(v: DocValue, max = 80): string {
  switch (v.t) {
    case 'object':
      return v.entries.length === 0 ? '{}' : `{ ${plural(v.entries.length, 'field', 'fields')} }`;
    case 'array':
      return v.items.length === 0 ? '[]' : `[ ${plural(v.items.length, 'item', 'items')} ]`;
    case 'string':
      return truncate(JSON.stringify(v.v), max);
    case 'objectId':
      return `ObjectId('${v.v}')`;
    case 'int32':
    case 'int64':
    case 'double':
    case 'decimal128':
    case 'date':
      return v.v;
    case 'binary':
      return truncate(`Binary(${v.subtype}, '${v.base64}')`, max);
    case 'timestamp':
      return `Timestamp(${v.seconds}, ${v.increment})`;
    case 'regex':
      return truncate(`/${v.pattern}/${v.options}`, max);
    case 'other':
      return truncate(v.ejson, max);
    default:
      return inline(v);
  }
}

export type TreePath = (string | number)[];

export interface TreeRow {
  docIndex: number;
  /** Relative to the document; `[]` is the document itself. */
  path: TreePath;
  depth: number;
  key: string;
  value: DocValue;
  expandable: boolean;
  expanded: boolean;
}

export function treeKey(docIndex: number, path: TreePath): string {
  return JSON.stringify([docIndex, ...path]);
}

function isExpandable(v: DocValue): boolean {
  return (v.t === 'object' && v.entries.length > 0) || (v.t === 'array' && v.items.length > 0);
}

/**
 * The visible rows of a page of documents. A key in `toggled` flips its node from the default:
 * documents start open, nested values start closed.
 */
export function flattenTree(docs: DocValue[], toggled: ReadonlySet<string>): TreeRow[] {
  const rows: TreeRow[] = [];
  const visit = (docIndex: number, path: TreePath, key: string, value: DocValue) => {
    const depth = path.length;
    const expandable = isExpandable(value);
    const flipped = toggled.has(treeKey(docIndex, path));
    const open = expandable && (depth === 0 ? !flipped : flipped);
    rows.push({ docIndex, path, depth, key, value, expandable, expanded: open });
    if (!open) return;
    if (value.t === 'object') {
      for (const [k, child] of value.entries) visit(docIndex, [...path, k], k, child);
    } else if (value.t === 'array') {
      value.items.forEach((child, i) => visit(docIndex, [...path, i], String(i), child));
    }
  };
  docs.forEach((doc, i) => {
    const id = documentId(doc);
    visit(i, [], id ? previewText(id, 60) : `Document ${i + 1}`, doc);
  });
  return rows;
}

export function documentId(doc: DocValue): DocValue | undefined {
  if (doc.t !== 'object') return undefined;
  return doc.entries.find(([k]) => k === '_id')?.[1];
}
