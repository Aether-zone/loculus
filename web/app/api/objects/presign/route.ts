import { NextResponse, type NextRequest } from 'next/server';

import { apiPost } from '@/lib/api';
import { failureResponse } from '@/lib/failure';
import type { PresignedUpload } from '@/lib/objects';
import { activeOrganization } from '@/lib/organizations';

/**
 * Asks loculus for somewhere to put a file.
 *
 * This exists to attach the access token, which lives in an httpOnly cookie the
 * browser cannot read. The rest of the body is passed through unexamined on
 * purpose: loculus validates it against a schema built around its *configured*
 * `MAX_UPLOAD_BYTES`, and a second limit restated here would be a second thing
 * to get wrong.
 *
 * What comes back is a URL the browser spends directly on the object store.
 * Nothing about the file crosses this process.
 */
export async function POST(request: NextRequest) {
  const body: unknown = await request.json().catch(() => null);

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json(
      { message: 'Expected a JSON object.' },
      { status: 400 },
    );
  }

  /*
   * The organization is resolved here and overwrites whatever the body said.
   *
   * `activeOrganization` reads the preference cookie and validates it against
   * the token's own `orgs` claim, so this can only ever be one the person
   * really belongs to. Taking the browser's word for it would let any caller
   * file an object under someone else's tenant — and the field is provenance,
   * which is worth nothing at all if it can be dictated by the thing being
   * recorded.
   */
  const organization = await activeOrganization();

  const result = await apiPost<PresignedUpload>('/objects/presign', {
    ...body,
    organizationId: organization?.id,
  });

  return result.ok ? NextResponse.json(result.data) : failureResponse(result);
}
