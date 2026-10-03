/** Arabic-Indic and Extended Arabic-Indic digits → ASCII. */
function asciiDigits(s: string): string {
  return s
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/**
 * Tunisian CIN: 8 digits. Returns the normalised CIN or null if invalid.
 * The CIN is stored only encrypted + as an HMAC for uniqueness (docs/security.md); never logged.
 */
export function normalizeCin(input: string): string | null {
  const digits = asciiDigits(input).replace(/[\s.-]/g, '');
  return /^\d{8}$/.test(digits) ? digits : null;
}

/**
 * Tunisian plates are written "123 تونس 4567" (series, تونس, number) or "123 TU 4567". Both normalise to
 * "123TU4567" so the uniqueness check (R-064) cannot be bypassed by spelling. Other formats (e.g. "RS 1234",
 * government plates) are kept as uppercase letters + digits. Returns null if it cannot be a plate.
 */
export function normalizePlate(input: string): string | null {
  const s = asciiDigits(input)
    .replace(/تونس/g, ' TU ')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (/^\d{1,3}TU\d{1,4}$/.test(s)) return s;
  if (/^[A-Z]{1,3}\d{1,6}$/.test(s) || /^\d{1,6}[A-Z]{1,3}$/.test(s)) return s;
  return null;
}

/** "123TU4567" → "123 تونس 4567" for display; other formats unchanged. */
export function displayPlate(normalized: string): string {
  const m = /^(\d{1,3})TU(\d{1,4})$/.exec(normalized);
  return m ? `${m[1]} تونس ${m[2]}` : normalized;
}
