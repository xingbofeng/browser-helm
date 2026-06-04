import { z } from 'zod';

import { defaultPageMediaManager } from '../../background/page-media-manager';
import { defaultScreenshotManager } from '../../background/screenshot-manager';
import { ERROR_CODES } from '../../shared/constants/error-codes';
import { TOOL_NAMES } from '../../shared/constants/tool-names';
import type { ContentRpcClient } from '../../page/messaging/content-rpc-client';
import { screenshotCaptureSchema, visionObservationSchema } from '../../shared/schemas/vision';
import {
  batchFullPageScreenshotResultSchema,
  batchImageCollectionResultSchema,
  batchMediaScopeSchema
} from '../../shared/schemas/page-media';
import { toolResultSchema, type ToolResult } from '../../shared/schemas/tool-result.schema';
import type { ToolContext } from '../core/tool-context';
import type { ToolSpec } from '../core/tool-spec';
import { groundVisionObservation } from './vision-grounding';
import { normalizeVisionObservation } from './vision-result-normalizer';

const captureArgsSchema = z.object({
  windowId: z.number().int().nonnegative().optional()
}).strict();

const batchArgsSchema = z.object({
  scope: batchMediaScopeSchema.default('current_window'),
  maxTabs: z.number().int().min(1).max(20).default(8)
}).strict();

const imageCollectArgsSchema = batchArgsSchema.extend({
  maxImagesPerTab: z.number().int().min(1).max(1000).default(250),
  includeCssBackgrounds: z.boolean().default(true)
});

const elementArgsSchema = captureArgsSchema.extend({
  selector: z.string().min(1)
});

const describeArgsSchema = captureArgsSchema.extend({
  prompt: z.string().min(1).optional()
});

/**
 * 截取当前视口。
 *
 * Agent 语义：Debug/Vision 可用的只读视觉增强工具，用于 DOM/a11y 不足时获取
 * 当前 viewport screenshot。不会修改页面，风险 safe，不触发 approval。参数为可选
 * windowId；结果包含 screenshot metadata 和 dataUrl，但 model context 只暴露摘要，
 * 避免默认把截图写入 trace/provider prompt。
 */
export function bhVisionCaptureViewport(_rpc: ContentRpcClient): ToolSpec<z.infer<typeof captureArgsSchema>, ToolResult> {
  return visionTool({
    name: TOOL_NAMES.VISION_CAPTURE_VIEWPORT,
    title: 'Capture Viewport Screenshot',
    description: 'Captures the current viewport screenshot for visual inspection.',
    argsSchema: captureArgsSchema,
    execute: async (args, ctx) => {
      const tabId = requireTabId(ctx);
      const screenshot = await defaultScreenshotManager.captureViewport({ tabId, windowId: normalizeWindowId(args.windowId) });
      return ok(`Captured viewport screenshot ${screenshot.id}.`, { screenshot: screenshotCaptureSchema.parse(screenshot) });
    }
  });
}

/**
 * 截取当前页面的 full-page 视觉参考。
 *
 * Agent 语义：Debug/Vision 只读工具。当前实现使用浏览器可见区域作为保守 fallback，
 * 不做 screenshot-first loop；风险 safe，不触发 approval。参数为可选 windowId；
 * 返回 full_page 模式 metadata，context 只暴露摘要。
 */
export function bhVisionCaptureFullPage(_rpc: ContentRpcClient): ToolSpec<z.infer<typeof captureArgsSchema>, ToolResult> {
  return visionTool({
    name: TOOL_NAMES.VISION_CAPTURE_FULL_PAGE,
    title: 'Capture Full Page Screenshot',
    description: 'Captures a full-page screenshot fallback for visual inspection.',
    argsSchema: captureArgsSchema,
    execute: async (args, ctx) => {
      const tabId = requireTabId(ctx);
      const screenshot = await defaultScreenshotManager.captureFullPage({ tabId, windowId: normalizeWindowId(args.windowId) });
      return ok(`Captured full-page screenshot ${screenshot.id}.`, { screenshot: screenshotCaptureSchema.parse(screenshot) });
    }
  });
}

