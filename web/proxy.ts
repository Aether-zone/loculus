import { createProxy } from '@aether-zone/daimon/config';

/**
 * Sends anyone without a session to pistis to sign in.
 *
 * From daimon's server-free entry point: this runs in the proxy runtime, where
 * `server-only` throws and where a full config would demand
 * `OAUTH_CLIENT_SECRET`. Only the cookie prefix is needed to tell a signed-in
 * browser from a signed-out one — the loculus api is the authority on whether
 * the token is any good.
 *
 * Named `proxy` rather than `middleware`: Next 16 renamed the convention, and
 * the file has to sit beside `app/` to be picked up at all.
 */
export default createProxy({ cookiePrefix: 'loculus' });

/*
 * Written out rather than imported from daimon: Next parses this object
 * statically, at compile time, so it has to be a literal in this file.
 *
 * It excludes Next's own output and static assets. Without a matcher the
 * proxy runs on every request — including `_next/static` and images — and the
 * redirect above would block CSS and JS from loading.
 */
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
