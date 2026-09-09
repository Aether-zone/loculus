/* eslint-disable @typescript-eslint/no-require-imports --
   `app.module` has to be loaded after the environment is set; see below. */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

/*
 * No broker.
 *
 * This boots the whole application to assert its wiring, and that pulls in
 * organon's `RabbitMqModule`. Pointed at a broker that is not listening, its
 * connection never settles — `wait: false` stops it *waiting* for a healthy
 * connection, not opening one — and `beforeAll` hangs until Jest gives up.
 * Raising the hook timeout to 30 seconds does not help: it is stuck, not slow.
 *
 * Overriding the `AmqpConnection` provider is too late, because the module has
 * already opened a connection of its own by then. So the transport package is
 * replaced outright with an inert module.
 *
 * Nothing asserted below publishes anything, so this removes a dependency the
 * test never needed — and one CI would not have.
 */
jest.mock('@golevelup/nestjs-rabbitmq', () => {
  const actual = jest.requireActual<
    typeof import('@golevelup/nestjs-rabbitmq')
  >('@golevelup/nestjs-rabbitmq');

  /*
   * A class, not a plain object carrying a `forRootAsync`: organon's
   * `RabbitMqModule` re-exports this module itself, and Nest refuses to export
   * something that is not a module.
   */
  class RabbitMQModule {
    static forRootAsync() {
      return {
        module: RabbitMQModule,
        global: true,
        providers: [
          {
            provide: actual.AmqpConnection,
            useValue: { publish: jest.fn().mockResolvedValue(undefined) },
          },
        ],
        exports: [actual.AmqpConnection],
      };
    }
  }

  // Everything else stays real — `RabbitSubscribe` is a decorator the object
  // listener applies at class-definition time, and `AmqpConnection` is the DI
  // token organon's publisher asks for. Only the module that dials out is
  // replaced.
  return { ...actual, RabbitMQModule };
});

/**
 * The whole application, booted the way it runs — so that what is asserted is
 * the wiring itself: `PistisAuthModule` registers its guard globally, and
 * nothing in the presign controller opts out.
 *
 * An unguarded `DELETE /objects/:objectKey` is a data-loss endpoint for anyone
 * who can reach the process, which is worth a test that fails loudly if the
 * guard is ever dropped from `AppModule`.
 */
describe('authentication', () => {
  let app: INestApplication;

  /** `getHttpServer()` is typed `any`, which makes every assertion below unsafe. */
  const server = () => app.getHttpServer() as Parameters<typeof request>[0];

  beforeAll(async () => {
    // Set before the module is loaded: the environment schema is read when
    // `AppModule` is defined, and it refuses to boot without credentials.
    Object.assign(process.env, {
      S3_ACCESS_KEY_ID: 'test',
      S3_SECRET_ACCESS_KEY: 'test',
      OAUTH_ISSUER: 'http://localhost:3001',
      // In memory: this boots the whole application, and a file on disk would
      // outlive the run.
      DATABASE_PATH: ':memory:',
    });

    /*
     * `require`, not a static import: the environment above has to be in place
     * before `app.module` is evaluated, and a static import would be hoisted
     * above it. A dynamic `import()` would need Jest's ESM flag.
     */

    const { AppModule } =
      require('./app.module') as typeof import('./app.module');

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it.each([
    ['post', '/objects/presign'],
    ['get', '/objects/abc-notes.txt/presign'],
    ['delete', '/objects/abc-notes.txt'],
  ])('refuses %s %s without a token', async (method, path) => {
    await request(server())[method as 'post'](path).expect(401);
  });

  it('refuses a token it cannot verify', async () => {
    await request(server())
      .post('/objects/presign')
      .set('Authorization', 'Bearer not-a-real-token')
      .send({ fileName: 'a.txt', contentType: 'text/plain', size: 1 })
      .expect(401);
  });

  it('leaves the health probes public, so an orchestrator can reach them', async () => {
    await request(server()).get('/health/live').expect(200);
  });
});
