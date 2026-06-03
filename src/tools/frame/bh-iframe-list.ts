import { z } from 'zod';

import type { ContentRpcClient } from '../../page/messaging/content-rpc-client';
import { ERROR_CODES } from '../../shared/constants/error-codes';
import { CONTENT_RPC_MESSAGES } from '../../shared/constants/event-names';
import { TOOL_NAMES } from '../../shared/constants/tool-names';
import { redactTextForModelContext } from '../../shared/redaction';
import { toolResultSchema, type ToolResult } from '../../shared/schemas/tool-result.schema';
import type { ToolSpec } from '../core/tool-spec';
import { toolMeta } from '../core/tool-meta';

const argsSchema = z.object({});

/** 列出 iframe 并给出稳定 iframeId；Ask/Debug/Form/Act 可用，只读 safe。 */
export function bhIframeList(
  rpc: ContentRpcClient
): ToolSpec<z.infer<typeof argsSchema>, ToolResult> {
  return {
    name: TOOL_NAMES.IFRAME_LIST,
    ...toolMeta('Iframe List', 'Lists iframes with stable iframeId metadata', 'tool.title.bh_iframe_list', 'tool.description.bh_iframe_list'),
    modes: ['ask', 'debug', 'form', 'act'],
    risk: 'safe',
    argsSchema,
    resultSchema: toolResultSchema,
    async execute() {
      const response = await rpc.request({ type: CONTENT_RPC_MESSAGES.FRAME_LIST });
      if (!response.ok || !('frames' in response)) {
        const message = response.ok ? 'Content RPC did not return frame metadata' : response.message;
        return { ok: false, code: response.ok ? ERROR_CODES.OBSERVATION_FAILED : response.code, summary: message, error: { message }, changedPage: false, requiresObserve: false };
      }
      const frames = response.frames.map((frame) => buildFrameSummary(frame, response.frames));
      const iframes = frames.filter((frame) => !frame.isTop).map((frame) => ({
        iframeId: `frame_${frame.frameId}`,
        frameId: frame.frameId,
        url: frame.url,
        origin: frame.origin,
        parentFrameId: frame.parentFrameId,
        parentOrigin: frame.parentOrigin,
        crossOrigin: frame.crossOrigin,
        readable: frame.readable,
        ...(frame.limitation ? { limitation: frame.limitation } : {})
      }));
      const top = frames.find((frame) => frame.isTop);
      const frameTree = {
        topFrameId: top?.frameId,
        frames
      };
      return {
        ok: true,
        code: ERROR_CODES.OK,
        summary: `Detected ${iframes.length} iframes`,
        data: { iframes, frameTree },
        changedPage: false,
        requiresObserve: false,
        context: { visibility: 'summary', summary: JSON.stringify({ iframes, frameTree }) }
      };
    }
  };
}

type RpcFrame = {
  frameId: number;
  url: string;
  parentFrameId?: number | undefined;
  isTop: boolean;
};

function buildFrameSummary(frame: RpcFrame, allFrames: RpcFrame[]) {
  const parent = frame.parentFrameId === undefined
    ? undefined
    : allFrames.find((candidate) => candidate.frameId === frame.parentFrameId);
  const origin = originOf(frame.url);
  const parentOrigin = parent ? originOf(parent.url) : undefined;
  const crossOrigin = Boolean(parentOrigin && origin && parentOrigin !== origin);
  return {
    frameId: frame.frameId,
    url: sanitizeFrameUrl(frame.url),
    origin,
    isTop: frame.isTop,
    parentFrameId: frame.parentFrameId,
    parentOrigin,
    crossOrigin,
    readable: 'unknown' as const,
    children: allFrames
      .filter((candidate) => candidate.parentFrameId === frame.frameId)
      .map((candidate) => candidate.frameId),
    ...(crossOrigin ? { limitation: 'cross_origin_read_requires_targeted_iframe_read' } : {})
  };
}

function sanitizeFrameUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    return redactTextForModelContext(`${parsed.origin}${parsed.pathname}`);
  } catch {
    return redactTextForModelContext(rawUrl.split(/[?#]/u)[0] ?? rawUrl);
  }
}

function originOf(rawUrl: string): string {
  try {
    return new URL(rawUrl).origin;
  } catch {
    return '';
  }
}
