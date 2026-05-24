import { z } from 'zod';

import { toolResultSchema } from '../../shared/schemas/toolResult.schema';
import type { ToolSpec } from '../core/tool-spec';

const argsSchema = z.object({
  page: z.string().min(1)
});

const dataSchema = z.object({
  title: z.string(),
  url: z.string(),
  interactiveCount: z.number().int().nonnegative()
});

export const bhMockPageObserve: ToolSpec<
  z.infer<typeof argsSchema>,
  z.infer<typeof toolResultSchema>
> = {
  name: 'bh_mock_page_observe',
  title: 'Mock Page Observe',
  description: 'Returns synthetic page observation data for kernel tests',
  modes: ['internal'],
  risk: 'safe',
  argsSchema,
  resultSchema: toolResultSchema,
  execute(args) {
    const data = dataSchema.parse({
      title: 'Mock Checkout Page',
      url: `https://mock.local/${args.page}`,
      interactiveCount: 12
    });

    return Promise.resolve({
      ok: true,
      code: 'OK',
      summary: 'Captured mock page observation',
      data,
      nextHints: ['Continue to form analysis'],
      changedPage: false,
      requiresObserve: false,
      context: {
        visibility: 'summary',
        summary: 'Title=Mock Checkout Page, interactive=12'
      }
    });
  }
};
