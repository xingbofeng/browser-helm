import { describe, expect, it } from 'vitest';

import { selectToolsForRun } from '../../../../src/agent/modes/tool-selector';
import type { ToolPromptContract } from '../../../../src/tools/core/tool-router';

const visionTool: ToolPromptContract = {
  name: 'bh_vision_describe_viewport',
  title: 'Describe Viewport',
  description: 'Describe viewport visually',
  modes: ['debug', 'vision'],
  risk: 'safe',
  argsSchema: {},
  readOnly: true,
  requiresApproval: false,
  contextVisibility: 'summary'
};

describe('vision tool selection policy', () => {
  it('hides vision tools for ordinary DOM/a11y tasks', () => {
    const result = selectToolsForRun({
      mode: 'debug',
      task: '读取页面表单字段',
      tools: [visionTool],
      capabilities: capabilities()
    });

    expect(result.visibleTools).toEqual([]);
    expect(result.hiddenTools).toContainEqual({
      tool: 'bh_vision_describe_viewport',
      reason: 'Vision tools are reserved for visual ambiguity or DOM/a11y fallback'
    });
  });

  it('exposes vision tools when the task asks about visual obstruction', () => {
    const result = selectToolsForRun({
      mode: 'debug',
      task: '按钮是不是被遮挡了，截图看一下',
      tools: [visionTool],
      capabilities: capabilities()
    });

    expect(result.visibleTools).toEqual(['bh_vision_describe_viewport']);
  });
});

function capabilities() {
  return {
    hasActiveTab: true,
    hasDebuggerPermission: true,
    hasClipboardPermission: false,
    hasDownloadsPermission: false,
    hostPermissions: [],
    shallowDebugAvailable: true,
    cdp: 'reserved' as const
  };
}