/**
 * 批量截取当前窗口页面长图。
 *
 * Agent 语义：Debug/Vision 只读批量视觉工具，面向用户显式要求批量长截图时使用。
 * 默认扫描当前窗口 http/https tabs，每页截图前会滚动以触发 lazy-load 图片。滚动后恢复
 * 原视口，不点击/输入/提交，风险 medium，不触发 approval。参数 scope/maxTabs 控制范围；
 * 结果包含每页 screenshot metadata 和 dataUrl，model context 仅暴露成功/失败摘要。
 */
export function bhVisionBatchCaptureFullPages(_rpc: ContentRpcClient): ToolSpec<z.infer<typeof batchArgsSchema>, ToolResult> {
  return visionTool({
    name: TOOL_NAMES.VISION_BATCH_CAPTURE_FULL_PAGES,
    title: 'Batch Capture Full Page Screenshots',
    description: 'Batch captures full-page screenshots for current-window pages after lazy-load scrolling.',
    risk: 'medium',
    argsSchema: batchArgsSchema,
    execute: async (args, ctx) => {
      const intentFailure = batchMediaIntentFailure(ctx);
      if (intentFailure) return intentFailure;
      const tabId = requireTabId(ctx);
      const batchCapture = await defaultPageMediaManager.captureFullPageBatch({
        sourceTabId: tabId,
        scope: args.scope,
        maxTabs: args.maxTabs
      });
      const summary = `Captured ${batchCapture.succeededCount} full-page screenshots across ${batchCapture.requestedTabCount} tabs; ${batchCapture.failedCount} failed.`;
      return ok(summary, { batchCapture: batchFullPageScreenshotResultSchema.parse(batchCapture) });
    }
  });
}

/**
 * 批量获取当前窗口页面图片清单。
 *
 * Agent 语义：Debug/Vision 只读页面媒体清单工具，面向用户要求获取页面所有图片时使用。
 * 默认扫描当前窗口 http/https tabs，并先滚动页面触发 lazy-load；返回 img/srcset/picture、
 * icon/open graph 和 CSS background URL 清单。不会下载图片二进制，不修改业务状态，风险
 * medium，不触发 approval。参数控制范围、每页图片上限和是否包含 CSS background。
 */
export function bhVisionCollectImages(_rpc: ContentRpcClient): ToolSpec<z.infer<typeof imageCollectArgsSchema>, ToolResult> {
  return visionTool({
    name: TOOL_NAMES.VISION_COLLECT_IMAGES,
    title: 'Batch Collect Page Images',
    description: 'Collects page image URLs across current-window pages after lazy-load scrolling.',
    risk: 'medium',
    argsSchema: imageCollectArgsSchema,
    execute: async (args, ctx) => {
      const intentFailure = batchMediaIntentFailure(ctx);
      if (intentFailure) return intentFailure;
      const tabId = requireTabId(ctx);
      const imageCollection = await defaultPageMediaManager.collectImagesBatch({
        sourceTabId: tabId,
        scope: args.scope,
        maxTabs: args.maxTabs,
        maxImagesPerTab: args.maxImagesPerTab,
        includeCssBackgrounds: args.includeCssBackgrounds
      });
      const summary = `Collected ${imageCollection.totalImageCount} images across ${imageCollection.succeededCount}/${imageCollection.requestedTabCount} tabs; ${imageCollection.failedCount} failed.`;
      return ok(summary, { imageCollection: batchImageCollectionResultSchema.parse(imageCollection) });
    }
  });
}

/**
 * 截取指定元素的视觉参考。
 *
 * Agent 语义：Debug/Vision 只读工具，用于对比 DOM 中存在的目标与视觉位置。不会点击
 * 或修改页面，风险 safe，不触发 approval。参数 selector 用于定位元素；返回截图和
 * bounds metadata，常用于 overlay/layout issue 判断。
 */
export function bhVisionCaptureElement(_rpc: ContentRpcClient): ToolSpec<z.infer<typeof elementArgsSchema>, ToolResult> {
  return visionTool({
    name: TOOL_NAMES.VISION_CAPTURE_ELEMENT,
    title: 'Capture Element Screenshot',
    description: 'Captures an element screenshot and bounds metadata.',
    argsSchema: elementArgsSchema,
    execute: async (args, ctx) => {
      const tabId = requireTabId(ctx);
      const screenshot = await defaultScreenshotManager.captureElement({
        tabId,
        windowId: normalizeWindowId(args.windowId),
        selector: args.selector
      });
      return ok(`Captured element screenshot ${screenshot.id}.`, { screenshot: screenshotCaptureSchema.parse(screenshot) });
    }
  });
}

