import { describe, expect, it } from 'vitest';

import { selectToolsForRun } from '../../../../src/agent/modes/tool-selector';
import type { ToolPromptContract } from '../../../../src/tools/core/tool-router';

const tools: ToolPromptContract[] = [
  {
    name: 'bh_page_observe',
    title: 'Observe',
    description: 'Observe page',
    modes: ['ask', 'debug', 'form'],
    risk: 'safe',
    argsSchema: {}
  },
  {
    name: 'bh_debug_collect_page_health',
    title: 'Page Health',
    description: 'Collect page health',
    modes: ['debug'],
    risk: 'safe',
    argsSchema: {}
  },
  {
    name: 'bh_form_read_fields',
    title: 'Read Fields',
    description: 'Read form fields',
    modes: ['form'],
    risk: 'safe',
    argsSchema: {}
  },
  {
    name: 'bh_iframe_click',
    title: 'Click',
    description: 'Click iframe target',
    modes: ['act'],
    risk: 'high',
    argsSchema: {}
  }
];

describe('selectToolsForRun', () => {
  it('selects only tools relevant to debug mode and task', () => {
    const result = selectToolsForRun({
      mode: 'debug',
      task: '检查 console 错误',
      tools,
      capabilities: {
        hasActiveTab: true,
        hasDebuggerPermission: false,
        hasClipboardPermission: false,
        hasDownloadsPermission: false,
        hostPermissions: [],
        shallowDebugAvailable: true,
        cdp: 'reserved'
      }
    });

    expect(result.visibleTools).toEqual([
      'bh_page_observe',
      'bh_debug_collect_page_health'
    ]);
    expect(result.hiddenTools.map((tool) => tool.tool)).toContain(
      'bh_form_read_fields'
    );
  });

  it('hides debug tools when shallow debug is unavailable', () => {
    const result = selectToolsForRun({
      mode: 'debug',
      task: '检查 console 错误',
      tools,
      capabilities: {
        hasActiveTab: true,
        hasDebuggerPermission: false,
        hasClipboardPermission: false,
        hasDownloadsPermission: false,
        hostPermissions: [],
        shallowDebugAvailable: false,
        cdp: 'reserved'
      }
    });

    expect(result.visibleTools).toEqual(['bh_page_observe']);
    expect(result.limitations).toContain('Shallow debug signals are unavailable');
  });

  it('hides high-risk act tools by default', () => {
    const result = selectToolsForRun({
      mode: 'act',
      task: '点击提交按钮',
      tools,
      capabilities: {
        hasActiveTab: true,
        hasDebuggerPermission: false,
        hasClipboardPermission: false,
        hasDownloadsPermission: false,
        hostPermissions: [],
        shallowDebugAvailable: true,
        cdp: 'reserved'
      }
    });

    expect(result.visibleTools).toEqual(['bh_page_observe']);
    expect(result.hiddenTools).toContainEqual({
      tool: 'bh_iframe_click',
      reason: 'High-risk tools require explicit approval boundary'
    });
  });

  it('hides page-dependent tools when active tab capability is unavailable', () => {
    const result = selectToolsForRun({
      mode: 'form',
      task: '诊断表单',
      tools,
      capabilities: {
        hasActiveTab: false,
        hasDebuggerPermission: false,
        hasClipboardPermission: false,
        hasDownloadsPermission: false,
        hostPermissions: [],
        shallowDebugAvailable: true,
        cdp: 'reserved'
      }
    });

    expect(result.visibleTools).toEqual([]);
    expect(result.hiddenTools.map((tool) => tool.tool)).toEqual([
      'bh_page_observe',
      'bh_debug_collect_page_health',
      'bh_form_read_fields',
      'bh_iframe_click'
    ]);
    expect(result.limitations).toContain('No active tab is available');
  });

  it('uses page state to hide form tools after a no-form observation', () => {
    const result = selectToolsForRun({
      mode: 'form',
      task: '诊断表单',
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
        hasForm: false
      }
    });

    expect(result.visibleTools).toEqual(['bh_page_observe']);
    expect(result.hiddenTools).toContainEqual({
      tool: 'bh_form_read_fields',
      reason: 'No form is detected in current page state'
    });
    expect(result.limitations).toContain('No form detected on page');
  });
});
