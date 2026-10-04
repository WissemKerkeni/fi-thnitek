import { defineConfig } from 'vitest/config';

// Vite 8's Oxc transform honours tsconfig `emitDecoratorMetadata`, so Nest DI works without SWC.
export default defineConfig({
  test: {
    projects: [
      { extends: true, test: { name: 'unit', include: ['src/**/*.test.ts'] } },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['test/**/*.int.test.ts'],
          testTimeout: 120_000,
          hookTimeout: 420_000,
          fileParallelism: false,
        },
      },
      {
        extends: true,
        test: {
          name: 'load',
          include: ['test/load/**/*.load.test.ts'],
          testTimeout: 600_000,
          hookTimeout: 600_000,
        },
      },
    ],
  },
});
