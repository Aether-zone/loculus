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
 * Published by the sweep rather than at the moment of upload, because there is
 * no such moment here to observe: the client PUTs to the store directly. So it
 * is late by design — up to one sweep after the upload URL expired — and says
 * *that the object exists*, not that it has just been written.
 */
export interface ObjectUploadedEvent {
  objectKey: string;
  name: string;
  contentType: string;
  size: number;
}
