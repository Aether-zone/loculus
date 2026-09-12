/**
 * Routing keys loculus publishes under.
 *
 * Named rather than written at each call site: a publisher and a subscriber
 * that disagree fail silently — the message reaches the exchange, matches no
 * binding, and is dropped. Nothing errors and nothing arrives.
 */
export const OBJECT_DELETED = 'object.deleted';
export const OBJECT_UPLOADED = 'object.uploaded';

/**
 * The same two moments, described as a *resource* rather than as a thing that
 * happened.
 *
 * Two pairs of keys because there are two audiences, and one message cannot
 * serve both. `object.uploaded` above is a **trigger**: it carries the few
 * fields a service needs to decide whether to act, and aether, akouo and mneme
 * each match it against a row of their own. These carry an `AetherEvent` whose
 * payload is a JSON-LD document — a *description*, for the consumers bound to
 * `#` that build a picture of the workspace out of whatever anybody announces.
 *
 * A third segment rather than reusing `object.created`/`object.deleted`,
 * because one routing key must mean one payload shape. A consumer parsing the
 * trigger would otherwise get an envelope it cannot read, and the failure would
 * be a validation error a long way from the cause.
 */
export const OBJECT_RESOURCE_CREATED = 'object.resource.created';
export const OBJECT_RESOURCE_DELETED = 'object.resource.deleted';

/**
 * An object is gone.
 *
 * The one lifecycle moment loculus actually observes. It never sees an upload
 * finish — the browser PUTs to the store directly, which is the point — so
 * there is no `object.uploaded` to publish without asking the store to tell us,
 * and that is a bucket-notification arrangement rather than something this
 * service can know.
 *
 * Worth publishing because a deletion is the one thing that invalidates
 * somebody else's row: whoever recorded this key now points at nothing, and
 * would otherwise find out when a person clicked play.
 */
export interface ObjectDeletedEvent {
  objectKey: string;
}

/**
 * The bytes arrived.
 *
 * loculus never sees the upload itself — the client PUTs to the store directly
 * — so this is published from whichever of two places notices first:
 *
 * - the store's own bucket notification, moments after the write, which is the
 *   ordinary path; or
 * - the sweep, if that notification never came, up to one sweep after the
 *   upload URL expired.
 *
 * Either way it says *that the object exists*, not that it has just been
 * written, and it is published exactly once for an object: whoever gets there
 * first moves the row out of `PENDING`, and the other finds nothing to do.
 */
export interface ObjectUploadedEvent {
  objectKey: string;
  name: string;
  contentType: string;
  size: number;
  /**
   * The organization the object was filed under, as the uploader declared it.
   *
   * Carried because a consumer usually cannot act without it — mneme files
   * every chunk under a tenant and would have to guess otherwise, and a guessed
   * tenant is one organization's document answering another's searches. It is
   * *provenance*, exactly as on the row: loculus never checked it, and a
   * consumer must not read it as permission to do anything.
   *
   * `null` for a service upload, which carries no organization claim to state,
   * and for a key minted before the column existed. A consumer that needs one
   * should drop the event rather than invent a default.
   */
  organizationId: string | null;
}

/**
 * The event for an object, from its row.
 *
 * Here rather than at each of the two call sites so that a field added to the
 * event cannot reach one publisher and not the other — a consumer would see the
 * same object described two ways depending on which noticed it.
 */
export const uploadedEventFor = (object: {
  objectKey: string;
  name: string;
  contentType: string;
  size: number;
  organizationId: string | null;
}): ObjectUploadedEvent => ({
  objectKey: object.objectKey,
  name: object.name,
  contentType: object.contentType,
  size: object.size,
  organizationId: object.organizationId,
});
