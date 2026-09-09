import { randomUUID } from 'node:crypto';

/**
 * Keys are a path: `{requestor}/{organizationId}/{uuid}-{name}`.
 *
 * The prefix is what makes a bucket listing legible — everything akouo uploaded
 * for one tenant sits together — and it is what a bucket policy would be
 * written against if the store ever enforced anything itself.
 *
 * **Every segment is checked on the way in rather than trusted because this
 * service minted it.** Nothing stops a caller inventing a key and asking about
 * it, and a key that could describe a path is how someone reaches an object
 * they were not given. `..`, an empty segment, an extra slash and an encoded
 * slash are all refused below — a segment must begin with a letter or a digit,
 * so `..` cannot survive the first character.
 */

/** An OAuth client id, which is where the requestor comes from. */
const REQUESTOR = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/** A UUID, or {@link NO_ORGANIZATION}. */
const ORGANIZATION = /^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/;

/** The `{uuid}-{name}` tail. */
const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/;

/**
 * Stands in for the organization segment when the caller stated none.
 *
 * A service token carries no organization claim, so background work has none to
 * give, and an empty segment would make the key a different shape. Underscore
 * because an organization id is a UUID and can never collide with it.
 */
export const NO_ORGANIZATION = '_';

/** Longest slice of the original name kept in a key. */
const MAX_NAME_LENGTH = 96;

export interface ObjectKeyParts {
  /** The OAuth client the object belongs to. Never taken from a request body. */
  requestor: string;
  organizationId?: string | null;
  fileName: string;
}

/**
 * A key for a newly uploaded file: unguessable, and still readable enough that
 * a bucket listing means something.
 *
 * The UUID leads the last segment so that two uploads of `notes.txt` cannot
 * collide, and the sanitised name trails it so the extension survives — which
 * is what lets a download be served with a sensible filename later.
 */
export function objectKeyFor({
  requestor,
  organizationId,
  fileName,
}: ObjectKeyParts): string {
  const safe = sanitize(fileName);
  const tail = safe ? `${randomUUID()}-${safe}` : randomUUID();

  return [requestor, organizationId || NO_ORGANIZATION, tail].join('/');
}

/**
 * True when `key` is one this service could have minted.
 *
 * Single-segment keys are still accepted: they are what loculus minted before
 * the prefix existed, and every object stored under one is still there. A
 * caller holding an old key must keep being able to spend it.
 */
export const isObjectKey = (key: string): boolean => {
  const segments = key.split('/');

  if (segments.length === 1) {
    return NAME.test(segments[0]);
  }

  if (segments.length !== 3) {
    return false;
  }

  const [requestor, organization, name] = segments;

  return (
    REQUESTOR.test(requestor) &&
    ORGANIZATION.test(organization) &&
    NAME.test(name)
  );
};

/**
 * Reduces a filename to the characters a key segment may carry.
 *
 * Leading dots go: a name of `..` would otherwise survive as a segment that
 * reads like a parent directory, and `.hidden` is a convention that means
 * nothing to an object store. Runs of replaced characters collapse so that a
 * name of only punctuation does not become a row of dashes.
 */
function sanitize(fileName: string): string {
  return fileName
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[.-]+/, '')
    .replace(/[.-]+$/, '')
    .slice(0, MAX_NAME_LENGTH);
}
