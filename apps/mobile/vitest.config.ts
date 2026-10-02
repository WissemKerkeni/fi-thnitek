import { defineConfig } from 'vitest/config';

// Unit tests cover pure modules only (theme, API client); screens are verified on device.
export default defineConfig({ test: { include: ['src/**/*.test.ts'], environment: 'node' } });
