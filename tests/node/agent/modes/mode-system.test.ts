import { describe, expect, it } from 'vitest';

import { resolveRunMode } from '../../../../src/agent/modes/mode-system';

describe('resolveRunMode', () => {
  it('uses explicit mode while adding classification reason', () => {
    const result = resolveRunMode({
      task: '帮我看这个页面为什么报错',
      explicitMode: 'form'
    });

    expect(result.mode).toBe('form');
    expect(result.classification.mode).toBe('form');
    expect(result.reason).toContain('显式');
  });

  it('classifies mode when no explicit mode is provided', () => {
    const result = resolveRunMode({
      task: '检查 console 和 network 错误'
    });

    expect(result.mode).toBe('debug');
    expect(result.classification.confidence).toBe('high');
  });

  it('defaults ambiguous tasks to ask mode', () => {
    const result = resolveRunMode({
      task: '看看这个'
    });

    expect(result.mode).toBe('ask');
    expect(result.classification.confidence).toBe('low');
  });

  it('keeps act as action preparation instead of execution', () => {
    const result = resolveRunMode({
      task: '点击提交按钮'
    });

    expect(result.mode).toBe('act');
    expect(result.reason).toContain('不自动执行');
  });
});
