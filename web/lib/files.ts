import 'server-only';

import { apiGet } from './api';
import { activeOrganization } from './organizations';

/**
 * One object, as the loculus api lists it.
 *
 * Mirrors `FileDTO` on the api side. Fetched, not remembered: the console used
 * to keep its own note of what this browser had uploaded, which meant an object
 * uploaded from another machine — or by akouo — was invisible even though its
 * key worked perfectly.
 */
export interface StoredFile {
  objectKey: string;
  name: string;
  contentType: string;
  size: number;
  /** The OAuth client that presigned it. The console groups by this. */
  requestor: string;
  uploadedAt: string | null;
  createdAt: string;
  confirmed: boolean;
}

export type FileListing =
  | { ok: true; files: StoredFile[] }
  | { ok: false; reason: 'noOrganization' | 'unavailable'; message?: string };

/**
 * Everything filed for the organization the person is working in.
 *
 * The organization comes from the active-organization cookie, validated against
 * the token's own `orgs` claim — so this can only ever ask about one they
 * really belong to, and the api checks the same thing again from the path.
 *
 * Someone who belongs to no organization is not an error: loculus files an
 * object under an organization only when the caller states one, so there is
 * genuinely nothing to list rather than something that failed.
 */
export async function listFiles(): Promise<FileListing> {
  const organization = await activeOrganization();

  if (!organization) {
    return { ok: false, reason: 'noOrganization' };
  }

  const result = await apiGet<StoredFile[]>(
    `/organizations/${encodeURIComponent(organization.id)}/files`,
  );

  if (!result.ok) {
    return { ok: false, reason: 'unavailable', message: result.message };
  }

  return { ok: true, files: result.data };
}
