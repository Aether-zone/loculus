import { ObjectSweeper } from './object-sweeper.service';
import { defaultPresignConfig } from './presign.config';
import { OBJECT_UPLOADED } from './presign.events';

const pending = (objectKey: string) => ({
  id: `row-${objectKey}`,
  objectKey,
  name: `${objectKey}.txt`,
  contentType: 'text/plain',
  size: 10,
  state: 'PENDING' as const,
});

const notFound = () =>
  Object.assign(new Error('NotFound'), {
    name: 'NotFound',
    $metadata: { httpStatusCode: 404 },
  });

function harness(expired: ReturnType<typeof pending>[], send: jest.Mock) {
  const registry = {
    expiredPending: jest.fn().mockResolvedValue(expired),
    markUploaded: jest.fn().mockResolvedValue(undefined),
    forget: jest.fn().mockResolvedValue(undefined),
  };
  const publish = jest.fn().mockResolvedValue(undefined);

  const sweeper = new ObjectSweeper(
    { send } as never,
    defaultPresignConfig,
    registry as never,
    { publish } as never,
  );

  return { sweeper, registry, publish };
}

describe('sweep', () => {
  it('marks an object that did arrive, and announces it', async () => {
    const { sweeper, registry, publish } = harness(
      [pending('arrived')],
      jest.fn().mockResolvedValue({}),
    );

    await sweeper.sweep();

    expect(registry.markUploaded).toHaveBeenCalled();
    expect(registry.forget).not.toHaveBeenCalled();
    const [routingKey, event] = publish.mock.calls[0] as [
      string,
      { objectKey: string },
    ];

    expect(routingKey).toBe(OBJECT_UPLOADED);
    expect(event).toMatchObject({ objectKey: 'arrived' });
  });

  it('drops a row whose object never arrived, and says nothing', async () => {
    const { sweeper, registry, publish } = harness(
      [pending('abandoned')],
      jest.fn().mockRejectedValue(notFound()),
    );

    await sweeper.sweep();

    expect(registry.forget).toHaveBeenCalled();
    expect(registry.markUploaded).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it('leaves a row alone when the store cannot answer', async () => {
    // A store that is unwell is not an abandoned upload. Deciding it was would
    // delete a row whose object is sitting there, and the bytes with it.
    const denied = Object.assign(new Error('AccessDenied'), {
      name: 'AccessDenied',
      $metadata: { httpStatusCode: 403 },
    });
    const { sweeper, registry } = harness(
      [pending('unknown')],
      jest.fn().mockRejectedValue(denied),
    );

    await expect(sweeper.sweep()).rejects.toThrow('AccessDenied');
    expect(registry.forget).not.toHaveBeenCalled();
    expect(registry.markUploaded).not.toHaveBeenCalled();
  });

  it('does nothing when there is nothing expired', async () => {
    const send = jest.fn();
    const { sweeper } = harness([], send);

    await sweeper.sweep();

    expect(send).not.toHaveBeenCalled();
  });

  it('still settles the row when the announcement fails', async () => {
    const { sweeper, registry, publish } = harness(
      [pending('arrived')],
      jest.fn().mockResolvedValue({}),
    );
    publish.mockRejectedValue(new Error('ECONNREFUSED'));

    await sweeper.sweep();

    // The object is there whether or not anyone was told.
    expect(registry.markUploaded).toHaveBeenCalled();
  });
});
