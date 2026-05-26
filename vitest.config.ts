import { defineConfig } from 'vitest/config';

export default defineConfig({
  assetsInclude: ['**/*.png'],
  test: {
    exclude: ['tests/e2e/**', 'node_modules/**', '.output/**', '.wxt/**'],
    server: {
      deps: {
        inline: ['animal-island-ui']
      }
    }
  }
});
