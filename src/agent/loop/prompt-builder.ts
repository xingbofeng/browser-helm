import type { ModelMessage } from '../../shared/schemas/model-message.schema';
import type { RunMode } from '../../shared/schemas/tool.schema';
import type { RunSnapshot } from '../../runtime/runtime-messages';
import type { RunRecord } from './types';
import type { ToolPromptContract } from '../../tools/core/tool-router';
import { redactTextForModelContext } from '../../shared/redaction';
import { TOOL_NAMES } from '../../shared/constants/tool-names';
import { isFormFillTool } from './form-fill-augmenter';
import { buildRecentToolActions } from './recent-tool-actions';
import { compactTaskState, createInitialTaskState } from './runtime-task-state';
import type { Locale } from '../../i18n/types';
import { buildMemoryPromptContext } from '../memory/memory-summary-builder';
import {
  evaluateBrowserHelmDomainOperationPolicy,
  type BrowserHelmDomainPolicy
} from '../../shared/domain-policy';
import { defaultMemoryRepo } from '../../storage/memory-repo';
import { defaultScratchpadRepo } from '../../storage/scratchpad-repo';
import { defaultWorkflowRepo } from '../../storage/workflow-repo';
import { buildSessionSummary } from '../memory/session-summary-builder';
import { defaultDomainAdapterRegistry } from '../../adapters/registry';
import { SystemPolicyBuilder } from './prompt/system-policy-builder';
import { DynamicContextBuilder } from './prompt/dynamic-context-builder';

// ── Context budget limits ──
const MAX_OBSERVATION_CHARS = 8000;
const MAX_OBSERVATION_CHARS_WITH_PAGE_READ = 1200;
const MAX_STRUCTURED_DATA_ITEMS = 50;
const MAX_TOOL_RESULT_CHARS = 4000;
const MAX_PAGE_READ_TEXT_CHARS = 12_000;
const MAX_PAGE_READ_HEADINGS = 20;
const MAX_PAGE_READ_LINKS = 20;
const MAX_VISION_LIST_ITEMS = 8;
const MAX_VISION_GROUNDING_ITEMS = 6;
const MAX_VISION_EVIDENCE_ITEMS = 4;
const MAX_CONVERSATION_HISTORY_CHARS = 3000;
const MAX_HISTORY_LINE_CHARS = 1200;
const MAX_PREVIOUS_TRACE_HISTORY_EVENTS = 12;
const MAX_TRACE_HISTORY_SUMMARY_CHARS = 80;

// ── Types ──

export type BuildMessagesInput = {
  record: RunRecord;
  snapshot: RunSnapshot;
  toolsContracts: ToolPromptContract[];
  locale: Locale;
  domainPolicy?: BrowserHelmDomainPolicy | undefined;
  requireProviderContextConsent?: boolean | undefined;
};

// ── Internal tool contracts ──

const TERMINAL_INTERNAL_TOOL_NAMES = new Set<string>([
  TOOL_NAMES.AGENT_ASK_USER,
  TOOL_NAMES.AGENT_FAIL,
  TOOL_NAMES.AGENT_FINISH
]);

const REQUEST_ACT_MODE_CONTRACT: ToolPromptContract = {
  name: TOOL_NAMES.REQUEST_ACT_MODE,
  title: '请求切换到执行模式',
  description: 'Ask mode only. Use when the user request would change page content, click, type, fill, submit, send, delete, upload, or otherwise requires Act mode. This does not execute the action; it asks the user to switch modes.',
  modes: ['ask'],
  risk: 'safe',
  argsSchema: {
    type: 'object',
    properties: {
      reason: { type: 'string' }
    },
    additionalProperties: false
  },
  readOnly: true,
  requiresApproval: false,
  contextVisibility: 'summary'
};

// ── Main build function ──

