import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

/**
 * CIN protection at rest (docs/domain-model.md: cin_hmac, cin_last4, cin_encrypted):
 * - `hmac` (keyed SHA-256) backs the uniqueness index without storing the CIN in clear;
 * - `encrypted` (AES-256-GCM, random IV) lets an admin reveal it during review (audited);
 * - `last4` is what the driver sees back.
 */
export class CinProtector {
  private readonly encryptionKey: Buffer;

  constructor(
    encryptionKeyBase64: string,
    private readonly hmacKey: string,
  ) {
    this.encryptionKey = Buffer.from(encryptionKeyBase64, 'base64');
    if (this.encryptionKey.length !== 32) throw new Error('CIN encryption key must be 32 bytes');
  }

  hmac(cin: string): string {
    return createHmac('sha256', this.hmacKey).update(cin).digest('hex');
  }

  /** Format: v1.<iv>.<tag>.<ciphertext>, each base64url. */
  encrypt(cin: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const ciphertext = Buffer.concat([cipher.update(cin, 'utf8'), cipher.final()]);
    return ['v1', iv, cipher.getAuthTag(), ciphertext]
      .map((p) => (typeof p === 'string' ? p : p.toString('base64url')))
      .join('.');
  }

  decrypt(value: string): string {
    const [version, iv, tag, ciphertext] = value.split('.');
    if (version !== 'v1' || !iv || !tag || !ciphertext) throw new Error('unknown CIN ciphertext format');
    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString(
      'utf8',
    );
  }
}

export const CIN_PROTECTOR = Symbol('CIN_PROTECTOR');
