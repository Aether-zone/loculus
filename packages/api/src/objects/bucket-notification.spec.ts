import { createdKeys } from './bucket-notification';

/** One record, shaped as the store sends it, with the parts under test open. */
const record = (over: Record<string, unknown> = {}) => ({
  eventVersion: '2.0',
  eventSource: 'minio:s3',
  eventName: 's3:ObjectCreated:Put',
  s3: {
    bucket: { name: 'loculus-objects' },
    object: {
      key: 'loculus%2F7ebff821%2Fa24b27c8-README.md',
      size: 7127,
    },
  },
  ...over,
});

describe('createdKeys', () => {
  it('decodes the escaped separators back into a key', () => {
    expect(createdKeys({ Records: [record()] })).toEqual([
      'loculus/7ebff821/a24b27c8-README.md',
    ]);
  });

  it('reads every record, because the store batches', () => {
    const keys = createdKeys({
      Records: [
        record(),
        record({
          s3: { object: { key: 'akouo%2F_%2Fb1-take.wav' } },
        }),
      ],
    });

    expect(keys).toEqual([
      'loculus/7ebff821/a24b27c8-README.md',
      'akouo/_/b1-take.wav',
    ]);
  });

  it('takes a multipart upload as an arrival too', () => {
    const keys = createdKeys({
      Records: [
        record({ eventName: 's3:ObjectCreated:CompleteMultipartUpload' }),
      ],
    });

    expect(keys).toHaveLength(1);
  });

  /*
   * The queue is bound to everything the bucket emits. A removal reaching a
   * handler that moves rows to `UPLOADED` would be the worst kind of bug, so it
   * is dropped here rather than trusted to the call site.
   */
  it('ignores anything that is not an arrival', () => {
    const keys = createdKeys({
      Records: [
        record({ eventName: 's3:ObjectRemoved:Delete' }),
        record({ eventName: 's3:ObjectAccessed:Get' }),
      ],
    });

    expect(keys).toEqual([]);
  });

  it('restores a space from the `+` the store escapes it as', () => {
    const keys = createdKeys({
      Records: [
        record({ s3: { object: { key: 'loculus%2F_%2Fb1-my+notes.txt' } } }),
      ],
    });

    expect(keys).toEqual(['loculus/_/b1-my notes.txt']);
  });

  it('keeps a literal plus in a filename', () => {
    const keys = createdKeys({
      Records: [
        record({ s3: { object: { key: 'loculus%2F_%2Fb1-c%2B%2B.md' } } }),
      ],
    });

    expect(keys).toEqual(['loculus/_/b1-c++.md']);
  });

  /*
   * Every one of these would be redelivered forever if it threw: nothing about
   * the message will be different next time.
   */
  it('survives a message that is not one of these at all', () => {
    expect(createdKeys({})).toEqual([]);
    expect(createdKeys({ Records: [] })).toEqual([]);
    expect(createdKeys({ Records: [{}] })).toEqual([]);
    expect(createdKeys({ Records: [record({ s3: {} })] })).toEqual([]);
    expect(
      createdKeys({ Records: [record({ s3: { object: { key: '%' } } })] }),
    ).toEqual([]);
  });
});
