import { NextResponse } from 'next/server';

import { apiGet } from '@/lib/api';
import { failureResponse } from '@/lib/failure';
import { encodeObjectKey, type PresignedDownload } from '@/lib/objects';

/**
 * A URL to download an object with, and the only way to confirm an upload.
 *
 * loculus HEADs the object before signing, so a key whose bytes never arrived
 * is a 404 rather than a URL that fails later — and a row still marked
 * `PENDING` is flipped to `UPLOADED` by the same look. That is why the console
 * calls this immediately after a PUT as well as when someone clicks download.
 *
 * `GET /api/objects/presign/{key...}` rather than `/{key...}/presign`: a key is
 * a path now, and Next requires a catch-all to be the last segment of a route —
 * so the action has to lead. The sibling `POST /api/objects/presign` mints an
 * upload URL; this signs a download for a key that already exists.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ objectKey: string[] }> },
) {
  const { objectKey } = await params;

  const result = await apiGet<PresignedDownload>(
    `/objects/${encodeObjectKey(objectKey.join('/'))}/presign`,
  );

  return result.ok ? NextResponse.json(result.data) : failureResponse(result);
}
