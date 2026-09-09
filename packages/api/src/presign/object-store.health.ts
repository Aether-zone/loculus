import type { HealthCheckResult, HealthIndicator } from '@aether-zone/organon';
import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { Inject, Injectable } from '@nestjs/common';

import {
  PRESIGN_CONFIG,
  S3_CLIENT,
  type PresignConfig,
} from './presign.config';

/**
 * Readiness for the one dependency loculus has.
 *
 * `HeadBucket` rather than a list or a read: it answers whether the bucket is
 * there and these credentials may reach it, which is the whole of what this
 * service needs, and it transfers no object data to find out.
 *
 * This belongs in readiness rather than liveness. A store that has gone away is
 * a reason to take this instance out of the load balancer, not a reason to
 * restart a process that is working perfectly — restarting would remove
 * capacity at exactly the moment the store comes back and the traffic arrives.
 */
/** Whatever the store said, in a form worth putting in a report. */
function describe(cause: unknown): string {
  if (cause instanceof Error) {
    return cause.message && cause.message !== 'Error'
      ? `${cause.name}: ${cause.message}`
      : cause.name;
  }

  return 'Unknown failure';
}

@Injectable()
export class ObjectStoreHealth implements HealthIndicator {
  readonly name = 'objectStore';

  constructor(
    @Inject(S3_CLIENT) private readonly client: S3Client,
    @Inject(PRESIGN_CONFIG) private readonly config: PresignConfig,
  ) {}

  async check(): Promise<HealthCheckResult> {
    const endpoint =
      this.config.endpoint ?? `s3.${this.config.region}.amazonaws.com`;

    try {
      await this.client.send(
        new HeadBucketCommand({ Bucket: this.config.bucket }),
      );

      return { status: 'up', bucket: this.config.bucket, endpoint };
    } catch (cause) {
      /*
       * The endpoint and the message, not just the error name. An
       * `S3ServiceException` reports itself as "Error" when what actually
       * happened is that the address is answering but is not an object store —
       * which is a whole afternoon if the report does not say where it looked.
       */
      return {
        status: 'down',
        bucket: this.config.bucket,
        endpoint,
        error: describe(cause),
      };
    }
  }
}
