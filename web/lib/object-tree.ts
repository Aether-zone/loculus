import type { StoredFile } from './files';

/**
 * The organization's objects, arranged the way their keys already are.
 *
 * A key is `{requestor}/{organizationId}/{name}`, so the tree is not a
 * structure invented for the UI — it is the path the object is genuinely
 * filed under in the bucket. Reading the tree and listing the bucket give the
 * same shape, which is the point of having put the prefix there.
 */

/** The organization segment loculus writes when a caller stated none. */
export const NO_ORGANIZATION = '_';

/**
 * Where a key with no prefix is shown.
 *
 * Objects minted before the prefix existed are a single segment and belong
 * under nothing. They are still perfectly valid keys, so they get a group of
 * their own rather than being hidden or guessed at.
 */
export const UNPREFIXED = '(no prefix)';

export interface ObjectTreeFile {
  /** The full key. Unique, and what every action names. */
  objectKey: string;
  /** The last segment — the uuid-prefixed filename. */
  segment: string;
  file: StoredFile;
}

export interface ObjectTreeOrganization {
  /** The organization id, `_` for none, or {@link UNPREFIXED}. */
  id: string;
  /** Node id for the tree, unique across requestors. */
  value: string;
  files: ObjectTreeFile[];
}

export interface ObjectTreeRequestor {
  /** The OAuth client that filed these — `loculus`, `akouo`. */
  id: string;
  value: string;
  organizations: ObjectTreeOrganization[];
}

/** Splits a key into the parts the tree groups on. */
export function partsOf(objectKey: string): {
  requestor: string;
  organizationId: string;
  segment: string;
} {
  const segments = objectKey.split('/');

  if (segments.length === 3) {
    return {
      requestor: segments[0],
      organizationId: segments[1],
      segment: segments[2],
    };
  }

  // A single-segment key, or anything else unexpected: shown whole, under the
  // group for keys that carry no prefix.
  return {
    requestor: UNPREFIXED,
    organizationId: UNPREFIXED,
    segment: objectKey,
  };
}

/**
 * Groups the listing into requestor → organization → files.
 *
 * Sorted throughout, and by name rather than by key: the uuid leading each
 * filename would otherwise scatter two uploads of the same file. The unprefixed
 * group sorts last, because it is a remnant rather than a peer.
 */
export function buildObjectTree(files: StoredFile[]): ObjectTreeRequestor[] {
  const requestors = new Map<string, Map<string, ObjectTreeFile[]>>();

  for (const file of files) {
    const { requestor, organizationId, segment } = partsOf(file.objectKey);

    const organizations =
      requestors.get(requestor) ?? new Map<string, ObjectTreeFile[]>();
    const siblings = organizations.get(organizationId) ?? [];

    siblings.push({ objectKey: file.objectKey, segment, file });
    organizations.set(organizationId, siblings);
    requestors.set(requestor, organizations);
  }

  const byId = (a: { id: string }, b: { id: string }) =>
    a.id === UNPREFIXED ? 1 : b.id === UNPREFIXED ? -1 : a.id.localeCompare(b.id);

  return [...requestors.entries()]
    .map(([requestor, organizations]) => ({
      id: requestor,
      value: `requestor:${requestor}`,
      organizations: [...organizations.entries()]
        .map(([organizationId, group]) => ({
          id: organizationId,
          value: `organization:${requestor}/${organizationId}`,
          files: [...group].sort((a, b) =>
            a.file.name.localeCompare(b.file.name),
          ),
        }))
        .sort(byId),
    }))
    .sort(byId);
}

/** Every branch id, for expanding the tree to its leaves by default. */
export function allBranchValues(tree: ObjectTreeRequestor[]): string[] {
  return tree.flatMap((requestor) => [
    requestor.value,
    ...requestor.organizations.map((organization) => organization.value),
  ]);
}

/**
 * How an organization segment reads.
 *
 * `_` is loculus's stand-in for "the caller stated none", which is a real
 * answer — background work has no organization — and worth saying in words
 * rather than showing the underscore.
 */
export function organizationLabel(id: string): string {
  if (id === NO_ORGANIZATION) {
    return 'No organization';
  }

  return id === UNPREFIXED ? UNPREFIXED : id;
}
