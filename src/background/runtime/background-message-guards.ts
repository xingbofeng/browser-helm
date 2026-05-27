import { SIDE_PANEL_MESSAGES, RUNTIME_MESSAGES } from '../../shared/constants/event-names';

/** 解析 SUBSCRIBE_RUN 端口消息中的 runId。 */
export function parseRunSubscription(message: unknown): string | undefined {
  if (!message || typeof message !== 'object') {
    return undefined;
  }
  const runId = (message as { runId?: unknown }).runId;
  return typeof runId === 'string' && runId.length > 0 ? runId : undefined;
}

/** 类型守卫：FLOATING_PANEL_URL 消息。 */
export function isFloatingPanelUrlMessage(value: unknown): value is {
  type: typeof SIDE_PANEL_MESSAGES.FLOATING_PANEL_URL;
} {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    (value as Record<string, unknown>).type === SIDE_PANEL_MESSAGES.FLOATING_PANEL_URL
  );
}

/** 类型守卫：FLOATING_PANEL_TOGGLE 消息。 */
export function isFloatingPanelToggleMessage(value: unknown): value is {
  type: typeof SIDE_PANEL_MESSAGES.FLOATING_PANEL_TOGGLE;
} {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    (value as Record<string, unknown>).type === SIDE_PANEL_MESSAGES.FLOATING_PANEL_TOGGLE
  );
}

/** 是否为合法的 RUNTIME_MESSAGES 消息类型名。 */
export function isRuntimeMessageName(value: unknown): value is (typeof RUNTIME_MESSAGES)[keyof typeof RUNTIME_MESSAGES] {
  if (typeof value !== 'string') return false;
  return Object.values(RUNTIME_MESSAGES).includes(value as (typeof RUNTIME_MESSAGES)[keyof typeof RUNTIME_MESSAGES]);
}
