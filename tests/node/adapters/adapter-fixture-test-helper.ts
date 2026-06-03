import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { buildMessages } from '../../../src/agent/loop/prompt-builder';
import { defaultDomainAdapterPreferences } from '../../../src/adapters/preferences';
import { defaultDomainAdapterRegistry } from '../../../src/adapters/registry';
import { buildDomainAdapterSnapshot } from '../../../src/background/runtime/run/run-snapshot-assembler';
import { ERROR_CODES } from '../../../src/shared/constants/error-codes';
import {
  bhAdapterApplyLocator,
  bhAdapterListWorkflows
} from '../../../src/tools/adapter/bh-adapter-tools';
import { defaultAdapterFailureReporter } from '../../../src/tools/adapter/adapter-failure-reporter';

export type AdapterFixtureContract = {
  id: 'github' | 'gmail' | 'notion' | 'linear' | 'jira' | 'stripe' | 'vercel' | 'supabase';
  label: string;
  url: string;
  workflowId: string;
  locatorId: string;
  fixtureNeedle: string;
  guidanceNeedle: string;
  approvalRequired: boolean;
  matchingCandidate: {
    refId: string;
    label: string;
    selector: string;
  };
};

export function runAdapterFixtureContract(input: AdapterFixtureContract): void {
  describe(`${input.label} adapter fixture contract`, () => {
    beforeEach(() => {
      defaultDomainAdapterPreferences.clear();
      defaultAdapterFailureReporter.clear();
    });

    it('has a fixture and detects guidance, workflow, locator, version, and drift metadata', () => {
      const fixture = readFixture(input.id);
      expect(fixture).toContain(input.fixtureNeedle);

      const detection = defaultDomainAdapterRegistry.detect(input.url);
      expect(detection.enabled).toBe(true);
      if (!detection.enabled) {
        throw new Error(`Expected ${input.label} adapter detection`);
      }

      expect(detection.adapter).toMatchObject({
        id: input.id,
        label: input.label,
        version: '1.0.0',
        lastVerifiedAt: '2026-06-03',
        driftStatus: {
          status: 'ok',
          checks: [
            expect.objectContaining({
              requiredSignal: 'url_domain_match',
              status: 'pass'
            })
          ],
          missingSignals: [],
          genericFallbackReason: 'Use generic browser tools if adapter hints fail drift checks.'
        }
      });
      expect(JSON.stringify(detection.adapter)).toContain(input.guidanceNeedle);
      expect(detection.adapter.workflows.map((workflow) => workflow.id)).toContain(input.workflowId);
      expect(detection.adapter.locators.map((locator) => locator.id)).toContain(input.locatorId);
      expect(detection.adapter.supportedUrlPatterns).toContain(detection.adapter.matchedUrlPattern);

      expect(buildDomainAdapterSnapshot(input.url)).toMatchObject({
        enabled: true,
        id: input.id,
        version: '1.0.0',
        approvalEnforced: true
      });
    });

    it('matches fixture locator hints and falls back with versioned failure metadata when drift is suspected', async () => {
      const matched = await bhAdapterApplyLocator().execute({
        url: input.url,
        locatorId: input.locatorId,
        candidates: [input.matchingCandidate]
      }, ctx());

      expect(matched).toMatchObject({
        ok: true,
        code: ERROR_CODES.OK,
        changedPage: false,
        requiresObserve: false,
        data: {
          adapterId: input.id,
          candidates: [expect.objectContaining({ refId: input.matchingCandidate.refId })]
        }
      });

      const failed = await bhAdapterApplyLocator().execute({
        url: input.url,
        locatorId: input.locatorId,
        candidates: []
      }, ctx());

      expect(failed).toMatchObject({
        ok: false,
        code: ERROR_CODES.ADAPTER_LOCATOR_FAILED,
        changedPage: false,
        requiresObserve: false
      });
      const failedData = readRecord(failed.data);
      const report = readRecord(failedData?.report);
      expect(failedData?.fallback).toBe('generic_browser_tools');
      expect(report).toMatchObject({
        adapterId: input.id,
        adapterVersion: '1.0.0',
        locatorId: input.locatorId,
        errorCode: ERROR_CODES.ADAPTER_LOCATOR_FAILED
      });
      expect(report?.urlPattern).toMatch(/^https:\/\/.+\/\*/u);
    });

    it('removes guidance from snapshot and prompt when the adapter is disabled', () => {
      defaultDomainAdapterPreferences.setEnabled(input.id, false);

      const snapshotAdapter = buildDomainAdapterSnapshot(input.url);
      expect(snapshotAdapter).toMatchObject({
        enabled: false,
        fallback: 'generic_browser_tools',
        disabledAdapter: {
          id: input.id,
          label: input.label
        }
      });

      const messages = buildMessages({
        record: {
          task: `Inspect ${input.label}`,
          mode: 'ask',
          trace: []
        },
        snapshot: {
          runId: 'run_1',
          mode: 'ask',
          status: 'observed',
          observation: {
            url: input.url,
            title: `${input.label} fixture`,
            currentDomain: new URL(input.url).hostname,
            origin: new URL(input.url).origin,
            visibleTextSummary: input.fixtureNeedle,
            pageStateSummary: 'fixture ready',
            interactiveCount: 1,
            warnings: []
          }
        },
        toolsContracts: [],
        locale: 'en'
      });
      const prompt = messages.at(-1)?.content ?? '';

      expect(prompt).toContain('generic_browser_tools');
      expect(prompt).toContain(`${input.label} adapter disabled by user`);
      expect(prompt).not.toContain(input.workflowId);
      expect(prompt).not.toContain(input.guidanceNeedle);
    });

    it('keeps adapter workflows as previews and preserves approval invariant', async () => {
      const result = await bhAdapterListWorkflows().execute({
        url: input.url,
        workflowId: input.workflowId
      }, ctx());

      expect(result.changedPage).toBe(false);
      expect(result.requiresObserve).toBe(false);
      if (input.approvalRequired) {
        expect(result).toMatchObject({
          ok: false,
          code: ERROR_CODES.APPROVAL_REQUIRED,
          requiresApproval: true,
          data: {
            adapterId: input.id,
            fallback: 'generic_browser_tools',
            workflow: expect.objectContaining({
              id: input.workflowId,
              requiresApproval: true
            }) as unknown
          }
        });
        expect(result.approval?.risk).toMatch(/^(medium|high)$/u);
        expect(result.nextHints).toContain('Adapter workflow approval is required before using its high-risk steps.');
      } else {
        expect(result).toMatchObject({
          ok: true,
          code: ERROR_CODES.OK,
          data: {
            adapterId: input.id,
            workflows: [expect.objectContaining({ id: input.workflowId })]
          }
        });
        expect(result.requiresApproval).not.toBe(true);
      }
    });
  });
}

function readFixture(adapterId: AdapterFixtureContract['id']): string {
  return readFileSync(join(process.cwd(), 'tests/fixtures/adapters', adapterId, 'index.html'), 'utf8');
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? value as Record<string, unknown>
    : undefined;
}

function ctx() {
  return {
    runId: 'run_1',
    stepId: 'step_1',
    runMode: 'ask' as const
  };
}
