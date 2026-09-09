import { NotFoundException } from '@nestjs/common';

import {
  createS3Client,
  defaultPresignConfig,
  type PresignConfig,
} from './presign.config';
import { PresignService } from './presign.service';

const config: PresignConfig = {
  ...defaultPresignConfig,
  bucket: 'test-bucket',
  endpoint: 'http://localhost:9020',
  uploadExpiresIn: 900,
  downloadExpiresIn: 300,
};

const owner = { clientId: 'akouo', subject: 'user-1' };

/** The row the registry hands back for a key this owner may have. */
const stored = {
  id: 'row-1',
  objectKey: 'abc-notes.txt',
  ownerClientId: 'akouo',
  state: 'UPLOADED' as const,
};

/**
 * A real client, because signing is local arithmetic and the point of these
 * tests is what ends up in the signature. Only `send` — the calls that would
 * cross the network — is stubbed.
 */
function harness(
  send: jest.Mock = jest.fn(),
  publish = jest.fn().mockResolvedValue(undefined),
  registry: Record<string, jest.Mock> = {},
) {
  // The client the application wires, not a lookalike: the options it is
  // built with are what these tests are checking.
  const client = createS3Client(config);
  client.send = send;

  const objects = {
    record: jest.fn().mockResolvedValue(stored),
    require: jest.fn().mockResolvedValue({ ...stored }),
    markUploaded: jest.fn().mockResolvedValue(undefined),
    forget: jest.fn().mockResolvedValue(undefined),
    ...registry,
  };

  return {
    service: new PresignService(
      client,
      config,
      { publish } as never,
      objects as never,
    ),
    send,
    publish,
    objects,
  };
}

const notFound = () =>
  Object.assign(new Error('NotFound'), {
    name: 'NotFound',
    $metadata: { httpStatusCode: 404 },
  });

describe('createUpload', () => {
  it('signs the declared size and content type into the URL', async () => {
    const { service } = harness();

    const result = await service.createUpload(
      {
        fileName: 'notes.txt',
        contentType: 'text/plain',
        size: 1234,
      },
      owner,
    );

    const signed = new URL(result.uploadUrl).searchParams.get(
      'X-Amz-SignedHeaders',
    );

    // This is what makes `size` a limit rather than a hint: both headers are
    // covered by the signature, so the client must send exactly what it said.
    expect(signed).toContain('content-length');
    expect(signed).toContain('content-type');
  });

  it('records the organization the caller stated', async () => {
    const { service, objects } = harness();

    await service.createUpload(
      {
        fileName: 'notes.txt',
        contentType: 'text/plain',
        size: 1234,
        organizationId: '8a5cda03-72ff-422b-a8da-d5991e10c8fa',
      },
      owner,
    );

    expect(objects.record).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: '8a5cda03-72ff-422b-a8da-d5991e10c8fa',
      }),
    );
  });

  it('records null when none was stated, rather than refusing', async () => {
    const { service, objects } = harness();

    // A service token carries no organization claim, so background work has
    // none to give. Requiring one would refuse exactly the callers loculus
    // scopes by client to accommodate.
    await service.createUpload(
      { fileName: 'notes.txt', contentType: 'text/plain', size: 1234 },
      owner,
    );

    expect(objects.record).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: null }),
    );
  });

  it('carries no checksum for the empty body it was signed against', async () => {
    const { service } = harness();

    const result = await service.createUpload(
      {
        fileName: 'notes.txt',
        contentType: 'text/plain',
        size: 1234,
      },
      owner,
    );

    // The SDK will otherwise sign in a CRC32 of the body it holds while
    // presigning — no body — and the store then rejects every real upload
    // against it. Regression guard for `requestChecksumCalculation`.
    expect(
      new URL(result.uploadUrl).searchParams.get('x-amz-checksum-crc32'),
    ).toBeNull();
  });

  it('addresses the configured bucket and the key it minted', async () => {
    const { service } = harness();

    const result = await service.createUpload(
      {
        fileName: 'notes.txt',
        contentType: 'text/plain',
        size: 1,
      },
      owner,
    );

    expect(new URL(result.uploadUrl).pathname).toBe(
      `/test-bucket/${result.objectKey}`,
    );
  });

  it('expires in line with the configured lifetime', async () => {
    const { service } = harness();
    const before = Date.now();

    const result = await service.createUpload(
      {
        fileName: 'a.bin',
        contentType: 'application/octet-stream',
        size: 1,
      },
      owner,
    );

    expect(new URL(result.uploadUrl).searchParams.get('X-Amz-Expires')).toBe(
      '900',
    );
    expect(result.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 900_000);
  });

  it('gives two uploads of the same name different keys', async () => {
    const { service } = harness();
    const upload = () =>
      service.createUpload(
        {
          fileName: 'notes.txt',
          contentType: 'text/plain',
          size: 1,
        },
        owner,
      );

    const [first, second] = await Promise.all([upload(), upload()]);

    expect(first.objectKey).not.toBe(second.objectKey);
    expect(first.objectKey.endsWith('-notes.txt')).toBe(true);
  });
});

