import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MIGRATIONS_FOLDER } from './migrate.js';

function journalTags(): string[] {
  const journal = JSON.parse(readFileSync(path.join(MIGRATIONS_FOLDER, 'meta', '_journal.json'), 'utf8')) as {
    entries: { tag: string }[];
  };
  return journal.entries.map((e) => e.tag);
}

describe('MIGRATIONS_FOLDER', () => {
  it('points at the drizzle journal', () => {
    expect(existsSync(path.join(MIGRATIONS_FOLDER, 'meta', '_journal.json'))).toBe(true);
  });

  it('applies extensions before the audit table and its insert-only guard', () => {
    expect(journalTags().slice(0, 3)).toEqual([
      '0000_extensions',
      '0001_audit_logs',
      '0002_audit_insert_only',
    ]);
  });

  it('numbers migrations consecutively, each with its SQL file', () => {
    journalTags().forEach((tag, i) => {
      expect(tag.startsWith(String(i).padStart(4, '0'))).toBe(true);
      expect(existsSync(path.join(MIGRATIONS_FOLDER, `${tag}.sql`))).toBe(true);
    });
  });
});
