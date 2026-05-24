import { describe, expect, it } from 'vitest';

import {
  elementRefSchema,
  observationContextSummarySchema,
  observationSchema
} from '../../../../src/shared/schemas/observation.schema';
import { ERROR_CODES } from '../../../../src/shared/errors/error-codes';

describe('observation schemas', () => {
  it('accepts a page observation with origin metadata and ref summary', () => {
    const parsed = observationSchema.parse({
      url: 'https://demo.example.com/register',
      title: '欢迎注册 - 示例网站',
      currentDomain: 'demo.example.com',
      origin: 'https://demo.example.com',
      visibleText: '创建账号 注册即可体验全部功能',
      visibleTextSummary: '创建账号 注册即可体验全部功能',
      pageStateSummary: '页面包含 5 个可交互元素',
      refSummary: [
        {
          refId: 'ref_101',
          role: 'button',
          name: '提交',
          tagName: 'button',
          visible: true,
          disabled: true
        }
      ],
      warnings: ['visible text truncated']
    });

    expect(parsed.refSummary[0]?.refId).toBe('ref_101');
    expect(parsed.origin).toBe('https://demo.example.com');
  });

  it('keeps context summary bounded and source-labelled', () => {
    const parsed = observationContextSummarySchema.parse({
      url: 'https://demo.example.com/register',
      title: '欢迎注册 - 示例网站',
      currentDomain: 'demo.example.com',
      origin: 'https://demo.example.com',
      pageStateSummary: '页面包含 5 个可交互元素',
      visibleTextSummary: '来自 https://demo.example.com 的页面文本: 创建账号',
      interactiveCount: 5,
      refHighlights: [
        elementRefSchema.parse({
          refId: 'ref_101',
          role: 'button',
          name: '提交',
          tagName: 'button',
          visible: true
        })
      ],
      warnings: []
    });

    expect(parsed.visibleTextSummary).toContain('https://demo.example.com');
    expect(parsed.refHighlights).toHaveLength(1);
  });

  it('defines structured observation and ref errors', () => {
    expect(ERROR_CODES.REF_NOT_FOUND).toBe('REF_NOT_FOUND');
    expect(ERROR_CODES.REF_STALE).toBe('REF_STALE');
    expect(ERROR_CODES.CONTENT_SCRIPT_UNAVAILABLE).toBe(
      'CONTENT_SCRIPT_UNAVAILABLE'
    );
    expect(ERROR_CODES.OBSERVATION_BUDGET_EXCEEDED).toBe(
      'OBSERVATION_BUDGET_EXCEEDED'
    );
    expect(ERROR_CODES.OBSERVATION_FAILED).toBe('OBSERVATION_FAILED');
  });
});
