export const INTERNAL_TOOL_NAMES = {
  IFRAME_CLICK: 'bh_iframe_click',
  IFRAME_TYPE: 'bh_iframe_type',
} as const;

export type InternalToolName = (typeof INTERNAL_TOOL_NAMES)[keyof typeof INTERNAL_TOOL_NAMES];