/**
 * 使用 vision model 描述当前视口。
 *
 * Agent 语义：Debug/Vision 只读工具，用于 DOM/a11y 无法解释遮挡、canvas、图表或视觉
 * 错位时生成视觉摘要。不会修改页面，风险 safe，不触发 approval。参数 prompt 可聚焦
 * 用户的视觉疑问；如果 provider 不支持 vision，返回明确 fallback 到 DOM/a11y。
 */
export function bhVisionDescribeViewport(_rpc: ContentRpcClient): ToolSpec<z.infer<typeof describeArgsSchema>, ToolResult> {
  return visionTool({
    name: TOOL_NAMES.VISION_DESCRIBE_VIEWPORT,
    title: 'Describe Viewport With Vision',
    description: 'Captures the viewport and asks a vision-capable model for a bounded summary.',
    argsSchema: describeArgsSchema,
    execute: async (args, ctx) => {
      const tabId = requireTabId(ctx);
      const screenshot = await defaultScreenshotManager.captureViewport({ tabId, windowId: normalizeWindowId(args.windowId) });
      if (!ctx.visionClient) {
        const observation = groundVisionObservation(normalizeVisionObservation({
          imageRef: screenshot.id,
          summary: 'Viewport screenshot was captured, but the vision model is unavailable; use DOM/a11y observation instead.',
          fallback: 'dom_a11y',
          fallbackReason: 'vision_not_supported'
        }), ctx.snapshot?.structuredPageData);
        return failed(ERROR_CODES.VISION_UNAVAILABLE, 'Viewport screenshot captured; vision model is unavailable, so DOM/a11y fallback is required.', {
          screenshot: screenshotCaptureSchema.parse(screenshot),
          observation
        });
      }
      const vision = await ctx.visionClient.describeViewport({
        imageDataUrl: screenshot.dataUrl,
        prompt: args.prompt ?? viewportPrompt(),
        runId: ctx.runId
      });
      const observation = groundVisionObservation(visionObservationSchema.parse({
        ...vision.observation,
        imageRef: vision.observation.imageRef ?? screenshot.id
      }), ctx.snapshot?.structuredPageData);
      return vision.ok
        ? ok(`Vision observation: ${observation.summary}`, {
            screenshot: screenshotCaptureSchema.parse(screenshot),
            observation
          })
        : failed(ERROR_CODES.VISION_UNAVAILABLE, `Viewport screenshot captured; vision model unavailable: ${vision.reason ?? observation.fallbackReason ?? 'unknown'}`, {
            screenshot: screenshotCaptureSchema.parse(screenshot),
            observation
          });
    }
  });
}

/**
 * 检测遮挡问题。
 *
 * Agent 语义：Debug/Vision 只读工具，是 `bh_vision_describe_viewport` 的 focused alias，
 * 适合用户怀疑按钮被浮层、弹窗、banner 或 sticky header 遮挡时调用。不会修改页面。
 */
export function bhVisionDetectOverlay(rpc: ContentRpcClient): ToolSpec<z.infer<typeof describeArgsSchema>, ToolResult> {
  const spec = bhVisionDescribeViewport(rpc);
  return {
    ...spec,
    name: TOOL_NAMES.VISION_DETECT_OVERLAY,
    title: 'Detect Visual Overlay',
    description: 'Detects visual blockers and overlays in the viewport.',
    execute: (args, ctx) => spec.execute({
      ...args,
      prompt: args.prompt ?? 'Detect overlays, modals, cookie banners, sticky headers, or visual blockers that make page targets hard to click.'
    }, ctx)
  };
}

/**
 * 检测布局问题。
 *
 * Agent 语义：Debug/Vision 只读工具，是 `bh_vision_describe_viewport` 的 focused alias，
 * 用于发现明显视觉错位、元素覆盖、按钮偏移或响应式布局异常。不会修改页面。
 */
