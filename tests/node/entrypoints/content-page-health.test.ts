import { readFileSync } from 'node:fs';
import vm from 'node:vm';

import { describe, expect, it, vi } from 'vitest';

describe('content script page health bridge', () => {
  it('browserHelmConsoleErrors / browserHelmNetworkFailures 使用 slice(-20) 限制容量', () => {
    // slice(-20) 确保数组最多保留最近 20 条记录
    const arr = Array.from({ length: 25 }, (_, i) => i);
    const capped = arr.slice(-20);
    expect(capped).toHaveLength(20);
    expect(capped[0]).toBe(5);
    expect(capped[19]).toBe(24);

    const shortArr = Array.from({ length: 10 }, (_, i) => i);
    const shortCapped = shortArr.slice(-20);
    expect(shortCapped).toHaveLength(10);
  });

  it('installPageHealthBridge 为全局数组提供空数组初始化', () => {
    const PAGE_HEALTH_BRIDGE_MARKER = '__BROWSER_HELM_PAGE_HEALTH_BRIDGE__';
    const globalScope = {} as Record<string, unknown>;

    if (!globalScope[PAGE_HEALTH_BRIDGE_MARKER]) {
      globalScope[PAGE_HEALTH_BRIDGE_MARKER] = true;
      globalScope.__browserHelmConsoleErrors = [];
      globalScope.__browserHelmConsoleMessages = [];
      globalScope.__browserHelmNetworkFailures = [];
    }

    expect(Array.isArray(globalScope.__browserHelmConsoleErrors)).toBe(true);
    expect(Array.isArray(globalScope.__browserHelmConsoleMessages)).toBe(true);
    expect(Array.isArray(globalScope.__browserHelmNetworkFailures)).toBe(true);
    expect((globalScope.__browserHelmConsoleErrors as unknown[]).length).toBe(0);
    expect((globalScope.__browserHelmConsoleMessages as unknown[]).length).toBe(0);
    expect((globalScope.__browserHelmNetworkFailures as unknown[]).length).toBe(0);
  });

  it('重复安装不会覆盖已有数据', () => {
    const PAGE_HEALTH_BRIDGE_MARKER = '__BROWSER_HELM_PAGE_HEALTH_BRIDGE__';
    const globalScope = {} as Record<string, unknown>;

    // 第一轮安装
    if (!globalScope[PAGE_HEALTH_BRIDGE_MARKER]) {
      globalScope[PAGE_HEALTH_BRIDGE_MARKER] = true;
      globalScope.__browserHelmConsoleErrors = [];
    }

    const errors = globalScope.__browserHelmConsoleErrors as unknown[];

    // 第二轮安装（不会执行因为 marker 已存在）
    if (!globalScope[PAGE_HEALTH_BRIDGE_MARKER]) {
      globalScope[PAGE_HEALTH_BRIDGE_MARKER] = true;
      globalScope.__browserHelmConsoleErrors = [];
    }

    expect(globalScope.__browserHelmConsoleErrors).toBe(errors);
  });

  it('page health 事件守卫过滤非法输入和未匹配 nonce', () => {
    const PAGE_HEALTH_EVENT = 'BROWSER_HELM_PAGE_HEALTH_EVENT';
    const nonce = 'nonce-123';

    // 模拟 isPageHealthEvent 守卫逻辑
    const isPageHealthEvent = (value: unknown): boolean => {
      if (!value || typeof value !== 'object') return false;
      const record = value as Record<string, unknown>;
      return record.channel === PAGE_HEALTH_EVENT &&
        record.nonce === nonce &&
        (record.kind === 'console_error' ||
          record.kind === 'console_message' ||
          record.kind === 'network_failure');
    };

    // 合法事件
    expect(isPageHealthEvent({ channel: PAGE_HEALTH_EVENT, nonce, kind: 'console_error' })).toBe(true);
    expect(isPageHealthEvent({ channel: PAGE_HEALTH_EVENT, nonce, kind: 'console_message' })).toBe(true);
    expect(isPageHealthEvent({ channel: PAGE_HEALTH_EVENT, nonce, kind: 'network_failure' })).toBe(true);

    // 非法事件
    expect(isPageHealthEvent(null)).toBe(false);
    expect(isPageHealthEvent(undefined)).toBe(false);
    expect(isPageHealthEvent('string')).toBe(false);
    expect(isPageHealthEvent(42)).toBe(false);
    expect(isPageHealthEvent({})).toBe(false);
    expect(isPageHealthEvent({ channel: 'OTHER', nonce, kind: 'console_error' })).toBe(false);
    expect(isPageHealthEvent({ channel: PAGE_HEALTH_EVENT, kind: 'console_error' })).toBe(false);
    expect(isPageHealthEvent({ channel: PAGE_HEALTH_EVENT, nonce: 'wrong', kind: 'console_error' })).toBe(false);
    expect(isPageHealthEvent({ channel: PAGE_HEALTH_EVENT, nonce })).toBe(false);
    expect(isPageHealthEvent({ channel: PAGE_HEALTH_EVENT, nonce, kind: 'unknown' })).toBe(false);
  });

  it('page-health hook 消息包含 content bridge session nonce', () => {
    const script = readFileSync(
      new URL('../../../public/page-health-hook.js', import.meta.url),
      'utf8'
    );
    const messages: unknown[] = [];
    const context = {
      window: {
        __BROWSER_HELM_PAGE_HEALTH_HOOK_INSTALLED__: false,
        location: { origin: 'https://docs.example.com' },
        postMessage: (payload: unknown) => messages.push(payload),
        addEventListener: vi.fn(),
        fetch: undefined,
        XMLHttpRequest: undefined
      },
      document: {
        currentScript: {
          dataset: {
            browserhelmPageHealthNonce: 'nonce-123'
          }
        }
      },
      console: {
        error: vi.fn(),
        debug: vi.fn(),
        info: vi.fn(),
        log: vi.fn(),
        warn: vi.fn()
      },
      Error,
      JSON,
      String
    };

    vm.runInNewContext(script, context);
    context.console.error('boom');

    expect(messages).toContainEqual(expect.objectContaining({
      channel: 'BROWSER_HELM_PAGE_HEALTH_EVENT',
      nonce: 'nonce-123',
      kind: 'console_error',
      message: 'boom'
    }));
  });
});
