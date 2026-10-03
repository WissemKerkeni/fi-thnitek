/** Day/month/year boxes → ISO date (YYYY-MM-DD), or null if incomplete or not a real calendar date. */
export function toIsoDate(day: string, month: string, year: string): string | null {
  const d = Number(day);
  const m = Number(month);
  const y = Number(year);
  if (!/^\d{1,2}$/.test(day) || !/^\d{1,2}$/.test(month) || !/^\d{4}$/.test(year)) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

export function fromIsoDate(iso: string | null | undefined): { day: string; month: string; year: string } {
  const [year = '', month = '', day = ''] = iso?.split('-') ?? [];
  return { day, month, year };
}
