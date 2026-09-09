import 'server-only';

import {
  createApiClient,
  type ApiFailure as DaimonApiFailure,
  type ApiResult as DaimonApiResult,
  type TargetResolver,
} from '@aether-zone/daimon';

import { getSession } from './auth';

const API_URL = process.env.LOCULUS_API_URL ?? 'http://localhost:3111';

/**
 * The loculus api, called with the session's access token.
 *
 * Every route on it is guarded — `PistisAuthModule` registers its guard
 * globally and the presign controller opts nothing out — so there is no
 * unauthenticated call to make except the health probe below, which is
 * deliberately outside the guard so an orchestrator without credentials can
 * still read it.
 *
 * There is no organization in any path, unlike akouo: loculus scopes an object
 * to the OAuth **client** that presigned it, because a service token carries no
 * organization claim and a store that enforced tenancy it cannot see would
 * refuse background work. Tenancy is the calling service's to keep.
 */

/** loculus adds no reasons of its own, so the base four are the whole set. */
export type ApiFailure = DaimonApiFailure;
export type ApiResult<T> = DaimonApiResult<T>;

/*
 * Typed as `TargetResolver` rather than left to inference: without the
 * annotation TypeScript reads `reason: 'unauthenticated'` as an *extra* reason
 * this client can produce, and every caller then has to handle a union wider
 * than the base four.
 */
const resolve: TargetResolver = async (path) => {
  const session = await getSession();

  if (!session) {
    return { ok: false, reason: 'unauthenticated' };
  }

  return {
    ok: true,
    url: `${API_URL}${path}`,
    accessToken: session.accessToken,
  };
};

const client = createApiClient(resolve);

export const apiGet = client.get;
export const apiPost = client.post;
export const apiDelete = client.del;
