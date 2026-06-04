import { z } from 'zod';

import { defaultDebuggerManager } from '../../background/debugger/debugger-manager';
import { redactCdpText } from '../../background/debugger/cdp-redaction';
import { ERROR_CODES } from '../../shared/constants/error-codes';
import { TOOL_NAMES } from '../../shared/constants/tool-names';
import { toolResultSchema, type ToolResult } from '../../shared/schemas/tool-result.schema';
import type { ToolContext } from '../core/tool-context';
import type { ContentRpcClient } from '../../page/messaging/content-rpc-client';
import type { ToolSpec } from '../core/tool-spec';

const tabArgsSchema = z.object({
  tabId: z.number().int().positive().optional()
});
const attachArgsSchema = tabArgsSchema.extend({
  protocolVersion: z.string().min(1).optional()
});
const listArgsSchema = tabArgsSchema.extend({
  limit: z.number().int().positive().max(300).optional()
});
const requestArgsSchema = tabArgsSchema.extend({
  requestId: z.string().min(1)
});
const eventListenersArgsSchema = tabArgsSchema.extend({
  objectExpression: z.string().min(1).optional()
});
const MAX_EVENT_LISTENERS_RETURNED = 50;

/**
 * Attach Chrome debugger to the current tab and enable Network/Runtime/Performance collectors.
 *
 * Agent semantics: Debug/Full only, mutates extension debugger session state but not page state. Medium
 * risk with BrowserHelm approval required because CDP attach grants deep inspection of the current tab.
 * Args: optional tabId and protocolVersion. Returns attached state or a clear reason when permission/API
 * attach fails.
 */
export function bhCdpAttach(_rpc: ContentRpcClient): ToolSpec<z.infer<typeof attachArgsSchema>, ToolResult> {
  return cdpTool({
    name: TOOL_NAMES.CDP_ATTACH,
    title: 'CDP Attach',
    description: 'Attaches chrome.debugger to collect deep DevTools signals.',
    argsSchema: attachArgsSchema,
    risk: 'medium',
    readOnly: false,
    requiresApproval: true,
    approvalBehavior: 'execute_pending_action',
    execute: async (args, ctx) => {
      const tabId = await resolveTabId(args.tabId, ctx);
      if (!tabId) return unavailable('No active tab is available for CDP attach');
      const state = await defaultDebuggerManager.attach(tabId, args.protocolVersion);
      return state.attached
        ? ok('Debugger attached; deep inspection is collecting console, network, and performance data.', { state })
        : failed(ERROR_CODES.RUNTIME_UNAVAILABLE, `Debugger attach failed: ${state.reason ?? 'unknown reason'}`, { state });
    }
  });
}

/**
 * Detach Chrome debugger from the current tab.
 *
 * Agent semantics: Debug/Full only, clears BrowserHelm's debugger session for a tab. Medium risk because
 * it mutates debugger attachment state but not page state. Args: optional tabId. Returns detached state.
 */
export function bhCdpDetach(_rpc: ContentRpcClient): ToolSpec<z.infer<typeof tabArgsSchema>, ToolResult> {
  return cdpTool({
    name: TOOL_NAMES.CDP_DETACH,
    title: 'CDP Detach',
    description: 'Detaches chrome.debugger from the tab.',
    argsSchema: tabArgsSchema,
    risk: 'medium',
    readOnly: false,
    execute: async (args, ctx) => {
      const tabId = await resolveTabId(args.tabId, ctx);
      if (!tabId) return unavailable('No active tab is available for CDP detach');
      return ok('Debugger detached.', { state: await defaultDebuggerManager.detach(tabId) });
    }
  });
}

/**
 * List debugger-capable Chrome targets.
 *
 * Agent semantics: read-only Debug/Full tool for explaining attach availability. Safe, no page state
 * changes, no approval. Args: none. Returns Chrome target info.
 */
export function bhCdpGetTargets(_rpc: ContentRpcClient): ToolSpec<Record<string, never>, ToolResult> {
  return cdpTool({
    name: TOOL_NAMES.CDP_GET_TARGETS,
    title: 'CDP Targets',
    description: 'Lists Chrome debugger targets.',
    argsSchema: z.object({}),
    readOnly: true,
    execute: async () => ok('Listed debugger targets.', { targets: await defaultDebuggerManager.targets() })
  });
}

/**
 * Read collected CDP console events.
 *
 * Agent semantics: read-only Debug/Full tool. Safe. Args: optional tabId and limit. Returns sanitized
 * console API calls and exceptions captured after attach.
 */
export function bhCdpGetConsoleEvents(_rpc: ContentRpcClient): ToolSpec<z.infer<typeof listArgsSchema>, ToolResult> {
  return cdpTool({
    name: TOOL_NAMES.CDP_GET_CONSOLE_EVENTS,
    title: 'CDP Console Events',
    description: 'Reads collected console events from a debugger session.',
    argsSchema: listArgsSchema,
    readOnly: true,
    execute: async (args, ctx) => {
      const tabId = await resolveTabId(args.tabId, ctx);
      if (!tabId) return unavailable('No active tab is available for console events');
      const events = defaultDebuggerManager.consoleEvents(tabId, args.limit);
      return ok(`Collected ${events.length} console event(s).`, { tabId, events });
    }
  });
}

