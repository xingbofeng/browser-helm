import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'BrowserHelm',
    description: 'Local-first a11y-first browser agent cockpit.',
    permissions: ['storage', 'tabs', 'scripting', 'sidePanel'],
    host_permissions: ['<all_urls>']
  }
});
