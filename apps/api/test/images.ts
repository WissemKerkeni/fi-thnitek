/** Tiny but well-formed JPEGs for upload tests; `seed` makes the bytes (and SHA-256) unique. */
export const SECRET_EXIF = 'GPS 36.806500N 10.181500E Pixel-9-Pro';

const segment = (marker: number, body: Buffer) => {
  const header = Buffer.alloc(4);
  header.writeUInt16BE(0xff00 | marker, 0);
  header.writeUInt16BE(body.length + 2, 2);
  return Buffer.concat([header, body]);
};

export function jpegWithExif(seed: string): Buffer {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    segment(0xe0, Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0', 'latin1')),
    segment(0xe1, Buffer.from(`Exif\0\0${SECRET_EXIF}`, 'latin1')),
    segment(0xdb, Buffer.alloc(65, 1)),
    segment(0xda, Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])),
    Buffer.from(seed, 'utf8'),
    Buffer.from([0xff, 0xd9]),
  ]);
}
