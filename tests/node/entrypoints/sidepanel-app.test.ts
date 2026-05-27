import { describe, expect, it } from 'vitest';

import {
  readTargetTabChangedTabId,
  resolveTargetModeFromSearch
} from '../../../src/entrypoints/sidepanel/app';

describe('resolveTargetModeFromSearch', () => {
  it('target=active 返回 active', () => {
    expect(resolveTargetModeFromSearch('?target=active')).toBe('active');
    expect(resolveTargetModeFromSearch('?target=active&tabId=42')).toBe('active');
  });

  it('仅有 tabId 无 target=active 返回 pinned', () => {
    expect(resolveTargetModeFromSearch('?tabId=42')).toBe('pinned');
    expect(resolveTargetModeFromSearch('?tabId=7&foo=bar')).toBe('pinned');
  });

  it('无任何参数返回 active', () => {
    expect(resolveTargetModeFromSearch('')).toBe('active');
    expect(resolveTargetModeFromSearch('?other=1')).toBe('active');
  });

  it('空搜索字符串返回 active', () => {
    expect(resolveTargetModeFromSearch('')).toBe('active');
  });
});

describe('readTargetTabChangedTabId', () => {
  it('有 target tab changed 消息时提取 tabId', () => {
    expect(
      readTargetTabChangedTabId({
        type: 'BH_SIDE_PANEL_TARGET_TAB_CHANGED',
        tabId: 42
      })
    ).toBe(42);
  });

  it('非对象返回 undefined', () => {
    expect(readTargetTabChangedTabId(null)).toBeUndefined();
    expect(readTargetTabChangedTabId(undefined)).toBeUndefined();
    expect(readTargetTabChangedTabId(123)).toBeUndefined();
  });

  it('缺少 tabId 返回 undefined', () => {
    expect(
      readTargetTabChangedTabId({ type: 'BH_SIDE_PANEL_TARGET_TAB_CHANGED' })
    ).toBeUndefined();
  });

  it('tabId 非 number 返回 undefined', () => {
    expect(
      readTargetTabChangedTabId({
        type: 'BH_SIDE_PANEL_TARGET_TAB_CHANGED',
        tabId: '42'
      })
    ).toBeUndefined();
  });
});
