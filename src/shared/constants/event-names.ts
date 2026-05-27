export const CONTENT_RPC_MESSAGES = {
  PAGE_OBSERVE: 'BH_PAGE_OBSERVE',
  PAGE_READ_VISIBLE_TEXT: 'BH_PAGE_READ_VISIBLE_TEXT',
  PAGE_READ_ARTICLE: 'BH_PAGE_READ_ARTICLE',
  PAGE_WAIT_UNTIL_STABLE: 'BH_PAGE_WAIT_UNTIL_STABLE',
  VIEWPORT_GET_INFO: 'BH_VIEWPORT_GET_INFO',
  VIEWPORT_SCROLL: 'BH_VIEWPORT_SCROLL',
  FRAME_LIST: 'BH_FRAME_LIST',
  A11Y_SNAPSHOT: 'BH_A11Y_SNAPSHOT',
  A11Y_RESOLVE_REF: 'BH_A11Y_RESOLVE_REF',
  A11Y_HIGHLIGHT_REF: 'BH_A11Y_HIGHLIGHT_REF',
  A11Y_REFRESH_REFS: 'BH_A11Y_REFRESH_REFS',
  IFRAME_READ: 'BH_IFRAME_READ',
  IFRAME_ACTION_AUTHORIZE: 'BH_IFRAME_ACTION_AUTHORIZE',
  IFRAME_CLICK: 'BH_IFRAME_CLICK',
  IFRAME_TYPE: 'BH_IFRAME_TYPE',
  // form fill actions
  FORM_FILL_FIELD: 'BH_FORM_FILL_FIELD',
  FORM_FILL_MANY: 'BH_FORM_FILL_MANY',
  FORM_VERIFY: 'BH_FORM_VERIFY',
  FORM_EXECUTE_SUBMIT: 'BH_FORM_EXECUTE_SUBMIT',
} as const;

export const RUNTIME_MESSAGES = {
  START_RUN: 'BH_RUNTIME_START_RUN',
  GET_SNAPSHOT: 'BH_RUNTIME_GET_SNAPSHOT',
  CANCEL_RUN: 'BH_RUNTIME_CANCEL_RUN',
  REVISE_GOAL: 'BH_RUNTIME_REVISE_GOAL',
  HIGHLIGHT_REF: 'BH_RUNTIME_HIGHLIGHT_REF',
  EXECUTE_TOOL: 'BH_RUNTIME_EXECUTE_TOOL',
  DECIDE_APPROVAL: 'BH_RUNTIME_DECIDE_APPROVAL',
  TEST_PROVIDER_CONNECTION: 'BH_RUNTIME_TEST_PROVIDER_CONNECTION',
  SUBSCRIBE_RUN: 'BH_RUNTIME_SUBSCRIBE_RUN'
} as const;

export const SIDE_PANEL_MESSAGES = {
  TARGET_PORT: 'BH_SIDE_PANEL_TARGET_PORT',
  TARGET_TAB_CHANGED: 'BH_SIDE_PANEL_TARGET_TAB_CHANGED',
  FLOATING_PANEL_URL: 'BH_SIDE_PANEL_FLOATING_PANEL_URL',
  FLOATING_PANEL_TOGGLE: 'BH_SIDE_PANEL_FLOATING_PANEL_TOGGLE'
} as const;

export const TRACE_EVENT_NAMES = {
  RUN_STARTED: 'run_started',
  RUN_FINISHED: 'run_finished',
  RUN_FAILED: 'run_failed',
  RUN_CANCELLED: 'run_cancelled',
  TURN_STARTED: 'turn_started',
  TURN_FINISHED: 'turn_finished',
  MODEL_OUTPUT_RECEIVED: 'model_output_received',
  MODEL_DECISION: 'model_decision',
  DECISION_PARSE_FAILED: 'decision_parse_failed',
  TOOL_STARTED: 'tool_started',
  TOOL_RESULT: 'tool_result',
  TOOL_FAILED: 'tool_failed',
  CONTEXT_BUILT: 'context_built',
  CONTEXT_COMPACTED: 'context_compacted',
  CONTEXT_SUMMARY: 'context_summary',
  APPROVAL_REQUIRED: 'approval_required',
  STATE_CHANGED: 'state_changed',
  TASK_CLASSIFIED: 'task_classified',
  TOOLS_SELECTED: 'tools_selected',
  CAPABILITIES_RESOLVED: 'capabilities_resolved',
  PLAN_UPDATED: 'plan_updated',
  RECOVERY_ACTION: 'recovery_action',
  FINDINGS_REPORTED: 'findings_reported',
  DEBUG_REPORT_CREATED: 'debug_report_created',
  MODEL_STREAM_STARTED: 'model_stream_started',
  MODEL_STREAM_DELTA: 'model_stream_delta',
  MODEL_STREAM_FINISHED: 'model_stream_finished',
  MODEL_STREAM_FAILED: 'model_stream_failed',
  MODEL_STREAM_FALLBACK_STARTED: 'model_stream_fallback_started',
  MODEL_STREAM_FALLBACK_FINISHED: 'model_stream_fallback_finished',
  PROVIDER_TEST_STARTED: 'provider_test_started',
  PROVIDER_TEST_FINISHED: 'provider_test_finished',
  PROVIDER_TEST_FAILED: 'provider_test_failed',
  FILL_PLAN_CREATED: 'fill_plan_created',
  FIELD_FILL_STARTED: 'field_fill_started',
  FIELD_FILL_RESULT: 'field_fill_result',
  FORM_VERIFY_RESULT: 'form_verify_result',
  SUBMIT_APPROVAL_REQUESTED: 'submit_approval_requested',
  FORM_SUBMIT_RESULT: 'form_submit_result',
} as const;

export const APPROVAL_EVENT_NAMES = {
  APPROVED: 'approval_approved',
  DENIED: 'approval_denied',
  EXPIRED: 'approval_expired'
} as const;

export type ContentRpcMessageName =
  (typeof CONTENT_RPC_MESSAGES)[keyof typeof CONTENT_RPC_MESSAGES];
export type RuntimeMessageName =
  (typeof RUNTIME_MESSAGES)[keyof typeof RUNTIME_MESSAGES];
export type SidePanelMessageName =
  (typeof SIDE_PANEL_MESSAGES)[keyof typeof SIDE_PANEL_MESSAGES];
export type TraceEventName =
  (typeof TRACE_EVENT_NAMES)[keyof typeof TRACE_EVENT_NAMES];
export type ApprovalEventName =
  (typeof APPROVAL_EVENT_NAMES)[keyof typeof APPROVAL_EVENT_NAMES];
