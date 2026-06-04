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

const optionalHighRiskPermissions = [
  'offscreen',
  'clipboardRead',
  'clipboardWrite'
] as const;

const basePermissions = ['activeTab', 'storage', 'tabs', 'scripting', 'sidePanel', 'webNavigation', 'debugger', 'contextMenus', 'downloads'] as const;
const e2eRequiredHighRiskPermissions = process.env.BROWSER_HELM_E2E_REQUIRED_PERMISSIONS === '1';

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
    // BrowserHelm keeps eligible high-risk capabilities optional. Chrome does
    // not allow "debugger" as optional, so CDP capture declares it up front.
    // Offscreen clipboard access and host access are still requested only when
    // a feature needs them and runtime authorization applies. Downloads are
    // required because right-click long screenshots can exceed extension
    // message payload limits and must be saved directly from the background.
    permissions: [
      ...basePermissions,
      ...(e2eRequiredHighRiskPermissions ? optionalHighRiskPermissions : [])
    ] as chrome.runtime.ManifestPermissions[],
    optional_permissions: e2eRequiredHighRiskPermissions
      ? []
      : [...optionalHighRiskPermissions] as chrome.runtime.ManifestOptionalPermission[],
    host_permissions: [],
    optional_host_permissions: ['http://*/*', 'https://*/*'],
    web_accessible_resources: [
      {
        resources: ['sidepanel.html', 'page-health-hook.js', 'icons/*'],
        matches: ['http://*/*', 'https://*/*']
      }
    ]
  }
});
