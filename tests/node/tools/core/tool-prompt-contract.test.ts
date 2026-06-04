import { describe, expect, it } from 'vitest';
import { toolManifestHash } from '../../../../src/tools/core/tool-prompt-contract';
import type { ToolPromptContract } from '../../../../src/tools/core/tool-router';

const baseContract: ToolPromptContract = {
  name: 'bh_page_observe',
  title: '页面观察',
  description: 'Observe the current page',
  modes: ['ask', 'form', 'act'],
  risk: 'safe',
  argsSchema: { type: 'object', properties: {}, additionalProperties: false },
  readOnly: true,
  requiresApproval: false,
  contextVisibility: 'summary'
};

describe('toolManifestHash', () => {
  it('produces a stable hash for the same contract', () => {
    const a = toolManifestHash([baseContract]);
    const b = toolManifestHash([baseContract]);
    expect(a).toBe(b);
  });

  it('produces different hashes for different tool names', () => {
    const a = toolManifestHash([baseContract]);
    const b = toolManifestHash([{
      ...baseContract,
      name: 'bh_different_tool'
    }]);
    expect(a).not.toBe(b);
  });

  it('produces different hashes for different descriptions', () => {
    const a = toolManifestHash([baseContract]);
    const b = toolManifestHash([{
      ...baseContract,
      description: 'A different description'
    }]);
    expect(a).not.toBe(b);
  });

  it('produces different hashes for different risk levels', () => {
    const a = toolManifestHash([baseContract]);
    const b = toolManifestHash([{
      ...baseContract,
      risk: 'high'
    }]);
    expect(a).not.toBe(b);
  });

  it('produces different hashes for different readOnly values', () => {
    const a = toolManifestHash([baseContract]);
    const b = toolManifestHash([{
      ...baseContract,
      readOnly: false
    }]);
    expect(a).not.toBe(b);
  });

  it('produces different hashes for different requiresApproval values', () => {
    const a = toolManifestHash([baseContract]);
    const b = toolManifestHash([{
      ...baseContract,
      requiresApproval: true
    }]);
    expect(a).not.toBe(b);
  });

  it('produces different hashes for different approval behaviors', () => {
    const a = toolManifestHash([{
      ...baseContract,
      requiresApproval: true,
      approvalBehavior: 'record_only'
    }]);
    const b = toolManifestHash([{
      ...baseContract,
      requiresApproval: true,
      approvalBehavior: 'execute_pending_action'
    }]);
    expect(a).not.toBe(b);
  });

  it('produces different hashes for different modes', () => {
    const a = toolManifestHash([baseContract]);
    const b = toolManifestHash([{
      ...baseContract,
      modes: ['ask']
    }]);
    expect(a).not.toBe(b);
  });

  it('is stable regardless of tool order in the array', () => {
    const contract2: ToolPromptContract = {
      ...baseContract,
      name: 'bh_form_fill_many',
      description: 'Fill many form fields',
      modes: ['form'],
      risk: 'medium',
      readOnly: false,
      requiresApproval: false,
      contextVisibility: 'summary'
    };
    const a = toolManifestHash([baseContract, contract2]);
    const b = toolManifestHash([contract2, baseContract]);
    expect(a).toBe(b);
  });

  it('produces a non-empty hex string', () => {
    const hash = toolManifestHash([baseContract]);
    expect(hash).toBeTypeOf('string');
    expect(hash.length).toBeGreaterThan(0);
    expect(/^[a-f0-9]+$/u.test(hash)).toBe(true);
  });

  it('handles empty array', () => {
    const hash = toolManifestHash([]);
    expect(hash).toBeTypeOf('string');
    expect(hash.length).toBeGreaterThan(0);
  });

  it('is not affected by title field changes (not part of manifest)', () => {
    const a = toolManifestHash([baseContract]);
    const b = toolManifestHash([{
      ...baseContract,
      title: 'A different title'
    }]);
    // Title is NOT part of the manifest hash per spec
    expect(a).toBe(b);
  });
});
