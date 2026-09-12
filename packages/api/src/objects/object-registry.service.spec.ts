import { NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { ObjectRegistry, READ_ANY_OBJECT } from './object-registry.service';
import { StoredObject } from './stored-object.entity';

/**
 * Against a real sqlite database rather than a stubbed repository: what is
 * under test is a *query* — that the owner clause is there and does what it
 * claims — and a mock would answer whatever it was told to.
 */
describe('ObjectRegistry', () => {
  let dataSource: DataSource;
  let registry: ObjectRegistry;

  const upload = (
    over: Partial<Parameters<ObjectRegistry['record']>[0]> = {},
  ) => ({
    objectKey: 'abc-notes.txt',
    ownerClientId: 'akouo',
    createdBy: 'user-1',
    name: 'notes.txt',
    contentType: 'text/plain',
    size: 10,
    uploadExpiresAt: new Date(Date.now() + 900_000),
    ...over,
  });

  /** A caller with no scopes: the ordinary case, owning or not owning a row. */
  const caller = (clientId: string, scopes: string[] = []) => ({
    clientId,
    scopes,
  });

  beforeEach(async () => {
    dataSource = await new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [StoredObject],
      synchronize: true,
    }).initialize();

    registry = new ObjectRegistry(dataSource.getRepository(StoredObject));
  });

  afterEach(() => dataSource.destroy());

  it('records an upload as pending', async () => {
    const row = await registry.record(upload());

    expect(row.state).toBe('PENDING');
    expect(row.uploadedAt).toBeNull();
  });

  it('gives an object back to the client that owns it', async () => {
    await registry.record(upload());

    await expect(
      registry.require('abc-notes.txt', caller('akouo')),
    ).resolves.toMatchObject({
      objectKey: 'abc-notes.txt',
    });
  });

  it('refuses it to a different client', async () => {
    await registry.record(upload());

    // This is the hole the table exists to close: before it, any valid token
    // could read or delete any object whose key it had learned.
    await expect(
      registry.require('abc-notes.txt', caller('demo-client')),
    ).rejects.toThrow(NotFoundException);
  });

  it('makes "not yours" indistinguishable from "does not exist"', async () => {
    // The same key in two worlds: one where it exists and belongs to someone
    // else, one where it was never uploaded. A caller must not be able to tell
    // which they are in, or the 404 answers "does this key exist" for anyone
    // willing to ask.
    await registry.record(upload({ objectKey: 'contested.txt' }));

    const empty = await new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [StoredObject],
      synchronize: true,
    }).initialize();
    const emptyRegistry = new ObjectRegistry(empty.getRepository(StoredObject));

    const notYours = await registry
      .require('contested.txt', caller('demo-client'))
      .catch((error: Error) => error.message);
    const notThere = await emptyRegistry
      .require('contested.txt', caller('demo-client'))
      .catch((error: Error) => error.message);

    expect(notYours).toBe(notThere);

    await empty.destroy();
  });

  it('marks an object uploaded, with the time it was seen', async () => {
    const row = await registry.record(upload());

    const marked = await registry.markUploaded(row);

    expect(marked.state).toBe('UPLOADED');
    expect(marked.uploadedAt).toBeInstanceOf(Date);
  });

  it('finds pending rows whose upload URL has expired', async () => {
    await registry.record(
      upload({
        objectKey: 'fresh',
        uploadExpiresAt: new Date(Date.now() + 900_000),
      }),
    );
    await registry.record(
      upload({
        objectKey: 'stale',
        uploadExpiresAt: new Date(Date.now() - 1_000),
      }),
    );

    const expired = await registry.expiredPending();

    expect(expired.map((row) => row.objectKey)).toEqual(['stale']);
  });

  it('does not sweep up an object that already arrived', async () => {
    const row = await registry.record(
      upload({
        objectKey: 'done',
        uploadExpiresAt: new Date(Date.now() - 1_000),
      }),
    );
    await registry.markUploaded(row);

    await expect(registry.expiredPending()).resolves.toEqual([]);
  });

  /*
   * The reader scope, and the line it deliberately does not cross: it opens
   * reading an object somebody else stored, and nothing else about it.
   */
  describe('objects:read:any', () => {
    it('lets a holder read another client’s object', async () => {
      await registry.record(upload());

      await expect(
        registry.requireReadable(
          'abc-notes.txt',
          caller('mneme', [READ_ANY_OBJECT]),
        ),
      ).resolves.toMatchObject({ objectKey: 'abc-notes.txt' });
    });

    it('still refuses a reader without it', async () => {
      await registry.record(upload());

      await expect(
        registry.requireReadable('abc-notes.txt', caller('mneme')),
      ).rejects.toThrow(NotFoundException);
    });

    it('lets an owner read without holding it', async () => {
      // The ordinary case must not come to depend on a scope nobody grants it.
      await registry.record(upload());

      await expect(
        registry.requireReadable('abc-notes.txt', caller('akouo')),
      ).resolves.toMatchObject({ objectKey: 'abc-notes.txt' });
    });

    it('does not let a holder delete, or claim, what it may read', async () => {
      /*
       * `require` is what every mutating path asks, and the scope must not
       * reach it: a reader is a far smaller thing to grant than an owner.
       */
      await registry.record(upload());

      await expect(
        registry.require('abc-notes.txt', caller('mneme', [READ_ANY_OBJECT])),
      ).rejects.toThrow(NotFoundException);
    });

    it('says the same thing about a key that does not exist', async () => {
      // A refusal that read differently from absence would confirm a key.
      await expect(
        registry.requireReadable('never-was.txt', caller('mneme')),
      ).rejects.toThrow(NotFoundException);
    });
  });

  it('forgets an object', async () => {
    const row = await registry.record(upload());

    await registry.forget(row);

    await expect(
      registry.require('abc-notes.txt', caller('akouo')),
    ).rejects.toThrow(NotFoundException);
  });
});
