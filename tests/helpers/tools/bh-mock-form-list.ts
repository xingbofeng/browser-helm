import { z } from 'zod';

import { toolResultSchema } from '../../../src/shared/schemas/tool-result.schema';
import type { ToolSpec } from '../../../src/tools/core/tool-spec';

const argsSchema = z.object({
  scope: z.string().min(1)
});

const formFieldSchema = z.object({
  ref: z.string(),
  label: z.string(),
  type: z.string(),
  required: z.boolean()
});

export const bhMockFormList: ToolSpec<
  z.infer<typeof argsSchema>,
  z.infer<typeof toolResultSchema>
> = {
  name: 'bh_mock_form_list',
  title: 'Mock Form List',
  description: 'Returns synthetic form fields for kernel tests',
  modes: ['internal'],
  risk: 'safe',
  argsSchema,
  resultSchema: toolResultSchema,
  execute(args) {
    const fields = z
      .array(formFieldSchema)
      .parse([
        {
          ref: `${args.scope}-field-email`,
          label: 'Email',
          type: 'email',
          required: true
        },
        {
          ref: `${args.scope}-field-phone`,
          label: 'Phone',
          type: 'tel',
          required: false
        }
      ]);

    return Promise.resolve({
      ok: true,
      code: 'OK',
      summary: 'Listed mock form fields',
      data: fields,
      nextHints: ['Validate required fields first'],
      changedPage: false,
      requiresObserve: false,
      context: {
        visibility: 'summary',
        summary: `Fields=${fields.length}`
      }
    });
  }
};
