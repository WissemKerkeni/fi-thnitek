import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MIGRATIONS_FOLDER } from './migrate.js';

describe('MIGRATIONS_FOLDER', () => {
  it('points at the drizzle journal', () => {
    expect(existsSync(path.join(MIGRATIONS_FOLDER, 'meta', '_journal.json'))).toBe(true);
  });

  it('applies extensions before the audit table and its insert-only guard', () => {
    const journal = JSON.parse(
      readFileSync(path.join(MIGRATIONS_FOLDER, 'meta', '_journal.json'), 'utf8'),
    ) as {
      entries: { tag: string }[];
    };
    expect(journal.entries.map((e) => e.tag)).toEqual([
      '0000_extensions',
      '0001_audit_logs',
      '0002_audit_insert_only',
    ]);
  });
});