export function buildMessages(input: BuildMessagesInput): ModelMessage[] {
  const { record, snapshot, toolsContracts, locale } = input;
  const redactedTask = redactTextForModelContext(record.task);
  const providerContextPolicy = buildProviderContextPolicy(input);
  const pageContextAllowed = providerContextPolicy?.allowed !== false;
  const providerSnapshot = pageContextAllowed ? snapshot : withholdProviderPageContext(snapshot);
  const providerTrace = pageContextAllowed ? record.trace : [];

  // ── Stable prefix: system policy + tool manifest ──
  const systemMessage = new SystemPolicyBuilder().build({
    mode: record.mode,
    toolsContracts,
    locale
  });

  // ── Dynamic suffix: user task, page context, history, trace ──
  const lastToolResult = pageContextAllowed && snapshot.toolResult ? compactToolResult(snapshot.toolResult) : undefined;
  const visionEvidence = pageContextAllowed && snapshot.toolResult ? compactVisionEvidence(snapshot.toolResult) : undefined;
  const priorityPageReadText = pageContextAllowed && snapshot.toolResult ? pageReadTextFromToolResult(snapshot.toolResult) : undefined;
  const hasPageReadText = Boolean(priorityPageReadText);
  const observation = compactObservation(
    providerSnapshot.observation,
    hasPageReadText ? MAX_OBSERVATION_CHARS_WITH_PAGE_READ : MAX_OBSERVATION_CHARS
  );
  const structuredPageData = hasPageReadText
    ? compactStructuredPageDataSummary(providerSnapshot.structuredPageData)
    : compactStructuredPageData(providerSnapshot.structuredPageData);
  const decisionGuidance = pageContextAllowed ? buildDecisionGuidance(snapshot.toolResult) : undefined;
  const recentActions = buildRecentToolActions(providerTrace);
  const loopGuard = buildLoopGuard(recentActions);
  const taskState = compactTaskState(record.taskState ?? createInitialTaskState(redactedTask));
  const sessionSummary = buildSessionSummary({
    sessionId: snapshot.runId,
    taskGoal: redactedTask,
    trace: providerTrace,
    snapshot: providerSnapshot
  });
  const memoryContext = pageContextAllowed
    ? buildMemoryPromptContext({
        domain: readObservationDomain(snapshot),
        task: redactedTask,
        runId: snapshot.runId,
        domainPolicy: input.domainPolicy,
        memoryRepo: defaultMemoryRepo,
        workflowRepo: defaultWorkflowRepo,
        scratchpadRepo: defaultScratchpadRepo
      })
    : undefined;
  const domainAdapter = pageContextAllowed ? buildDomainAdapterContext(snapshot) : undefined;

  // Dynamic user content: all untrusted / page-derived data
  const userContent = {
    task: redactedTask,
    locale,
    taskState,
    ...(providerContextPolicy ? { providerContextPolicy } : {}),
    ...(lastToolResult ? { lastToolResult } : {}),
    ...(visionEvidence ? { visionEvidence } : {}),
    ...(priorityPageReadText ? { priorityPageReadText: redactTextForModelContext(priorityPageReadText) } : {}),
    ...(loopGuard ? { loopGuard } : {}),
    ...(recentActions.length ? { recentActions } : {}),
    ...(memoryContext ? { memoryContext } : {}),
    ...(domainAdapter ? { domainAdapter } : {}),
    sessionSummary,
    observation,
    structuredPageData
  };

  const historyMessages = buildConversationHistoryMessages(record, MAX_CONVERSATION_HISTORY_CHARS);

  const baseMessages = [systemMessage, ...historyMessages];
  const userMessage = new DynamicContextBuilder().buildUserMessage({
    baseMessages,
    userContent,
    decisionGuidance
  });

  const messages: ModelMessage[] = [
    ...baseMessages,
    userMessage
  ];

  return messages;
}

function buildProviderContextPolicy(input: BuildMessagesInput): {
  operation: 'provider_context';
  allowed: boolean;
  restricted: boolean;
  hostname?: string | undefined;
  reason?: string | undefined;
  withheld?: string[] | undefined;
} | undefined {
  if (input.requireProviderContextConsent !== true || !input.snapshot.observation) {
    return undefined;
  }
  const decision = evaluateBrowserHelmDomainOperationPolicy(
    input.snapshot.observation.url || input.snapshot.observation.origin || input.snapshot.observation.currentDomain,
    input.domainPolicy,
    'provider_context'
  );
  return {
    operation: 'provider_context',
    allowed: decision.allowed,
    restricted: decision.restricted,
    ...(decision.hostname ? { hostname: decision.hostname } : {}),
    ...(decision.reason ? { reason: decision.reason } : {}),
    ...(!decision.allowed
      ? {
          withheld: [
            'observation',
            'structuredPageData',
            'pageReadText',
            'visionEvidence',
            'recentPageToolActions',
            'domainAdapter',
            'memoryContext'
          ]
        }
      : {})
  };
}

