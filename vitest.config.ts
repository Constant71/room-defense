import { defineConfig } from 'vitest/config';

// Kept separate from vite.config.ts so tests never start the room or phone servers.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
  },
});
