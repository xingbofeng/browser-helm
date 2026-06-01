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
  },
  {
    name: 'bh_download_list',
    title: 'Downloads',
    description: 'List downloads',
    modes: ['advanced'],
    risk: 'safe',
    argsSchema: {},
    readOnly: true,
    requiresApproval: false,
    contextVisibility: 'summary'
  },
  {
    name: 'bh_debug_collect_page_health',
    title: 'Page health',
    description: 'Collect shallow debug hook signals',
    modes: ['debug'],
    risk: 'safe',
    argsSchema: {},
    readOnly: true,
    requiresApproval: false,
    contextVisibility: 'summary'
  },
  {
    name: 'bh_file_upload_with_approval',
    title: 'Upload file',
    description: 'Upload file with approval',
    modes: ['advanced'],
    risk: 'high',
    argsSchema: {},
    readOnly: false,
    requiresApproval: true,
    contextVisibility: 'summary'
  },
  {
    name: 'bh_clipboard_write_with_approval',
    title: 'Clipboard write',
    description: 'Write clipboard',
    modes: ['advanced'],
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

  it('requires explicit domain consent before exposing mutating form tools on ordinary domains', () => {
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
      permissions: { requireExplicitDomainConsent: true },
      pageDomain: 'docs.example.com',
      pageState: {
        hasForm: true
      }
    });

    expect(result.visibleTools).toEqual(['bh_page_observe']);
    expect(result.hiddenTools).toContainEqual({
      tool: 'bh_form_fill_many',
      reason: 'Domain docs.example.com requires explicit consent before mutating or diagnostic hook tools are exposed'
    });
  });

  it('exposes mutating and debug hook tools when the current domain is explicitly enabled', () => {
    const formResult = selectToolsForRun({
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
      permissions: {
        allowedDomains: ['example.com'],
        requireExplicitDomainConsent: true
      },
      pageDomain: 'docs.example.com',
      pageState: {
        hasForm: true
      }
    });

    expect(formResult.visibleTools).toContain('bh_form_fill_many');

    const debugResult = selectToolsForRun({
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
      },
      permissions: {
        allowedDomains: ['example.com'],
        requireExplicitDomainConsent: true
      },
      pageDomain: 'docs.example.com'
    });

    expect(debugResult.visibleTools).toContain('bh_debug_collect_page_health');
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

  it('loads advanced tool families only when the task and capabilities need them', () => {
    const withoutNeed = selectToolsForRun({
      mode: 'full',
      task: '总结当前页面',
      tools,
      capabilities: {
        hasActiveTab: true,
        hasDebuggerPermission: false,
        hasClipboardPermission: true,
        hasDownloadsPermission: true,
        hostPermissions: [],
        shallowDebugAvailable: true,
        cdp: 'reserved'
      }
    });

    expect(withoutNeed.hiddenTools).toContainEqual({
      tool: 'bh_download_list',
      reason: 'Advanced tool family is not needed for current task'
    });

    const downloadTask = selectToolsForRun({
      mode: 'full',
      task: '列出下载文件',
      tools,
      capabilities: {
        hasActiveTab: true,
        hasDebuggerPermission: false,
        hasClipboardPermission: false,
        hasDownloadsPermission: true,
        hostPermissions: [],
        shallowDebugAvailable: true,
        cdp: 'reserved'
      }
    });

    expect(downloadTask.visibleTools).toContain('bh_download_list');
    expect(downloadTask.hiddenTools).toContainEqual({
      tool: 'bh_file_upload_with_approval',
      reason: 'Advanced tool family is not needed for current task'
    });
    expect(downloadTask.hiddenTools).toContainEqual({
      tool: 'bh_clipboard_write_with_approval',
      reason: 'Clipboard permission is unavailable'
    });
  });

  it('does not require downloads permission for upload approval boundary', () => {
    const result = selectToolsForRun({
      mode: 'full',
      task: '上传头像文件',
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

    expect(result.visibleTools).toContain('bh_file_upload_with_approval');
    expect(result.hiddenTools).toContainEqual({
      tool: 'bh_download_list',
      reason: 'Downloads permission is unavailable'
    });
  });
});
