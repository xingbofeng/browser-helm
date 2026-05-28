import { describe, expect, it } from 'vitest';

import { selectToolsForRun } from '../../../../src/tools/core/tool-selector';
import type { ToolPromptContract } from '../../../../src/tools/core/tool-router';

const tools: ToolPromptContract[] = [
  {
    name: 'bh_page_observe',
    title: 'Observe',
    description: 'Observe page',
    modes: ['ask', 'debug', 'form', 'act'],
    risk: 'safe',
    argsSchema: {},
    readOnly: true,
    requiresApproval: false,
    contextVisibility: 'summary'
  },
  {
    name: 'bh_form_fill_many',
    title: 'Fill many',
    description: 'Fill fields',
    modes: ['form'],
    risk: 'medium',
    argsSchema: {},
    readOnly: false,
    requiresApproval: false,
    contextVisibility: 'summary'
  },
  {
    name: 'bh_form_submit_with_approval',
    title: 'Submit',
    description: 'Submit form',
    modes: ['form'],
    risk: 'high',
    argsSchema: {},
    readOnly: false,
    requiresApproval: true,
    contextVisibility: 'summary'
  }
];

describe('core ToolSelector', () => {
  it('selects by mode, page state, permission, and risk from the core tools package', () => {
    const result = selectToolsForRun({
      mode: 'form',
      task: '填写表单',
      tools,
      capabilities: {
        hasActiveTab: true,
        hasDebuggerPermission: false,
        hasClipboardPermission: false,
        hasDownloadsPermission: false,
        hostPermissions: [],
        shallowDebugAvailable: true,
        cdp: 'reserved'
      },
      pageState: {
        hasForm: true
      }
    });

    expect(result.visibleTools).toContain('bh_page_observe');
    expect(result.visibleTools).toContain('bh_form_fill_many');
    expect(result.hiddenTools).toContainEqual({
      tool: 'bh_form_submit_with_approval',
      reason: 'High-risk tools require explicit approval boundary'
    });
  });

  it('pauses risky tools while an approval request is pending', () => {
    const result = selectToolsForRun({
      mode: 'form',
      task: '填写表单',
      tools,
      capabilities: {
        hasActiveTab: true,
        hasDebuggerPermission: false,
        hasClipboardPermission: false,
        hasDownloadsPermission: false,
        hostPermissions: [],
        shallowDebugAvailable: true,
        cdp: 'reserved'
      },
      pendingApproval: true,
      pageState: { hasForm: true }
    });

    expect(result.visibleTools).toEqual(['bh_page_observe']);
    expect(result.hiddenTools).toContainEqual({
      tool: 'bh_form_fill_many',
      reason: 'A pending approval is active; mutating or risky tools are paused'
    });
  });

  it('applies domain policy limitations before exposing tools', () => {
    const result = selectToolsForRun({
      mode: 'form',
      task: '填写表单',
      tools,
      capabilities: {
        hasActiveTab: true,
        hasDebuggerPermission: false,
        hasClipboardPermission: false,
        hasDownloadsPermission: false,
        hostPermissions: [],
        shallowDebugAvailable: true,
        cdp: 'reserved'
      },
      permissions: { allowedDomains: ['example.com'] },
      pageDomain: 'bank.example',
      pageState: { hasForm: true }
    });

    expect(result.visibleTools).toEqual([]);
    expect(result.limitations).toContain('Domain bank.example is not allowed');
  });
});
