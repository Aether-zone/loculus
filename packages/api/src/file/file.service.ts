import { Injectable } from '@nestjs/common';

import { ObjectRegistry } from '../objects/object-registry.service';
import type { StoredObject } from '../objects/stored-object.entity';
import type { FileDTO } from './file.dto';

/**
 * Listing the objects filed for an organization.
 *
 * **From the registry, not from the bucket.** Two reasons, and the first is
 * decisive: a key is `{requestor}/{organizationId}/{name}`, so an S3 prefix can
 * only ever answer "this requestor, this organization" — there is no wildcard
 * for a leading segment, and the console asks about an organization across all
 * of them. The row carries the organization as a column and can be queried
 * directly.
 *
 * The second is that the row holds what a listing is actually for: the name the
 * uploader declared, the content type, and whether the bytes have been seen.
 * `ListObjectsV2` knows a key, a size and an etag, and the name would have to be
 * reconstructed out of the key.
 *
 * The cost is that an object placed in the bucket out of band — by hand, or by
 * something that did not presign through loculus — has no row and does not
 * appear here. That is consistent with the rest of the service: the row is what
 * makes an object belong to somebody, and without one there is nobody to list
 * it for.
 */
@Injectable()
export class FileService {
  constructor(private readonly registry: ObjectRegistry) {}

  async getFiles(organizationId: string): Promise<FileDTO[]> {
    const objects = await this.registry.byOrganization(organizationId);

    return objects.map(toFile);
  }
}

function toFile(object: StoredObject): FileDTO {
  return {
    objectKey: object.objectKey,
    name: object.name,
    contentType: object.contentType,
    size: object.size,
    /*
     * From the row, not parsed back out of the key. They agree — the key's
     * first segment is built from this — but the column is the one loculus
     * enforces ownership against, and a legacy key has no segment to read.
     */
    requestor: object.ownerClientId,
    uploadedAt: object.uploadedAt?.toISOString() ?? null,
    createdAt: object.createdAt.toISOString(),
    confirmed: object.state === 'UPLOADED',
  };
}
