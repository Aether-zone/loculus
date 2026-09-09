/**
 * Uploading a file to loculus, in three steps.
 *
 * 1. **Ask for somewhere to put it.** This app's own route handler relays the
 *    request to the api, which mints an object key, writes a `PENDING` row and
 *    signs a URL. The declared content type and size are signed *into* that
 *    URL, so it can only be spent on the file it was issued for.
 * 2. **PUT the bytes straight to the object store**, from the browser. They
 *    cross neither this app nor the api, which is the whole point of the
 *    service: a 4 GB upload costs loculus a JSON request, not 4 GB of memory.
 * 3. **Confirm.** loculus never sees step 2 — there is no request that means
 *    "the upload finished" — so a row stays `PENDING` until something looks.
 *    Asking for a download URL is that look: it HEADs the object and flips the
 *    row to `UPLOADED`. Skip it and the object is still fine, but it stays
 *    pending until the sweeper gets to it five minutes later, and anything
 *    waiting on `object.uploaded` waits that long too.
 *
 * Nothing server-only may be imported here: this module runs in the browser.
 */

import {
  cancelledOr,
  putToSignedUrl,
  type UploadFailure,
} from '@aether-zone/daimon/upload';

/** What step 1 answers with. `expiresAt` is an ISO string over the wire. */
export type PresignedUpload = {
  objectKey: string;
  uploadUrl: string;
  expiresAt: string;
};

export type PresignedDownload = {
  objectKey: string;
  downloadUrl: string;
  expiresAt: string;
};

/**
 * Mirrors the api's `MAX_UPLOAD_BYTES` default (5 GiB).
 *
 * Checked here only to fail a hopeless upload before starting one. The api
 * enforces the real limit, and whatever size it accepts is signed into the URL,
 * so the store enforces it a second time.
 */
/**
 * A key is a path — `{requestor}/{organizationId}/{name}` — so each segment is
 * encoded on its own.
 *
 * `encodeURIComponent` over the whole key would turn its separators into
 * `%2F`, which the catch-all route would then see as one segment containing
 * slashes rather than the three it is.
 */
export const encodeObjectKey = (objectKey: string): string =>
  objectKey.split('/').map(encodeURIComponent).join('/');

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024 * 1024;

export type { UploadFailure };

export type UploadResult =
  | { ok: true; object: PresignedUpload; confirmed: boolean }
  | UploadFailure;

export async function uploadFile(
  file: File,
  options: {
    /** Fraction uploaded, 0..1. */
    onProgress?: (fraction: number) => void;
    signal?: AbortSignal;
  } = {},
): Promise<UploadResult> {
  const { onProgress, signal } = options;

  if (signal?.aborted) {
    return { ok: false, error: 'Upload cancelled.', cancelled: true };
  }

  const prepared = await presign(file, signal);

  if (!prepared.ok) {
    return prepared;
  }

  const sent = await putToSignedUrl(prepared.upload.uploadUrl, file, {
    onProgress,
    signal,
  });

  if (!sent.ok) {
    return sent;
  }

  /*
   * A failed confirmation is not a failed upload — the bytes are in the store
   * either way, and the sweeper will settle the row. So it is reported beside
   * the success rather than instead of it.
   */
  const confirmed = await confirmUpload(prepared.upload.objectKey, signal);

  return { ok: true, object: prepared.upload, confirmed };
}

/** Step 1: somewhere to put it. */
async function presign(
  file: File,
  signal?: AbortSignal,
): Promise<{ ok: true; upload: PresignedUpload } | UploadFailure> {
  try {
    const response = await fetch('/api/objects/presign', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        fileName: file.name,
        // Browsers leave this empty for a type they do not know. The api
        // requires a media type and the store will be told this one, so guess
        // the most permissive thing rather than fail.
        contentType: file.type || 'application/octet-stream',
        size: file.size,
      }),
      signal,
    });

    const body = (await response.json().catch(() => null)) as
      | (PresignedUpload & { message?: string })
      | null;

    if (!response.ok || !body?.uploadUrl) {
      return {
        ok: false,
        error: body?.message ?? 'Could not start the upload.',
      };
    }

    return { ok: true, upload: body };
  } catch (error) {
    return cancelledOr(
      error,
      'Could not reach the server to start the upload.',
    );
  }
}

/**
 * Step 3: tell loculus to go and look.
 *
 * Answers whether the object is confirmed rather than throwing, because
 * everything worth doing has already been done by the time this runs.
 */
async function confirmUpload(
  objectKey: string,
  signal?: AbortSignal,
): Promise<boolean> {
  try {
    const response = await fetch(
      `/api/objects/presign/${encodeObjectKey(objectKey)}`,
      { signal },
    );

    return response.ok;
  } catch {
    return false;
  }
}

/**
 * A fresh download URL for an object, signed by the store and good for the
 * api's `DOWNLOAD_URL_EXPIRES_IN` (15 minutes by default).
 *
 * Fetched at the moment of use rather than held with the row: a URL kept in a
 * table would be expired by the time anyone clicked it.
 */
export async function downloadUrlFor(
  objectKey: string,
): Promise<{ ok: true; url: string } | UploadFailure> {
  try {
    const response = await fetch(
      `/api/objects/presign/${encodeObjectKey(objectKey)}`,
    );

    const body = (await response.json().catch(() => null)) as
      | (PresignedDownload & { message?: string })
      | null;

    if (!response.ok || !body?.downloadUrl) {
      return {
        ok: false,
        error: body?.message ?? 'That object could not be found.',
      };
    }

    return { ok: true, url: body.downloadUrl };
  } catch (error) {
    return cancelledOr(error, 'Could not reach the server.');
  }
}

/** Removes the object and, on the api's side, the row and the bytes both. */
export async function deleteObject(
  objectKey: string,
): Promise<{ ok: true } | UploadFailure> {
  try {
    const response = await fetch(
      `/api/objects/${encodeObjectKey(objectKey)}`,
      { method: 'DELETE' },
    );

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;

      return { ok: false, error: body?.message ?? 'Could not delete it.' };
    }

    return { ok: true };
  } catch (error) {
    return cancelledOr(error, 'Could not reach the server.');
  }
}

/** An aborted fetch rejects with `AbortError`; that is a cancel, not a fault. */