function withholdProviderPageContext(snapshot: RunSnapshot): RunSnapshot {
  const providerSnapshot: RunSnapshot = { ...snapshot, refs: [] };
  delete providerSnapshot.observation;
  delete providerSnapshot.structuredPageData;
  delete providerSnapshot.toolResult;
  return providerSnapshot;
}

// ── Conversation history ──

function buildConversationHistoryMessages(record: RunRecord, maxChars: number): ModelMessage[] {
  const history = record.conversationHistory ?? [];
  const lines = history
    .filter((message) => message.content.trim())
    .map((message, index) => {
      const speaker = message.role === 'agent'
        ? 'BrowserHelm'
        : message.role === 'system'
          ? 'System'
          : 'User';
      const title = message.title ? ` (${redactTextForModelContext(message.title)})` : '';
      const content = truncateStr(
        redactTextForModelContext(historyContentForPrompt(message)),
        MAX_HISTORY_LINE_CHARS
      ) ?? '';
      return `[${index + 1}] ${speaker}${title}: ${content}`;
    });
  if (!lines.length) {
    return [];
  }
  const selected: string[] = [];
  let usedChars = 0;
  let omittedCount = 0;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (!line) {
      continue;
    }
    if (usedChars + line.length > maxChars && selected.length > 0) {
      omittedCount = index + 1;
      break;
    }
    selected.unshift(line);
    usedChars += line.length;
  }
  if (omittedCount > 0) {
    selected.unshift(`[history compacted] ${omittedCount} older entries omitted to keep the provider prompt responsive.`);
  }
  return [{
    role: 'user',
    content: [
      'Conversation history before current request:',
      ...selected
    ].join('\n')
  }];
}

function historyContentForPrompt(message: NonNullable<RunRecord['conversationHistory']>[number]): string {
  if (message.role === 'system' && message.title === 'Previous run trace') {
    return summarizePreviousRunTrace(message.content);
  }
  return message.content;
}

function summarizePreviousRunTrace(content: string): string {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (!Array.isArray(parsed)) {
      return truncateStr(content, MAX_HISTORY_LINE_CHARS) ?? '';
    }
    const recentEvents = parsed.slice(-MAX_PREVIOUS_TRACE_HISTORY_EVENTS);
    return [
      `Previous run trace compacted from ${parsed.length} events; showing latest ${recentEvents.length}.`,
      ...recentEvents.map(summarizeTraceHistoryEvent)
    ].join('\n');
  } catch {
    return truncateStr(content, MAX_HISTORY_LINE_CHARS) ?? '';
  }
}

function summarizeTraceHistoryEvent(value: unknown): string {
  if (!value || typeof value !== 'object') {
    return truncateStr(String(value), MAX_TRACE_HISTORY_SUMMARY_CHARS) ?? '';
  }
  const record = value as Record<string, unknown>;
  const payload = record.payload && typeof record.payload === 'object'
    ? record.payload as Record<string, unknown>
    : {};
  const details = [
    stringField(record, 'type'),
    stringField(payload, 'tool'),
    stringField(payload, 'code'),
    stringField(payload, 'summary'),
    stringField(payload, 'message')
  ].filter(Boolean).join(' ');
  return truncateStr(details || JSON.stringify(record), MAX_TRACE_HISTORY_SUMMARY_CHARS) ?? '';
}

// ── Tool contract filtering ──

export function getPromptToolContracts(
  toolsContracts: ToolPromptContract[],
  runMode: RunMode
): ToolPromptContract[] {
  const modelVisibleTools = toolsContracts.filter((tool) =>
    !TERMINAL_INTERNAL_TOOL_NAMES.has(tool.name)
  );
  if (runMode !== 'ask' || toolsContracts.some((tool) => tool.name === TOOL_NAMES.REQUEST_ACT_MODE)) {
    return modelVisibleTools;
  }
  return [
    ...modelVisibleTools,
    REQUEST_ACT_MODE_CONTRACT
  ];
}

// ── Compaction helpers ──

