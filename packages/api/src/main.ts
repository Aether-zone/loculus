import { ENV, JsonLogger } from '@aether-zone/organon';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import type { Env } from './env';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    /*
     * Note this is CORS for *this* api, which lets a browser call
     * `/objects/presign` directly. It is not what makes a direct upload work:
     * the browser PUTs to the object store, not here, so the store's own
     * bucket CORS policy is what that needs — allowing PUT from the calling
     * origin, with `Content-Type` and `Content-Length` among its allowed
     * headers, since loculus signs both into the URL.
     */
    cors: true,
    // The application logger has to exist before the app does, so it is built
    // here rather than by a module; the module gets the same options.
    logger: new JsonLogger({
      level: process.env.LOG_LEVEL as never,
      base: { service: 'loculus' },
    }),
  });

  // The validated environment, so `PORT` is a number and not a string that
  // happens to look like one.
  const env = app.get<Env>(ENV);

  await app.listen(env.PORT);
}

void bootstrap();
