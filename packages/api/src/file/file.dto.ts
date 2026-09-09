/** One object, as the console lists it. */
export interface FileDTO {
  /** The full key: `{requestor}/{organizationId}/{uuid}-{name}`. */
  objectKey: string;
  /** The name declared at presign. Display only; the key is the identity. */
  name: string;
  contentType: string;
  size: number;
  /**
   * The OAuth client that presigned it, which is the key's first segment and
   * what the console groups by.
   */
  requestor: string;
  /** ISO 8601. When the bytes were first seen, or null while pending. */
  uploadedAt: string | null;
  /** ISO 8601. When the upload URL was handed out. */
  createdAt: string;
  /**
   * Whether loculus has seen the bytes. False means a URL was handed out and
   * nothing has looked since — not that the upload failed.
   */
  confirmed: boolean;
}