function compactObservation(obs: RunSnapshot['observation'], maxChars: number): unknown {
  if (!obs) return undefined;
  const { url, title, currentDomain, origin, visibleTextSummary, pageStateSummary, interactiveCount, warnings } = obs;
  return {
    url: redactTextForModelContext(url),
    title,
    currentDomain,
    origin,
    visibleTextSummary: truncateStr(visibleTextSummary, maxChars),
    pageStateSummary,
    interactiveCount,
    warnings
  };
}

function readObservationDomain(snapshot: RunSnapshot): string | undefined {
  return snapshot.observation?.currentDomain ?? snapshot.observation?.origin;
}

function buildDomainAdapterContext(snapshot: RunSnapshot): unknown {
  const url = snapshot.observation?.url;
  if (!url) {
    return undefined;
  }
  const detection = defaultDomainAdapterRegistry.detect(url);
  if (!detection.enabled) {
    return {
      enabled: false,
      fallback: detection.fallback,
      reason: detection.reason
    };
  }
  return {
    enabled: true,
    id: detection.adapter.id,
    label: detection.adapter.label,
    guidance: detection.adapter.guidance,
    workflows: detection.adapter.workflows.map((workflow) => ({
      id: workflow.id,
      title: workflow.title,
      intent: workflow.intent,
      risk: workflow.risk,
      requiresApproval: workflow.requiresApproval,
      steps: workflow.steps
    })),
    locators: detection.adapter.locators.map((locator) => ({
      id: locator.id,
      label: locator.label,
      risk: locator.risk,
      fallbackText: locator.fallbackText
    }))
  };
}

function compactStructuredPageData(data: RunSnapshot['structuredPageData']): unknown {
  if (!data) return undefined;
  return redactEmbeddedUrls({
    ...data,
    refs: Array.isArray(data.refs) ? data.refs.slice(0, MAX_STRUCTURED_DATA_ITEMS) : data.refs,
    interactive: data.interactive ? {
      ...data.interactive,
      items: Array.isArray(data.interactive.items)
        ? data.interactive.items.slice(0, MAX_STRUCTURED_DATA_ITEMS)
        : data.interactive.items,
      ...(Array.isArray(data.interactive.items) && data.interactive.items.length > MAX_STRUCTURED_DATA_ITEMS
        ? { omittedCount: data.interactive.items.length - MAX_STRUCTURED_DATA_ITEMS }
        : {})
    } : data.interactive,
    forms: data.forms ? {
      ...data.forms,
      items: Array.isArray(data.forms.items) ? data.forms.items.slice(0, MAX_STRUCTURED_DATA_ITEMS) : data.forms.items
    } : data.forms
  });
}

function compactStructuredPageDataSummary(data: RunSnapshot['structuredPageData']): unknown {
  if (!data) return undefined;
  return redactEmbeddedUrls({
    observation: {
      summary: data.observation.summary,
      count: data.observation.count
    },
    refs: {
      summary: data.refs.summary,
      count: data.refs.count
    },
    interactive: data.interactive ? { summary: data.interactive.summary } : undefined,
    forms: data.forms ? { summary: data.forms.summary } : undefined
  });
}

function compactToolResult(result: NonNullable<RunSnapshot['toolResult']>): unknown {
  if (!result) return undefined;
  return {
    tool: result.tool,
    ok: result.ok,
    code: result.code,
    summary: truncateStr(result.summary, MAX_TOOL_RESULT_CHARS),
    changedPage: result.changedPage,
    requiresObserve: result.requiresObserve,
    requiresApproval: result.requiresApproval,
    ...compactToolResultDetails(result)
    // detail is deliberately omitted to prevent context blow-up
  };
}

