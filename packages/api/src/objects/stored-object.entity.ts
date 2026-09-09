import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Where an object is in its life.
 *
 * `PENDING` means a URL was handed out and the bytes have not been seen since.
 * It is not "uploading": loculus cannot watch an upload — the client PUTs to
 * the store directly — so the only way past this state is to go and look.
 */
export type ObjectState = 'PENDING' | 'UPLOADED';

/**
 * What loculus knows about one object.
 *
 * The row exists so loculus can answer two questions it previously could not:
 * *whose is this*, and *did the bytes ever arrive*. Without the first, any
 * valid token could read or delete any object whose key it had learned — and
 * keys are not secret: they reach browsers, other services' databases, logs,
 * and the `object.deleted` events on the bus.
 *
 * What is deliberately **not** here is anything about what the object means.
 * Which recording or meeting it belongs to is akouo's, and a column for it here
 * would be a second place for that to be wrong.
 */
@Entity('stored_object')
export class StoredObject {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** The key in the bucket. Unique: it is what every caller names. */
  @Index({ unique: true })
  @Column({ name: 'object_key', length: 1024 })
  objectKey: string;

  /**
   * The OAuth client the object belongs to, from the token's `client_id`.
   *
   * The boundary is the *client*, not the subject. A service presigns an upload
   * with the caller's relayed token and reads it back later with its own — same
   * client, different subject — so owning by subject would refuse a service its
   * own files the moment no person was waiting.
   */
  @Index()
  @Column({ name: 'owner_client_id', length: 255 })
  ownerClientId: string;

  /** The token's `sub` at the time it was presigned. Provenance, not authority. */
  @Column({ name: 'created_by', type: 'varchar', length: 255, nullable: true })
  createdBy: string | null;

  /**
   * The organization the caller was working in, as they declared it.
   *
   * Provenance, not authority — `require` still narrows by `ownerClientId`
   * alone. Nullable because a service token carries no organization claim, so
   * background work legitimately has none to state, and every row written
   * before this column existed has none either.
   */
  @Index()
  @Column({
    name: 'organization_id',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  organizationId: string | null;

  @Column({ name: 'state', type: 'varchar', default: 'PENDING' })
  state: ObjectState;

  /** The name the client declared. Display only; the key is the identity. */
  @Column({ name: 'name', length: 255 })
  name: string;

  @Column({ name: 'content_type', length: 255 })
  contentType: string;

  /** Bytes, as declared at presign and signed into the upload URL. */
  @Column({ type: 'integer' })
  size: number;

  /** When the upload URL stops working, so a sweep knows what is abandoned. */
  @Column({ name: 'upload_expires_at', type: 'datetime' })
  uploadExpiresAt: Date;

  /** When the bytes were first seen. Null while `PENDING`. */
  @Column({ name: 'uploaded_at', type: 'datetime', nullable: true })
  uploadedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
