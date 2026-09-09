import { S3Client } from '@aws-sdk/client-s3';
import { Provider } from '@nestjs/common';

export const PRESIGN_CONFIG = 'PRESIGN_CONFIG';
export const S3_CLIENT = 'S3_CLIENT';

/** Everything needed to reach the object store and sign URLs against it. */
export interface PresignConfig {
  bucket: string;
  region: string;
  /**
   * Override for an S3-compatible store. Left unset, the AWS endpoint for
   * `region` is used.
   */
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  /**
   * Address buckets as a path segment rather than a subdomain. MinIO and
   * friends need this, because virtual-host style would want a DNS entry per
   * bucket, which a local container does not have.
   */
  forcePathStyle: boolean;
  /**
   * How long an upload URL is good for, in seconds. Short by default: it is
   * handed out at the moment of upload, and a leaked one is a write.
   */
  uploadExpiresIn: number;
  /** How long a download URL is good for, in seconds. */
  downloadExpiresIn: number;
  /**
   * Largest upload this service will sign for, in bytes. The declared size is
   * signed into the URL, so this is a real ceiling rather than a hint — see
   * `PresignService.createUpload`.
   */
  maxUploadBytes: number;
}

export const defaultPresignConfig: PresignConfig = {
  bucket: 'loculus-objects',
  region: 'us-east-1',
  endpoint: 'http://localhost:9020',
  accessKeyId: 'loculus',
  secretAccessKey: 'Ch4nG3M3!',
  forcePathStyle: true,
  uploadExpiresIn: 15 * 60,
  downloadExpiresIn: 15 * 60,
  maxUploadBytes: 5 * 1024 * 1024 * 1024,
};

/**
 * The client every signature is produced with.
 *
 * Exported separately from the provider so a test can build the same client
 * the application runs — a harness constructing its own would not be exercising
 * the options below, which is exactly where the surprises are.
 */
export const createS3Client = (config: PresignConfig): S3Client =>
  new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    /*
     * Without this the SDK computes a CRC32 of the body it is holding — which,
     * when presigning, is no body at all — and bakes
     * `x-amz-checksum-crc32=AAAAAA==` into the signed URL. The client then
     * uploads real bytes against a checksum for zero bytes, and the store
     * rejects every upload. `WHEN_REQUIRED` leaves it out, and integrity is
     * still covered by TLS and the signature.
     */
    requestChecksumCalculation: 'WHEN_REQUIRED',
  });

export const createS3Providers = (): Provider[] => [
  {
    provide: S3_CLIENT,
    useFactory: createS3Client,
    inject: [PRESIGN_CONFIG],
  },
];
