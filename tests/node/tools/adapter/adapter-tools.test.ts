import { beforeEach, describe, expect, it } from 'vitest';

import { ERROR_CODES } from '../../../../src/shared/constants/error-codes';
import { TOOL_NAMES } from '../../../../src/shared/constants/tool-names';
import {
  bhAdapterApplyLocator,
  bhAdapterDetectSite,
  bhAdapterListWorkflows,
  bhAdapterReportFailure
} from '../../../../src/tools/adapter/bh-adapter-tools';
import { defaultAdapterFailureReporter } from '../../../../src/tools/adapter/adapter-failure-reporter';

describe('adapter tools', () => {
  beforeEach(() => {
    defaultAdapterFailureReporter.clear();
  });

  it('detects a supported site without changing page state', async () => {
    const result = await bhAdapterDetectSite().execute({
      url: 'https://github.com/openai/browser-helm'
    }, ctx());

    expect(result).toMatchObject({
      ok: true,
      code: ERROR_CODES.OK,
      changedPage: false,
      requiresObserve: false
    });
    const data = readRecord(result.data);
    const detection = readRecord(data?.detection);
    const adapter = readRecord(detection?.adapter);
    expect(detection?.enabled).toBe(true);
    expect(adapter?.id).toBe('github');
    expect(adapter?.label).toBe('GitHub');
  });

  it('lists adapter workflows for a supported site', async () => {
    const result = await bhAdapterListWorkflows().execute({
      url: 'https://mail.google.com/mail/u/0/#inbox'
    }, ctx());

    expect(result).toMatchObject({
      ok: true,
      data: {
        adapterId: 'gmail',
        workflows: [expect.objectContaining({ id: 'gmail-search-mail' })]
      }
    });
  });

  it('records workflow failure when a requested workflow is not available for the adapter', async () => {
    const result = await bhAdapterListWorkflows().execute({
      url: 'https://github.com/openai/browser-helm',
      workflowId: 'github-missing-workflow'
    }, ctx());

    expect(result).toMatchObject({
      ok: false,
      code: ERROR_CODES.ADAPTER_WORKFLOW_FAILED,
      changedPage: false,
      requiresObserve: false
    });
    const data = readRecord(result.data);
    const report = readRecord(data?.report);
    expect(data?.fallback).toBe('generic_browser_tools');
    expect(report?.adapterId).toBe('github');
    expect(report?.workflowId).toBe('github-missing-workflow');
    expect(report?.errorCode).toBe(ERROR_CODES.ADAPTER_WORKFLOW_FAILED);
    expect(defaultAdapterFailureReporter.list()).toHaveLength(1);
  });

  it('reminds the agent that adapter workflows do not bypass approval policy', async () => {
    const result = await bhAdapterListWorkflows().execute({
      url: 'https://dashboard.stripe.com/customers'
    }, ctx());

    expect(result).toMatchObject({
      ok: true,
      data: {
        adapterId: 'stripe',
        workflows: [expect.objectContaining({
          risk: 'high',
          requiresApproval: true
        })]
      }
    });
    expect(result.nextHints).toContain('Adapter workflows never bypass global approval policy.');
  });


  it('records locator failure and falls back to generic tools when candidates do not match', async () => {
    const result = await bhAdapterApplyLocator().execute({
      url: 'https://github.com/openai/browser-helm',
      locatorId: 'github-issues-tab',
      candidates: [{ refId: 'ref_1', label: 'Pull requests', selector: 'a[href$="/pulls"]' }]
    }, ctx());

    expect(result).toMatchObject({
      ok: false,
      code: 'ADAPTER_LOCATOR_FAILED',
      changedPage: false,
      requiresObserve: false
    });
    const data = readRecord(result.data);
    const report = readRecord(data?.report);
    expect(data?.fallback).toBe('generic_browser_tools');
    expect(report?.adapterId).toBe('github');
    expect(report?.locatorId).toBe('github-issues-tab');
    expect(report?.errorCode).toBe('ADAPTER_LOCATOR_FAILED');
    expect(defaultAdapterFailureReporter.list()).toHaveLength(1);
  });

  it('records workflow failure reports without blocking generic fallback', async () => {
    const result = await bhAdapterReportFailure().execute({
      url: 'https://dashboard.stripe.com/customers',
      adapterId: 'stripe',
      workflowId: 'stripe-open-customer',
      errorCode: ERROR_CODES.ADAPTER_WORKFLOW_FAILED,
      message: 'Customer search workflow no longer matches the dashboard layout.'
    }, ctx());

    expect(result).toMatchObject({
      ok: true,
      code: ERROR_CODES.OK,
      changedPage: false,
      requiresObserve: false,
      data: {
        fallback: 'generic_browser_tools',
        report: expect.objectContaining({
          adapterId: 'stripe',
          workflowId: 'stripe-open-customer',
          errorCode: ERROR_CODES.ADAPTER_WORKFLOW_FAILED
        }) as unknown
      }
    });
    expect(defaultAdapterFailureReporter.list()).toHaveLength(1);
  });

  it('registers stable v1.6 adapter tool names', () => {
    expect(bhAdapterDetectSite().name).toBe(TOOL_NAMES.ADAPTER_DETECT_SITE);
    expect(bhAdapterListWorkflows().name).toBe(TOOL_NAMES.ADAPTER_LIST_WORKFLOWS);
    expect(bhAdapterApplyLocator().name).toBe(TOOL_NAMES.ADAPTER_APPLY_LOCATOR);
    expect(bhAdapterReportFailure().name).toBe(TOOL_NAMES.ADAPTER_REPORT_FAILURE);
  });
});

function ctx() {
  return {
    runId: 'run_1',
    stepId: 'step_1',
    runMode: 'ask' as const
  };
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? value as Record<string, unknown>
    : undefined;
}
