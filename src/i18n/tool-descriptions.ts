import { TOOL_NAMES, type ToolName } from '../shared/constants/tool-names';
import { t } from './t';
import type { Locale, TranslationKey } from './types';

export const TOOL_DESCRIPTION_KEYS: Record<ToolName, TranslationKey> = {
  [TOOL_NAMES.A11Y_FIND_INTERACTIVE]: 'tool.description.bh_a11y_find_interactive',
  [TOOL_NAMES.A11Y_REFRESH_REFS]: 'tool.description.bh_a11y_refresh_refs',
  [TOOL_NAMES.A11Y_RESOLVE_REF]: 'tool.description.bh_a11y_resolve_ref',
  [TOOL_NAMES.A11Y_SNAPSHOT]: 'tool.description.bh_a11y_snapshot',
  [TOOL_NAMES.ACTION_CHECK_READINESS]: 'tool.description.bh_action_check_readiness',
  [TOOL_NAMES.AGENT_ASK_USER]: 'tool.description.bh_agent_ask_user',
  [TOOL_NAMES.AGENT_FAIL]: 'tool.description.bh_agent_fail',
  [TOOL_NAMES.AGENT_FINISH]: 'tool.description.bh_agent_finish',
  [TOOL_NAMES.DEBUG_COLLECT_PAGE_HEALTH]: 'tool.description.bh_debug_collect_page_health',
  [TOOL_NAMES.ELEMENT_INSPECT]: 'tool.description.bh_element_inspect',
  [TOOL_NAMES.ELEMENT_READ_STATE]: 'tool.description.bh_element_read_state',
  [TOOL_NAMES.FORM_FIND_DISABLED_SUBMIT_REASON]: 'tool.description.bh_form_find_disabled_submit_reason',
  [TOOL_NAMES.FORM_FIND_MISSING_REQUIRED]: 'tool.description.bh_form_find_missing_required',
  [TOOL_NAMES.FORM_FIND_VALIDATION_ERRORS]: 'tool.description.bh_form_find_validation_errors',
  [TOOL_NAMES.FORM_INSPECT]: 'tool.description.bh_form_inspect',
  [TOOL_NAMES.FORM_LIST]: 'tool.description.bh_form_list',
  [TOOL_NAMES.FORM_READ_FIELDS]: 'tool.description.bh_form_read_fields',
  [TOOL_NAMES.FRAME_LIST]: 'tool.description.bh_frame_list',
  [TOOL_NAMES.IFRAME_CLICK]: 'tool.description.bh_iframe_click',
  [TOOL_NAMES.IFRAME_LIST]: 'tool.description.bh_iframe_list',
  [TOOL_NAMES.IFRAME_READ]: 'tool.description.bh_iframe_read',
  [TOOL_NAMES.IFRAME_TYPE]: 'tool.description.bh_iframe_type',
  [TOOL_NAMES.PAGE_OBSERVE]: 'tool.description.bh_page_observe',
  [TOOL_NAMES.PAGE_READ_VISIBLE_TEXT]: 'tool.description.bh_page_read_visible_text',
  [TOOL_NAMES.PAGE_READ_ARTICLE]: 'tool.description.bh_page_read_article',
  [TOOL_NAMES.PAGE_WAIT_UNTIL_STABLE]: 'tool.description.bh_page_wait_until_stable',
  [TOOL_NAMES.VIEWPORT_GET_INFO]: 'tool.description.bh_viewport_get_info',
  [TOOL_NAMES.VIEWPORT_SCROLL]: 'tool.description.bh_viewport_scroll',
  [TOOL_NAMES.FORM_INFER_FILL_PLAN]: 'tool.description.bh_form_infer_fill_plan',
  [TOOL_NAMES.FORM_FILL_FIELD]: 'tool.description.bh_form_fill_field',
  [TOOL_NAMES.FORM_FILL_MANY]: 'tool.description.bh_form_fill_many',
  [TOOL_NAMES.FORM_VERIFY]: 'tool.description.bh_form_verify',
  [TOOL_NAMES.FORM_SUBMIT_WITH_APPROVAL]: 'tool.description.bh_form_submit_with_approval'
};

export function toolDescription(tool: string | undefined, locale: Locale): string | undefined {
  if (!tool || !(tool in TOOL_DESCRIPTION_KEYS)) {
    return undefined;
  }
  return t(TOOL_DESCRIPTION_KEYS[tool as ToolName], locale);
}
