import 'server-only';

import { createAuth } from '@aether-zone/daimon';

/**
 * loculus as an OAuth client of pistis. Configured once here; everything
 * downstream takes the session and the route handlers from this object rather
 * than reading the environment again.
 *
 * One thing is loculus-specific and worth knowing before changing the client
 * id: **an object belongs to the OAuth client that presigned it**, not to the
 * person. So everything uploaded through this console is owned by whatever
 * `OAUTH_CLIENT_ID` is set to, and objects akouo uploaded under its own client
 * are invisible here — by design, not by omission.
 */
export const auth = createAuth({
  cookiePrefix: 'loculus',
  clientId: 'loculus',
  redirectUri: 'http://localhost:3112/api/auth/callback',
  // `organizations` is what puts the `orgs` claim on the token, which the
  // sidebar's switcher reads. The client is already registered for it in
  // pistis; it simply was not asked for before.
  scopes: 'profile email organizations',
});

export const getSession = auth.getSession;
