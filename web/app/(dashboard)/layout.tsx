import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { getSession } from '@/lib/auth';
import { activeOrganization, organizationsOf } from '@/lib/organizations';

import { DashboardShell } from './shell';

/**
 * The signed-in area. A route group, so /signed-out — which must not show the
 * nav — sits outside it.
 *
 * The proxy has already turned away anyone without a token cookie, so reaching
 * here without a session means the cookie was there and the refresh behind it
 * failed. Send them back through pistis rather than rendering a shell around an
 * empty page.
 *
 * The organizations are read here rather than fetched by the shell: they come
 * off the access token, which only the server can see, and passing them down
 * saves a request on every navigation.
 */
export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getSession();

  if (!session) {
    redirect('/api/auth/login');
  }

  return (
    <DashboardShell
      user={session.user}
      clientId={session.clientId}
      organizations={organizationsOf(session.organizations)}
      activeOrganizationId={(await activeOrganization())?.id ?? null}
    >
      {children}
    </DashboardShell>
  );
}