export function bhVisionDetectLayoutIssues(rpc: ContentRpcClient): ToolSpec<z.infer<typeof describeArgsSchema>, ToolResult> {
  const spec = bhVisionDescribeViewport(rpc);
  return {
    ...spec,
    name: TOOL_NAMES.VISION_DETECT_LAYOUT_ISSUES,
    title: 'Detect Layout Issues',
    description: 'Detects visual layout issues in the viewport.',
    execute: (args, ctx) => spec.execute({
      ...args,
      prompt: args.prompt ?? 'Detect visual layout issues, clipped controls, overlap, offscreen content, or elements that appear visible but are not interactable.'
    }, ctx)
  };
}

function visionTool<TArgs>(input: {
  name: string;
  title: string;
  description: string;
  risk?: ToolSpec<TArgs, ToolResult>['risk'] | undefined;
  argsSchema: z.ZodType<TArgs>;
  execute: (args: TArgs, ctx: ToolContext) => Promise<ToolResult>;
}): ToolSpec<TArgs, ToolResult> {
  return {
    name: input.name,
    title: input.title,
    description: input.description,
    modes: ['debug', 'vision'],
    risk: input.risk ?? 'safe',
    argsSchema: input.argsSchema,
    resultSchema: toolResultSchema,
    readOnly: true,
    requiresApproval: false,
    contextVisibility: 'summary',
    execute: async (args, ctx) => {
      try {
        return await input.execute(args, ctx);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'screenshot_failed';
        const hints = message.includes('debugger_permission_denied')
          ? [
              'Screenshot requires the "Debugger" permission. Open chrome://extensions, find BrowserHelm details, and enable it.',
              'Use bh_page_observe or bh_page_read_visible_text as DOM-based fallback evidence instead.'
            ]
          : undefined;
        return failed(ERROR_CODES.SCREENSHOT_FAILED, message, { reason: message }, hints);
      }
    }
  };
}

function batchMediaIntentFailure(ctx: ToolContext): ToolResult | undefined {
  if (ctx.source !== 'agent' && ctx.source !== 'runtime') {
    return undefined;
  }
  if (hasExplicitBatchMediaIntent(ctx.userTask ?? '')) {
    return undefined;
  }
  return {
    ok: false,
    code: ERROR_CODES.USER_INTENT_MISMATCH,
    summary: 'Batch media collection requires explicit user intent before scanning screenshots or images across tabs.',
    changedPage: false,
    requiresObserve: false,
    error: {
      message: 'Batch media collection requires explicit user intent before scanning screenshots or images across tabs.'
    },
    nextHints: [
      'Ask the user to explicitly request screenshots, long screenshots, image collection, or page media export.'
    ]
  };
}

function hasExplicitBatchMediaIntent(task: string): boolean {
  return /(?:screenshot|full[-\s]?page|long screenshot|capture|image|media|图片|截图|长图|媒体|收集图片|导出图片)/iu.test(task);
}

function requireTabId(ctx: ToolContext): number {
  if (!ctx.tabId) {
    throw new Error('No active tab is available for screenshot capture');
  }
  return ctx.tabId;
}

function normalizeWindowId(windowId: number | undefined): number | undefined {
  return windowId === 0 ? undefined : windowId;
}

function ok(summary: string, data: unknown): ToolResult {
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

function failed(code: string, summary: string, data: unknown, nextHints?: string[]): ToolResult {
  const fallbackSummary = code === ERROR_CODES.VISION_UNAVAILABLE
    ? `${summary} Use DOM/a11y or visible-text fallback evidence; do not retry the vision model unless settings change.`
    : summary;
  return {
    ok: false,
    code,
    summary: fallbackSummary,
    data,
    error: { message: fallbackSummary, detail: data },
    nextHints: nextHints ?? (code === ERROR_CODES.VISION_UNAVAILABLE
      ? [
          'The screenshot capture succeeded, but the vision model result is unavailable.',
          'Use bh_page_read_visible_text or page observation as fallback evidence.',
          'Do not call another vision model tool unless provider settings change.'
        ]
      : undefined),
    changedPage: false,
    requiresObserve: false,
    context: {
      visibility: 'summary',
      summary: fallbackSummary
    }
  };
}

function viewportPrompt(): string {
  return [
    'Describe the current browser viewport visually.',
    'Focus on overlays, blocked controls, layout issues, visible text, and whether DOM/a11y observation may be incomplete.',
    'Return JSON with summary, visibleText, blockers, layoutIssues, and confidence.'
  ].join(' ');
}