function compactVisionEvidence(result: NonNullable<RunSnapshot['toolResult']>): unknown {
  if (!isVisionTool(result.tool)) {
    return undefined;
  }
  const data = toolResultData(result);
  const observation = isRecord(data?.observation) ? data.observation : undefined;
  if (!observation) {
    return undefined;
  }
  const summary = stringField(observation, 'summary');
  if (!summary) {
    return undefined;
  }
  const screenshot = compactVisionScreenshot(data?.screenshot);
  const grounding = Array.isArray(observation.grounding)
    ? observation.grounding
        .map(compactVisionGrounding)
        .filter(Boolean)
        .slice(0, MAX_VISION_GROUNDING_ITEMS)
    : undefined;
  return {
    tool: result.tool,
    summary: truncateStr(redactTextForModelContext(summary), MAX_TOOL_RESULT_CHARS),
    fallback: stringField(observation, 'fallback'),
    fallbackReason: stringField(observation, 'fallbackReason'),
    confidence: numberField(observation, 'confidence'),
    visibleText: compactStringArray(observation.visibleText, MAX_VISION_LIST_ITEMS),
    blockers: compactStringArray(observation.blockers, MAX_VISION_LIST_ITEMS),
    layoutIssues: compactStringArray(observation.layoutIssues, MAX_VISION_LIST_ITEMS),
    ...(screenshot ? { screenshot } : {}),
    ...(grounding?.length ? { grounding } : {}),
    ...(isRecord(observation.pointerFallback) ? {
      pointerFallback: {
        allowed: observation.pointerFallback.allowed === true,
        targetConfidence: stringField(observation.pointerFallback, 'targetConfidence'),
        domRefUnavailable: observation.pointerFallback.domRefUnavailable === true,
        reason: stringField(observation.pointerFallback, 'reason')
      }
    } : {})
  };
}

function compactVisionScreenshot(value: unknown): unknown {
  if (!isRecord(value)) {
    return undefined;
  }
  return {
    mode: stringField(value, 'mode'),
    mimeType: stringField(value, 'mimeType'),
    width: numberField(value, 'width'),
    height: numberField(value, 'height'),
    captureSource: stringField(value, 'captureSource'),
    fallbackReason: stringField(value, 'fallbackReason'),
    truncated: value.truncated === true,
    sensitivity: stringField(value, 'sensitivity')
  };
}

function compactVisionGrounding(value: unknown): unknown {
  if (!isRecord(value)) {
    return undefined;
  }
  const claim = stringField(value, 'claim');
  if (!claim) {
    return undefined;
  }
  const evidence = Array.isArray(value.evidence)
    ? value.evidence
        .map(compactVisionGroundingEvidence)
        .filter(Boolean)
        .slice(0, MAX_VISION_EVIDENCE_ITEMS)
    : [];
  return {
    claim: truncateStr(redactTextForModelContext(claim), MAX_TOOL_RESULT_CHARS),
    source: stringField(value, 'source'),
    confidence: stringField(value, 'confidence'),
    evidence,
    reason: stringField(value, 'reason')
  };
}

function compactVisionGroundingEvidence(value: unknown): unknown {
  if (!isRecord(value)) {
    return undefined;
  }
  return {
    kind: stringField(value, 'kind'),
    text: stringField(value, 'text'),
    refId: stringField(value, 'refId'),
    label: stringField(value, 'label')
  };
}

function compactStringArray(value: unknown, maxItems: number): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items = value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => truncateStr(redactTextForModelContext(item), MAX_TOOL_RESULT_CHARS) ?? '')
    .filter(Boolean)
    .slice(0, maxItems);
  return items.length ? items : undefined;
}

function compactToolResultDetails(result: NonNullable<RunSnapshot['toolResult']>): Record<string, unknown> {
  if (result.tool === TOOL_NAMES.ACTION_CHECK_READINESS) {
    return compactActionReadinessToolResultDetails(result);
  }
  if (isPageContentReadTool(result.tool)) {
    return compactPageReadToolResultDetails(result);
  }
  if (!isFormFillTool(result.tool) && result.tool !== TOOL_NAMES.FORM_VERIFY) {
    return {};
  }
  const data = isRecord(result.detail) && isRecord(result.detail.data)
    ? result.detail.data
    : undefined;
  const fields = Array.isArray(data?.fields)
    ? data.fields
    : Array.isArray(data?.fieldResults)
      ? data.fieldResults
      : undefined;
  if (!fields) {
    return {};
  }
  const compactFields = fields
    .map((field) => isRecord(field) ? {
      fieldRefId: stringField(field, 'fieldRefId'),
      label: stringField(field, 'label'),
      name: stringField(field, 'name'),
      status: stringField(field, 'status'),
      valid: typeof field.valid === 'boolean' ? field.valid : undefined,
      filled: typeof field.filled === 'boolean' ? field.filled : undefined,
      maskedActualValue: stringField(field, 'maskedActualValue')
    } : undefined)
    .filter(Boolean)
    .slice(0, 12);
  return compactFields.length ? { fields: compactFields } : {};
}

