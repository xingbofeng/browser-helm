import { describe, expect, it } from 'vitest';

import { classifyTask } from '../../../../src/agent/task/task-classifier';

describe('classifyTask', () => {
  it('classifies form diagnosis requests as form mode', () => {
    const result = classifyTask('帮我看这个表单为什么不能提交，哪些必填项缺失');

    expect(result.mode).toBe('form');
    expect(result.confidence).toBe('high');
    expect(result.matchedSignals).toContain('表单');
  });

  it('classifies page error requests as debug mode', () => {
    const result = classifyTask('检查这个页面 console 和 network 为什么报错');

    expect(result.mode).toBe('debug');
    expect(result.reason).toContain('页面');
  });

  it('classifies action requests as act mode without promising execution', () => {
    const result = classifyTask('帮我点击提交按钮');

    expect(result.mode).toBe('act');
    expect(result.reason).toContain('动作准备');
  });

  it('classifies general questions as ask mode', () => {
    const result = classifyTask('总结一下当前页面内容');

    expect(result.mode).toBe('ask');
    expect(result.confidence).toBe('medium');
  });

  it('safely falls back to ask mode for ambiguous tasks', () => {
    const result = classifyTask('看看这个');

    expect(result.mode).toBe('ask');
    expect(result.confidence).toBe('low');
  });
});
