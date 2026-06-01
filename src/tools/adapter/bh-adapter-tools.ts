import { z } from 'zod';

import { defaultDomainAdapterRegistry } from '../../adapters/registry';
import type { AdapterDetection, AdapterLocator, DetectedDomainAdapter } from '../../adapters/adapter-types';
import { ERROR_CODES } from '../../shared/constants/error-codes';
import { TOOL_NAMES } from '../../shared/constants/tool-names';
import { toolResultSchema, type ToolResult } from '../../shared/schemas/tool-result.schema';
import { approvalRequiredResult } from '../core/tool-result-factory';
import type { ToolSpec } from '../core/tool-spec';
import {
  adapterFailureReportInputSchema,
  defaultAdapterFailureReporter
} from './adapter-failure-reporter';

const urlArgsSchema = z.object({
  url: z.string().url(),
  workflowId: z.string().min(1).optional()
}).strict();

const locatorCandidateSchema = z.object({
  refId: z.string().min(1),
  label: z.string().optional(),
  selector: z.string().optional()
}).strict();

const applyLocatorArgsSchema = z.object({
  url: z.string().url(),
  locatorId: z.string().min(1),
  candidates: z.array(locatorCandidateSchema).default([])
}).strict();

type LocatorCandidate = z.infer<typeof locatorCandidateSchema>;

/**
 * 检测当前 URL 是否命中站点 adapter。
 *
 * Agent 语义：用于进入站点后读取 adapter 状态、guidance、workflow 和 locator hints。
 * 适用所有 run mode；只读 safe，不改变页面状态，不触发 approval。参数 url 是当前页面
 * URL；返回 adapter detection，未命中时明确回退 generic browser tools。
 */
export function bhAdapterDetectSite(): ToolSpec<z.infer<typeof urlArgsSchema>, ToolResult> {
  return adapterTool({
    name: TOOL_NAMES.ADAPTER_DETECT_SITE,
    title: 'Detect Domain Adapter',
    description: 'Detects whether the current URL has a site-specific domain adapter.',
    argsSchema: urlArgsSchema,
    execute: ({ url }) => {
      const detection = defaultDomainAdapterRegistry.detect(url);
      return ok(
        detection.enabled
          ? `Detected ${detection.adapter.label} adapter.`
          : 'No domain adapter detected; use generic browser tools.',
        { detection }
      );
    }
  });
}

/**
 * 列出命中站点 adapter 的 workflow templates。
 *
 * Agent 语义：在高价值站点执行常见流程前读取 workflow hints；只读 safe，不执行 workflow，
 * 不改变页面状态，不触发 approval。参数 url 是当前页面 URL；可选 workflowId 用于验证
 * 某个 workflow 是否仍可用，缺失时自动记录 workflow failure 并 generic fallback。
 */
export function bhAdapterListWorkflows(): ToolSpec<z.infer<typeof urlArgsSchema>, ToolResult> {
  return adapterTool({
    name: TOOL_NAMES.ADAPTER_LIST_WORKFLOWS,
    title: 'List Adapter Workflows',
    description: 'Lists site-specific workflow templates for the detected domain adapter.',
    argsSchema: urlArgsSchema,
    execute: ({ url, workflowId }) => {
      const detection = defaultDomainAdapterRegistry.detect(url);
      if (!detection.enabled) {
        return fallbackNotFound(detection);
      }
      const selectedWorkflow = workflowId
        ? detection.adapter.workflows.find((workflow) => workflow.id === workflowId)
        : undefined;
      if (workflowId && !selectedWorkflow) {
        return recordWorkflowFailure(
          url,
          detection.adapter,
          workflowId,
          `Workflow ${workflowId} is not registered for ${detection.adapter.label}.`
        );
      }
      if (selectedWorkflow?.requiresApproval) {
        return {
          ...approvalRequiredResult({
            reason: `Confirm adapter workflow: ${selectedWorkflow.title}`,
            risk: selectedWorkflow.risk === 'high' ? 'high' : 'medium',
            actionPreview: selectedWorkflow.steps.join('\n')
          }),
          data: {
            adapterId: detection.adapter.id,
            workflow: selectedWorkflow,
            fallback: 'generic_browser_tools'
          },
          nextHints: ['Adapter workflow approval is required before using its high-risk steps.']
        };
      }
      return {
        ...ok(`Listed ${detection.adapter.workflows.length} ${detection.adapter.label} workflows.`, {
          adapterId: detection.adapter.id,
          workflows: detection.adapter.workflows
        }),
        nextHints: ['Adapter workflows never bypass global approval policy.']
      };
    }
  });
}

/**
 * 将 adapter locator hint 应用到已观察候选元素。
 *
 * Agent 语义：只在已有 observation/ref 候选上筛选 locator，不查询 DOM、不点击、不输入。
 * 适用所有 run mode；只读 safe，不触发 approval。locator 匹配失败会记录 failure report，
 * 并明确要求回退 generic browser tools。
 */
