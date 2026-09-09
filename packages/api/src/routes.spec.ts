import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { EventPublisher } from '@aether-zone/organon';
import { Global, Module } from '@nestjs/common';

import { defaultPresignConfig, PresignModule } from './presign';

/*
 * `RabbitMqModule` is global, so the application resolves `EventPublisher` from
 * the root. Here there is no root — only the module under test — so this stands
 * in for it, global for the same reason and stubbed because a routing test has
 * no use for a broker connection.
 */
@Global()
@Module({
  providers: [{ provide: EventPublisher, useValue: { publish: jest.fn() } }],
  exports: [EventPublisher],
})
class StubEvents {}

describe('routes', () => {
  let app: INestApplication;

  /** `getHttpServer()` is typed `any`, which makes every assertion below unsafe. */
  const server = () => app.getHttpServer() as Parameters<typeof request>[0];

  beforeAll(async () => {
    /*
     * The presign module alone, not the whole application: these tests are
     * about routing, validation and what comes back. Booting the application
     * would drag in the environment schema and the global token guard, and a
     * failure would no longer say which of the three broke.
     *
     * That the routes *are* guarded is asserted in `auth.spec.ts`.
     */
    const moduleRef = await Test.createTestingModule({
      imports: [
        StubEvents,
        PresignModule.forRoot(
          { ...defaultPresignConfig, bucket: 'test-bucket' },
          // In memory: these tests are about routes, and a file on disk would
          // outlive them and carry state into the next run.
          { database: ':memory:', synchronize: true },
        ),
      ],
    }).compile();
    app = moduleRef.createNestApplication();

    /*
     * Stands in for `PistisJwtAuthGuard`, which is not in this module: the
     * handlers read `request.user` for the owner an object is recorded against,
     * and there is no token here to produce one.
     */
    app.use(
      (request: { user?: unknown }, _response: unknown, next: () => void) => {
        request.user = {
          id: 'user-1',
          clientId: 'akouo',
          scopes: [],
          organizations: {},
        };
        next();
      },
    );

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /objects/presign returns a key, a URL and an expiry', async () => {
    const response = await request(server())
      .post('/objects/presign')
      .send({ fileName: 'notes.txt', contentType: 'text/plain', size: 10 })
      .expect(201);

    const body = response.body as {
      objectKey: string;
      uploadUrl: string;
      expiresAt: string;
    };

    // The requestor is the stubbed principal's client, and `_` stands in for
    // the organization the request did not state.
    expect(body.objectKey).toMatch(/^akouo\/_\/[0-9a-f-]{36}-notes\.txt$/);
    expect(body.uploadUrl).toContain('X-Amz-Signature=');
    expect(new Date(body.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('POST /objects/presign rejects a bad body with a 400', async () => {
    await request(server())
      .post('/objects/presign')
      .send({ fileName: '', contentType: 'text/plain', size: 10 })
      .expect(400);
  });

  it('files the object under the organization when one is stated', async () => {
    const organizationId = '8a5cda03-72ff-422b-a8da-d5991e10c8fa';

    const response = await request(server())
      .post('/objects/presign')
      .send({
        fileName: 'notes.txt',
        contentType: 'text/plain',
        size: 10,
        organizationId,
      })
      .expect(201);

    const { objectKey } = response.body as { objectKey: string };

    expect(objectKey.startsWith(`akouo/${organizationId}/`)).toBe(true);
  });

  it('refuses a requestor the token does not back', async () => {
    // A key is a namespace; a caller free to name another system's would be
    // writing into it.
    await request(server())
      .post('/objects/presign')
      .send({
        fileName: 'notes.txt',
        contentType: 'text/plain',
        size: 10,
        requestor: 'loculus',
      })
      .expect(403);
  });

  it('GET /objects/:objectKey/presign is routed, key with slashes and all', async () => {
    // No store to reach, so this fails at HeadObject rather than at routing —
    // a 404 from the route not existing would say "Cannot GET". The key is a
    // path now, so this is also what proves the wildcard route matches one.
    const response = await request(server()).get(
      '/objects/akouo/8a5cda03-72ff-422b-a8da-d5991e10c8fa/abc-notes.txt/presign',
    );

    const { message } = response.body as { message?: string };

    expect(message ?? '').not.toContain('Cannot GET');
  });

  it('still routes a single-segment key from before the prefix existed', async () => {
    const response = await request(server()).get(
      '/objects/abc-notes.txt/presign',
    );

    const { message } = response.body as { message?: string };

    expect(message ?? '').not.toContain('Cannot GET');
  });

  it('DELETE /objects/:objectKey refuses a key that names a path', async () => {
    await request(server()).delete('/objects/..').expect(404);
  });
});
