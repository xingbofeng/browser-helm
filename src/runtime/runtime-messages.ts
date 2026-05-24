import { z } from 'zod';

export const startRunInputSchema = z.object({
  task: z.string().min(1),
  tabId: z.number().int().positive().optional()
});

export const runtimeRequestSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('BH_RUNTIME_START_RUN'),
    input: startRunInputSchema
  }),
  z.object({
    type: z.literal('BH_RUNTIME_GET_SNAPSHOT'),
    runId: z.string().min(1)
  })
]);

export const runtimeResponseSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    data: z.unknown()
  }),
  z.object({
    ok: z.literal(false),
    code: z.string().min(1),
    message: z.string().min(1)
  })
]);

export type StartRunInput = z.infer<typeof startRunInputSchema>;
export type RuntimeRequest = z.infer<typeof runtimeRequestSchema>;
export type RuntimeResponse = z.infer<typeof runtimeResponseSchema>;

export type RuntimeObservationSnapshot = {
  url: string;
  title: string;
  currentDomain: string;
  origin: string;
  visibleTextSummary: string;
  pageStateSummary: string;
  interactiveCount: number;
  warnings: string[];
};

export type RuntimeRefSnapshot = {
  refId: string;
  role?: string | undefined;
  name?: string | undefined;
  tagName: string;
  visible: boolean;
  disabled?: boolean | undefined;
};

export type RuntimeToolResultSnapshot = {
  tool: string;
  ok: boolean;
  code: string;
  summary: string;
};

export type RunSnapshot = {
  runId: string;
  status: 'created' | 'observed' | 'empty' | 'error' | 'not_found';
  observation?: RuntimeObservationSnapshot;
  refs?: RuntimeRefSnapshot[];
  toolResult?: RuntimeToolResultSnapshot;
  error?: {
    code: string;
    message: string;
  };
};

export type RuntimeEvent = {
  runId: string;
  type: string;
  payload?: unknown;
};
