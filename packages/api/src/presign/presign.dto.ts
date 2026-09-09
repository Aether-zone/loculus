import { z } from 'zod';

/**
 * `type/subtype`, with the parameters a `Content-Type` may carry (`; charset=`
 * and friends). Deliberately not a list of known types: this service stores
 * whatever it is given, and an allow-list belongs to the caller that knows what
 * it is collecting.
 */
const contentType = z
  .string()
  .regex(
    /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*(\s*;.*)?$/i,
    'must be a media type, such as "audio/mpeg"',
  );

/**
 * What a client asks for before uploading.
 *
 * The upper bound on `size` is the configured `maxUploadBytes` rather than
 * anything stated here, so the schema is built per-request — see
 * {@link createPresignedUploadSchema}. What this fixes is the shape: a whole
 * number of bytes, because the value is signed into the URL as a
 * `Content-Length` the client then has to match exactly. A float or a NaN
 * would fail at upload time instead of here, somewhere far less legible.
 */
export const createPresignedUploadSchema = (maxUploadBytes: number) =>
  z.object({
    fileName: z.string().trim().min(1),
    contentType,
    size: z.number().int().positive().max(maxUploadBytes),
    /**
     * Which organization the caller was working in, recorded against the object.
     *
     * **Optional, and deliberately not an authorization boundary.** loculus
     * still decides who may touch an object by `client_id`: a service token
     * carries no organization claim, so a store that refused an object whose
     * tenancy it could not see would refuse background work — a transcription
     * reading a recording back has no person and no organization behind it.
     *
     * So this is provenance. It says which tenant a file was uploaded for,
     * which is what a later `require` could narrow on once every caller can
     * supply it. Until then, absent is a legitimate answer.
     */
    organizationId: z.uuid().optional(),
    /**
     * Which system is asking. It becomes the first segment of the object key.
     *
     * **Normally omitted.** loculus already knows the requestor — it is the
     * verified token's `client_id`, which is also what decides who may touch
     * the object afterwards. A caller may state it to be explicit, and loculus
     * refuses the request if it disagrees with the token rather than quietly
     * preferring one of the two: a key is a namespace, and a caller that could
     * name someone else's would be writing into it.
     */
    requestor: z
      .string()
      .trim()
      .regex(
        /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/,
        'must look like an OAuth client id',
      )
      .optional(),
  });

export type CreatePresignedUploadDTO = z.infer<
  ReturnType<typeof createPresignedUploadSchema>
>;

export const presignedUploadSchema = z.object({
  objectKey: z.string(),
  uploadUrl: z.url(),
  expiresAt: z.date(),
});

export const presignedDownloadSchema = z.object({
  objectKey: z.string(),
  downloadUrl: z.url(),
  expiresAt: z.date(),
});

export type PresignedUploadDTO = z.infer<typeof presignedUploadSchema>;
export type PresignedDownloadDTO = z.infer<typeof presignedDownloadSchema>;
