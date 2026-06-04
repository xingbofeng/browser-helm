import { ERROR_CODES } from '../../shared/constants/error-codes';
import type {
  ActionIntent,
  ActionReadiness
} from '../../shared/schemas/action-readiness.schema';
import type { ResolvedRefElement } from '../a11y/ref-resolver';
import { resolveRef } from '../a11y/ref-resolver';
import type { RefMap } from '../a11y/ref-map';

const HIGH_RISK_ACTION_TEXT_PATTERN = new RegExp([
  'delete',
  'remove',
  'destroy',
  'payment',
  'pay',
  'purchase',
  'transfer',
  'subscribe',
  'send',
  'submit',
  'upload',
  'clipboard',
  'execute_js',
  'password',
  'token',
  'secret',
  'otp',
  'api key',
  'authorize',
  'approve',
  'confirm',
  'consent',
  'accept\\s+(terms|agreement|policy)',
  '删除',
  '移除',
  '支付',
  '付款',
  '购买',
  '转账',
  '订阅',
  '发送',
  '提交',
  '上传',
  '剪贴板',
  '密码',
  '令牌',
  '密钥',
  '验证码',
  '授权',
  '批准',
  '确认',
  '同意'
].join('|'), 'iu');

export function checkActionReadiness(
  refMap: RefMap,
  intent: ActionIntent
): ActionReadiness {
  const resolved = resolveRef(refMap, intent.refId);
  if (!resolved.ok) {
    return {
      canAct: false,
      code: resolved.code,
      reason: resolved.message,
      risk: defaultRiskForAction(intent.kind),
      staleRefs: resolved.code === ERROR_CODES.REF_STALE,
      changedPage: false,
      requiresObserve: true,
      wouldRequireApproval: false,
      nextHints: ['Run bh_page_observe again']
    };
  }

  return checkResolvedActionReadiness(intent, resolved.element);
}

export function checkResolvedActionReadiness(
  intent: ActionIntent,
  target: ResolvedRefElement
): ActionReadiness {
  if (!target.visible) {
    return blockedReadiness(
      intent,
      ERROR_CODES.ELEMENT_NOT_ACTIONABLE,
      'Target is not visible',
      target
    );
  }
  if (target.disabled) {
    return blockedReadiness(intent, ERROR_CODES.ELEMENT_DISABLED, 'Target is disabled', target);
  }
  if (intent.kind === 'type' && !isTypeTarget(target)) {
    return blockedReadiness(
      intent,
      ERROR_CODES.ACTION_TARGET_MISMATCH,
      'Type action requires a text-like target',
      target
    );
  }

  const risk = riskForAction(intent, target);
  const wouldRequireApproval = risk === 'high';
  return {
    canAct: true,
    code: ERROR_CODES.OK,
    reason: wouldRequireApproval
      ? 'Action target is ready but requires approval'
      : 'Action target is ready',
    risk,
    staleRefs: false,
    changedPage: false,
    requiresObserve: false,
    wouldRequireApproval,
    target,
    ...(wouldRequireApproval
      ? { nextHints: ['Request approval before executing this action'] }
      : {})
  };
}

function blockedReadiness(
  intent: ActionIntent,
  code: string,
  reason: string,
  target: ActionReadiness['target']
): ActionReadiness {
  return {
    canAct: false,
    code,
    reason,
    risk: defaultRiskForAction(intent.kind),
    staleRefs: false,
    changedPage: false,
    requiresObserve: false,
    wouldRequireApproval: false,
    target
  };
}

function defaultRiskForAction(kind: ActionIntent['kind']): ActionReadiness['risk'] {
  if (kind === 'focus') {
    return 'low';
  }
  if (kind === 'submit') {
    return 'high';
  }
  return 'medium';
}

function riskForAction(
  intent: ActionIntent,
  target: NonNullable<ActionReadiness['target']>
): ActionReadiness['risk'] {
  if (intent.kind === 'submit') {
    return 'high';
  }
  if (target.isSensitive) {
    return 'high';
  }
  const text = [
    target.name,
    target.role,
    target.tagName,
    target.inputType,
    target.autocomplete,
    intent.valuePreview?.reason
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (HIGH_RISK_ACTION_TEXT_PATTERN.test(text)) {
    return 'high';
  }
  return defaultRiskForAction(intent.kind);
}

function isTypeTarget(target: NonNullable<ActionReadiness['target']>): boolean {
  const tagName = target.tagName?.toLowerCase();
  return (
    tagName === 'input' ||
    tagName === 'textarea' ||
    target.role === 'textbox' ||
    target.role === 'combobox'
  );
}
