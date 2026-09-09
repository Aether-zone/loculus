import { baseEnvSchema, booleanFromString } from '@aether-zone/organon';
import { z } from 'zod';

/**
 * The environment loculus needs, on top of the `NODE_ENV`, `PORT` and
 * `LOG_LEVEL` every service has.
 *
 * Credentials have no defaults: a store this service can reach with a
 * development password is one it can also reach in production if nobody
 * remembered to set them, and a boot failure is the louder way to find out.
 */
export const envSchema = baseEnvSchema.extend({
  S3_BUCKET: z.string().min(1).default('loculus-objects'),
  S3_REGION: z.string().min(1).default('us-east-1'),
  /**
   * The store's address **as the browser will see it**, because it is what
   * ends up inside every signed URL. An internal hostname works for this
   * service and resolves nowhere for the client that has to use the URL.
   */
  S3_ENDPOINT: z.url().optional(),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: booleanFromString.default(true),

  UPLOAD_URL_EXPIRES_IN: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60),
  DOWNLOAD_URL_EXPIRES_IN: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60),
  MAX_UPLOAD_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(5 * 1024 * 1024 * 1024),

  /** Path to the sqlite file loculus records its objects in. */
  DATABASE_PATH: z.string().min(1).default('db.sqlite'),
  /** Whether TypeORM syncs the schema on boot. Off outside development. */
  DATABASE_SYNCHRONIZE: booleanFromString.default(true),

  /*
   * RabbitMQ.
   *
   * **The broker is shared, not per-service.** Every aether-zone service
   * publishes to one exchange, which is the only arrangement in which an event
   * from one reaches a consumer in another. A broker of loculus's own would
   * route its events to nobody. In development that means the one akouo's
   * compose file runs.
   */

  /** `amqp://user:pass@host:5672`, or a vhost URL. */
  RABBITMQ_URI: z.string().min(1).default('amqp://localhost:5672'),
  /** The shared topic exchange. Must match every other service's. */
  RABBITMQ_EXCHANGE: z.string().min(1).default('aether-zone'),
  /**
   * Wait this long for the broker before finishing the boot, in milliseconds.
   * `0` starts anyway and connects in the background.
   *
   * Zero is right here: loculus's job is signing URLs, and an unreachable
   * broker should cost the events, not the service.
   */
  RABBITMQ_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(0).default(0),

  /** Public origin of pistis. Must equal the `iss` claim of its tokens exactly. */
  OAUTH_ISSUER: z.url().default('http://localhost:3001'),
  /** Defaults to the issuer, which is what pistis itself defaults `aud` to. */
  OAUTH_AUDIENCE: z.string().min(1).optional(),
  OAUTH_JWKS_URI: z.url().optional(),
});

export type Env = z.infer<typeof envSchema>;
