import { crc32 } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { InvalidImageError, detectImageType, sanitizeImage } from './image-sanitizer.js';

const seg = (marker: number, payload: string | Buffer) => {
  const body = typeof payload === 'string' ? Buffer.from(payload, 'latin1') : payload;
  const header = Buffer.alloc(4);
  header.writeUInt16BE(0xff00 | marker, 0);
  header.writeUInt16BE(body.length + 2, 2);
  return Buffer.concat([header, body]);
};

/** A minimal JPEG: SOI, APP0 (JFIF), APP1 (EXIF with a fake GPS string), COM, DQT, SOS + data, EOI. */
function jpeg(): Buffer {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    seg(0xe0, 'JFIF\0\x01\x01\0\0\x01\0\x01\0\0'),
    seg(0xe1, 'Exif\0\0GPS 36.8065N 10.1815E Pixel-9'),
    seg(0xfe, 'shot by Sami'),
    seg(0xdb, Buffer.alloc(65, 1)),
    seg(0xda, Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])),
    Buffer.from([0xab, 0xcd, 0xff, 0x00, 0xef]), // entropy-coded data (with a stuffed 0xFF00)
    Buffer.from([0xff, 0xd9]),
  ]);
}

function chunk(type: string, data: string | Buffer) {
  const body = Buffer.concat([
    Buffer.from(type, 'latin1'),
    typeof data === 'string' ? Buffer.from(data) : data,
  ]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(body.length - 4);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(): Buffer {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0])),
    chunk('tEXt', 'Comment\0taken at 36.8065,10.1815'),
    chunk('eXIf', 'MM\0*GPS'),
    chunk('IDAT', Buffer.from([1, 2, 3])),
    chunk('IEND', ''),
  ]);
}

describe('detectImageType', () => {
  it('recognises JPEG and PNG by their bytes only', () => {
    expect(detectImageType(jpeg())).toBe('image/jpeg');
    expect(detectImageType(png())).toBe('image/png');
    expect(detectImageType(Buffer.from('%PDF-1.7'))).toBeNull();
    expect(detectImageType(Buffer.from('<svg onload=alert(1)>'))).toBeNull();
    expect(detectImageType(Buffer.alloc(0))).toBeNull();
  });
});

describe('sanitizeImage', () => {
  it('removes EXIF and comments from JPEGs and keeps the image data intact', () => {
    const { contentType, bytes } = sanitizeImage(jpeg());
    expect(contentType).toBe('image/jpeg');
    const text = bytes.toString('latin1');
    expect(text).not.toContain('GPS');
    expect(text).not.toContain('Pixel-9');
    expect(text).not.toContain('Sami');
    expect(text).toContain('JFIF');
    // Scan data and EOI are copied byte for byte.
    expect(bytes.subarray(-7)).toEqual(Buffer.from([0xab, 0xcd, 0xff, 0x00, 0xef, 0xff, 0xd9]));
  });

  it('removes text, EXIF and time chunks from PNGs', () => {
    const { contentType, bytes } = sanitizeImage(png());
    expect(contentType).toBe('image/png');
    const text = bytes.toString('latin1');
    expect(text).not.toContain('36.8065');
    expect(text).not.toContain('eXIf');
    expect(text).toContain('IHDR');
    expect(text).toContain('IDAT');
    expect(text).toContain('IEND');
  });

  it('rejects other formats and corrupt files', () => {
    expect(() => sanitizeImage(Buffer.from('GIF89a'))).toThrow(InvalidImageError);
    const truncated = jpeg().subarray(0, 10);
    expect(() => sanitizeImage(truncated)).toThrow(InvalidImageError);
    const badPng = Buffer.concat([png().subarray(0, 8), Buffer.from([0xff, 0xff, 0xff, 0xff, 0x49, 0x44])]);
    expect(() => sanitizeImage(badPng)).toThrow(InvalidImageError);
  });
});