/**
 * Read collected CDP network events.
 *
 * Agent semantics: read-only Debug/Full tool. Safe. Args: optional tabId. Returns sanitized request list
 * with status, failure state, and header previews.
 */
export function bhCdpGetNetworkEvents(_rpc: ContentRpcClient): ToolSpec<z.infer<typeof tabArgsSchema>, ToolResult> {
  return cdpTool({
    name: TOOL_NAMES.CDP_GET_NETWORK_EVENTS,
    title: 'CDP Network Events',
    description: 'Reads collected network request records.',
    argsSchema: tabArgsSchema,
    readOnly: true,
    execute: async (args, ctx) => {
      const tabId = await resolveTabId(args.tabId, ctx);
      if (!tabId) return unavailable('No active tab is available for network events');
      const detached = detachedSessionFailure(tabId);
      if (detached) return detached;
      const requests = defaultDebuggerManager.networkEvents(tabId);
      return ok(`Collected ${requests.length} network request(s).`, { tabId, requests });
    }
  });
}

/**
 * Read one request detail including available response body preview.
 *
 * Agent semantics: read-only Debug/Full tool. Safe. Args: requestId and optional tabId. Returns sanitized
 * request/response headers and response body preview when CDP can provide it.
 */
export function bhCdpGetRequestDetail(_rpc: ContentRpcClient): ToolSpec<z.infer<typeof requestArgsSchema>, ToolResult> {
  return cdpTool({
    name: TOOL_NAMES.CDP_GET_REQUEST_DETAIL,
    title: 'CDP Request Detail',
    description: 'Reads detailed request/response data for one request.',
    argsSchema: requestArgsSchema,
    readOnly: true,
    execute: async (args, ctx) => {
      const tabId = await resolveTabId(args.tabId, ctx);
      if (!tabId) return unavailable('No active tab is available for request detail');
      const detail = await defaultDebuggerManager.requestDetail(tabId, args.requestId);
      return detail
        ? ok(`Request detail loaded: ${detail.method} ${detail.status ?? 'pending'} ${detail.url}`, { tabId, detail })
        : failed(ERROR_CODES.TOOL_NOT_FOUND, 'Request detail not found', { tabId, requestId: args.requestId });
    }
  });
}

/**
 * Read response body for a network request.
 *
 * Agent semantics: read-only Debug/Full tool. Safe. Args: requestId and optional tabId. Returns body or
 * explicit unavailableReason; sensitive text is masked/truncated before entering result/trace.
 */
export function bhCdpGetResponseBody(_rpc: ContentRpcClient): ToolSpec<z.infer<typeof requestArgsSchema>, ToolResult> {
  return cdpTool({
    name: TOOL_NAMES.CDP_GET_RESPONSE_BODY,
    title: 'CDP Response Body',
    description: 'Reads response body for one request when available.',
    argsSchema: requestArgsSchema,
    readOnly: true,
    execute: async (args, ctx) => {
      const tabId = await resolveTabId(args.tabId, ctx);
      if (!tabId) return unavailable('No active tab is available for response body');
      const result = await defaultDebuggerManager.responseBody(tabId, args.requestId);
      if (result.unavailableReason) {
        return failed(ERROR_CODES.OBSERVATION_FAILED, `Response body unavailable: ${result.unavailableReason}`, { tabId, ...result });
      }
      return ok('Response body loaded.', {
        tabId,
        requestId: args.requestId,
        body: redactCdpText(result.body ?? ''),
        base64Encoded: result.base64Encoded === true
      });
    }
  });
}

/**
 * Read Performance.getMetrics from CDP.
 *
 * Agent semantics: read-only Debug/Full tool. Safe. Args: optional tabId. Returns basic metrics for
 * loading and runtime bottleneck analysis.
 */
export function bhCdpGetPerformanceMetrics(_rpc: ContentRpcClient): ToolSpec<z.infer<typeof tabArgsSchema>, ToolResult> {
  return cdpTool({
    name: TOOL_NAMES.CDP_GET_PERFORMANCE_METRICS,
    title: 'CDP Performance Metrics',
    description: 'Reads basic CDP performance metrics.',
    argsSchema: tabArgsSchema,
    readOnly: true,
    execute: async (args, ctx) => {
      const tabId = await resolveTabId(args.tabId, ctx);
      if (!tabId) return unavailable('No active tab is available for performance metrics');
      const snapshot = await defaultDebuggerManager.performanceMetrics(tabId);
      const summary = {
        metricCount: snapshot.metrics.length,
        highlights: snapshot.metrics.slice(0, 10)
      };
      return ok(`Collected ${snapshot.metrics.length} performance metric(s).`, {
        snapshot: {
          ...snapshot,
          summary
        }
      });
    }
  });
}

