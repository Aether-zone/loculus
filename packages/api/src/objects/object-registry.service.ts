import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { LessThan, Repository } from 'typeorm';

import { STORED_OBJECT_REPOSITORY } from './database.providers';
import { StoredObject } from './stored-object.entity';

/** What loculus records when it hands out an upload URL. */
export interface RecordUpload {
  objectKey: string;
  ownerClientId: string;
  createdBy: string | null;
  /** Provenance only; `require` does not narrow on it. See the entity. */
  organizationId: string | null;
  name: string;
  contentType: string;
  size: number;
  uploadExpiresAt: Date;
}

/**
 * The rows behind the objects, and the one authorization question loculus can
 * answer for itself: may this caller touch this object.
 *
 * The check is by `client_id`, so every token issued to a client reaches that
 * client's objects and nobody else's. Finer scoping than that — which
 * organization within a client owns a file — is deliberately not here: a
 * service token carries no organization claim, so loculus enforcing tenancy
 * would refuse background work for a tenancy it cannot see. That boundary
 * belongs to the service that has the domain model.
 */
@Injectable()
export class ObjectRegistry {
  constructor(
    @Inject(STORED_OBJECT_REPOSITORY)
    private readonly objects: Repository<StoredObject>,
  ) {}

  /** Records an object a URL has just been handed out for. */
  record(upload: RecordUpload): Promise<StoredObject> {
    return this.objects.save(
      this.objects.create({ ...upload, state: 'PENDING' }),
    );
  }

  /**
   * The object, if this caller may have it.
   *
   * A key belonging to someone else is a 404 rather than a 403, and so is one
   * that never existed. Telling them apart would answer "does this key exist"
   * for anyone willing to ask, which is the question the whole check is there
   * to refuse.
   */
  async require(objectKey: string, clientId: string): Promise<StoredObject> {
    const object = await this.objects.findOneBy({ objectKey });

    if (!object || object.ownerClientId !== clientId) {
      throw new NotFoundException(`No object with key "${objectKey}".`);
    }

    return object;
  }

  /**
   * Every object filed for one organization, newest first.
   *
   * Across requestors deliberately: a key is `{requestor}/{organizationId}/…`,
   * so an S3 prefix can only answer "this requestor, this organization" — there
   * is no wildcard for the first segment. The row carries the organization on
   * its own, which is the only way to ask the question the console asks.
   *
   * Objects with no organization are not here. That is the same answer for a
   * service upload, which has no organization to be filed under, and for a key
   * minted before the column existed.
   */
  byOrganization(organizationId: string): Promise<StoredObject[]> {
    return this.objects.find({
      where: { organizationId },
      order: { createdAt: 'DESC' },
    });
  }

  /** Marks the bytes as seen. */
  markUploaded(object: StoredObject): Promise<StoredObject> {
    object.state = 'UPLOADED';
    object.uploadedAt = new Date();

    return this.objects.save(object);
  }

  async forget(object: StoredObject): Promise<void> {
    await this.objects.delete(object.id);
  }

  /**
   * Rows whose upload URL has expired and whose bytes were never seen.
   *
   * The sweep's input. `PENDING` past its expiry means one of two things —
   * an upload that was offered and abandoned, or one that succeeded while
   * nothing was watching — and only the store can say which.
   */
  expiredPending(now: Date = new Date()): Promise<StoredObject[]> {
    return this.objects.find({
      where: { state: 'PENDING', uploadExpiresAt: LessThan(now) },
      order: { uploadExpiresAt: 'ASC' },
      take: 100,
    });
  }
}
