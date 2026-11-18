import { describe, expect, test } from 'bun:test';
import { shellCompletions, shellCollectionAt } from './shellComplete';

const ctx = {
  collections: ['users', 'orders', 'system.profile', 'odd name'],
  fields: ['age', 'address.city', 'name'],
};

const at = (text: string, context = ctx) => shellCompletions(text, text.length, context);
const labels = (text: string, context = ctx) => at(text, context)?.options.map((o) => o.label) ?? [];

describe('shellCompletions', () => {
  test('after db. offers collections and db helpers', () => {
    const result = at('db.')!;
    expect(result.from).toBe(3);
    expect(labels('db.')).toEqual(
      expect.arrayContaining(['users', 'orders', 'system.profile', 'getCollection', 'runCommand', 'adminCommand', 'getCollectionNames']),
    );
    expect(labels('db.')).not.toContain('odd name');
  });

  test('filters by the typed prefix and reports where it starts', () => {
    const result = at('db.us')!;
    expect(result.from).toBe(3);
    expect(result.options.map((o) => o.label)).toEqual(['users']);
  });

  test('after db.<collection>. offers the shell methods', () => {
    const found = labels('db.users.');
    expect(found).toEqual(expect.arrayContaining(['find', 'findOne', 'aggregate', 'insertMany', 'getIndexes', 'drop']));
    expect(at('db.users.fi')!.options.map((o) => o.label)).toEqual(['find', 'findOne']);
  });

  test('methods follow bracket and getCollection access too', () => {
    expect(labels('db["odd name"].')).toContain('find');
    expect(labels("db.getCollection('odd name').ag")).toEqual(['aggregate']);
  });

  test('dotted collection names complete as a whole', () => {
    expect(labels('db.system.')).toEqual(['system.profile']);
    expect(labels('db.system.profile.')).toContain('find');
  });

  test('after a find call offers the cursor chain', () => {
    expect(labels('db.users.find({ age: 1 }).')).toEqual(['sort', 'limit', 'skip', 'project', 'projection']);
    expect(labels('db.users.find({}).sort({ a: 1 }).li')).toEqual(['limit']);
    expect(at('db.users.aggregate([]).')).toBeNull();
  });

  test('chain on a following line belongs to the statement above', () => {
    expect(labels('db.users.find({})\n  .')).toContain('sort');
  });

  test('field paths complete in key position, quoted when they are not identifiers', () => {
    const result = at('db.users.find({ a')!;
    expect(result.options.map((o) => o.label)).toEqual(['age', 'address.city']);
    expect(result.options[1].apply).toBe('"address.city"');
    expect(result.options[0].apply).toBeUndefined();
    expect(result.from).toBe('db.users.find({ '.length);
    expect(labels('db.users.find({ name: 1, ')).toEqual(['age', 'address.city', 'name']);
  });

  test('no field completion in value position', () => {
    expect(at('db.users.find({ age: ')).toBeNull();
  });

  test('operators after $', () => {
    expect(labels('db.users.find({ age: { $g')).toEqual(['$gt', '$gte']);
    expect(labels('db.users.updateOne({}, { $')).toEqual(expect.arrayContaining(['$set', '$unset', '$inc']));
    expect(labels('db.users.find({ $')).toEqual(expect.arrayContaining(['$and', '$or', '$nor']));
  });

  test('aggregate stage keys at the stage level only', () => {
    expect(labels('db.users.aggregate([{ $')).toEqual(
      expect.arrayContaining(['$match', '$group', '$lookup', '$facet']),
    );
    expect(labels('db.users.aggregate([{ $')).not.toContain('$gt');
    expect(labels('db.users.aggregate([{ $match: { age: { $g')).toEqual(['$gt', '$gte']);
    expect(labels('db.users.aggregate([{ $group: { _id: "$a", n: { $s')).toContain('$sum');
  });

  test('statement keywords', () => {
    expect(labels('us')).toEqual(['use']);
    expect(labels('sh')).toEqual(['show dbs', 'show collections']);
    expect(at('select')).toBeNull();
  });

  test('only the current statement counts', () => {
    expect(labels('use shop;\ndb.us')).toEqual(['users']);
    expect(labels('db.users.aggregate([{}])\ndb.users.')).toContain('find');
  });

  test('nothing inside strings or comments', () => {
    expect(at('db.users.find({ name: "db.')).toBeNull();
    expect(at('// db.')).toBeNull();
  });

  test('works from the middle of the text', () => {
    const text = 'db.us\ndb.orders.find()';
    const result = shellCompletions(text, 5, ctx)!;
    expect(result.options.map((o) => o.label)).toEqual(['users']);
  });
});

describe('shellCollectionAt', () => {
  test('names the collection the statement at the caret works on', () => {
    expect(shellCollectionAt('db.users.find({ a', 17)).toBe('users');
    expect(shellCollectionAt('db.getCollection("a b").find({', 30)).toBe('a b');
    expect(shellCollectionAt('db["x"].aggregate([{', 20)).toBe('x');
    expect(shellCollectionAt('use shop', 8)).toBeNull();
  });
});