function compactActionReadinessToolResultDetails(result: NonNullable<RunSnapshot['toolResult']>): Record<string, unknown> {
  const data = toolResultData(result);
  if (!data) {
    return {};
  }
  const target = isRecord(data.target)
    ? {
        refId: stringField(data.target, 'refId'),
        role: stringField(data.target, 'role'),
        name: stringField(data.target, 'name'),
        tagName: stringField(data.target, 'tagName')
      }
    : undefined;
  return {
    actionReadiness: {
      canAct: data.canAct === true,
      code: stringField(data, 'code'),
      reason: stringField(data, 'reason'),
      risk: stringField(data, 'risk'),
      wouldRequireApproval: data.wouldRequireApproval === true,
      requiresObserve: data.requiresObserve === true,
      ...(target?.refId ? { target } : {})
    }
  };
}

function compactPageReadToolResultDetails(result: NonNullable<RunSnapshot['toolResult']>): Record<string, unknown> {
  const data = toolResultData(result);
  const text = pageReadTextFromToolResult(result);
  if (!data || !text) {
    return {};
  }
  const headings = Array.isArray(data.headings)
    ? data.headings
        .map(compactHeading)
        .filter((heading): heading is { level: number; text: string } => Boolean(heading))
        .slice(0, MAX_PAGE_READ_HEADINGS)
    : undefined;
  const links = Array.isArray(data.links)
    ? data.links
        .map(compactLink)
        .filter((link): link is { text?: string; href?: string } => Boolean(link))
        .slice(0, MAX_PAGE_READ_LINKS)
    : undefined;
  return {
    pageRead: {
      text: truncateStr(redactTextForModelContext(text), MAX_PAGE_READ_TEXT_CHARS),
      cursor: numberField(data, 'cursor'),
      nextCursor: numberField(data, 'nextCursor'),
      hasMore: data.hasMore === true,
      totalTextLength: numberField(data, 'totalTextLength'),
      warnings: Array.isArray(data.warnings)
        ? data.warnings.filter((value): value is string => typeof value === 'string')
        : [],
      contentSource: stringField(data, 'contentSource'),
      ...(headings?.length ? { headings } : {}),
      ...(links?.length ? { links } : {})
    }
  };
}

function buildDecisionGuidance(
  result: RunSnapshot['toolResult']
): string | undefined {
  if (!result?.ok) {
    return undefined;
  }
  if (result.tool === TOOL_NAMES.FORM_FILL_MANY || result.tool === TOOL_NAMES.FORM_FILL_FIELD) {
    return [
      'The last form fill succeeded.',
      'If the user only asked to fill, select, type, or enter values and did not ask to submit/send/continue, return finish now.',
      'Call bh_form_verify only when explicit validation is still needed, using the filled field refs from lastToolResult.fields.',
      'Do not call bh_form_fill_many again for the same already-filled value.',
      'If finishing, explicitly say the field was filled and that no submit/send action was performed.'
    ].join(' ');
  }
  if (result.tool === TOOL_NAMES.FORM_VERIFY) {
    return [
      'The last form verification completed.',
      'If verification passed or only warned and the user did not ask to submit, return finish now.',
      'If the user asked to submit, request the submit approval tool instead of finishing.',
      'Do not call bh_form_verify again unless page state changed.'
    ].join(' ');
  }
  if (result.tool === TOOL_NAMES.ACTION_CHECK_READINESS) {
    const data = toolResultData(result);
    const canAct = data?.canAct === true;
    const wouldRequireApproval = data?.wouldRequireApproval === true;
    return [
      'The latest action readiness check was read-only; it did not execute the click, type, select, submit, or focus action.',
      'Do not repeat bh_action_check_readiness for the same target unless the page changed or refs were refreshed.',
      canAct
        ? 'The target is ready from a readiness perspective.'
        : 'The target is not ready; explain the readiness result instead of pretending the action ran.',
      wouldRequireApproval
        ? 'The checked action would require approval before any separate execution tool could run it.'
        : undefined,
      'If a separate action-execution tool is available for the requested action and the target does not require approval, use it next; otherwise return finish and clearly explain the boundary.'
    ].filter(Boolean).join(' ');
  }
  if (isPageContentReadTool(result.tool)) {
    const data = toolResultData(result);
    const hasText = Boolean(data && stringField(data, 'text'));
    if (!hasText) {
      return undefined;
    }
    const hasMore = data?.hasMore === true;
    const nextCursor = data ? numberField(data, 'nextCursor') : undefined;
    return [
      'The latest page read returned pageRead.text in lastToolResult.',
      hasMore && typeof nextCursor === 'number'
        ? `If the current text is sufficient for the user task, finish now. Only continue reading if the missing tail is essential, and then use cursor ${nextCursor}; do not repeat cursor 0 or only change maxChars.`
        : 'The latest page read is complete enough for this turn; finish now unless the user asked for another source.'
    ].join(' ');
  }
  return undefined;
}

