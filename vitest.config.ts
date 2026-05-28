import { defineConfig } from 'vitest/config';

export default defineConfig({
  assetsInclude: ['**/*.png'],
  test: {
    exclude: ['tests/e2e/**', 'node_modules/**', '.output/**', '.wxt/**'],
    server: {
      deps: {
        inline: ['animal-island-ui']
      }
    },
    coverage: {
      provider: 'v8',
      include: [
        'src/background/runtime/run/**',
        'src/tools/core/**',
        'src/shared/**',
        'src/page/dom/**',
        'src/agent/**'
      ],
      thresholds: {
        statements: 30,
        branches: 20,
        functions: 25,
        lines: 30
      }
    }
  }
});
