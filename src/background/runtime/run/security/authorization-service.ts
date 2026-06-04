import type {
  RuntimeToolPolicyLike,
  ToolAuthorizationContext,
  ToolAuthorizationDecision
} from './action-context';
import { ERROR_CODES } from '../../../../shared/constants/error-codes';
import { evaluateBrowserHelmDomainOperationPolicy } from '../../../../shared/domain-policy';

export class AuthorizationService {
  constructor(private readonly toolPolicy: RuntimeToolPolicyLike) {}

  authorize(context: ToolAuthorizationContext): ToolAuthorizationDecision {
    const capabilityBlock = capabilityUnavailable(context);
    if (capabilityBlock) {
      return capabilityBlock;
    }

    const domainBlock = domainConsentRequired(context);
    if (domainBlock) {
      return domainBlock;
    }

    if (
      context.userIntent?.required === true &&
      context.userIntent.grounded !== true
    ) {
      return {
        allow: false,
        requiresApproval: false,
        code: ERROR_CODES.USER_INTENT_MISMATCH,
        reason: context.userIntent.reason,
        risk: context.risk
      };
    }

    if (isCrossOriginIframeMutation(context)) {
      if (context.userIntent?.grounded !== true) {
        return {
          allow: false,
          requiresApproval: false,
          code: ERROR_CODES.USER_INTENT_MISMATCH,
          reason: 'Cross-origin iframe mutation requires explicit user intent',
          risk: context.risk
        };
      }
      return {
        allow: false,
        requiresApproval: true,
        reason: 'Cross-origin iframe mutation requires approval before execution',
        risk: context.risk,
        actionPreview: buildActionPreview(context)
      };
    }

    if (
      context.changedPageExpected === true &&
      context.firstMutationRequiresApproval === true
    ) {
      return {
        allow: false,
        requiresApproval: true,
        reason: 'First page-mutating action requires approval before execution',
        risk: context.risk,
        actionPreview: buildActionPreview(context)
      };
    }

    if (
      context.requiresApproval &&
      context.bypassPolicyApproval !== true &&
      context.approvalResume !== true &&
      !isUserTriggeredNonMutatingExecution(context)
    ) {
      return {
        allow: false,
        requiresApproval: true,
        reason: 'Tool metadata requires approval before execution',
        risk: context.risk,
        actionPreview: buildActionPreview(context)
      };
    }

    if (context.bypassPolicyApproval === true) {
      return {
        allow: true,
        requiresApproval: false,
        reason: 'Tool owns its approval flow',
        risk: context.risk
      };
    }

    const policy = this.toolPolicy.evaluate(context.risk, context.runMode);
    if (!policy.allow && policy.requiresApproval) {
      return {
        allow: false,
        requiresApproval: true,
        reason: policy.reason,
        risk: context.risk,
        actionPreview: buildActionPreview(context)
      };
    }

    return {
      allow: true,
      requiresApproval: false,
      reason: policy.reason,
      risk: context.risk
    };
  }
}

function isUserTriggeredNonMutatingExecution(context: ToolAuthorizationContext): boolean {
  return context.source === 'user' && context.changedPageExpected !== true;
}

export function buildActionPreview(context: Pick<
  ToolAuthorizationContext,
  'title' | 'tool' | 'argsPreview' | 'targetSummary'
>): string {
  const details = actionPreviewDetails(context.argsPreview);
  const target = context.targetSummary?.trim();
  return [
    `${context.title} (${context.tool})`,
    target ? `target=${target}` : undefined,
    ...details
  ].filter(Boolean).join(' ');
}

