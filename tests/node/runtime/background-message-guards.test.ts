import { describe, expect, it } from 'vitest';

import {
  isFloatingPanelOpenNativeMessage,
  isFloatingPanelUrlMessage,
  isFloatingPanelToggleMessage,
  isRuntimeMessageName,
  parseRunSubscription
} from '../../../src/background/runtime/background-message-guards';
import { RUNTIME_MESSAGES, SIDE_PANEL_MESSAGES } from '../../../src/shared/constants/event-names';

describe('parseRunSubscription', () => {
  it('从包含有效 runId 的消息中提取 runId', () => {
    expect(parseRunSubscription({ runId: 'abc-123' })).toBe('abc-123');
  });

  it('空字符串 runId 返回 undefined', () => {
    expect(parseRunSubscription({ runId: '' })).toBeUndefined();
    expect(parseRunSubscription({ runId: ' ' })).toBe(' ');
  });

  it('非对象返回 undefined', () => {
    expect(parseRunSubscription(null)).toBeUndefined();
    expect(parseRunSubscription(undefined)).toBeUndefined();
    expect(parseRunSubscription('abc')).toBeUndefined();
    expect(parseRunSubscription(42)).toBeUndefined();
  });

  it('对象缺少 runId 返回 undefined', () => {
    expect(parseRunSubscription({})).toBeUndefined();
    expect(parseRunSubscription({ type: 'other' })).toBeUndefined();
  });

  it('runId 为非字符串返回 undefined', () => {
    expect(parseRunSubscription({ runId: 123 })).toBeUndefined();
    expect(parseRunSubscription({ runId: null })).toBeUndefined();
    expect(parseRunSubscription({ runId: true })).toBeUndefined();
  });
});

describe('isFloatingPanelUrlMessage', () => {
  it('合法的 FLOATING_PANEL_URL 消息返回 true', () => {
    expect(
      isFloatingPanelUrlMessage({
        type: SIDE_PANEL_MESSAGES.FLOATING_PANEL_URL
      })
    ).toBe(true);
  });

  it('类型不匹配返回 false', () => {
    expect(
      isFloatingPanelUrlMessage({
        type: SIDE_PANEL_MESSAGES.FLOATING_PANEL_TOGGLE
      })
    ).toBe(false);
    expect(isFloatingPanelUrlMessage({ type: RUNTIME_MESSAGES.START_RUN })).toBe(false);
  });

  it('非对象返回 false', () => {
    expect(isFloatingPanelUrlMessage(null)).toBe(false);
    expect(isFloatingPanelUrlMessage(undefined)).toBe(false);
    expect(isFloatingPanelUrlMessage('string')).toBe(false);
  });

  it('缺少 type 返回 false', () => {
    expect(isFloatingPanelUrlMessage({})).toBe(false);
  });
});

describe('isFloatingPanelToggleMessage', () => {
  it('合法的 FLOATING_PANEL_TOGGLE 消息返回 true', () => {
    expect(
      isFloatingPanelToggleMessage({
        type: SIDE_PANEL_MESSAGES.FLOATING_PANEL_TOGGLE
      })
    ).toBe(true);
  });

  it('类型不匹配返回 false', () => {
    expect(
      isFloatingPanelToggleMessage({
        type: SIDE_PANEL_MESSAGES.FLOATING_PANEL_URL
      })
    ).toBe(false);
  });

  it('非对象返回 false', () => {
    expect(isFloatingPanelToggleMessage(null)).toBe(false);
    expect(isFloatingPanelToggleMessage(123)).toBe(false);
  });
});

describe('isFloatingPanelOpenNativeMessage', () => {
  it('合法的 FLOATING_PANEL_OPEN_NATIVE 消息返回 true', () => {
    expect(
      isFloatingPanelOpenNativeMessage({
        type: SIDE_PANEL_MESSAGES.FLOATING_PANEL_OPEN_NATIVE
      })
    ).toBe(true);
  });

  it('其他 side panel 消息返回 false', () => {
    expect(
      isFloatingPanelOpenNativeMessage({
        type: SIDE_PANEL_MESSAGES.FLOATING_PANEL_URL
      })
    ).toBe(false);
  });

  it('非对象返回 false', () => {
    expect(isFloatingPanelOpenNativeMessage(null)).toBe(false);
    expect(isFloatingPanelOpenNativeMessage('x')).toBe(false);
  });
});

describe('isRuntimeMessageName', () => {
  it('所有 RUNTIME_MESSAGES 值都通过类型守卫', () => {
    for (const name of Object.values(RUNTIME_MESSAGES)) {
      expect(isRuntimeMessageName(name), `应为合法消息: ${name}`).toBe(true);
    }
  });

  it('SIDE_PANEL_MESSAGES 值不通过类型守卫', () => {
    for (const name of Object.values(SIDE_PANEL_MESSAGES)) {
      expect(isRuntimeMessageName(name), `不应为合法运行时消息: ${name}`).toBe(false);
    }
  });

  it('非字符串返回 false', () => {
    expect(isRuntimeMessageName(null)).toBe(false);
    expect(isRuntimeMessageName(undefined)).toBe(false);
    expect(isRuntimeMessageName(42)).toBe(false);
    expect(isRuntimeMessageName(true)).toBe(false);
    expect(isRuntimeMessageName({})).toBe(false);
  });

  it('未知字符串返回 false', () => {
    expect(isRuntimeMessageName('invalid-message')).toBe(false);
    expect(isRuntimeMessageName('')).toBe(false);
  });
});
