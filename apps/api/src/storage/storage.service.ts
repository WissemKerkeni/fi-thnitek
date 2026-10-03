import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Env } from '../config/env.js';

/** Signed admin links live this long (docs/security.md §5). */
export const SIGNED_URL_TTL_S = 60;

/**
 * Private object storage for verification documents through the S3 API (Garage in dev and on the VPS,
 * ADR-215; swappable for any S3-compatible store). Objects are never public: reads use short signed URLs.
 */
export class StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(
    env: Pick<Env, 'S3_ENDPOINT' | 'S3_REGION' | 'S3_BUCKET' | 'S3_ACCESS_KEY_ID' | 'S3_SECRET_ACCESS_KEY'>,
  ) {
    this.bucket = env.S3_BUCKET;
    this.client = new S3Client({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      forcePathStyle: true,
      credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
    });
  }

  async put(key: string, bytes: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: bytes, ContentType: contentType }),
    );
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  /** A GET link valid for SIGNED_URL_TTL_S, displayed inline (never as a download with a filename). */
  signedGetUrl(key: string): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key, ResponseContentDisposition: 'inline' }),
      { expiresIn: SIGNED_URL_TTL_S },
    );
  }
}

export const STORAGE = Symbol('STORAGE');
