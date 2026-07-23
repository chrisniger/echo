import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Avoid the slow default reporter; keep output terse for CI snapshots.
    reporters: 'default',
    // Ensure workspace deps (shared-types, shared-config) resolve through
    // pnpm symlinks the same way the runtime resolution works, without
    // forcing contributors to pre-build the packages.
    server: {
      deps: {
        inline: ['@echo-gpt/shared-types', '@echo-gpt/shared-config'],
      },
    },
  },
});
