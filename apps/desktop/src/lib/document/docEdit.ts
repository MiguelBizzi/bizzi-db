import type { DocValue } from '@db/shared';
import type { TreePath } from './docTree';

/** A tree edit or value conversion the user asked for that cannot be applied; `message` is shown as is. */
export class DocEditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DocEditError';
  }
}

export type ScalarType =
  | 'string'
  | 'int32'
  | 'int64'
  | 'double'
  | 'decimal128'
  | 'bool'
  | 'null'
  | 'objectId'
  | 'date';

export const SCALAR_TYPES: { type: ScalarType; label: string }[] = [
  { type: 'string', label: 'String' },
  { type: 'int32', label: 'Int32' },
  { type: 'int64', label: 'Int64' },
  { type: 'double', label: 'Double' },
  { type: 'decimal128', label: 'Decimal128' },
  { type: 'bool', label: 'Boolean' },
  { type: 'null', label: 'Null' },
  { type: 'objectId', label: 'ObjectId' },
  { type: 'date', label: 'Date' },
];

type ObjectValue = Extract<DocValue, { t: 'object' }>;
type ArrayValue = Extract<DocValue, { t: 'array' }>;

const pathLabel = (path: TreePath) => (path.length === 0 ? 'the document' : path.join('.'));

function child(v: DocValue, segment: string | number, path: TreePath): DocValue {
  if (typeof segment === 'number' && v.t === 'array' && segment >= 0 && segment < v.items.length) {
    return v.items[segment];
  }
  if (typeof segment === 'string' && v.t === 'object') {
    const entry = v.entries.find(([k]) => k === segment);
    if (entry) return entry[1];
  }
  throw new DocEditError(`There is no ${pathLabel(path)} in this document.`);
}

export function getValue(doc: DocValue, path: TreePath): DocValue {
  let v = doc;
  path.forEach((segment, i) => {
    v = child(v, segment, path.slice(0, i + 1));
  });
  return v;
}

function updateAt(v: DocValue, path: TreePath, update: (target: DocValue) => DocValue, depth = 0): DocValue {
  if (depth === path.length) return update(v);
  const segment = path[depth];
  const current = child(v, segment, path.slice(0, depth + 1));
  const next = updateAt(current, path, update, depth + 1);
  if (v.t === 'array') {
    return { t: 'array', items: v.items.map((item, i) => (i === segment ? next : item)) };
  }
  const object = v as ObjectValue;
  return { t: 'object', entries: object.entries.map(([k, val]) => [k, k === segment ? next : val]) };
}

function asObject(v: DocValue, path: TreePath): ObjectValue {
  if (v.t !== 'object') throw new DocEditError(`${pathLabel(path)} is not an object.`);
  return v;
}

function asArray(v: DocValue, path: TreePath): ArrayValue {
  if (v.t !== 'array') throw new DocEditError(`${pathLabel(path)} is not an array.`);
  return v;
}

const isRootId = (path: TreePath) => path.length === 1 && path[0] === '_id';

function splitLast(path: TreePath): [TreePath, string | number] {
  if (path.length === 0) throw new DocEditError('Choose a field inside the document.');
  return [path.slice(0, -1), path[path.length - 1]];
}

function checkNewKey(parent: ObjectValue, key: string, parentPath: TreePath): void {
  if (key === '') throw new DocEditError('A field name cannot be empty.');
  if (parent.entries.some(([k]) => k === key)) {
    throw new DocEditError(`${pathLabel([...parentPath, key])} already exists.`);
  }
}

export function setValue(doc: DocValue, path: TreePath, value: DocValue): DocValue {
  splitLast(path);
  return updateAt(doc, path, () => value);
}

export function removeField(doc: DocValue, path: TreePath): DocValue {
  const [parentPath, last] = splitLast(path);
  if (typeof last === 'number') return removeItem(doc, parentPath, last);
  if (isRootId(path)) throw new DocEditError('_id cannot be removed.');
  getValue(doc, path);
  return updateAt(doc, parentPath, (parent) => ({
    t: 'object',
    entries: asObject(parent, parentPath).entries.filter(([k]) => k !== last),
  }));
}

/** Renames in place, so the field keeps its position among its siblings. */
export function renameField(doc: DocValue, path: TreePath, newKey: string): DocValue {
  const [parentPath, last] = splitLast(path);
  if (typeof last === 'number') throw new DocEditError('Array items have no name to change.');
  if (isRootId(path)) throw new DocEditError('_id cannot be renamed.');
  getValue(doc, path);
  if (newKey === last) return doc;
  return updateAt(doc, parentPath, (parent) => {
    const object = asObject(parent, parentPath);
    checkNewKey(object, newKey, parentPath);
    return { t: 'object', entries: object.entries.map(([k, v]) => [k === last ? newKey : k, v]) };
  });
}

