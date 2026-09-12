import { Injectable, Logger } from '@nestjs/common';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';

import { Public } from '@aether-zone/organon';

import { createdKeys, type BucketNotification } from './bucket-notification';
import { ObjectAnnouncer } from './object.announcer';
import { ObjectRegistry } from './object-registry.service';

/**
 * The object store, telling loculus what it just did.
 *
 * This is the arrangement that closes the gap the sweep was built around: the
 * client PUTs its bytes straight to the store, so no request to this service
 * marks the upload finishing, and a row sat `PENDING` until something went and
 * looked. The bucket publishes its notifications onto the bus instead, and a
 * row moves to `UPLOADED` seconds after the write rather than minutes after the
 * URL expires.
 *
 * The sweep stays as the backstop, for the uploads this never hears about — the
 * broker was down, the notification was dropped, the bucket was reconfigured.
 * Both are idempotent and neither is anybody's only chance.
 */
@Injectable()
export class ObjectListener {
  private readonly logger = new Logger(ObjectListener.name);

  constructor(
    private readonly registry: ObjectRegistry,
    private readonly announcer: ObjectAnnouncer,
  ) {}

  /**
   * `@Public()` because `PistisAuthModule` registers its token guard as an
   * `APP_GUARD`, which Nest runs for **every** execution context — including
   * this one. There is no HTTP request behind an AMQP delivery, so the guard
   * reaches for `request.headers.authorization` on `undefined` and the message
   * fails with a TypeError rather than being handled.
   *
   * Opting out is right rather than a workaround: nothing on the bus is
   * authorized this way. An event carries the publisher's access token in its
   * own envelope, for a consumer that needs to act as that person — the broker
   * connection is the trust boundary here, not a bearer header.
   */
  @Public()
  @RabbitSubscribe({
    queue: 'loculus.files',
    routingKey: 'loculus',
  })
  async onLoculusEvent(event: BucketNotification): Promise<void> {
    for (const objectKey of createdKeys(event)) {
      await this.onCreated(objectKey);
    }
  }

  /**
   * One key the store says it has written.
   *
   * Nothing here throws. A message that is rejected is redelivered, and every
   * reason this can fail to find something — a key from before the row existed,
   * a file written into the bucket by hand, a notification arriving twice —
   * would fail the same way forever.
   */
  private async onCreated(objectKey: string): Promise<void> {
    const object = await this.registry.findByKey(objectKey);

    if (!object) {
      // Not ours to account for: something is in the bucket that loculus never
      // handed out a URL for. Worth saying once, not worth failing over.
      this.logger.warn(`No object recorded for uploaded key "${objectKey}"`);

      return;
    }

    if (object.state !== 'PENDING') {
      // Already settled — by the sweep, by a download, or by this notification
      // arriving twice, which the store makes no promise against.
      return;
    }

    const settled = await this.registry.markUploaded(object);

    this.logger.log(`"${objectKey}" uploaded`);

    await this.announcer.uploaded(settled);
  }
}
