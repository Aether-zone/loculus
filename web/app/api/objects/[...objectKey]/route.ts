import { NextResponse } from 'next/server';

import { apiDelete } from '@/lib/api';
import { failureResponse } from '@/lib/failure';
import { encodeObjectKey } from '@/lib/objects';

/**
 * Deletes an object: the bytes, loculus's row, and an `object.deleted` on the
 * shared exchange so anything holding the key learns it is gone.
 *
 * The api is idempotent about this — a key it no longer has is still a
 * successful delete — so a double click is not an error worth showing.
 *
 * A catch-all segment because a key is a path now:
 * `{requestor}/{organizationId}/{name}`. Next hands the segments back as an
 * array, which is the key split on the separators it already had.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ objectKey: string[] }> },
) {
  const { objectKey } = await params;

  const result = await apiDelete(
    `/objects/${encodeObjectKey(objectKey.join('/'))}`,
  );

  return result.ok
    ? new NextResponse(null, { status: 204 })
    : failureResponse(result);
}
