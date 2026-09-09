import { Injectable, Logger } from '@nestjs/common';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';

import { Public } from '@aether-zone/organon';

@Injectable()
export class ObjectListener {
  private readonly logger = new Logger(ObjectListener.name);

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
  onLoculusEvent(event: object) {
    this.logger.log(`Received message: ${JSON.stringify(event)}`);
  }
}
