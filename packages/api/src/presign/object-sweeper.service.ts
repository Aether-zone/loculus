import { EventPublisher } from '@aether-zone/organon';
import { HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';

import { ObjectRegistry } from '../objects/object-registry.service';
import type { StoredObject } from '../objects/stored-object.entity';
import {
  PRESIGN_CONFIG,
  S3_CLIENT,
  type PresignConfig,
} from './presign.config';
import { OBJECT_UPLOADED, type ObjectUploadedEvent } from './presign.events';

/**
 * Settles the objects nobody came back to talk about.
 *
 * loculus hands out an upload URL and then hears nothing: the client PUTs to
 * the store directly, so there is no request that means "the upload finished".
 * A row stays `PENDING` until this looks.
 *
 * Once the URL has expired the answer is knowable and stable — nothing more can
 * be written with it — so each pending row is checked once:
 *
 * - **The object is there.** The upload worked and nobody said so. Mark it
 *   uploaded and publish `object.uploaded`, which is the only way anything
 *   downstream learns the bytes exist.
 * - **It is not.** The URL was handed out and abandoned. Drop the row, because
 *   a row pointing at nothing is what makes a listing untrustworthy.
 *
 * Deliberately without a service token of its own: it never leaves loculus.
 * Publishing needs one, so the event carries the credential the *upload* was
 * presigned with — see `accessToken` below for why that is thin.
 */
/** How often to look. Long: nothing here is urgent, and each run costs HEADs. */
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

@Injectable()
export class ObjectSweeper implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ObjectSweeper.name);
  private timer: NodeJS.Timeout | null = null;
  /** Set while a sweep runs, so a slow one is never overlapped by the next. */
  private running = false;

  constructor(
    @Inject(S3_CLIENT) private readonly client: S3Client,
    @Inject(PRESIGN_CONFIG) private readonly config: PresignConfig,
    private readonly registry: ObjectRegistry,
    private readonly events: EventPublisher,
  ) {}

  /**
   * A plain interval rather than `@nestjs/schedule`, which is ESM-only at the
   * version that supports Nest 11 and so cannot be required from this CommonJS
   * build. One timer did not seem worth changing the module format over.
   *
   * `unref` so it never holds the process open: a sweep is not a reason to
   * refuse to shut down, and the work is idempotent whenever it next runs.
   */
  onApplicationBootstrap(): void {
    this.timer = setInterval(() => {
      void this.tick();
    }, SWEEP_INTERVAL_MS);

    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Skips a beat rather than running two sweeps at once. */
  private async tick(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;

    try {
      await this.sweep();
    } catch (cause) {
      this.logger.error('Sweep failed; it will be tried again', cause);
    } finally {
      this.running = false;
    }
  }

  /**
   * One pass, in batches of a hundred.
   *
   * Bounded on purpose: a backlog is drained across several runs rather than in
   * one pass that holds a connection open and heads ten thousand objects.
   */
  async sweep(): Promise<void> {
    const pending = await this.registry.expiredPending();

    if (pending.length === 0) {
      return;
    }

    let arrived = 0;
    let abandoned = 0;

    for (const object of pending) {
      if (await this.exists(object.objectKey)) {
        await this.registry.markUploaded(object);
        await this.announceUploaded(object);
        arrived += 1;
      } else {
        await this.registry.forget(object);
        abandoned += 1;
      }
    }

    this.logger.log(
      `Swept ${pending.length} expired uploads: ${arrived} arrived, ${abandoned} abandoned`,
    );
  }

  private async exists(objectKey: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.config.bucket, Key: objectKey }),
      );

      return true;
    } catch (cause) {
      const status = (cause as { $metadata?: { httpStatusCode?: number } })
        ?.$metadata?.httpStatusCode;

      if (status === 404) {
        return false;
      }

      // A store that is unwell is not an abandoned upload. Leave the row
      // `PENDING` and let the next sweep ask again.
      this.logger.error(
        `Could not check "${objectKey}"; leaving it pending`,
        cause,
      );

      throw cause;
    }
  }

  private async announceUploaded(object: StoredObject): Promise<void> {
    const event: ObjectUploadedEvent = {
      objectKey: object.objectKey,
      name: object.name,
      contentType: object.contentType,
      size: object.size,
    };

    try {
      /*
       * Nobody asked for this: the sweep noticed the bytes, no caller is
       * waiting, and there is no subject behind it. A consumer that needs to
       * act on somebody's behalf should treat this as a notification and go and
       * ask, rather than looking for an identity in the message.
       */
      await this.events.publish(OBJECT_UPLOADED, event);
    } catch (cause) {
      this.logger.error(
        `"${object.objectKey}" arrived but "${OBJECT_UPLOADED}" could not be published`,
        cause,
      );
    }
  }
}
