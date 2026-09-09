import 'server-only';

import type { OrganizationMembership } from '@aether-zone/daimon';
import { cookies } from 'next/headers';

import { getSession } from './auth';

export const ACTIVE_ORGANIZATION = 'loculus.organization';

export type Organization = OrganizationMembership & { id: string };

/**
 * The organizations this person belongs to, from the token's `orgs` claim.
 *
 * pistis is the authority and loculus asks it nothing at request time. pistis
 * re-reads the memberships on every token issue, refreshes included, so a
 * change there lands here within one refresh.
 *
 * **This does not scope anything yet.** loculus files an object under the OAuth
 * *client* that presigned it, not under an organization — a service token
 * carries no organization claim, and a store that enforced tenancy it cannot
 * see would refuse background work. So the switcher below records a preference
 * and nothing filters on it. Making it mean something is a change to the api,
 * not to this console.
 */
export function organizationsOf(
  memberships: Record<string, OrganizationMembership> | undefined,
): Organization[] {
  return Object.entries(memberships ?? {})
    .map(([id, membership]) => ({ id, ...membership }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Which organization the person is currently working in.
 *
 * The cookie is a preference, never a permission: it is validated against the
 * token's memberships on every read, and a stale or forged value falls back to
 * the first organization they really belong to.
 */
export async function activeOrganization(): Promise<Organization | null> {
  const session = await getSession();

  if (!session) {
    return null;
  }

  const organizations = organizationsOf(session.organizations);
  const [first] = organizations;

  if (!first) {
    return null;
  }

  const preferred = (await cookies()).get(ACTIVE_ORGANIZATION)?.value;

  return organizations.find((org) => org.id === preferred) ?? first;
}
