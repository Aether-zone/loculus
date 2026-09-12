import type { JsonLdDocument } from '@aether-zone/organon';

import type { StoredObject } from './stored-object.entity';

/**
 * A stored object as the rest of aether-zone sees it.
 *
 * Not `StoredObject`. That row is loculus's own bookkeeping — an owning client
 * id, an upload expiry, a state machine nothing outside this service acts on —
 * and putting it on the bus would make every consumer depend on loculus's
 * schema. This says the few things anybody else needs in a vocabulary anything
 * can read, keyed by an IRI a graph store can relate to whatever else names the
 * same file.
 *
 * **It is deliberately a leaf.** The document has no references on it at all:
 * loculus knows what a file *is*, never what it means. Which recording it
 * belongs to is akouo's to say and which memory read it is mneme's, so both
 * edges are drawn from the other end — by a document that names this IRI. A
 * `recording` property here would be loculus guessing at a domain it has no
 * model of, and guessing wrong is what puts a second node in the graph.
 */

/** The vocabulary aether-zone publishes under. */
export const AETHER_VOCAB = 'https://aether.zone/vocab/';

/**
 * The context every stored-object document carries.
 *
 * Inline rather than a URL: a remote context has to be fetched before a
 * document can be read, which turns every consumer into an HTTP client and this
 * service into their dependency.
 *
 * Only the prefix, because every property below is a literal. A term mapping
 * matters for a property whose value is a reference — that is what decides the
 * name of the edge — and this document has none.
 */
export const STORED_OBJECT_CONTEXT = {
  aether: AETHER_VOCAB,
} as const;

export interface StoredObjectJsonLD extends JsonLdDocument {
  '@type': 'aether:StoredObject';
  '@context': typeof STORED_OBJECT_CONTEXT;

  /** The name the file was uploaded under. Display only; the key is identity. */
  name: string;
  contentType: string;
  /** Bytes, as declared when the upload URL was signed. */
  size: number;
  /** When the bytes were first seen. */
  uploadedAt?: string;
}

/**
 * The IRI a stored object is known by outside loculus.
 *
 * **Keyed by the object key, and that is the whole point.** The key is the one
 * identifier every service already holds for the same file — aether's
 * `StoredFile.key`, akouo's `StoredFile.key` and this service's `objectKey` are
 * the same string — so a document from any of them lands on one node. A row id
 * would be unique to whoever minted it, and naming the file by one would put a
 * second node in the graph beside the real one, related to nothing.
 *
 * mneme derives the same IRI independently, in its `objectUri`. The two are a
 * convention rather than a shared constant, because organon is a published
 * package and this is not vocabulary enough to release one for — but they must
 * agree, and a change to either is a change to both.
 *
 * A URN rather than a URL: it names the resource without promising that
 * anything answers if you fetch it, which is the honest claim for an id that
 * travels on a bus.
 */
export const objectIri = (objectKey: string): string =>
  `urn:aether:object:${objectKey}`;

/**
 * A row as a JSON-LD document.
 *
 * `uploadedAt` is omitted rather than sent as null while an object is still
 * `PENDING`: absent means "not stated", where null would assert that the bytes
 * arrived at no time.
 */
export function toStoredObjectDocument(
  object: StoredObject,
): StoredObjectJsonLD {
  return {
    '@context': STORED_OBJECT_CONTEXT,
    '@id': objectIri(object.objectKey),
    '@type': 'aether:StoredObject',
    name: object.name,
    contentType: object.contentType,
    size: object.size,
    ...(object.uploadedAt
      ? { uploadedAt: object.uploadedAt.toISOString() }
      : {}),
  };
}