function buildLoopGuard(actions: ReturnType<typeof buildRecentToolActions>): {
  warning: string;
  repeatedTools: string[];
  repeatCount: number;
  instruction: string;
} | undefined {
  const repeated = repeatedReadLoop(actions);
  if (!repeated) {
    return undefined;
  }
  return {
    warning: 'Potential repeated tool loop detected.',
    repeatedTools: repeated.tools,
    repeatCount: repeated.count,
    instruction: [
      'You already read the current page content repeatedly and the page did not change.',
      'Do not call these read tools again unless the page changes or the user asks for another source.',
      'Use the available information now: return finish with the answer, ask_user only for missing user input, or fail if the task cannot be answered.'
    ].join(' ')
  };
}

function repeatedReadLoop(actions: ReturnType<typeof buildRecentToolActions>):
  { tools: string[]; count: number } | undefined {
  const tail = actions.slice(-4);
  const readsSinceChange: typeof tail = [];
  for (let index = tail.length - 1; index >= 0; index -= 1) {
    const action = tail[index];
    if (!action) {
      continue;
    }
    if (action.changedPage) {
      break;
    }
    if (isPageContentReadTool(action.tool) && action.ok) {
      readsSinceChange.unshift(action);
      continue;
    }
    if (readsSinceChange.length > 0) {
      break;
    }
  }
  if (readsSinceChange.length < 3) {
    return undefined;
  }
  return {
    tools: uniqueStrings(readsSinceChange.map((action) => action.tool)),
    count: readsSinceChange.length
  };
}

function isPageContentReadTool(tool: string): boolean {
  return tool === TOOL_NAMES.PAGE_READ_ARTICLE || tool === TOOL_NAMES.PAGE_READ_VISIBLE_TEXT;
}

function isVisionTool(tool: string): boolean {
  return tool.startsWith('bh_vision_');
}

function pageReadTextFromToolResult(result: NonNullable<RunSnapshot['toolResult']>): string | undefined {
  if (!isPageContentReadTool(result.tool)) {
    return undefined;
  }
  const data = toolResultData(result);
  return data ? stringField(data, 'text') : undefined;
}

function toolResultData(result: NonNullable<RunSnapshot['toolResult']>): Record<string, unknown> | undefined {
  return isRecord(result.detail) && isRecord(result.detail.data)
    ? result.detail.data
    : undefined;
}

function compactHeading(value: unknown): { level: number; text: string } | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const text = stringField(value, 'text');
  const level = numberField(value, 'level');
  if (!text || typeof level !== 'number') {
    return undefined;
  }
  return {
    level,
    text: redactTextForModelContext(text)
  };
}

function compactLink(value: unknown): { text?: string; href?: string } | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const text = stringField(value, 'text');
  const href = stringField(value, 'href');
  if (!text && !href) {
    return undefined;
  }
  return {
    ...(text ? { text: redactTextForModelContext(text) } : {}),
    ...(href ? { href: redactTextForModelContext(href) } : {})
  };
}

function uniqueStrings(values: string[]): string[] {
  return values.filter((value, index, all) => all.indexOf(value) === index);
}

// ── Utility functions ──

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function numberField(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function truncateStr(value: string | undefined, maxChars: number): string | undefined {
  if (!value) return value;
  if (value.length <= maxChars) return value;
  return value.slice(0, maxChars) + '…[truncated]';
}

/**
 * Redacts URLs and email patterns embedded in structured data objects
 * that may contain sensitive query parameters.
 */
function redactEmbeddedUrls(obj: unknown): unknown {
  if (typeof obj === 'string') {
    return redactTextForModelContext(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map(redactEmbeddedUrls);
  }
  if (typeof obj === 'object' && obj !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = redactEmbeddedUrls(value);
    }
    return result;
  }
  return obj;
}
