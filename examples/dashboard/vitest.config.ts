import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Standalone rather than merged with vite.config.ts: the analytics module is
// pure, so these tests need neither React nor Tailwind. The root vitest config's
// `include` is resolved from the repo root and does not match this directory, so
// the two runs stay independent.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
