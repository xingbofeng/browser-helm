import { defineConfig } from 'wxt';
import type { Plugin } from 'vite';

/**
 * Chrome MV3 extension_pages 完全禁止内联脚本（连 hash/nonce 都不接受）。
 * @vitejs/plugin-react 在 dev 模式下会注入 React Fast Refresh 内联 <script>，
 * 被 CSP 拦截后报运行时错误。本插件移除所有不带 src 属性的 <script>，从源头消除内联脚本。
 */
function stripInlineScripts(): Plugin {
  return {
    name: 'strip-inline-scripts',
    enforce: 'post',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        return html.replace(
          /<script\b(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi,
          ''
        );
      }
    }
  };
}

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    server: {
      hmr: false
    },
    plugins: [stripInlineScripts()]
  }),
  manifest: {
    name: 'BrowserHelm',
    description: 'Local-first a11y-first browser agent cockpit.',
    icons: {
      '16': '/icons/icon-16.png',
      '48': '/icons/icon-48.png',
      '128': '/icons/icon-128.png'
    },
    action: {
      default_icon: {
        '16': '/icons/icon-16.png',
        '48': '/icons/icon-48.png',
        '128': '/icons/icon-128.png'
      },
      default_title: 'Open BrowserHelm side panel'
    },
    commands: {
      'open-browserhelm-side-panel': {
        suggested_key: {
          default: 'Alt+Shift+B',
          mac: 'Alt+Shift+B'
        },
        description: 'Toggle BrowserHelm floating panel'
      }
    },
    // BrowserHelm uses a minimal manifest permissions model for the Chrome Web Store.
    // We declare zero host_permissions at install time so the extension does not
    // request blanket page access by default. The runtime requests <all_urls>
    // via optional_host_permissions, and Chrome prompts the user only when
    // BrowserHelm first needs to read or act on a specific page.
    //
    // For a more locked-down distribution (e.g. enterprise), consider switching to
    // the activeTab-only model and removing optional_host_permissions entirely.
    permissions: ['activeTab', 'storage', 'tabs', 'scripting', 'sidePanel', 'webNavigation'],
    host_permissions: [],
    optional_host_permissions: ['http://*/*', 'https://*/*', '<all_urls>'],
    web_accessible_resources: [
      {
        resources: ['sidepanel.html', 'page-health-hook.js', 'assets/*', 'icons/*'],
        matches: ['http://*/*', 'https://*/*']
      }
    ]
  }
});
