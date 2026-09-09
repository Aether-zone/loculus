import { isObjectKey, NO_ORGANIZATION, objectKeyFor } from './object-key';

const ORGANIZATION = '8a5cda03-72ff-422b-a8da-d5991e10c8fa';

const keyFor = (fileName: string, over: Record<string, unknown> = {}) =>
  objectKeyFor({
    requestor: 'akouo',
    organizationId: ORGANIZATION,
    fileName,
    ...over,
  });

describe('objectKeyFor', () => {
  it('files the object under the requestor and the organization', () => {
    expect(keyFor('quarterly report.pdf')).toMatch(
      new RegExp(
        `^akouo/${ORGANIZATION}/[0-9a-f-]{36}-quarterly-report\\.pdf$`,
      ),
    );
  });

  it('stands the organization in when the caller stated none', () => {
    // A service token carries no organization claim, and an empty segment would
    // make the key a different shape.
    for (const organizationId of [undefined, null, '']) {
      expect(keyFor('a.txt', { organizationId })).toMatch(
        new RegExp(`^akouo/${NO_ORGANIZATION}/[0-9a-f-]{36}-a\\.txt$`),
      );
    }
  });

  it('produces a key that passes its own check', () => {
    for (const name of [
      'a.txt',
      '../../etc/passwd',
      '..',
      '///',
      '   ',
      '🙂',
    ]) {
      expect(isObjectKey(keyFor(name))).toBe(true);
    }
  });

  it('flattens the filename, so it cannot add a segment of its own', () => {
    const key = keyFor('../../etc/passwd');

    // Exactly three: requestor, organization, name. A filename that could
    // contribute a slash would be choosing its own prefix.
    expect(key.split('/')).toHaveLength(3);
    expect(key).not.toContain('..');
  });

  it('falls back to the uuid alone when nothing survives sanitising', () => {
    expect(keyFor('///')).toMatch(
      new RegExp(`^akouo/${ORGANIZATION}/[0-9a-f-]{36}$`),
    );
  });

  it('caps a very long name', () => {
    const [, , name] = keyFor('x'.repeat(500)).split('/');

    expect(name.length).toBeLessThanOrEqual(255);
  });
});

describe('isObjectKey', () => {
  it('accepts a key of the shape this service mints', () => {
    expect(isObjectKey(`akouo/${ORGANIZATION}/3f2b-notes.txt`)).toBe(true);
  });

  it('still accepts a single-segment key', () => {
    // What loculus minted before the prefix existed. Every object stored under
    // one is still there, and a caller holding an old key must keep being able
    // to spend it.
    expect(isObjectKey('3f2b-notes.txt')).toBe(true);
  });

  it.each([
    ['../secret', 'a parent directory'],
    ['a/b', 'two segments, which is no shape this mints'],
    ['a/b/c/d', 'four segments'],
    ['akouo//3f2b-notes.txt', 'an empty organization segment'],
    ['/akouo/org/3f2b-notes.txt', 'a leading slash'],
    ['akouo/org/3f2b-notes.txt/', 'a trailing slash'],
    [`akouo/../${'x'}/notes.txt`, 'a traversal in the organization segment'],
    ['../org/notes.txt', 'a traversal in the requestor segment'],
    ['akouo/org/../notes.txt', 'a traversal in the name segment'],
    ['a%2Fb', 'an encoded slash'],
    ['.hidden', 'a leading dot'],
    ['', 'nothing at all'],
    ['a'.repeat(256), 'more than the length cap'],
  ])('refuses %p — %s', (key) => {
    expect(isObjectKey(key)).toBe(false);
  });
});
