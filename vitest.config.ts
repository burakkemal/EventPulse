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
        'src/application/rule-crud.ts',
        'src/application/rule-schema.ts',
        'src/application/threshold-evaluator.ts',
        'src/application/rule-store.ts',
        'src/application/metrics.ts',
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
