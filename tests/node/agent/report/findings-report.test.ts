import { describe, expect, it } from 'vitest';

import {
  buildDebugReport,
  buildFormDoctorFindings,
  buildPageHealthFindings,
  buildFinding,
  confidenceFromEvidence
} from '../../../../src/agent/report/findings-report';

describe('findings-report', () => {
  it('builds high-confidence finding from direct evidence', () => {
    const finding = buildFinding({
      title: '邮箱缺失',
      explanation: 'Email 是必填字段但为空',
      evidence: [
        {
          source: 'form',
          summary: 'Email required empty',
          refId: 'ref_email'
        }
      ]
    });

    expect(finding.confidence).toBe('high');
    expect(finding.evidence[0]?.source).toBe('form');
  });

  it('downgrades missing evidence to low confidence limitation', () => {
    expect(confidenceFromEvidence([])).toBe('low');
    const report = buildDebugReport({
      title: '页面诊断报告',
      findings: [],
      recommendations: [],
      limitations: ['未能读取 console/network 浅层信号']
    });

    expect(report.limitations).toContain('未能读取 console/network 浅层信号');
  });

  it('keeps inferred evidence at medium confidence', () => {
    const finding = buildFinding({
      title: '提交按钮可能因必填字段为空而禁用',
      explanation: '页面同时存在 disabled submit 与空 required 字段。',
      evidence: [
        {
          source: 'tool_result',
          summary: 'disabled submit reason inferred'
        }
      ],
      inferred: true
    });

    expect(finding.confidence).toBe('medium');
  });

  it('builds Form Doctor findings with evidence and confidence', () => {
    const findings = buildFormDoctorFindings({
      fields: [
        {
          refId: 'ref_email',
          label: 'Email',
          name: 'email',
          type: 'email',
          required: true,
          disabled: false,
          sensitive: false,
          valuePreview: 'empty',
          validation: {
            valid: false,
            message: '请填写邮箱',
            ariaInvalid: true
          },
          warnings: []
        }
      ],
      submit: {
        disabled: true,
        reason: {
          kind: 'inferred',
          message: '必填字段为空',
          fieldRefId: 'ref_email'
        }
      },
      warnings: []
    });

    expect(findings.map((finding) => finding.title)).toEqual([
      '必填字段为空',
      '字段校验失败',
      '提交按钮不可用'
    ]);
    expect(findings[0]?.confidence).toBe('high');
    expect(findings[0]?.evidence[0]).toMatchObject({
      source: 'form',
      refId: 'ref_email'
    });
    expect(findings[1]?.evidence[0]?.summary).toContain('请填写邮箱');
    expect(findings[2]?.confidence).toBe('medium');
    expect(findings[2]?.evidence[0]?.refId).toBe('ref_email');
  });

  it('builds Page Inspector findings from console and network health signals', () => {
    const findings = buildPageHealthFindings({
      consoleErrors: [
        {
          message: 'Uncaught TypeError',
          source: 'app.js',
          count: 2
        }
      ],
      networkFailures: [
        {
          url: 'https://api.example.com/users',
          method: 'GET',
          errorText: 'Failed to fetch'
        }
      ],
      hasForm: false,
      pageStateSummary: '检测到 1 类 console error 和 1 个 network failure',
      limitations: ['CDP deep inspection is not used']
    });

    expect(findings.map((finding) => finding.title)).toEqual([
      'Console error',
      'Network failure'
    ]);
    expect(findings[0]?.confidence).toBe('high');
    expect(findings[0]?.evidence[0]).toMatchObject({
      source: 'debug',
      summary: 'app.js: Uncaught TypeError (2 次)'
    });
    expect(findings[1]?.evidence[0]?.summary).toContain('GET https://api.example.com/users');
  });
});
