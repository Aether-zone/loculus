import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { ObjectAnnouncer } from '../objects/object.announcer';
import {
  ObjectRegistry,
  type ObjectCaller,
} from '../objects/object-registry.service';
import { isObjectKey, objectKeyFor } from './object-key';
import {
  PRESIGN_CONFIG,
  S3_CLIENT,
  type PresignConfig,
} from './presign.config';
import type {
  CreatePresignedUploadDTO,
  PresignedDownloadDTO,
  PresignedUploadDTO,
} from './presign.dto';

/**
 * Who is asking, taken from the verified token.
 *
 * Extends {@link ObjectCaller} rather than restating it, so that what the
 * registry authorizes on and what a handler is given cannot fall out of step.
 */
export interface ObjectOwner extends ObjectCaller {
  /** The token's `sub`. Provenance only. */
  subject: string | null;
}

/**
 * Hands out URLs that let a client talk to the object store directly.
 *
 * Nothing here touches the bytes: an upload goes from the browser to S3 and a
 * download comes back the same way, so this service stays a small JSON API
 * whatever the file size. The cost is that every rule about an object has to be
 * expressed in the signature, because there is no request to inspect later.
 */
@Injectable()
export class PresignService {
  private readonly logger = new Logger(PresignService.name);

  constructor(
    @Inject(S3_CLIENT) private readonly client: S3Client,
    @Inject(PRESIGN_CONFIG) private readonly config: PresignConfig,
    private readonly announcer: ObjectAnnouncer,
    private readonly registry: ObjectRegistry,
  ) {}

  /**
   * A URL the client may PUT one file to.
   *
   * `ContentType` and `ContentLength` are part of the signed request, so the
   * client has to send exactly what it declared — a URL issued for a 2 MB
   * image cannot be spent on a 2 GB one. That is the only place the declared
   * `size` can be enforced: once the URL is out, the upload never comes past
   * this service again.
   */
  async createUpload(
    request: CreatePresignedUploadDTO,
    owner: ObjectOwner,
  ): Promise<PresignedUploadDTO> {
    /*
     * The requestor is the token's client, never the body's.
     *
     * It is the first segment of the key, so it is a namespace: a caller free
     * to name another system's would be writing into it. A stated one is
     * checked rather than ignored — silently filing an object somewhere other
     * than where the caller was told is worse than refusing.
     */
    if (request.requestor && request.requestor !== owner.clientId) {
      throw new ForbiddenException(
        `This token belongs to "${owner.clientId}", not "${request.requestor}".`,
      );
    }

    const objectKey = objectKeyFor({
      requestor: owner.clientId,
      organizationId: request.organizationId,
      fileName: request.fileName,
    });

    const uploadUrl = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: objectKey,
        ContentType: request.contentType,
        ContentLength: request.size,
      }),
      {
        expiresIn: this.config.uploadExpiresIn,
        /*
         * Named explicitly because the presigner signs neither by default: it
         * drops `Content-Type` entirely, so a URL issued for a text file would
         * happily take an executable, and the declared `size` would be a
         * comment rather than a limit.
         */
        signableHeaders: new Set(['content-type', 'content-length']),
      },
    );

    const expiresAt = this.expiryFor(this.config.uploadExpiresIn);

    /*
     * The row before the URL is returned. It is what makes the object belong
     * to somebody: without it the key is a bearer token in all but name, and
     * keys are not secret — they reach browsers, other services' databases and
     * the events on the bus.
     */
    await this.registry.record({
      objectKey,
      ownerClientId: owner.clientId,
      createdBy: owner.subject,
      organizationId: request.organizationId ?? null,
      name: request.fileName,
      contentType: request.contentType,
      size: request.size,
      uploadExpiresAt: expiresAt,
    });

    return { objectKey, uploadUrl, expiresAt };
  }

  /**
   * A URL the client may GET the object from.
   *
   * The object is checked to exist first. Signing is local arithmetic and would
   * happily produce a URL for a key that was never uploaded — which fails at
   * download time, somewhere the caller has no context to make sense of it.
   */
  async createDownload(
    objectKey: string,
    owner: ObjectOwner,
  ): Promise<PresignedDownloadDTO> {
    /*
     * Readable, not owned. This is the one route a service holding
     * `objects:read:any` reaches an object it did not store — which is what
     * lets mneme index a document aether's browser uploaded. Deletion below
     * still asks for ownership.
     */
    const object = await this.registry.requireReadable(objectKey, owner);

    await this.requireObject(objectKey);

    /*
     * First sighting of the bytes: the row catches up, and — this is the part
     * that used to be missing — the workspace is told.
     *
     * The store just served a `HeadObject` for this key, which is the same
     * evidence the sweep acts on. Settling the row and announcing nothing left
     * an object `UPLOADED` that nothing downstream had ever heard of, reachable
     * only if something happened to ask again.
     */
    if (object.state === 'PENDING') {
      await this.announcer.uploaded(await this.registry.markUploaded(object));
    }

    const downloadUrl = await getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.config.bucket, Key: objectKey }),
      { expiresIn: this.config.downloadExpiresIn },
    );

    return {
      objectKey,
      downloadUrl,
      expiresAt: this.expiryFor(this.config.downloadExpiresIn),
    };
  }

  /**
   * Removes an object.
   *
   * Deliberately idempotent: S3 answers the same whether or not the key was
   * there, and a caller deleting something twice — a retry, a double-click —
   * wants the same "it is gone" both times.
   */
  async remove(objectKey: string, owner: ObjectOwner): Promise<void> {
    const object = await this.registry.require(objectKey, owner);

    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.config.bucket,
        Key: object.objectKey,
      }),
    );

    // The row after the bytes: a row outliving its object is a sweep's
    // problem, where an object outliving its row is nobody's.
    await this.registry.forget(object);

    /*
     * After the delete, and never in place of it: the object is already gone by
     * the time this runs, and a caller must not be told the deletion failed
     * because a broker was unreachable. The announcer swallows and logs for
     * that reason — and because the delete is idempotent, repeating the request
     * is a safe way to try again.
     */
    await this.announcer.removed(object);
  }

  private async requireObject(objectKey: string): Promise<void> {
    this.requireKeyShape(objectKey);

    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.config.bucket, Key: objectKey }),
      );
    } catch (cause) {
      if (isNotFound(cause)) {
        throw new NotFoundException(`No object with key "${objectKey}".`);
      }

      throw cause;
    }
  }

  /**
   * A malformed key is a 404 rather than a 400, so that probing for one tells
   * an outsider nothing an ordinary miss would not.
   */
  private requireKeyShape(objectKey: string): void {
    if (!isObjectKey(objectKey)) {
      throw new NotFoundException(`No object with key "${objectKey}".`);
    }
  }

  private expiryFor(seconds: number): Date {
    return new Date(Date.now() + seconds * 1000);
  }
}

/**
 * HeadObject reports a missing key as 404 with an empty body, so there is no
 * error `Code` to match on the way `GetObject` gives one — the status is all
 * there is.
 */
function isNotFound(cause: unknown): boolean {
  const error = cause as {
    name?: string;
    $metadata?: { httpStatusCode?: number };
  };

  return (
    error?.$metadata?.httpStatusCode === 404 ||
    error?.name === 'NotFound' ||
    error?.name === 'NoSuchKey'
  );
}
