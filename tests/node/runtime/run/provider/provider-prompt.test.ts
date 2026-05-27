import { describe, expect, it } from 'vitest';
import { providerPrompt } from '../../../../../src/background/runtime/run/provider/provider-prompt';
import type { RunSnapshot } from '../../../../../src/runtime/runtime-messages';

const baseSnapshot: RunSnapshot = {
  runId: 'run_1',
  mode: 'ask',
  status: 'observed',
  observation: {
    url: 'https://example.com/form',
    title: 'Test Form',
    currentDomain: 'example.com',
    origin: 'https://example.com',
    visibleTextSummary: 'Name: ___ Email: ___',
    pageStateSummary: '3 elements',
    interactiveCount: 2,
    warnings: []
  }
};

describe('providerPrompt', () => {
  it('includes user task', () => {
    const prompt = providerPrompt('fill the form', baseSnapshot);
    expect(prompt).toContain('用户任务：fill the form');
  });

  it('includes page title and domain', () => {
    const prompt = providerPrompt('test', baseSnapshot);
    expect(prompt).toContain('Test Form');
    expect(prompt).toContain('example.com');
  });

  it('shows fallback when no observation', () => {
    const snapshot: RunSnapshot = {
      runId: 'run_1',
      mode: 'ask',
      status: 'observing'
    };
    const prompt = providerPrompt('test', snapshot);
    expect(prompt).toContain('尚未获得页面摘要');
  });

  it('does not expose ref_id in prompt', () => {
    const prompt = providerPrompt('test', baseSnapshot);
    expect(prompt).not.toContain('ref_id');
    expect(prompt).not.toContain('refId');
  });

  it('does not contain raw JSON', () => {
    const prompt = providerPrompt('test', baseSnapshot);
    expect(prompt).not.toContain('"refSummary"');
    expect(prompt).not.toContain('"observation"');
  });

  it('ends with instruction to answer in Chinese', () => {
    const prompt = providerPrompt('test', baseSnapshot);
    expect(prompt).toContain('请基于这些信息');
  });
});