/**
 * Read DOM event listeners from CDP.
 *
 * Agent semantics: read-only Debug/Full tool. Safe. Args: optional tabId and objectExpression
 * such as document or window. Returns listener metadata, not source editing.
 */
export function bhCdpGetEventListeners(_rpc: ContentRpcClient): ToolSpec<z.infer<typeof eventListenersArgsSchema>, ToolResult> {
  return cdpTool({
    name: TOOL_NAMES.CDP_GET_EVENT_LISTENERS,
    title: 'CDP Event Listeners',
    description: 'Reads event listeners for a CDP object expression.',
    argsSchema: eventListenersArgsSchema,
    readOnly: true,
    execute: async (args, ctx) => {
      const tabId = await resolveTabId(args.tabId, ctx);
      if (!tabId) return unavailable('No active tab is available for event listeners');
      const listeners = await defaultDebuggerManager.eventListeners(tabId, args.objectExpression);
      const boundedListeners = listeners.slice(0, MAX_EVENT_LISTENERS_RETURNED);
      return ok(`Collected ${listeners.length} event listener(s).`, {
        tabId,
        listeners: boundedListeners,
        summary: {
          listenerCount: listeners.length,
          returnedCount: boundedListeners.length,
          eventTypes: [...new Set(listeners.map((listener) => listener.type))].slice(0, 20)
        }
      });
    }
  });
}

/**
 * Capture a bounded CDP DOM snapshot.
 *
 * Agent semantics: read-only Debug/Full tool. Safe but context-heavy, result is summary visibility only.
 * Args: optional tabId. Returns snapshot metadata for diagnostics.
 */
export function bhCdpCaptureDomSnapshot(_rpc: ContentRpcClient): ToolSpec<z.infer<typeof tabArgsSchema>, ToolResult> {
  return cdpTool({
    name: TOOL_NAMES.CDP_CAPTURE_DOM_SNAPSHOT,
    title: 'CDP DOM Snapshot',
    description: 'Captures a CDP DOMSnapshot payload for diagnostics.',
    argsSchema: tabArgsSchema,
    readOnly: true,
    contextVisibility: 'hidden',
    execute: async (args, ctx) => {
      const tabId = await resolveTabId(args.tabId, ctx);
      if (!tabId) return unavailable('No active tab is available for DOM snapshot');
      const snapshot = await defaultDebuggerManager.captureDomSnapshot(tabId);
      const documentCount = Array.isArray(snapshot.documents) ? snapshot.documents.length : 0;
      return ok(`Captured DOM snapshot with ${documentCount} document(s).`, { tabId, documentCount, snapshot });
    }
  });
}

function cdpTool<TArgs>(input: {
  name: string;
  title: string;
  description: string;
  argsSchema: z.ZodType<TArgs>;
  risk?: 'safe' | 'low' | 'medium' | 'high' | undefined;
  readOnly: boolean;
  requiresApproval?: boolean | undefined;
  approvalBehavior?: ToolSpec<TArgs, ToolResult>['approvalBehavior'];
  contextVisibility?: 'summary' | 'hidden' | 'full' | undefined;
  execute: (args: TArgs, ctx: ToolContext) => Promise<ToolResult>;
}): ToolSpec<TArgs, ToolResult> {
  return {
    name: input.name,
    title: input.title,
    description: input.description,
    modes: ['debug'],
    risk: input.risk ?? 'safe',
    argsSchema: input.argsSchema,
    resultSchema: toolResultSchema,
    readOnly: input.readOnly,
    requiresApproval: input.requiresApproval ?? false,
    ...(input.approvalBehavior ? { approvalBehavior: input.approvalBehavior } : {}),
    contextVisibility: input.contextVisibility ?? 'summary',
    execute: input.execute
  };
}

async function resolveTabId(tabId: number | undefined, ctx: ToolContext): Promise<number | undefined> {
  if (tabId) return tabId;
  if (ctx.tabId) return ctx.tabId;
  if (!globalThis.chrome?.tabs?.query) return undefined;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

function ok(summary: string, data: unknown): ToolResult {
  return {
    ok: true,
    code: ERROR_CODES.OK,
    summary,
    data,
    changedPage: false,
    requiresObserve: false,
    context: { visibility: 'summary', summary }
  };
}

function failed(code: string, summary: string, data: unknown): ToolResult {
  return {
    ok: false,
    code,
    summary,
    data,
    changedPage: false,
    requiresObserve: false,
    error: { message: summary, detail: data },
    context: { visibility: 'summary', summary }
  };
}

function unavailable(message: string): ToolResult {
  return failed(ERROR_CODES.RUNTIME_UNAVAILABLE, message, { reason: message });
}

function detachedSessionFailure(tabId: number): ToolResult | undefined {
  const state = defaultDebuggerManager.sessionState(tabId);
  if (!state || state.attached) {
    return undefined;
  }
  const reason = state.detachReason ?? 'debugger_detached';
  return failed(ERROR_CODES.RUNTIME_UNAVAILABLE, `Debugger detached: ${reason}`, { tabId, state });
}
