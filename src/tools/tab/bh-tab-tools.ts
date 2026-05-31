import { z } from 'zod';

import { defaultTabManager } from '../../background/tab-manager';
import { ERROR_CODES } from '../../shared/constants/error-codes';
import { TOOL_NAMES } from '../../shared/constants/tool-names';
import { toolResultSchema, type ToolResult } from '../../shared/schemas/tool-result.schema';
import type { BrowserTabSummary } from '../../shared/schemas/tab';
import type { ToolSpec } from '../core/tool-spec';

const emptyArgsSchema = z.object({}).strict();
const focusArgsSchema = z.object({
  tabId: z.number().int().positive()
}).strict();

/**
 * 列出当前浏览器 tabs。
 *
 * Agent 语义：Advanced 只读上下文工具，用于多 tab 工作流开始前枚举可用目标。
 * 不修改页面，风险 safe，不触发 approval。返回 tabId、windowId、标题和脱敏 URL；
 * URL query/hash 会被移除，避免把 token 或页面片段写入 trace/model context。
 */
export function bhTabList(): ToolSpec<z.infer<typeof emptyArgsSchema>, ToolResult> {
  return {
    name: TOOL_NAMES.TAB_LIST,
    title: 'List Browser Tabs',
    description: 'Lists open browser tabs with redacted URLs for advanced multi-tab workflows.',
    modes: ['advanced'],
    risk: 'safe',
    argsSchema: emptyArgsSchema,
    resultSchema: toolResultSchema,
    readOnly: true,
    requiresApproval: false,
    contextVisibility: 'summary',
    execute: async () => {
      try {
        const tabs = await defaultTabManager.listTabs();
        return ok(`Listed ${tabs.length} browser tabs.`, { tabs });
      } catch (error) {
        return failure(error);
      }
    }
  };
}

/**
 * 读取当前 active tab。
 *
 * Agent 语义：Advanced 只读上下文工具，用于确认当前 runtime 目标 tab。不会切换页面
 * 或修改浏览器状态，风险 safe，不触发 approval。返回单个脱敏 tab summary。
 */
export function bhTabGetActive(): ToolSpec<z.infer<typeof emptyArgsSchema>, ToolResult> {
  return {
    name: TOOL_NAMES.TAB_GET_ACTIVE,
    title: 'Get Active Tab',
    description: 'Returns the current active tab summary with a redacted URL.',
    modes: ['advanced'],
    risk: 'safe',
    argsSchema: emptyArgsSchema,
    resultSchema: toolResultSchema,
    readOnly: true,
    requiresApproval: false,
    contextVisibility: 'summary',
    execute: async () => {
      try {
        const tab = await defaultTabManager.getActiveTab();
        return ok(tab ? `Active tab is ${tab.tabId}.` : 'No active tab found.', { tab });
      } catch (error) {
        return failure(error);
      }
    }
  };
}

/**
 * 切换到指定 tab。
 *
 * Agent 语义：Advanced 低风险浏览器上下文切换工具，用于多 tab 工作流中把 runtime
 * 焦点移动到用户已有 tab。不会点击页面内容或提交数据；会改变浏览器焦点，风险 low，
 * 执行后必须重新 observe 当前目标。
 */
export function bhTabFocus(): ToolSpec<z.infer<typeof focusArgsSchema>, ToolResult> {
  return {
    name: TOOL_NAMES.TAB_FOCUS,
    title: 'Focus Browser Tab',
    description: 'Focuses an existing browser tab and requires re-observation of the new target.',
    modes: ['advanced'],
    risk: 'low',
    argsSchema: focusArgsSchema,
    resultSchema: toolResultSchema,
    readOnly: false,
    requiresApproval: false,
    contextVisibility: 'summary',
    execute: async (args) => {
      try {
        const tab = await defaultTabManager.focusTab(args.tabId);
        return {
          ...ok(`Focused browser tab ${tab.tabId}.`, { tab }),
          requiresObserve: true
        };
      } catch (error) {
        return failure(error);
      }
    }
  };
}

function ok(summary: string, data: { tabs?: BrowserTabSummary[]; tab?: BrowserTabSummary | undefined }): ToolResult {
  return {
    ok: true,
    code: ERROR_CODES.OK,
    summary,
    data,
    changedPage: false,
    requiresObserve: false,
    context: {
      visibility: 'summary',
      summary
    }
  };
}

function failure(error: unknown): ToolResult {
  const message = error instanceof Error ? error.message : 'tab_tool_failed';
  return {
    ok: false,
    code: ERROR_CODES.RUNTIME_UNAVAILABLE,
    summary: message,
    error: { message },
    changedPage: false,
    requiresObserve: false,
    context: {
      visibility: 'summary',
      summary: `${ERROR_CODES.RUNTIME_UNAVAILABLE}: ${message}`
    }
  };
}
