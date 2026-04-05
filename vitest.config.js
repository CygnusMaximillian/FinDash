import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals:     true,
    environment: 'node',
    // Run test files sequentially to avoid DB race conditions
    pool:        'forks',
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 15_000,
  },
});
