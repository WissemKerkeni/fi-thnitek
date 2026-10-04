/**
 * CLAUDE.md rule 8 for crash reports: no PII or coordinates leave the phone or reach storage. Applied
 * on the phone before sending and again by the API before storing. Ids (UUIDs) stay: they are needed
 * to debug and identify nobody by themselves.
 */
const RULES: [RegExp, string][] = [
  // JWTs and bearer tokens.
  [/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[token]'],
  [/\b(Bearer)\s+[\w.~+/-]+=*/gi, '$1 [token]'],
  // E-mail addresses.
  [/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[email]'],
  // Coordinates: "36.80651, 10.18149", "lat":36.8065 and any decimal with 4+ decimals.
  [/-?\d{1,3}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}/g, '[coords]'],
  [/-?\d{1,3}\.\d{4,}/g, '[number]'],
  // Phone numbers: +216 and 8-digit Tunisian numbers, with or without spaces.
  [/\+?\d{3}[\s.-]?\d{2}[\s.-]?\d{3}[\s.-]?\d{3}\b/g, '[phone]'],
  [/(?<![\w-])\d{2}[\s.]?\d{3}[\s.]?\d{3}(?![\w-])/g, '[phone]'],
  // CIN (8 digits) is covered by the phone rule; long opaque secrets (keys, hashes) next.
  [/\b[A-Za-z0-9+/_-]{40,}={0,2}/g, '[secret]'],
];

export function scrubText(text: string, maxLength = 4000): string {
  let out = text;
  for (const [pattern, replacement] of RULES) out = out.replace(pattern, replacement);
  return out.length > maxLength ? `${out.slice(0, maxLength)}…` : out;
}

/**
 * Groups identical crashes: the error name, the message without numbers or ids, and the first stack
 * frame. A short stable hash (FNV-1a, hex).
 */
export function errorFingerprint(name: string, message: string, stack: string | null): string {
  const normalisedMessage = message
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<id>')
    .replace(/\d+/g, '<n>');
  const firstFrame = (stack ?? '')
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.startsWith('at ') || l.includes('@'))
    ?.replace(/:\d+(:\d+)?/g, '');
  let hash = 0x811c9dc5;
  for (const ch of `${name}|${normalisedMessage}|${firstFrame ?? ''}`) {
    hash ^= ch.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
