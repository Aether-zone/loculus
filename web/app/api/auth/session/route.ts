import { createSessionRoute } from '@aether-zone/daimon';

import { auth } from '@/lib/auth';
import { activeOrganization, organizationsOf } from '@/lib/organizations';

/**
 * Who is signed in, for client components. Never the access token — that stays
 * in an httpOnly cookie the browser cannot read.
 *
 * `clientId` is the one that decides what this console can see: objects belong
 * to the OAuth client that presigned them. The organizations are alongside it
 * for the switcher's sake, and scope nothing.
 */
export const GET = createSessionRoute(auth.getSession, async (session) => ({
  user: session?.user ?? null,
  clientId: session?.clientId ?? null,
  organizations: organizationsOf(session?.organizations),
  activeOrganization: (await activeOrganization())?.id ?? null,
}));