/** Without `afterKey` the field is appended. */
export function addField(
  doc: DocValue,
  parentPath: TreePath,
  key: string,
  value: DocValue,
  afterKey?: string,
): DocValue {
  return updateAt(doc, parentPath, (parent) => {
    const object = asObject(parent, parentPath);
    checkNewKey(object, key, parentPath);
    const entries = [...object.entries];
    let at = entries.length;
    if (afterKey !== undefined) {
      const index = entries.findIndex(([k]) => k === afterKey);
      if (index === -1) throw new DocEditError(`There is no ${pathLabel([...parentPath, afterKey])} in this document.`);
      at = index + 1;
    }
    entries.splice(at, 0, [key, value]);
    return { t: 'object', entries };
  });
}

/** `index` may equal the length, which appends. */
export function insertItem(doc: DocValue, arrayPath: TreePath, index: number, value: DocValue): DocValue {
  return updateAt(doc, arrayPath, (target) => {
    const array = asArray(target, arrayPath);
    if (!Number.isInteger(index) || index < 0 || index > array.items.length) {
      throw new DocEditError(`${pathLabel(arrayPath)} has no position ${index}.`);
    }
    const items = [...array.items];
    items.splice(index, 0, value);
    return { t: 'array', items };
  });
}

export function removeItem(doc: DocValue, arrayPath: TreePath, index: number): DocValue {
  return updateAt(doc, arrayPath, (target) => {
    const array = asArray(target, arrayPath);
    if (!Number.isInteger(index) || index < 0 || index >= array.items.length) {
      throw new DocEditError(`${pathLabel(arrayPath)} has no item ${index}.`);
    }
    return { t: 'array', items: array.items.filter((_, i) => i !== index) };
  });
}

export function uniqueFieldKey(parent: DocValue, base = 'newField'): string {
  const taken = new Set(parent.t === 'object' ? parent.entries.map(([k]) => k) : []);
  if (!taken.has(base)) return base;
  let n = 1;
  while (taken.has(`${base}${n}`)) n++;
  return `${base}${n}`;
}

export type AddTarget =
  | { kind: 'field'; parentPath: TreePath; afterKey?: string }
  | { kind: 'item'; arrayPath: TreePath; index: number };

/**
 * Where Add Field puts a new value for the row at `path`: inside an object or at the end of an
 * array, otherwise right after the row among its siblings.
 */
export function addFieldTarget(doc: DocValue, path: TreePath): AddTarget {
  const value = getValue(doc, path);
  if (value.t === 'object') return { kind: 'field', parentPath: path };
  if (value.t === 'array') return { kind: 'item', arrayPath: path, index: value.items.length };
  const [parentPath, last] = splitLast(path);
  if (typeof last === 'number') return { kind: 'item', arrayPath: parentPath, index: last + 1 };
  return { kind: 'field', parentPath, afterKey: last };
}

export function scalarTypeOf(v: DocValue): ScalarType | undefined {
  return SCALAR_TYPES.some(({ type }) => type === v.t) ? (v.t as ScalarType) : undefined;
}

/** The text the inline editor starts with; `convertScalar` reads it back to the same value. */
export function scalarText(v: DocValue): string {
  switch (v.t) {
    case 'bool':
      return v.v ? 'true' : 'false';
    case 'null':
      return '';
    case 'string':
    case 'int32':
    case 'int64':
    case 'double':
    case 'decimal128':
    case 'objectId':
    case 'date':
      return v.v;
    default:
      return '';
  }
}

const INTEGER = /^[+-]?\d+$/;
const DECIMAL = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
const SPECIAL_NUMBERS = new Set(['NaN', 'Infinity', '-Infinity']);
const OBJECT_ID = /^[0-9a-f]{24}$/i;
const ISO_DATE =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|[+-]\d{2}:?\d{2})?)?$/i;

function integer(text: string, min: bigint, max: bigint, label: string): string {
  const trimmed = text.trim();
  if (!INTEGER.test(trimmed)) throw new DocEditError(`${label} must be a whole number.`);
  const n = BigInt(trimmed);
  if (n < min || n > max) throw new DocEditError(`${label} must be between ${min} and ${max}.`);
  return n.toString();
}

/**
 * Rust's `{:?}` text for an f64, which the server sends: shortest round-trip digits, always with a
 * `.` or an exponent so the value reads back as a Double, and exponent form outside 1e-4..1e16.
 */
function doubleText(x: number): string {
  if (x === 0) return Object.is(x, -0) ? '-0.0' : '0.0';
  const sign = x < 0 ? '-' : '';
  const [mantissa, expText] = Math.abs(x).toExponential().split('e');
  const digits = mantissa.replace('.', '');
  const exp = Number(expText);
  if (exp < -4 || exp >= 16) {
    return `${sign}${digits[0]}${digits.length > 1 ? '.' + digits.slice(1) : ''}e${exp}`;
  }
  if (exp < 0) return `${sign}0.${'0'.repeat(-exp - 1)}${digits}`;
  const whole = digits.slice(0, exp + 1).padEnd(exp + 1, '0');
  return `${sign}${whole}.${digits.slice(exp + 1) || '0'}`;
}

