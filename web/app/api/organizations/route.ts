import { NextResponse, type NextRequest } from 'next/server';

import { getSession } from '@/lib/auth';
import { ACTIVE_ORGANIZATION } from '@/lib/organizations';

/**
 * Switches the active organization.
 *
 * Refuses one the token does not carry. The cookie is not a permission — no
 * loculus route reads it, and objects are scoped to the OAuth client either way
 * — but silently storing a membership the person does not have would make the
 * switcher lie about where they are.
 */
export async function POST(request: NextRequest) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ message: 'Not signed in.' }, { status: 401 });
  }

  const { organizationId } = (await request.json().catch(() => ({}))) as {
    organizationId?: unknown;
  };

  if (
    typeof organizationId !== 'string' ||
    !(organizationId in session.organizations)
  ) {
    return NextResponse.json(
      { message: 'You are not a member of that organization.' },
      { status: 403 },
    );
  }

  const response = NextResponse.json({ active: organizationId });

  response.cookies.set(ACTIVE_ORGANIZATION, organizationId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });

  return response;
}