export function bhAdapterApplyLocator(): ToolSpec<z.infer<typeof applyLocatorArgsSchema>, ToolResult> {
  return adapterTool({
    name: TOOL_NAMES.ADAPTER_APPLY_LOCATOR,
    title: 'Apply Adapter Locator',
    description: 'Applies a site adapter locator hint to observed candidates and falls back when it fails.',
    argsSchema: applyLocatorArgsSchema,
    execute: ({ url, locatorId, candidates }) => {
      const detection = defaultDomainAdapterRegistry.detect(url);
      if (!detection.enabled) {
        return fallbackNotFound(detection);
      }
      const locator = detection.adapter.locators.find((item) => item.id === locatorId);
      if (!locator) {
        return recordLocatorFailure(url, detection.adapter, locatorId, `Locator ${locatorId} is not registered.`);
      }
      const matches = candidates.filter((candidate) => matchesLocator(candidate, locator));
      if (!matches.length) {
        return recordLocatorFailure(url, detection.adapter, locatorId, `Locator ${locatorId} did not match observed candidates.`);
      }
      return ok(`Matched ${matches.length} candidate(s) for ${locator.label}.`, {
        adapterId: detection.adapter.id,
        locator,
        candidates: matches
      });
    }
  });
}

/**
 * 手动记录 adapter workflow 或 locator failure。
 *
 * Agent 语义：当 adapter hint 与当前站点版本不符时记录开发者可追踪失败，并保持通用工具
 * fallback。只读 safe，不改变页面状态，不触发 approval。参数包含 adapter/workflow/locator
 * 和错误原因；返回 failure report。
 */
export function bhAdapterReportFailure(): ToolSpec<z.infer<typeof adapterFailureReportInputSchema>, ToolResult> {
  return adapterTool({
    name: TOOL_NAMES.ADAPTER_REPORT_FAILURE,
    title: 'Report Adapter Failure',
    description: 'Records a domain adapter locator or workflow failure and keeps generic fallback available.',
    argsSchema: adapterFailureReportInputSchema,
    execute: (args) => ok('Recorded adapter failure report; use generic browser tools.', {
      report: defaultAdapterFailureReporter.report(args),
      fallback: 'generic_browser_tools'
    })
  });
}

function adapterTool<TArgs>(input: {
  name: string;
  title: string;
  description: string;
  argsSchema: z.ZodType<TArgs>;
  execute: (args: TArgs) => ToolResult;
}): ToolSpec<TArgs, ToolResult> {
  return {
    name: input.name,
    title: input.title,
    description: input.description,
    modes: ['ask', 'debug', 'form', 'act'],
    risk: 'safe',
    argsSchema: input.argsSchema,
    resultSchema: toolResultSchema,
    readOnly: true,
    requiresApproval: false,
    contextVisibility: 'summary',
    execute: (args) => Promise.resolve(input.execute(args))
  };
}

function ok(summary: string, data: unknown): ToolResult {
  return {
    ok: true,
    code: ERROR_CODES.OK,
    summary,
    data,
    changedPage: false,
    requiresObserve: false,
    context: {
      visibility: 'summary',
      summary
    }
  };
}

function fallbackNotFound(detection: Extract<AdapterDetection, { enabled: false }>): ToolResult {
  return {
    ok: false,
    code: ERROR_CODES.ADAPTER_NOT_FOUND,
    summary: detection.reason,
    data: detection,
    changedPage: false,
    requiresObserve: false,
    error: { message: detection.reason },
    nextHints: ['Use generic browser tools.'],
    context: {
      visibility: 'summary',
      summary: `${detection.reason}; use generic browser tools.`
    }
  };
}

function recordLocatorFailure(
  url: string,
  adapter: DetectedDomainAdapter,
  locatorId: string,
  message: string
): ToolResult {
  const report = defaultAdapterFailureReporter.report({
    url,
    adapterId: adapter.id,
    locatorId,
    errorCode: ERROR_CODES.ADAPTER_LOCATOR_FAILED,
    message
  });
  return {
    ok: false,
    code: ERROR_CODES.ADAPTER_LOCATOR_FAILED,
    summary: `${message} Falling back to generic browser tools.`,
    data: {
      report,
      fallback: 'generic_browser_tools'
    },
    changedPage: false,
    requiresObserve: false,
    error: { message },
    nextHints: ['Use generic browser tools and refresh observation before retrying adapter locator.'],
    context: {
      visibility: 'summary',
      summary: `${ERROR_CODES.ADAPTER_LOCATOR_FAILED}: ${message}; fallback generic_browser_tools.`
    }
  };
}

function recordWorkflowFailure(
  url: string,
  adapter: DetectedDomainAdapter,
  workflowId: string,
  message: string
): ToolResult {
  const report = defaultAdapterFailureReporter.report({
    url,
    adapterId: adapter.id,
    workflowId,
    errorCode: ERROR_CODES.ADAPTER_WORKFLOW_FAILED,
    message
  });
  return {
    ok: false,
    code: ERROR_CODES.ADAPTER_WORKFLOW_FAILED,
    summary: `${message} Falling back to generic browser tools.`,
    data: {
      report,
      fallback: 'generic_browser_tools'
    },
    changedPage: false,
    requiresObserve: false,
    error: { message },
    nextHints: ['Use generic browser tools and report adapter workflow mismatch before retrying.'],
    context: {
      visibility: 'summary',
      summary: `${ERROR_CODES.ADAPTER_WORKFLOW_FAILED}: ${message}; fallback generic_browser_tools.`
    }
  };
}

function matchesLocator(candidate: LocatorCandidate, locator: AdapterLocator): boolean {
  const selector = candidate.selector?.toLowerCase();
  const label = candidate.label?.toLowerCase();
  return locator.selectors.some((item) => selector === item.toLowerCase()) ||
    (label !== undefined && (locator.fallbackText ?? []).some((text) => label.includes(text.toLowerCase())));
}
