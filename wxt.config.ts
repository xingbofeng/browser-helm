import { defineConfig } from 'wxt';
import react from '@wxt-dev/module-react';

export default defineConfig({
  modules: [react()],
  manifest: {
    name: 'BrowserHelm',
    description: 'Local-first a11y-first browser agent cockpit.',
    permissions: ['storage', 'tabs', 'scripting', 'sidePanel'],
    host_permissions: ['<all_urls>']
  }
});
