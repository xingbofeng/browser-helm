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
const e2eElevatedPermissions = ['downloads', 'offscreen', 'clipboardRead', 'clipboardWrite'] as const;

function isE2eRequiredPermissionManifest(): boolean {
  const permissions = (manifest.permissions as string[] | undefined) ?? [];
  const optionalPermissions = (manifest.optional_permissions as string[] | undefined) ?? [];

  return e2eElevatedPermissions.every((permission) => permissions.includes(permission))
    && e2eElevatedPermissions.every((permission) => !optionalPermissions.includes(permission));
}

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

  it('包含 contextMenus 权限，用于选中文字后一键解释和翻译', () => {
    const permissions = manifest.permissions as string[];
    expect(permissions).toContain('contextMenus');
  });

  it('包含 storage 权限', () => {
    const permissions = manifest.permissions as string[];
    expect(permissions).toContain('storage');
  });

  it('始终把 debugger 声明为 required，因为 Chrome 不允许它作为 optional permission', () => {
    const permissions = manifest.permissions as string[];
    const optionalPermissions = manifest.optional_permissions as string[];

    expect(permissions).toContain('debugger');
    expect(optionalPermissions).not.toContain('debugger');
  });

  it('默认产物授予 downloads，用于右键长图等大文件自动下载', () => {
    const permissions = manifest.permissions as string[];
    const optionalPermissions = manifest.optional_permissions as string[];

    expect(permissions).toContain('downloads');
    expect(optionalPermissions).not.toContain('downloads');
  });

  it('默认产物不授予 clipboard；E2E 产物仅在测试 profile 中提升为 required', () => {
    const permissions = manifest.permissions as string[];
    const optionalPermissions = manifest.optional_permissions as string[];
    if (isE2eRequiredPermissionManifest()) {
      expect(permissions).toEqual(expect.arrayContaining(['offscreen', 'clipboardRead', 'clipboardWrite']));
      expect(optionalPermissions).not.toEqual(expect.arrayContaining(['offscreen', 'clipboardRead', 'clipboardWrite']));
      return;
    }

    expect(optionalPermissions).toEqual(expect.arrayContaining(['offscreen', 'clipboardRead', 'clipboardWrite']));
    expect(permissions).not.toContain('clipboardRead');
    expect(permissions).not.toContain('clipboardWrite');
  });

  it('使用 activeTab，并只把 http/https 放入 optional host 权限', () => {
    const permissions = manifest.permissions as string[];
    const hostPermissions = (manifest.host_permissions as string[] | undefined) ?? [];
    const optionalHostPermissions = manifest.optional_host_permissions as string[];

    expect(permissions).toContain('activeTab');
    expect(hostPermissions).toEqual([]);
    expect(hostPermissions).not.toContain('<all_urls>');
    expect(optionalHostPermissions).toEqual(expect.arrayContaining(['http://*/*', 'https://*/*']));
    expect(optionalHostPermissions).not.toContain('<all_urls>');
  });
});

describe('manifest commands 契约', () => {
  const expectedCommands = {
    'open-browserhelm-side-panel': 'Alt+Shift+B',
    'browserhelm-selection-to-markdown': 'Alt+Shift+M',
    'browserhelm-selection-explain': 'Alt+Shift+E',
    'browserhelm-selection-translate': 'Alt+Shift+T',
    'browserhelm-vision-capture-viewport': undefined,
    'browserhelm-vision-capture-full-page': undefined,
    'browserhelm-vision-collect-images': undefined
  } as const;

  it('存在 open-browserhelm-side-panel 快捷键命令', () => {
    const commands = manifest.commands as Record<string, unknown>;
    expect(commands).toHaveProperty('open-browserhelm-side-panel');
  });

  it('为右键菜单的六个功能提供快捷键命令', () => {
    const commands = manifest.commands as Record<string, unknown>;

    expect(Object.keys(commands).sort()).toEqual(Object.keys(expectedCommands).sort());
  });

  it('快捷键命令描述不为空', () => {
    const commands = manifest.commands as Record<string, unknown>;
    for (const commandName of Object.keys(expectedCommands)) {
      const cmd = commands[commandName] as Record<string, unknown>;
      expect(cmd.description).toBeTruthy();
      expect(typeof cmd.description).toBe('string');
    }
  });

  it('最多只声明 4 个 suggested_key，避免 Chrome 拒绝加载扩展', () => {
    const commands = manifest.commands as Record<string, unknown>;
    const commandsWithSuggestedKeys = Object.values(commands).filter((command) =>
      Boolean((command as Record<string, unknown>).suggested_key)
    );

    expect(commandsWithSuggestedKeys).toHaveLength(4);
  });

  it('快捷键命令 suggested_key 符合 Chrome 4 个默认快捷键上限', () => {
    const commands = manifest.commands as Record<string, unknown>;
    for (const [commandName, shortcut] of Object.entries(expectedCommands)) {
      const cmd = commands[commandName] as Record<string, unknown>;
      const suggestedKey = cmd.suggested_key as Record<string, string> | undefined;
      if (!shortcut) {
        expect(suggestedKey).toBeUndefined();
        continue;
      }
      expect(suggestedKey?.default).toBe(shortcut);
      expect(suggestedKey?.mac).toBe(shortcut);
    }
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
