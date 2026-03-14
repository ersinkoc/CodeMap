import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'node_modules/',
        'tests/',
        'website/',
        'examples/',
        'dist/',
        '*.config.*',
        'src/types.ts',
        'src/cli.ts',
        'src/index.ts',
        'src/utils/index.ts',
        'src/plugins/index.ts',
        'src/plugins/core/index.ts',
        'src/plugins/optional/index.ts',
      ],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 90,
        statements: 100,
      },
    },
  },
});
