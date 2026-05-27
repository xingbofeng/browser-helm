import { TOOL_NAMES, type ToolName } from './constants/tool-names';

export const TOOL_DESCRIPTIONS: Record<ToolName, string> = {
  [TOOL_NAMES.A11Y_FIND_INTERACTIVE]: 'Returns read-only interactive elements with refs and state',
  [TOOL_NAMES.A11Y_REFRESH_REFS]: 'Refreshes the current page ref map',
  [TOOL_NAMES.A11Y_RESOLVE_REF]: 'Resolves a stable ref_id to the current page element summary',
  [TOOL_NAMES.A11Y_SNAPSHOT]: 'Returns an accessibility-like snapshot with stable refs',
  [TOOL_NAMES.ACTION_CHECK_READINESS]: 'Checks whether a proposed action is ready and whether it would require approval',
  [TOOL_NAMES.AGENT_ASK_USER]: 'Requests user input before continuing',
  [TOOL_NAMES.AGENT_FAIL]: 'Fails current run with structured error',
  [TOOL_NAMES.AGENT_FINISH]: 'Completes current run with final summary',
  [TOOL_NAMES.DEBUG_COLLECT_PAGE_HEALTH]: 'Collects a read-only shallow page health summary',
  [TOOL_NAMES.ELEMENT_INSPECT]: 'Inspects a page element from its stable ref',
  [TOOL_NAMES.ELEMENT_READ_STATE]: 'Reads current state for a page element from its stable ref',
  [TOOL_NAMES.FORM_FIND_DISABLED_SUBMIT_REASON]: 'Finds the reason a submit button is disabled',
  [TOOL_NAMES.FORM_FIND_MISSING_REQUIRED]: 'Finds required fields with empty previews',
  [TOOL_NAMES.FORM_FIND_VALIDATION_ERRORS]: 'Finds fields with validation errors',
  [TOOL_NAMES.FORM_INSPECT]: 'Inspects form fields and submit state',
  [TOOL_NAMES.FORM_LIST]: 'Lists detected forms and field counts',
  [TOOL_NAMES.FORM_READ_FIELDS]: 'Reads form field snapshots',
  [TOOL_NAMES.FRAME_LIST]: 'Lists frame ids and urls for the current page',
  [TOOL_NAMES.IFRAME_CLICK]: 'Clicks an iframe target after readiness and approval checks',
  [TOOL_NAMES.IFRAME_LIST]: 'Lists iframes with stable iframeId metadata',
  [TOOL_NAMES.IFRAME_READ]: 'Reads an iframe document by iframeId or a target by composite stable ref_id',
  [TOOL_NAMES.IFRAME_TYPE]: 'Types into an iframe target after readiness and approval checks',
  [TOOL_NAMES.PAGE_OBSERVE]: 'Observes the current page and returns a bounded summary',
  [TOOL_NAMES.PAGE_READ_VISIBLE_TEXT]: 'Reads current page visible text with cursor pagination',
  [TOOL_NAMES.PAGE_READ_ARTICLE]: 'Reads article-like main content with optional headings and links',
  [TOOL_NAMES.PAGE_WAIT_UNTIL_STABLE]: 'Waits until the page is stable enough for a follow-up read',
  [TOOL_NAMES.VIEWPORT_GET_INFO]: 'Reads viewport and scroll state for page or iframe',
  [TOOL_NAMES.VIEWPORT_SCROLL]: 'Scrolls the page or iframe viewport and requires a follow-up observe/read',
  [TOOL_NAMES.FORM_INFER_FILL_PLAN]: 'Infers a form fill plan from the user task and field snapshots.',
  [TOOL_NAMES.FORM_FILL_FIELD]: 'Fills a single form field with guard checks and event dispatch.',
  [TOOL_NAMES.FORM_FILL_MANY]: 'Batch-fills multiple form fields with partial-success results.',
  [TOOL_NAMES.FORM_VERIFY]: 'Verifies form readiness before submit.',
  [TOOL_NAMES.FORM_SUBMIT_WITH_APPROVAL]: 'Requests user approval before submitting a form.'
};

export function toolDescription(tool: string | undefined): string | undefined {
  return tool && tool in TOOL_DESCRIPTIONS
    ? TOOL_DESCRIPTIONS[tool as ToolName]
    : undefined;
}
