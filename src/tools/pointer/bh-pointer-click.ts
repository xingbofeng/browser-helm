import { z } from 'zod';

import { ERROR_CODES } from '../../shared/constants/error-codes';
import { TOOL_NAMES } from '../../shared/constants/tool-names';
import { toolResultSchema, type ToolResult } from '../../shared/schemas/tool-result.schema';
import { pointerClickResultSchema } from '../../shared/schemas/vision';
import { defaultDebuggerManager } from '../../background/debugger/debugger-manager';
import type { ToolSpec } from '../core/tool-spec';
import { classifyCoordinateRisk } from './coordinate-risk';

const argsSchema = z.object({
  x: z.number().nonnegative(),
  y: z.number().nonnegative(),
  reason: z.string().min(10)
}).strict();

/**
 * 通过坐标执行最后手段点击。
 *
 * Agent 语义：Vision/Full fallback 工具，仅当 DOM/a11y ref 路径不可用且视觉检查给出
 * 明确原因时使用。会修改页面状态，风险 medium；如果 reason 命中提交、支付、删除、
 * 上传、密码等敏感场景，工具不会点击并返回 approval required。主要参数为 viewport
 * 坐标 x/y 和视觉 fallback reason；返回命中的元素 tag 摘要。
 */
export function bhPointerClick(): ToolSpec<z.infer<typeof argsSchema>, ToolResult> {
  return {
    name: TOOL_NAMES.POINTER_CLICK,
    title: 'Pointer Click',
    description: 'Clicks viewport coordinates only as a last-resort visual fallback.',
    modes: ['vision'],
    risk: 'medium',
    argsSchema,
    resultSchema: toolResultSchema,
    readOnly: false,
    requiresApproval: false,
    contextVisibility: 'summary',
    async execute(args, ctx) {
      const risk = classifyCoordinateRisk(args);
      if (risk.requiresApproval) {
        return {
          ok: false,
          code: ERROR_CODES.APPROVAL_REQUIRED,
          summary: `${risk.reason}; pointer click was not executed`,
          data: { risk },
          error: { message: risk.reason },
          changedPage: false,
          requiresObserve: false,
          requiresApproval: true,
          approval: {
            reason: risk.reason,
            risk: 'high',
            actionPreview: `Click viewport coordinate (${args.x}, ${args.y})`
          },
          context: {
            visibility: 'summary',
            summary: `${ERROR_CODES.APPROVAL_REQUIRED}: ${risk.reason}; pointer click was not executed`
          }
        };
      }
      if (!ctx.tabId) {
        return failure(ERROR_CODES.RUNTIME_UNAVAILABLE, 'No active tab is available for pointer click');
      }
      const clicked = await clickCoordinates(ctx.tabId, args.x, args.y);
      if (!clicked.ok) {
        return failure(ERROR_CODES.POINTER_ACTION_FAILED, clicked.reason);
      }
      const parsedClick = pointerClickResultSchema.parse(clicked.result);
      if (!parsedClick.clicked) {
        return failure(ERROR_CODES.POINTER_ACTION_FAILED, 'No clickable element found at viewport coordinates');
      }
      return {
        ok: true,
        code: ERROR_CODES.OK,
        summary: `Clicked viewport coordinate (${args.x}, ${args.y})`,
        data: {
          risk,
          result: parsedClick
        },
        changedPage: true,
        requiresObserve: true,
        context: {
          visibility: 'summary',
          summary: `Clicked viewport coordinate (${args.x}, ${args.y})`
        }
      };
    }
  };
}

async function clickCoordinates(
  tabId: number,
  x: number,
  y: number
): Promise<{ ok: true; result: unknown } | { ok: false; reason: string }> {
  if (typeof globalThis.chrome?.scripting?.executeScript === 'function') {
    try {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId },
        args: [x, y],
        func: (targetX: number, targetY: number) => {
          const target = document.elementFromPoint(targetX, targetY) as HTMLElement | null;
          if (!target) {
            return { clicked: false };
          }
          target.click();
          return {
            clicked: true,
            tagName: target.tagName
          };
        }
      });
      const clicked = pointerClickResultSchema.parse(result?.result ?? { clicked: false });
      return { ok: true, result: clicked };
    } catch (error) {
      if (!canFallbackToDebugger(error)) {
        return { ok: false, reason: error instanceof Error ? error.message : 'pointer_click_failed' };
      }
    }
  }

  try {
    await defaultDebuggerManager.dispatchMouseClick(tabId, x, y);
    return {
      ok: true,
      result: {
        clicked: true
      }
    };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'pointer_click_failed' };
  }
}

function failure(code: string, message: string): ToolResult {
  return {
    ok: false,
    code,
    summary: message,
    error: { message },
    changedPage: false,
    requiresObserve: false,
    context: {
      visibility: 'summary',
      summary: `${code}: ${message}`
    }
  };
}

function canFallbackToDebugger(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /permission|Cannot access contents|activeTab|<all_urls>|unavailable/iu.test(message);
}
