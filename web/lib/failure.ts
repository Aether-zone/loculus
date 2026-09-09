import 'server-only';

import { createFailureResponder } from '@aether-zone/daimon';

import type { ApiFailure } from './api';

/**
 * Turns a failure from the loculus api into one this app's own routes can
 * answer with. Statuses are daimon's defaults — 401/403/404/502 — and only the
 * wording is loculus's.
 */
const responder = createFailureResponder({
  // As before: a message from the loculus api wins over the wording below. It
  // knows why it said no; these are the fallback when it did not say.
  preferApiMessage: true,
  messages: {
    forbidden: 'That object belongs to another application.',
    /*
     * loculus answers 404 for a key that never existed and for one owned by a
     * different OAuth client alike, so this wording has to cover both without
     * claiming to know which — telling them apart is exactly what the api
     * refuses to do.
     */
    notFound: 'No object with that key. It may have been deleted already.',
    unavailable: 'loculus could not be reached. Try again in a moment.',
  },
});

export function failureResponse(failure: ApiFailure) {
  return responder.response(failure);
}
