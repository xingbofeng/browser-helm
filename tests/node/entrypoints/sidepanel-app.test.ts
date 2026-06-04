import { describe, expect, it } from 'vitest';

import {
  readTargetTabChangedRunId,
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

  it('仅有 runId 时固定查看该 run，避免被 active tab 消息覆盖', () => {
    expect(resolveTargetModeFromSearch('?runId=run_1')).toBe('pinned');
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

describe('readTargetTabChangedRunId', () => {
  it('有 target tab changed 消息且携带 runId 时提取 runId', () => {
    expect(
      readTargetTabChangedRunId({
        type: 'BH_SIDE_PANEL_TARGET_TAB_CHANGED',
        tabId: 42,
        runId: 'run_1'
      })
    ).toBe('run_1');
  });

  it('缺少或非法 runId 返回 undefined', () => {
    expect(
      readTargetTabChangedRunId({
        type: 'BH_SIDE_PANEL_TARGET_TAB_CHANGED',
        tabId: 42
      })
    ).toBeUndefined();
    expect(
      readTargetTabChangedRunId({
        type: 'BH_SIDE_PANEL_TARGET_TAB_CHANGED',
        tabId: 42,
        runId: ''
      })
    ).toBeUndefined();
    expect(
      readTargetTabChangedRunId({
        type: 'BH_SIDE_PANEL_TARGET_TAB_CHANGED',
        tabId: 42,
        runId: 123
      })
    ).toBeUndefined();
  });
});
