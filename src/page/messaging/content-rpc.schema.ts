import { z } from 'zod';

import {
  a11ySnapshotSchema,
  observationSchema
} from '../../shared/schemas/observation.schema';

export const contentRpcRequestSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('BH_PAGE_OBSERVE')
  }),
  z.object({
    type: z.literal('BH_A11Y_SNAPSHOT')
  }),
  z.object({
    type: z.literal('BH_A11Y_RESOLVE_REF'),
    refId: z.string().min(1)
  }),
  z.object({
    type: z.literal('BH_A11Y_REFRESH_REFS')
  })
]);

export const contentRpcSuccessSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    observation: observationSchema
  }),
  z.object({
    ok: z.literal(true),
    snapshot: a11ySnapshotSchema
  }),
  z.object({
    ok: z.literal(true),
    ref: z.unknown()
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