describe('createDownload', () => {
  it('signs a GET once the object is known to exist', async () => {
    const { service, send } = harness(jest.fn().mockResolvedValue({}));

    const result = await service.createDownload('abc-notes.txt', owner);

    expect(send).toHaveBeenCalledTimes(1);
    expect(new URL(result.downloadUrl).searchParams.get('X-Amz-Expires')).toBe(
      '300',
    );
  });

  it('is a 404 when the object is not there', async () => {
    const { service } = harness(jest.fn().mockRejectedValue(notFound()));

    await expect(service.createDownload('abc-gone.txt', owner)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('lets an unexpected store failure through rather than calling it a 404', async () => {
    const denied = Object.assign(new Error('AccessDenied'), {
      name: 'AccessDenied',
      $metadata: { httpStatusCode: 403 },
    });
    const { service } = harness(jest.fn().mockRejectedValue(denied));

    await expect(
      service.createDownload('abc-notes.txt', owner),
    ).rejects.toThrow('AccessDenied');
  });

  it('refuses a key that could name a path, without asking the store', async () => {
    const { service, send } = harness();

    await expect(
      service.createDownload('../../etc/passwd', owner),
    ).rejects.toThrow(NotFoundException);
    expect(send).not.toHaveBeenCalled();
  });
});

describe('remove', () => {
  it('announces the deletion, after the object is actually gone', async () => {
    const order: string[] = [];
    const send = jest.fn(() => {
      order.push('delete');
      return Promise.resolve({});
    });
    const publish = jest.fn(() => {
      order.push('publish');
      return Promise.resolve();
    });
    const { service } = harness(send, publish);

    await service.remove('abc-notes.txt', owner);

    expect(order).toEqual(['delete', 'publish']);
    expect(publish).toHaveBeenCalledWith('object.deleted', {
      objectKey: 'abc-notes.txt',
    });
  });

  it('still deletes when the broker refuses the announcement', async () => {
    const { service } = harness(
      jest.fn().mockResolvedValue({}),
      jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    );

    // The object is already gone; a caller must not be told otherwise.
    await expect(
      service.remove('abc-notes.txt', owner),
    ).resolves.toBeUndefined();
  });

  it('announces the key and nothing else', async () => {
    // No credential travels with the event: it would be written to the
    // broker's disk and readable by anything that can read the queue.
    const { service, publish } = harness(jest.fn().mockResolvedValue({}));

    await service.remove('abc-notes.txt', owner);

    const [, event] = publish.mock.calls[0] as [string, object];

    expect(Object.keys(event)).toEqual(['objectKey']);
  });

  it('deletes the key from the configured bucket', async () => {
    const { service, send } = harness(jest.fn().mockResolvedValue({}));

    await service.remove('abc-notes.txt', owner);

    const [command] = send.mock.calls[0] as [{ input: unknown }];

    expect(command.input).toEqual({
      Bucket: 'test-bucket',
      Key: 'abc-notes.txt',
    });
  });

  it('refuses a key this owner has no row for', async () => {
    // The registry is the check now: a key nobody was given — a guess, a
    // traversal attempt, or another client's — has no row, so nothing reaches
    // the store.
    const { service, send } = harness(jest.fn(), jest.fn(), {
      require: jest
        .fn()
        .mockRejectedValue(new NotFoundException('No object with key "..".')),
    });

    await expect(service.remove('..', owner)).rejects.toThrow(
      NotFoundException,
    );
    expect(send).not.toHaveBeenCalled();
  });

  it('refuses a key belonging to another client', async () => {
    const { service, send } = harness(jest.fn(), jest.fn(), {
      require: jest.fn().mockRejectedValue(new NotFoundException()),
    });

    await expect(
      service.remove('someone-elses.txt', { clientId: 'other', subject: null }),
    ).rejects.toThrow(NotFoundException);
    expect(send).not.toHaveBeenCalled();
  });
});
