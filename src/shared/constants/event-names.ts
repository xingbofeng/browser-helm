export const CONTENT_RPC_MESSAGES = {
  PAGE_OBSERVE: 'BH_PAGE_OBSERVE',
  FRAME_LIST: 'BH_FRAME_LIST',
  A11Y_SNAPSHOT: 'BH_A11Y_SNAPSHOT',
  A11Y_RESOLVE_REF: 'BH_A11Y_RESOLVE_REF',
  A11Y_REFRESH_REFS: 'BH_A11Y_REFRESH_REFS',
  IFRAME_READ: 'BH_IFRAME_READ',
  IFRAME_CLICK: 'BH_IFRAME_CLICK',
  IFRAME_TYPE: 'BH_IFRAME_TYPE'
} as const;

export const RUNTIME_MESSAGES = {
  START_RUN: 'BH_RUNTIME_START_RUN',
  GET_SNAPSHOT: 'BH_RUNTIME_GET_SNAPSHOT',
  EXECUTE_TOOL: 'BH_RUNTIME_EXECUTE_TOOL',
  DECIDE_APPROVAL: 'BH_RUNTIME_DECIDE_APPROVAL'
} as const;

export const SIDE_PANEL_MESSAGES = {
  TARGET_PORT: 'BH_SIDE_PANEL_TARGET_PORT',
  TARGET_TAB_CHANGED: 'BH_SIDE_PANEL_TARGET_TAB_CHANGED'
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
  STATE_CHANGED: 'state_changed'
} as const;

export type ContentRpcMessageName =
  (typeof CONTENT_RPC_MESSAGES)[keyof typeof CONTENT_RPC_MESSAGES];
export type RuntimeMessageName =
  (typeof RUNTIME_MESSAGES)[keyof typeof RUNTIME_MESSAGES];
export type SidePanelMessageName =
  (typeof SIDE_PANEL_MESSAGES)[keyof typeof SIDE_PANEL_MESSAGES];
export type TraceEventName =
  (typeof TRACE_EVENT_NAMES)[keyof typeof TRACE_EVENT_NAMES];