function actionPreviewDetails(argsPreview: unknown): string[] {
  if (!argsPreview || typeof argsPreview !== 'object' || Array.isArray(argsPreview)) {
    return [];
  }
  const record = argsPreview as Record<string, unknown>;
  const frameId = typeof record.frameId === 'number' || typeof record.frameId === 'string'
    ? String(record.frameId)
    : frameIdFromRef(record.refId);
  const refId = typeof record.refId === 'string' ? record.refId : undefined;
  const origin = typeof record.origin === 'string'
    ? record.origin
    : typeof record.targetOrigin === 'string'
      ? record.targetOrigin
      : undefined;
  const pageOrigin = typeof record.pageOrigin === 'string' ? record.pageOrigin : undefined;
  const crossOrigin = record.crossOrigin === true ||
    Boolean(origin && pageOrigin && origin !== pageOrigin);
  return [
    frameId ? `frame=${frameId}` : undefined,
    refId ? `ref=${refId}` : undefined,
    origin ? `origin=${origin}` : undefined,
    pageOrigin ? `pageOrigin=${pageOrigin}` : undefined,
    crossOrigin ? 'crossOrigin=true' : undefined
  ].filter((value): value is string => Boolean(value));
}

function frameIdFromRef(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const match = /^frame_(\d+):/u.exec(value);
  return match?.[1];
}

function isCrossOriginIframeMutation(context: ToolAuthorizationContext): boolean {
  if (context.changedPageExpected !== true) {
    return false;
  }
  const argsPreview = context.argsPreview;
  if (!argsPreview || typeof argsPreview !== 'object' || Array.isArray(argsPreview)) {
    return false;
  }
  const record = argsPreview as Record<string, unknown>;
  if (record.crossOrigin === true) {
    return true;
  }
  const origin = typeof record.origin === 'string'
    ? record.origin
    : typeof record.targetOrigin === 'string'
      ? record.targetOrigin
      : undefined;
  const pageOrigin = typeof record.pageOrigin === 'string' ? record.pageOrigin : undefined;
  return Boolean(origin && pageOrigin && origin !== pageOrigin);
}

function domainConsentRequired(
  context: ToolAuthorizationContext
): ToolAuthorizationDecision | undefined {
  if (!context.domainOperation) {
    return undefined;
  }
  const decision = evaluateBrowserHelmDomainOperationPolicy(
    context.pageDomain,
    context.domainPolicy,
    context.domainOperation
  );
  if (decision.allowed) {
    return undefined;
  }
  const domain = context.pageDomain ?? 'unknown';
  return {
    allow: false,
    requiresApproval: false,
    code: ERROR_CODES.DOMAIN_CONSENT_REQUIRED,
    reason: `Domain ${domain} requires explicit consent before running ${context.tool}`,
    risk: context.risk
  };
}

function capabilityUnavailable(
  context: ToolAuthorizationContext
): ToolAuthorizationDecision | undefined {
  if (!context.requiredCapability) {
    return undefined;
  }
  const capabilities = context.capabilities;
  const unavailable = !capabilities || !hasCapability(capabilities, context.requiredCapability);
  if (!unavailable) {
    return undefined;
  }
  return {
    allow: false,
    requiresApproval: false,
    code: ERROR_CODES.CAPABILITY_UNAVAILABLE,
    reason: `${capabilityLabel(context.requiredCapability)} is unavailable for ${context.tool}`,
    risk: context.risk
  };
}

function hasCapability(
  capabilities: NonNullable<ToolAuthorizationContext['capabilities']>,
  requirement: NonNullable<ToolAuthorizationContext['requiredCapability']>
): boolean {
  switch (requirement) {
    case 'activeTab':
      return capabilities.hasActiveTab;
    case 'debugger':
      return capabilities.hasDebuggerPermission;
    case 'clipboard':
      return capabilities.hasClipboardPermission;
    case 'downloads':
      return capabilities.hasDownloadsPermission;
    case 'storageInspection':
      return capabilities.hasStorageInspection === true;
    case 'shallowDebug':
      return capabilities.shallowDebugAvailable;
  }
}

function capabilityLabel(
  requirement: NonNullable<ToolAuthorizationContext['requiredCapability']>
): string {
  switch (requirement) {
    case 'activeTab':
      return 'Active tab';
    case 'debugger':
      return 'Debugger permission';
    case 'clipboard':
      return 'Clipboard permission';
    case 'downloads':
      return 'Downloads permission';
    case 'storageInspection':
      return 'Storage inspection capability';
    case 'shallowDebug':
      return 'Shallow debug capability';
  }
}