function dateText(text: string): string {
  const match = ISO_DATE.exec(text.trim());
  const invalid = () => new DocEditError('Date must be ISO 8601, like 2024-01-31 or 2024-01-31T12:00:00Z.');
  if (!match) throw invalid();
  const [, y, mo, d, h = '0', mi = '0', s = '0', frac = '', zone = 'Z'] = match;
  const parts = [y, mo, d, h, mi, s].map(Number);
  const ms = Number(frac.slice(0, 3).padEnd(3, '0'));
  // `Date.UTC` reads years 0–99 as 1900–1999; `setUTCFullYear` takes the year as given.
  const check = new Date(0);
  check.setUTCFullYear(parts[0], parts[1] - 1, parts[2]);
  check.setUTCHours(parts[3], parts[4], parts[5], ms);
  const local = check.getTime();
  if (
    check.getUTCFullYear() !== parts[0] ||
    check.getUTCMonth() !== parts[1] - 1 ||
    check.getUTCDate() !== parts[2] ||
    parts[3] > 23 ||
    parts[4] > 59 ||
    parts[5] > 59
  ) {
    throw invalid();
  }
  let offsetMinutes = 0;
  if (zone.toUpperCase() !== 'Z') {
    const digits = zone.slice(1).replace(':', '');
    offsetMinutes = (zone[0] === '-' ? -1 : 1) * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2)));
  }
  return new Date(local - offsetMinutes * 60_000).toISOString();
}

export function convertScalar(text: string, type: ScalarType): DocValue {
  const trimmed = text.trim();
  switch (type) {
    case 'string':
      return { t: 'string', v: text };
    case 'int32':
      return { t: 'int32', v: integer(text, -2147483648n, 2147483647n, 'Int32') };
    case 'int64':
      return { t: 'int64', v: integer(text, -9223372036854775808n, 9223372036854775807n, 'Int64') };
    case 'double': {
      if (SPECIAL_NUMBERS.has(trimmed)) return { t: 'double', v: trimmed };
      const x = DECIMAL.test(trimmed) ? Number(trimmed) : NaN;
      if (!Number.isFinite(x)) throw new DocEditError('Double must be a finite number, NaN, Infinity or -Infinity.');
      return { t: 'double', v: doubleText(x) };
    }
    case 'decimal128':
      if (!SPECIAL_NUMBERS.has(trimmed) && !DECIMAL.test(trimmed)) {
        throw new DocEditError('Decimal128 must be a number, like 12.50 or 1.5E+3.');
      }
      return { t: 'decimal128', v: trimmed };
    case 'bool': {
      const lower = trimmed.toLowerCase();
      if (lower !== 'true' && lower !== 'false') throw new DocEditError('Boolean must be true or false.');
      return { t: 'bool', v: lower === 'true' };
    }
    case 'null':
      return { t: 'null' };
    case 'objectId':
      if (!OBJECT_ID.test(trimmed)) throw new DocEditError('ObjectId must be 24 hexadecimal characters.');
      return { t: 'objectId', v: trimmed.toLowerCase() };
    case 'date':
      return { t: 'date', v: dateText(text) };
  }
}

export function newDocumentTemplate(): string {
  return '{\n  \n}';
}

export interface RowEditCapabilities {
  editValue: boolean;
  rename: boolean;
  remove: boolean;
  duplicate: boolean;
}

/** The tree edits a row offers. The document's own `_id` is fixed: the server refuses to change it. */
export function rowEditCapabilities(doc: DocValue, path: TreePath): RowEditCapabilities {
  if (path.length === 0 || isRootId(path)) {
    return { editValue: false, rename: false, remove: false, duplicate: false };
  }
  const last = path[path.length - 1];
  return {
    editValue: scalarTypeOf(getValue(doc, path)) !== undefined,
    rename: typeof last === 'string',
    remove: true,
    duplicate: typeof last === 'number',
  };
}

/**
 * The document after an inline edit commits: a rename (for `rename` and `field`) and then the
 * value (for `value` and `field`). Throws `DocEditError` when the key or the value is refused, so
 * the editor stays open with the message instead of losing what was typed.
 */
export function commitInlineEdit(
  doc: DocValue,
  path: TreePath,
  mode: 'rename' | 'value' | 'field',
  initialKey: string,
  values: { key: string; text: string; type: ScalarType },
): { doc: DocValue; path: TreePath } {
  let next = doc;
  let target = path;
  if (mode !== 'value' && values.key !== initialKey) {
    next = renameField(next, path, values.key);
    target = [...path.slice(0, -1), values.key];
  }
  if (mode !== 'rename') next = setValue(next, target, convertScalar(values.text, values.type));
  return { doc: next, path: target };
}
