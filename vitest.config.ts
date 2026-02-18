import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'src/domain/rules/**',
        'src/application/rule-engine.ts',
        'src/application/query-events.ts',
        'src/application/query-anomalies.ts',
        'src/infrastructure/rules/**',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
