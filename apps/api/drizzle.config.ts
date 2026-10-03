import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  schemaFilter: ['public', 'audit'],
  // Generation needs no database; `db:migrate` reads DATABASE_URL itself.
  dbCredentials: { url: process.env.DATABASE_URL ?? 'postgres://localhost:5432/fi_thnitek' },
});
