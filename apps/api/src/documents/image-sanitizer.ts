/**
 * Verification photos (docs/security.md §5): only JPEG and PNG, detected from their bytes (never the
 * filename or client-declared type), with metadata removed (EXIF GPS position, device, dates, XMP, IPTC,
 * comments). Pure byte-level processing: no native image library.
 */

export type ImageType = 'image/jpeg' | 'image/png';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function detectImageType(bytes: Buffer): ImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return 'image/png';
  return null;
}

export class InvalidImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidImageError';
  }
}

/** JPEG segments that can carry personal metadata: APP1 (EXIF/XMP), APP13 (IPTC), APP12, COM. */
const JPEG_DROPPED = new Set([0xe1, 0xec, 0xed, 0xfe]);

function stripJpeg(bytes: Buffer): Buffer {
  const parts: Buffer[] = [bytes.subarray(0, 2)];
  let i = 2;
  while (i < bytes.length) {
    if (bytes[i] !== 0xff) throw new InvalidImageError('corrupt JPEG marker');
    const marker = bytes[i + 1];
    if (marker === undefined) throw new InvalidImageError('truncated JPEG');
    // Fill bytes, standalone markers (TEM, RST0–7) and EOI have no length.
    if (marker === 0xff) {
      i += 1;
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      parts.push(bytes.subarray(i, i + 2));
      i += 2;
      continue;
    }
    if (marker === 0xd9) {
      parts.push(bytes.subarray(i, i + 2));
      break;
    }
    if (i + 4 > bytes.length) throw new InvalidImageError('truncated JPEG segment');
    const length = bytes.readUInt16BE(i + 2);
    if (length < 2 || i + 2 + length > bytes.length) throw new InvalidImageError('bad JPEG segment length');
    // Start of scan: the compressed image data follows; keep everything from here.
    if (marker === 0xda) {
      parts.push(bytes.subarray(i));
      break;
    }
    if (!JPEG_DROPPED.has(marker)) parts.push(bytes.subarray(i, i + 2 + length));
    i += 2 + length;
  }
  return Buffer.concat(parts);
}

/** PNG ancillary chunks that can carry metadata. Critical chunks (IHDR, PLTE, IDAT, IEND) are kept. */
const PNG_DROPPED = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']);

function stripPng(bytes: Buffer): Buffer {
  const parts: Buffer[] = [PNG_SIGNATURE];
  let i = 8;
  while (i < bytes.length) {
    if (i + 12 > bytes.length) throw new InvalidImageError('truncated PNG chunk');
    const length = bytes.readUInt32BE(i);
    const end = i + 12 + length;
    if (end > bytes.length) throw new InvalidImageError('bad PNG chunk length');
    const type = bytes.toString('latin1', i + 4, i + 8);
    if (!PNG_DROPPED.has(type)) parts.push(bytes.subarray(i, end));
    i = end;
    if (type === 'IEND') break;
  }
  return Buffer.concat(parts);
}

export interface SanitizedImage {
  contentType: ImageType;
  bytes: Buffer;
}

/** Throws InvalidImageError for anything that is not a well-formed JPEG or PNG. */
export function sanitizeImage(input: Buffer): SanitizedImage {
  const contentType = detectImageType(input);
  if (!contentType) throw new InvalidImageError('only JPEG and PNG images are accepted');
  return { contentType, bytes: contentType === 'image/jpeg' ? stripJpeg(input) : stripPng(input) };
}
