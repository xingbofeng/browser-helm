import { z } from 'zod';

import { CONTENT_RPC_MESSAGES } from '../../shared/constants/event-names';
import { ERROR_CODES } from '../../shared/constants/error-codes';
import { TOOL_NAMES } from '../../shared/constants/tool-names';
import { pageHealthSummarySchema } from '../../shared/schemas/page-health.schema';
import { toolResultSchema, type ToolResult } from '../../shared/schemas/tool-result.schema';
import type { ContentRpcClient } from '../../page/messaging/content-rpc-client';
import { t } from '../../i18n/t';
import type { Locale } from '../../i18n/types';
import type { ToolSpec } from '../core/tool-spec';

const argsSchema = z.object({});

export function bhDebugCollectPageHealth(
  rpc: ContentRpcClient
): ToolSpec<z.infer<typeof argsSchema>, ToolResult> {
  return {
    name: TOOL_NAMES.DEBUG_COLLECT_PAGE_HEALTH,
    title: 'Collect Page Health',
    description: 'Collects a read-only shallow page health summary',
    modes: ['debug'],
    risk: 'safe',
    argsSchema,
    resultSchema: toolResultSchema,
    ui: {
      titleKey: 'tool.title.bh_debug_collect_page_health',
      descriptionKey: 'tool.description.bh_debug_collect_page_health',
    },
    async execute(_args, ctx) {
      const locale: Locale = ctx.locale ?? 'zh';
      const response = await rpc.request({ type: CONTENT_RPC_MESSAGES.PAGE_OBSERVE });
      if (!response.ok) {
        return {
          ok: false,
          code: response.code,
          summary: response.message,
          error: {
            message: response.message,
            detail: response.detail
          },
          changedPage: false,
          requiresObserve: true
        };
      }
      if (!('observation' in response)) {
        return {
          ok: false,
          code: ERROR_CODES.OBSERVATION_FAILED,
          summary: t('tool.summary.bh_debug_collect_page_health.missing', locale),
          changedPage: false,
          requiresObserve: true
        };
      }

      const observation = response.observation;
      if (observation.pageHealth) {
        const payload = pageHealthSummarySchema.parse(observation.pageHealth);
        return {
          ok: true,
          code: ERROR_CODES.OK,
          summary: payload.pageStateSummary,
          data: payload,
          changedPage: false,
          requiresObserve: false,
          context: {
            visibility: 'summary',
            summary: payload.pageStateSummary
          }
        };
      }
      const hasForm =
        typeof observation.formFields === 'object' &&
        observation.formFields !== null &&
        'fields' in observation.formFields &&
        Array.isArray(observation.formFields.fields) &&
        observation.formFields.fields.length >= 0;
      const payload = pageHealthSummarySchema.parse({
        consoleErrors: [],
        networkFailures: [],
        hasForm,
        pageStateSummary: observation.pageStateSummary,
        limitations: ['CDP deep inspection unavailable']
      });

      return {
        ok: true,
        code: ERROR_CODES.OK,
        summary: payload.pageStateSummary,
        data: payload,
        changedPage: false,
        requiresObserve: false,
        context: {
          visibility: 'summary',
          summary: payload.pageStateSummary
        }
      };
    }
  };
}
