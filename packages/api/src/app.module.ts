import {
  ENV,
  jwksUriFor,
  OrganonModule,
  PistisAuthModule,
  RabbitMqModule,
} from '@aether-zone/organon';
import { Module } from '@nestjs/common';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { envSchema, type Env } from './env';
import { ObjectStoreHealth, PresignModule } from './presign';
import { ObjectListener } from './objects/object.listener';
import { FileModule } from './file/file.module';

/*
 * Held in a variable and imported twice on purpose. Nest identifies a dynamic
 * module by reference, so calling `forRootAsync` again for the health module
 * would build a second one — a second S3 client, reading the same config to
 * answer the same questions.
 */
const presign = PresignModule.forRootAsync({
  inject: [ENV],
  useFactory: (env: Env) => ({
    bucket: env.S3_BUCKET,
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    uploadExpiresIn: env.UPLOAD_URL_EXPIRES_IN,
    downloadExpiresIn: env.DOWNLOAD_URL_EXPIRES_IN,
    maxUploadBytes: env.MAX_UPLOAD_BYTES,
    database: {
      database: env.DATABASE_PATH,
      synchronize: env.DATABASE_SYNCHRONIZE,
    },
  }),
});

@Module({
  imports: [
    OrganonModule.forRoot({
      config: { schema: envSchema },
      logging: { base: { service: 'loculus' } },
      health: { indicators: [ObjectStoreHealth], imports: [presign] },
    }),

    /*
     * Identity comes from pistis. loculus is a resource server: it verifies the
     * tokens akouo's api sends and issues none of its own.
     *
     * This matters more here than in a service that merely reads: an unguarded
     * `DELETE /objects/:objectKey` is a data-loss endpoint for anyone who can
     * reach the process.
     */
    /*
     * Events. The exchange is shared with every other aether-zone service, so
     * what loculus publishes is reachable by a consumer in akouo.
     */
    RabbitMqModule.registerAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        uri: env.RABBITMQ_URI,
        exchange: env.RABBITMQ_EXCHANGE,
        // 0 means "do not wait": start, and connect in the background.
        connectTimeoutMs:
          env.RABBITMQ_CONNECT_TIMEOUT_MS === 0
            ? false
            : env.RABBITMQ_CONNECT_TIMEOUT_MS,
      }),
    }),

    PistisAuthModule.registerAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        issuer: env.OAUTH_ISSUER,
        audience: env.OAUTH_AUDIENCE ?? env.OAUTH_ISSUER,
        jwksUri: env.OAUTH_JWKS_URI ?? jwksUriFor(env.OAUTH_ISSUER),
      }),
    }),

    presign,
    // Takes `ObjectRegistry` from the configured presign module.
    FileModule.register([presign]),
  ],
  controllers: [AppController],
  providers: [AppService, ObjectListener],
})
export class AppModule {}
