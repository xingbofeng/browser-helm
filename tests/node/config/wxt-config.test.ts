import { describe, expect, it } from 'vitest';
import type { Plugin } from 'vite';

import config from '../../../wxt.config';

type TestViteConfig = {
  plugins?: Plugin[];
  server?: {
    hmr?: boolean;
  };
};

async function readViteConfig(): Promise<TestViteConfig> {
  const viteConfig = typeof config.vite === 'function' ? config.vite({} as never) : config.vite;
  return await Promise.resolve(viteConfig) as TestViteConfig;
}

function getPluginName(plugin: Plugin): string | undefined {
  return typeof plugin === 'object' && plugin !== null && 'name' in plugin
    ? plugin.name
    : undefined;
}

function getInlineScriptTransform(plugin: Plugin): ((html: string) => string) | undefined {
  if (typeof plugin !== 'object' || plugin === null || !('transformIndexHtml' in plugin)) {
    return undefined;
  }

  const hook = plugin.transformIndexHtml;
  if (typeof hook === 'function') {
    return hook as (html: string) => string;
  }

  if (typeof hook === 'object' && hook !== null && 'handler' in hook && typeof hook.handler === 'function') {
    return hook.handler as (html: string) => string;
  }

  return undefined;
}

describe('wxt config CSP safeguards', () => {
  it('disables Vite HMR so React Fast Refresh cannot inject inline extension scripts', async () => {
    const viteConfig = await readViteConfig();

    expect(viteConfig).toMatchObject({
      server: {
        hmr: false
      }
    });
  });

  it('strips inline scripts from transformed extension HTML', async () => {
    const viteConfig = await readViteConfig();
    const plugin = viteConfig.plugins?.find((candidate) => getPluginName(candidate) === 'strip-inline-scripts');

    expect(plugin).toBeTruthy();
    const transformIndexHtml = plugin ? getInlineScriptTransform(plugin) : undefined;

    expect(typeof transformIndexHtml).toBe('function');
    expect(transformIndexHtml?.(
      '<div></div><script>window.inline = true</script><script src="/entry.js"></script>'
    )).toBe('<div></div><script src="/entry.js"></script>');
  });
});
