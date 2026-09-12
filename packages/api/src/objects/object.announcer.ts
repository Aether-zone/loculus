import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { EventPublisher, type AetherEvent } from '@aether-zone/organon';

import {
  OBJECT_DELETED,
  OBJECT_RESOURCE_CREATED,
  OBJECT_RESOURCE_DELETED,
  OBJECT_UPLOADED,
  uploadedEventFor,
  type ObjectDeletedEvent,
} from '../presign/presign.events';
import {
  objectIri,
  toStoredObjectDocument,
  type StoredObjectJsonLD,
} from './stored-object.json-ld';
import type { StoredObject } from './stored-object.entity';

/**
 * Everything loculus says about an object, said in one place.
 *
 * There were three sites that moved a row and announced it, and they had drifted
 * apart: the bucket notification and the sweep each published `object.uploaded`
 * with their own copy of the payload, and `createDownload` — which also settles
 * a `PENDING` row, on the evidence that the store served the bytes — published
 * nothing at all. So an object could reach `UPLOADED` with the workspace never
 * told. Adding a second announcement to each of those would have doubled the
 * inconsistency, which is why they now all come here.
 *
 * **Nothing here throws.** The row is the record and the events are how anybody
 * else finds out; a broker that will not take one must not undo a write that
 * already happened. Each is attempted independently for the same reason — the
 * trigger reaching akouo is not worth losing because arachni's description
 * could not be serialised.
 */
@Injectable()
export class ObjectAnnouncer {
  private readonly logger = new Logger(ObjectAnnouncer.name);

  constructor(private readonly events: EventPublisher) {}

  /**
   * The bytes are there.
   *
   * Announced twice, to two audiences: `object.uploaded` for the services
   * waiting to act on a file of their own, and `aether:ResourceCreated` for the
   * consumers building a graph out of whatever the workspace announces. See the
   * routing keys for why one message cannot do both.
   */
  async uploaded(object: StoredObject): Promise<void> {
    await this.send(OBJECT_UPLOADED, uploadedEventFor(object));
    await this.send(
      OBJECT_RESOURCE_CREATED,
      this.resourceEvent(object, 'aether:ResourceCreated'),
    );
  }

  /**
   * It is gone.
   *
   * The trigger names the key and nothing else — whoever recorded it now points
   * at nothing and would otherwise find out when somebody clicked play. The
   * Aether event is what takes the node out of the graph, along with anything
   * defined inside it.
   */
  async removed(object: StoredObject): Promise<void> {
    const deleted: ObjectDeletedEvent = { objectKey: object.objectKey };

    await this.send(OBJECT_DELETED, deleted);
    await this.send(
      OBJECT_RESOURCE_DELETED,
      this.resourceEvent(object, 'aether:ResourceDeleted'),
    );
  }

  /**
   * The envelope both Aether events share.
   *
   * `subject` is the object's IRI and, on a create, must equal the document's
   * `@id` — organon's schema refuses an event where the two disagree, because
   * they are the same fact stated twice and a consumer would file the document
   * under the wrong node.
   *
   * `actor` carries the pistis subject that presigned the upload, **not a
   * person IRI**. loculus holds a token's `sub`; the IRI a person is known by
   * comes from prosopone, and the two are ids from different services. Minting
   * `urn:aether:person:{sub}` from one would put a second node in the graph for
   * a human who already has one — the mistake akouo's `meeting.json-ld.ts`
   * records having made and undone.
   *
   * `organizationId` is provenance here as everywhere: loculus never checked
   * it, and a consumer must not read it as permission to do anything. It is
   * carried because a consumer filing by tenant has nothing else to file under,
   * and it is what arachni keys its nodes on.
   */
  private resourceEvent(
    object: StoredObject,
    type: 'aether:ResourceCreated' | 'aether:ResourceDeleted',
  ): AetherEvent<StoredObjectJsonLD> {
    const envelope = {
      id: randomUUID(),
      source: AETHER_SOURCE,
      time: new Date().toISOString(),
      subject: objectIri(object.objectKey),
      ...(object.organizationId
        ? { organizationId: object.organizationId }
        : {}),
      ...(object.createdBy
        ? { actor: { id: object.createdBy, type: 'User' } }
        : {}),
    };

    return type === 'aether:ResourceDeleted'
      ? { ...envelope, type }
      : { ...envelope, type, data: toStoredObjectDocument(object) };
  }

  private async send(routingKey: string, event: object): Promise<void> {
    try {
      await this.events.publish(routingKey, event);
    } catch (cause) {
      /*
       * The reason goes in the message, not in a trailing argument: organon
       * 0.5.0 keeps only strings there, so a cause passed as one is dropped
       * and the line says nothing about what went wrong. Fixed in 0.5.1, after
       * which passing the cause is the better form — a field an aggregator can
       * group by beats a reason spliced into prose.
       */
      const reason = cause instanceof Error ? cause.message : String(cause);

      this.logger.error(`"${routingKey}" could not be published: ${reason}`);
    }
  }
}

/**
 * What loculus puts in an event's `source`.
 *
 * An IRI rather than the bare name, because `source` identifies the producer
 * across the whole workspace and a bare word is only unique by luck.
 */
export const AETHER_SOURCE = 'https://aether.zone/loculus';
