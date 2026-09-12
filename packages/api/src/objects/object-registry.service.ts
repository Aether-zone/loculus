import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { LessThan, Repository } from 'typeorm';

import { STORED_OBJECT_REPOSITORY } from './database.providers';
import { StoredObject } from './stored-object.entity';

/**
 * The scope that lets a caller read an object it does not own.
 *
 * For a service that has to read what other services stored: mneme indexes
 * uploaded documents, and it presigned none of them — every object it is told
 * about belongs to whichever client handed out the upload URL. Without this it
 * could only ever read its own uploads, and it makes none.
 *
 * **Read, and only read.** It does not widen `require`, so it grants no
 * deletion and no claim of ownership over anything: a holder can see bytes it
 * did not store and can do nothing else with them. That asymmetry is the point
 * — a reader is a far smaller thing to grant than an owner, and the two were
 * one check before this existed.
 *
 * Granted in pistis, on the client's registration, and carried in the token's
 * `scope` claim. So *which* services may read is a question answered in one
 * place by somebody administering clients, rather than in loculus's
 * configuration or in a list compiled here.
 */
export const READ_ANY_OBJECT = 'objects:read:any';

/**
 * A caller, as far as the checks here are concerned.
 *
 * Both fields come from the verified token and neither from the request. The
 * whole point of the ownership check is that a caller cannot name an owner, and
 * the same goes for naming its own scopes.
 */
export interface ObjectCaller {
  /** The token's `client_id` — the boundary an object belongs to. */
  clientId: string;
  /** Granted scopes, already split out of the `scope` claim. */
  scopes: string[];
}

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
   * The object, if this caller owns it.
   *
   * A key belonging to someone else is a 404 rather than a 403, and so is one
   * that never existed. Telling them apart would answer "does this key exist"
   * for anyone willing to ask, which is the question the whole check is there
   * to refuse.
   *
   * Ownership and nothing else — {@link READ_ANY_OBJECT} does not open this
   * door. Use it for anything that changes an object; {@link requireReadable}
   * is for reading one.
   */
  async require(
    objectKey: string,
    caller: ObjectCaller,
  ): Promise<StoredObject> {
    const object = await this.findByKey(objectKey);

    if (!object || object.ownerClientId !== caller.clientId) {
      throw new NotFoundException(`No object with key "${objectKey}".`);
    }

    return object;
  }

  /**
   * The object, if this caller may *read* it.
   *
   * Its owner, or a service holding {@link READ_ANY_OBJECT}. Still a 404 when
   * neither, for the same reason as above: a refusal that could be told apart
   * from absence would confirm a key to anyone who asked, and a reader scope
   * makes that question no less worth refusing.
   */
  async requireReadable(
    objectKey: string,
    caller: ObjectCaller,
  ): Promise<StoredObject> {
    const object = await this.findByKey(objectKey);

    if (!object || !mayRead(object, caller)) {
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

  /**
   * The object, without asking who wants it.
   *
   * For the store talking about its own bucket: a notification has no caller
   * and no token behind it, so there is no client to narrow by. Every caller
   * that *does* have one must go through {@link require} instead — this one
   * will hand back anybody's row.
   *
   * A key the store knows and this service does not is a `null` rather than a
   * throw. It is an ordinary thing on a shared bucket, and the caller's answer
   * to it is to do nothing.
   */
  findByKey(objectKey: string): Promise<StoredObject | null> {
    return this.objects.findOneBy({ objectKey });
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

/**
 * Whether a caller may read an object.
 *
 * Owner first, because it is the ordinary case and costs nothing — a service
 * reading back what it stored never depends on holding the scope.
 */
const mayRead = (object: StoredObject, caller: ObjectCaller): boolean =>
  object.ownerClientId === caller.clientId ||
  caller.scopes.includes(READ_ANY_OBJECT);
