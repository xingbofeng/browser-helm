import { z } from 'zod';

import {
  a11ySnapshotSchema,
  observationSchema
} from '../../shared/schemas/observation.schema';
import { actionValuePreviewSchema } from '../../shared/schemas/action-readiness.schema';
import {
  fillFieldResultSchema,
  fillManyResultSchema,
  formVerifyResultSchema,
} from '../../shared/schemas/form-fill.schema';
import { CONTENT_RPC_MESSAGES } from '../../shared/constants/event-names';

export const contentRpcRequestSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal(CONTENT_RPC_MESSAGES.PAGE_OBSERVE)
  }),
  z.object({
    type: z.literal(CONTENT_RPC_MESSAGES.PAGE_READ_VISIBLE_TEXT),
    cursor: z.number().int().nonnegative().optional(),
    maxChars: z.number().int().positive().max(50_000).optional(),
    frameId: z.number().int().nonnegative().optional()
  }),
  z.object({
    type: z.literal(CONTENT_RPC_MESSAGES.PAGE_READ_ARTICLE),
    cursor: z.number().int().nonnegative().optional(),
    maxChars: z.number().int().positive().max(50_000).optional(),
    includeHeadings: z.boolean().optional(),
    includeLinks: z.boolean().optional(),
    linkLimit: z.number().int().nonnegative().max(200).optional(),
    frameId: z.number().int().nonnegative().optional()
  }),
  z.object({
    type: z.literal(CONTENT_RPC_MESSAGES.PAGE_WAIT_UNTIL_STABLE),
    quietMs: z.number().int().positive().max(5_000).optional()
  }),
  z.object({
    type: z.literal(CONTENT_RPC_MESSAGES.VIEWPORT_GET_INFO),
    frameId: z.number().int().nonnegative().optional()
  }),
  z.object({
    type: z.literal(CONTENT_RPC_MESSAGES.VIEWPORT_SCROLL),
    direction: z.enum(['up', 'down', 'left', 'right']),
    amount: z.union([
      z.enum(['half', 'page', 'end']),
      z.object({ pixels: z.number().int().positive().max(50_000) })
    ]),
    frameId: z.number().int().nonnegative().optional()
  }),
  z.object({
    type: z.literal(CONTENT_RPC_MESSAGES.FRAME_LIST)
  }),
  z.object({
    type: z.literal(CONTENT_RPC_MESSAGES.A11Y_SNAPSHOT)
  }),
  z.object({
    type: z.literal(CONTENT_RPC_MESSAGES.A11Y_RESOLVE_REF),
    refId: z.string().min(1)
  }),
  z.object({
    type: z.literal(CONTENT_RPC_MESSAGES.A11Y_HIGHLIGHT_REF),
    refId: z.string().min(1)
  }),
  z.object({
    type: z.literal(CONTENT_RPC_MESSAGES.A11Y_REFRESH_REFS)
  }),
  z.object({
    type: z.literal(CONTENT_RPC_MESSAGES.IFRAME_READ),
    frameId: z.number().int().nonnegative(),
    refId: z.string().min(1)
  }),
  z.object({
    type: z.literal(CONTENT_RPC_MESSAGES.IFRAME_ACTION_AUTHORIZE),
    frameId: z.number().int().nonnegative(),
    refId: z.string().min(1),
    action: z.enum(['click', 'type'])
  }),
  z.object({
    type: z.literal(CONTENT_RPC_MESSAGES.IFRAME_CLICK),
    frameId: z.number().int().nonnegative(),
    refId: z.string().min(1),
    actionToken: z.string().optional()
  }),
  z.object({
    type: z.literal(CONTENT_RPC_MESSAGES.IFRAME_TYPE),
    frameId: z.number().int().nonnegative(),
    refId: z.string().min(1),
    text: z.string(),
    actionToken: z.string().optional(),
    valuePreview: actionValuePreviewSchema
  }),
  // 表单填写动作
  z.object({ type: z.literal(CONTENT_RPC_MESSAGES.FORM_FILL_FIELD), fieldRefId: z.string().min(1), value: z.string(), clear: z.boolean().optional() }),
  z.object({ type: z.literal(CONTENT_RPC_MESSAGES.FORM_FILL_MANY), targets: z.array(z.object({ fieldRefId: z.string().min(1), value: z.string(), clear: z.boolean().optional() })) }),
  z.object({ type: z.literal(CONTENT_RPC_MESSAGES.FORM_VERIFY), fieldRefIds: z.array(z.string().min(1)), submitRefId: z.string().min(1).optional() }),
  z.object({ type: z.literal(CONTENT_RPC_MESSAGES.FORM_EXECUTE_SUBMIT), submitTargetRefId: z.string().min(1).optional() }),
]);

export const contentRpcSuccessSchema = z.union([
  z.object({
    ok: z.literal(true),
    observation: observationSchema
  }),
  z.object({
    ok: z.literal(true),
    frames: z.array(
      z.object({
        frameId: z.number().int().nonnegative(),
        url: z.string(),
        parentFrameId: z.number().int().nonnegative().optional(),
        isTop: z.boolean()
      })
    )
  }),
  z.object({
    ok: z.literal(true),
    pageRead: z.object({
      text: z.string(),
      cursor: z.number().int().nonnegative(),
      nextCursor: z.number().int().nonnegative().optional(),
      hasMore: z.boolean(),
      totalTextLength: z.number().int().nonnegative(),
      warnings: z.array(z.string()),
      headings: z.array(z.object({ level: z.number().int(), text: z.string() })).optional(),
      links: z.array(z.object({ text: z.string(), href: z.string() })).optional(),
      contentSource: z.string().optional()
    })
  }),
  z.object({
    ok: z.literal(true),
    viewport: z.object({
      scrollX: z.number(),
      scrollY: z.number(),
      viewportWidth: z.number(),
      viewportHeight: z.number(),
      scrollWidth: z.number(),
      scrollHeight: z.number(),
      canScrollDown: z.boolean(),
      canScrollUp: z.boolean(),
      canScrollLeft: z.boolean(),
      canScrollRight: z.boolean(),
      atBottom: z.boolean(),
      atTop: z.boolean()
    }),
    before: z.unknown().optional(),
    after: z.unknown().optional(),
    didScroll: z.boolean().optional(),
    atBoundary: z.boolean().optional()
  }),
  z.object({
    ok: z.literal(true),
    stable: z.boolean(),
    readyState: z.string(),
    waitedMs: z.number().int().nonnegative()
  }),
  z.object({
    ok: z.literal(true),
    snapshot: a11ySnapshotSchema
  }),
  z.object({
    ok: z.literal(true),
    fillFieldResult: fillFieldResultSchema
  }),
  z.object({
    ok: z.literal(true),
    fillManyResult: fillManyResultSchema
  }),
  z.object({
    ok: z.literal(true),
    verifyResult: formVerifyResultSchema
  }),
  z.object({
    ok: z.literal(true),
    submitResult: z.string()
  }),
  z.object({
    ok: z.literal(true),
    ref: z.unknown(),
    changedPage: z.boolean().optional()
  }),
  z.object({
    ok: z.literal(true),
    actionToken: z.string().min(1)
  })
]);

export const contentRpcFailureSchema = z.object({
  ok: z.literal(false),
  code: z.string().min(1),
  message: z.string().min(1),
  detail: z.unknown().optional()
});

export type ContentRpcRequest = z.infer<typeof contentRpcRequestSchema>;
export type ContentRpcResponse =
  | z.infer<typeof contentRpcSuccessSchema>
  | z.infer<typeof contentRpcFailureSchema>;
