/**
 * What the object store says when something lands in the bucket.
 *
 * The store is configured to publish its notifications onto the bus, which is
 * the one thing that lets loculus know an upload finished: the client PUTs
 * straight to the store, so no request to this service marks the moment.
 *
 * Typed loosely on purpose — every field optional, nothing narrower than the
 * two this service reads. The shape is MinIO's rendering of the S3 notification
 * record, it arrives from outside this codebase, and a message that does not
 * fit should be ignored rather than throw: a rejected delivery is retried, and
 * a malformed one would be retried forever.
 */
export interface BucketNotification {
  Records?: BucketNotificationRecord[];
}

export interface BucketNotificationRecord {
  /** `s3:ObjectCreated:Put`, `s3:ObjectRemoved:Delete`, and so on. */
  eventName?: string;
  s3?: {
    bucket?: { name?: string };
    object?: { key?: string; size?: number; eTag?: string };
  };
}

/** The prefix every "the bytes are here now" event shares. */
const OBJECT_CREATED = 's3:ObjectCreated:';

/**
 * The keys this notification says were written, decoded.
 *
 * Two things need undoing. The key arrives percent-encoded — the store escapes
 * it as a query parameter, so the `/` separating a key's segments reaches us as
 * `%2F` and a space as `+` — and a single notification may carry several
 * records, because the store batches.
 *
 * Anything that is not an `ObjectCreated` is dropped here rather than at the
 * call site: the queue is bound to everything the bucket emits, so removals and
 * lifecycle events arrive on it too and mean nothing to a row moving out of
 * `PENDING`.
 */
export function createdKeys(notification: BucketNotification): string[] {
  const records = notification?.Records ?? [];

  return records
    .filter((record) => record.eventName?.startsWith(OBJECT_CREATED))
    .map((record) => decodeKey(record.s3?.object?.key))
    .filter((key): key is string => Boolean(key));
}

/**
 * `+` before percent-decoding, because the store escapes with Go's
 * `url.QueryEscape`: a space becomes `+`, and a literal `+` in a filename
 * becomes `%2B`. Undoing them in the other order would turn that `%2B` into a
 * space and quietly rename the file.
 */
function decodeKey(key: string | undefined): string | null {
  if (!key) {
    return null;
  }

  try {
    return decodeURIComponent(key.replace(/\+/g, ' '));
  } catch {
    // Not valid percent-encoding. Nothing to look up, and no retry will help.
    return null;
  }
}
