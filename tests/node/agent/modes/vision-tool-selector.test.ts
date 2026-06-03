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
  it('exposes vision tools in debug mode without task text regex matching', () => {
    const result = selectToolsForRun({
      mode: 'debug',
      task: '读取页面表单字段',
      tools: [visionTool],
      capabilities: capabilities()
    });

    expect(result.visibleTools).toEqual(['bh_vision_describe_viewport']);
  });

  it('still hides vision tools outside their run mode', () => {
    const result = selectToolsForRun({
      mode: 'ask',
      task: '按钮是不是被遮挡了，截图看一下',
      tools: [visionTool],
      capabilities: capabilities()
    });

    expect(result.visibleTools).toEqual([]);
    expect(result.hiddenTools).toContainEqual({
      tool: 'bh_vision_describe_viewport',
      reason: 'Tool is not available in ask mode'
    });
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
