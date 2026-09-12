import type { EventPublisher } from '@aether-zone/organon';
import { DataSource } from 'typeorm';

import {
  OBJECT_RESOURCE_CREATED,
  OBJECT_UPLOADED,
} from '../presign/presign.events';
import { ObjectAnnouncer } from './object.announcer';
import { ObjectListener } from './object.listener';
import { ObjectRegistry } from './object-registry.service';
import { StoredObject } from './stored-object.entity';

/**
 * The notification as MinIO actually sends it, trimmed to the fields anything
 * reads. Copied from a real delivery rather than written from the docs: the
 * percent-encoded key is the part every bug here has been about.
 */
const notification = (key: string, eventName = 's3:ObjectCreated:Put') => ({
  EventName: eventName,
  Key: `loculus-objects/${key}`,
  Records: [
    {
      eventName,
      eventTime: '2026-09-12T06:24:19.011Z',
      s3: {
        bucket: { name: 'loculus-objects' },
        object: {
          key: encodeURIComponent(key),
          size: 7127,
          eTag: '9a379066591aa51be4a698c47ef2aed4',
          contentType: 'text/markdown',
        },
      },
    },
  ],
});

const KEY = 'loculus/7ebff821-9c27-400c-90a0-1ac31e52b177/a24b27c8-README.md';

/**
 * Against a real sqlite-backed registry, because what is interesting is whether
 * the row actually moved — a stubbed repository would report whatever it was
 * told, including for the key it was never asked about.
 */
describe('ObjectListener', () => {
  let dataSource: DataSource;
  let registry: ObjectRegistry;
  let events: { publish: jest.Mock };
  let listener: ObjectListener;

  const record = (over: Partial<StoredObject> = {}) =>
    registry.record({
      objectKey: KEY,
      ownerClientId: 'loculus',
      createdBy: 'user-1',
      organizationId: '7ebff821-9c27-400c-90a0-1ac31e52b177',
      name: 'README.md',
      contentType: 'text/markdown',
      size: 7127,
      uploadExpiresAt: new Date(Date.now() + 900_000),
      ...over,
    });

  beforeEach(async () => {
    dataSource = await new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [StoredObject],
      synchronize: true,
    }).initialize();

    registry = new ObjectRegistry(dataSource.getRepository(StoredObject));
    events = { publish: jest.fn().mockResolvedValue(undefined) };
    /*
     * The real announcer over a stubbed publisher: what the listener owes the
     * workspace is the events themselves, and a stubbed announcer would assert
     * only that a method was called.
     */
    listener = new ObjectListener(
      registry,
      new ObjectAnnouncer(events as unknown as EventPublisher),
    );
  });

  afterEach(() => dataSource.destroy());

  const state = async () => (await registry.findByKey(KEY))?.state;

  /** Every event sent under one routing key, in order. */
  const sentUnder = (routingKey: string) =>
    events.publish.mock.calls
      .filter((call: unknown[]) => call[0] === routingKey)
      .map((call: unknown[]) => call[1] as Record<string, unknown>);

  it('marks the object uploaded', async () => {
    await record();

    await listener.onLoculusEvent(notification(KEY));

    const object = await registry.findByKey(KEY);

    expect(object?.state).toBe('UPLOADED');
    expect(object?.uploadedAt).toBeInstanceOf(Date);
  });

  it('announces the arrival so consumers need not poll', async () => {
    await record();

    await listener.onLoculusEvent(notification(KEY));

    expect(events.publish).toHaveBeenCalledWith(OBJECT_UPLOADED, {
      objectKey: KEY,
      name: 'README.md',
      contentType: 'text/markdown',
      size: 7127,
      // Provenance, so a consumer that files by tenant has one to file under.
      organizationId: '7ebff821-9c27-400c-90a0-1ac31e52b177',
    });
  });

  /*
   * The store makes no promise of delivering a notification once, so a second
   * one must be a no-op rather than a second `object.uploaded` — a consumer
   * treating that event as "do the work" would do it twice.
   */
  it('announces once however many times the store says so', async () => {
    await record();

    await listener.onLoculusEvent(notification(KEY));
    await listener.onLoculusEvent(notification(KEY));

    // Two events per arrival — the trigger and the resource description — but
    // one arrival however many notifications the store sends.
    expect(sentUnder(OBJECT_UPLOADED)).toHaveLength(1);
    expect(sentUnder(OBJECT_RESOURCE_CREATED)).toHaveLength(1);
    expect(await state()).toBe('UPLOADED');
  });

  /*
   * The other audience. `object.uploaded` tells a service with a row of its own
   * to act; this describes the file as a resource, for the consumers bound to
   * `#` that build a graph out of whatever is announced. The IRI is the join:
   * mneme's memory points at exactly this one.
   */
  it('describes the object as a resource anything can graph', async () => {
    await record();

    await listener.onLoculusEvent(notification(KEY));

    const [event] = sentUnder(OBJECT_RESOURCE_CREATED);

    expect(event.type).toBe('aether:ResourceCreated');
    expect(event.subject).toBe(`urn:aether:object:${KEY}`);
    expect(event.organizationId).toBe('7ebff821-9c27-400c-90a0-1ac31e52b177');
    expect(event.data).toMatchObject({
      '@id': `urn:aether:object:${KEY}`,
      '@type': 'aether:StoredObject',
      name: 'README.md',
      contentType: 'text/markdown',
      size: 7127,
    });
  });

  it('names the uploader as an actor, never as a person IRI', async () => {
    /*
     * loculus holds a pistis `sub`; the IRI a person is known by comes from
     * prosopone. Minting one from the other would put a second node in the
     * graph for a human who already has one.
     */
    await record();

    await listener.onLoculusEvent(notification(KEY));

    const [event] = sentUnder(OBJECT_RESOURCE_CREATED);

    expect(event.actor).toEqual({ id: 'user-1', type: 'User' });
    expect(JSON.stringify(event)).not.toContain('urn:aether:person');
  });

  /*
   * Two audiences, two failures. A broker that rejects one must not cost the
   * other — akouo acting on a file should not depend on arachni's picture of
   * it being serialisable.
   */
  it('still sends the description when the trigger cannot be published', async () => {
    await record();
    events.publish.mockImplementation((routingKey: string) =>
      routingKey === OBJECT_UPLOADED
        ? Promise.reject(new Error('broker is away'))
        : Promise.resolve(),
    );

    await listener.onLoculusEvent(notification(KEY));

    expect(sentUnder(OBJECT_RESOURCE_CREATED)).toHaveLength(1);
    expect(await state()).toBe('UPLOADED');
  });

  it('leaves a key it has no row for alone', async () => {
    await listener.onLoculusEvent(notification('someone-elses-file.txt'));

    expect(events.publish).not.toHaveBeenCalled();
  });

  it('does not take a removal for an arrival', async () => {
    await record();

    await listener.onLoculusEvent(notification(KEY, 's3:ObjectRemoved:Delete'));

    expect(await state()).toBe('PENDING');
    expect(events.publish).not.toHaveBeenCalled();
  });

  /*
   * The bytes are there whatever the broker thinks. Losing the state change
   * because the event could not go out would leave the row lying about an
   * object that exists, and the message would be redelivered anyway.
   */
  it('keeps the state change when the event cannot be published', async () => {
    await record();
    events.publish.mockRejectedValue(new Error('broker is away'));

    await expect(
      listener.onLoculusEvent(notification(KEY)),
    ).resolves.toBeUndefined();

    expect(await state()).toBe('UPLOADED');
  });
});
