import { describe, expect, it } from 'vitest';

/**
 * Manifest 契约测试 —— 确保 WXT 配置生成的 manifest 满足运行时假设。
 *
 * 通过读取编译后产物 .output/chrome-mv3/manifest.json 进行断言，因此
 * 跑之前需要先 `npm run build`，否则测试会在缺少文件时给出可操作提示。
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readManifest() {
  const manifestPath = resolve(process.cwd(), '.output/chrome-mv3/manifest.json');
  if (!existsSync(manifestPath)) {
    throw new Error(
      `缺少编译产物：${manifestPath}。请先运行 npm run build 再执行本测试。`
    );
  }
  return JSON.parse(readFileSync(manifestPath, 'utf-8')) as Record<string, unknown>;
}

const manifest = readManifest();
const manifestVersion = manifest.manifest_version as number;

describe('manifest 权限契约', () => {
  it('是 Manifest V3', () => {
    expect(manifestVersion).toBe(3);
  });

  it('包含 sidePanel 权限', () => {
    const permissions = manifest.permissions as string[];
    expect(permissions).toContain('sidePanel');
  });

  it('包含 tabs 权限', () => {
    const permissions = manifest.permissions as string[];
    expect(permissions).toContain('tabs');
  });

  it('包含 scripting 权限', () => {
    const permissions = manifest.permissions as string[];
    expect(permissions).toContain('scripting');
  });

  it('包含 webNavigation 权限', () => {
    const permissions = manifest.permissions as string[];
    expect(permissions).toContain('webNavigation');
  });

  it('包含 storage 权限', () => {
    const permissions = manifest.permissions as string[];
    expect(permissions).toContain('storage');
  });

  it('包含 debugger 权限用于 v1.3 CDP deep tools', () => {
    const permissions = manifest.permissions as string[];
    expect(permissions).toContain('debugger');
  });

  it('包含 downloads 权限用于 v1.5 下载列表工具', () => {
    const permissions = manifest.permissions as string[];
    expect(permissions).toContain('downloads');
  });

  it('包含 offscreen 与 clipboard 权限用于 v1.5 剪贴板审批工具', () => {
    const permissions = manifest.permissions as string[];
    expect(permissions).toContain('offscreen');
    expect(permissions).toContain('clipboardRead');
    expect(permissions).toContain('clipboardWrite');
  });

  it('使用 activeTab，并把 http/https 与 <all_urls> 放入 optional host 权限', () => {
    const permissions = manifest.permissions as string[];
    const hostPermissions = (manifest.host_permissions as string[] | undefined) ?? [];
    const optionalHostPermissions = manifest.optional_host_permissions as string[];

    expect(permissions).toContain('activeTab');
    expect(hostPermissions).toEqual([]);
    expect(hostPermissions).not.toContain('<all_urls>');
    expect(optionalHostPermissions).toEqual(expect.arrayContaining(['http://*/*', 'https://*/*']));
    expect(optionalHostPermissions).toContain('<all_urls>');
  });
});

describe('manifest commands 契约', () => {
  it('存在 open-browserhelm-side-panel 快捷键命令', () => {
    const commands = manifest.commands as Record<string, unknown>;
    expect(commands).toHaveProperty('open-browserhelm-side-panel');
  });

  it('快捷键命令描述不为空', () => {
    const commands = manifest.commands as Record<string, unknown>;
    const cmd = commands['open-browserhelm-side-panel'] as Record<string, unknown>;
    expect(cmd.description).toBeTruthy();
    expect(typeof cmd.description).toBe('string');
  });

  it('快捷键命令 suggested_key 包含 default (Alt+Shift+B)', () => {
    const commands = manifest.commands as Record<string, unknown>;
    const cmd = commands['open-browserhelm-side-panel'] as Record<string, unknown>;
    const suggestedKey = cmd.suggested_key as Record<string, string>;
    expect(suggestedKey).toBeDefined();
    expect(suggestedKey.default).toBe('Alt+Shift+B');
  });

  it('快捷键命令 suggested_key 包含 mac (Alt+Shift+B)', () => {
    const commands = manifest.commands as Record<string, unknown>;
    const cmd = commands['open-browserhelm-side-panel'] as Record<string, unknown>;
    const suggestedKey = cmd.suggested_key as Record<string, string>;
    expect(suggestedKey.mac).toBe('Alt+Shift+B');
  });
});

describe('manifest action / web_accessible_resources 契约', () => {
  it('action 配置存在', () => {
    const action = manifest.action as Record<string, unknown>;
    expect(action).toBeDefined();
  });

  it('action default_title 与产品入口一致', () => {
    const action = manifest.action as Record<string, unknown>;
    expect(action.default_title).toMatch(/BrowserHelm/u);
  });

  it('web_accessible_resources 包含 sidepanel.html', () => {
    const resources = manifest.web_accessible_resources as Array<{ resources: string[] }>;
    const allResources = resources.flatMap((entry) => entry.resources);
    expect(allResources).toContain('sidepanel.html');
  });

  it('web_accessible_resources 包含 icons/*', () => {
    const resources = manifest.web_accessible_resources as Array<{ resources: string[] }>;
    const allResources = resources.flatMap((entry) => entry.resources);
    expect(allResources).toContain('icons/*');
  });

  it('web_accessible_resources 不暴露构建资产通配符', () => {
    const resources = manifest.web_accessible_resources as Array<{ resources: string[] }>;
    const allResources = resources.flatMap((entry) => entry.resources);
    expect(allResources).not.toContain('assets/*');
  });

  it('web_accessible_resources 只暴露给 http/https 页面', () => {
    const resources = manifest.web_accessible_resources as Array<{ matches: string[] }>;
    for (const entry of resources) {
      expect(entry.matches).toEqual(expect.arrayContaining(['http://*/*', 'https://*/*']));
      expect(entry.matches).not.toContain('<all_urls>');
    }
  });
});

describe('manifest description / name', () => {
  it('name 为 BrowserHelm', () => {
    expect(manifest.name).toBe('BrowserHelm');
  });

  it('description 不为空', () => {
    expect(manifest.description).toBeTruthy();
    expect(typeof manifest.description).toBe('string');
  });
});
