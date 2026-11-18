import { describe, expect, it } from 'bun:test';
import type { IndexDraft } from '@db/shared';
import type { DocumentCapabilities } from '@db/database';
import { indexDraftSummary, validateIndexDraft } from './indexDraft';

const ALL: DocumentCapabilities = {
  views: true,
  textIndexes: true,
  geoIndexes: true,
  hashedIndexes: true,
  ttlIndexes: true,
  hiddenIndexes: true,
  partialIndexes: true,
};

const draft = (patch: Partial<IndexDraft> = {}): IndexDraft => ({
  keys: [['email', '1']],
  unique: false,
  sparse: false,
  hidden: false,
  partialFilter: '',
  ...patch,
});

describe('validateIndexDraft', () => {
  it('accepts a plain single-key index', () => {
    expect(validateIndexDraft(draft(), ALL)).toEqual([]);
  });

  it('requires a key', () => {
    expect(validateIndexDraft(draft({ keys: [] }), ALL)).toEqual(['Add at least one key.']);
  });

  it('rejects an empty field name', () => {
    expect(validateIndexDraft(draft({ keys: [['  ', '1']] }), ALL)).toContain('Every key needs a field name.');
  });

  it('rejects a field used twice', () => {
    const errors = validateIndexDraft(
      draft({
        keys: [
          ['a', '1'],
          ['a', '-1'],
        ],
      }),
      ALL,
    );
    expect(errors).toEqual(['The field "a" is used in more than one key.']);
  });

  it('allows several text keys and text beside ascending keys', () => {
    expect(
      validateIndexDraft(
        draft({
          keys: [
            ['a', 'text'],
            ['b', 'text'],
            ['c', '1'],
          ],
        }),
        ALL,
      ),
    ).toEqual([]);
  });

  it('allows 2dsphere beside other keys', () => {
    expect(
      validateIndexDraft(
        draft({
          keys: [
            ['loc', '2dsphere'],
            ['kind', '1'],
          ],
        }),
        ALL,
      ),
    ).toEqual([]);
  });

  it('rejects hashed with any other key', () => {
    const errors = validateIndexDraft(
      draft({
        keys: [
          ['a', 'hashed'],
          ['b', '1'],
        ],
      }),
      ALL,
    );
    expect(errors).toEqual(['A hashed index can have only one key.']);
  });

  it('rejects unique with hashed', () => {
    expect(validateIndexDraft(draft({ keys: [['a', 'hashed']], unique: true }), ALL)).toEqual([
      'A hashed index cannot be unique.',
    ]);
  });

  it('requires exactly one key for TTL', () => {
    const two = draft({
      ttlSeconds: 60,
      keys: [
        ['a', '1'],
        ['b', '1'],
      ],
    });
    expect(validateIndexDraft(two, ALL)).toEqual(['A TTL index needs exactly one key.']);
  });

  it('accepts zero and whole TTL seconds, ignores no TTL', () => {
    expect(validateIndexDraft(draft({ ttlSeconds: 0 }), ALL)).toEqual([]);
    expect(validateIndexDraft(draft({ ttlSeconds: 3600 }), ALL)).toEqual([]);
    expect(validateIndexDraft(draft({ ttlSeconds: null }), ALL)).toEqual([]);
  });

  it('rejects negative, fractional and non-finite TTL', () => {
    const message = 'TTL seconds must be a whole number of 0 or more.';
    expect(validateIndexDraft(draft({ ttlSeconds: -1 }), ALL)).toEqual([message]);
    expect(validateIndexDraft(draft({ ttlSeconds: 1.5 }), ALL)).toEqual([message]);
    expect(validateIndexDraft(draft({ ttlSeconds: Number.NaN }), ALL)).toEqual([message]);
  });

  it('rejects options the engine does not support', () => {
    const none: DocumentCapabilities = {
      ...ALL,
      textIndexes: false,
      geoIndexes: false,
      hashedIndexes: false,
      ttlIndexes: false,
      hiddenIndexes: false,
      partialIndexes: false,
    };
    expect(validateIndexDraft(draft({ keys: [['a', 'text']] }), none)).toEqual([
      'Text indexes are not supported.',
    ]);
    expect(validateIndexDraft(draft({ keys: [['a', '2dsphere']] }), none)).toEqual([
      'Geospatial indexes are not supported.',
    ]);
    expect(validateIndexDraft(draft({ keys: [['a', 'hashed']] }), none)).toEqual([
      'Hashed indexes are not supported.',
    ]);
    expect(validateIndexDraft(draft({ ttlSeconds: 5 }), none)).toEqual(['TTL indexes are not supported.']);
    expect(validateIndexDraft(draft({ hidden: true }), none)).toEqual(['Hidden indexes are not supported.']);
    expect(validateIndexDraft(draft({ partialFilter: '{ a: 1 }' }), none)).toEqual([
      'Partial indexes are not supported.',
    ]);
  });
});

describe('indexDraftSummary', () => {
  it('lists keys and flags', () => {
    expect(indexDraftSummary(draft({ unique: true, partialFilter: '{ a: 1 }' }))).toBe(
      '{ email: 1 } unique, partial',
    );
  });

  it('prints direction numbers bare and types quoted', () => {
    expect(
      indexDraftSummary(
        draft({
          keys: [
            ['a', '-1'],
            ['b', 'text'],
          ],
        }),
      ),
    ).toBe('{ a: -1, b: "text" }');
  });

  it('includes sparse, hidden and TTL', () => {
    expect(indexDraftSummary(draft({ sparse: true, hidden: true, ttlSeconds: 60 }))).toBe(
      '{ email: 1 } sparse, hidden, ttl 60s',
    );
  });

  it('treats a blank partial filter as none', () => {
    expect(indexDraftSummary(draft({ partialFilter: '  ' }))).toBe('{ email: 1 }');
  });
});
