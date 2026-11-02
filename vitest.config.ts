import { defineConfig } from 'vitest/config';

// Separate from vite.config.ts: vitest 3 bundles its own Vite version.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
  },
});
