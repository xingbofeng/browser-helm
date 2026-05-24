import type { ContentRpcClient } from '../../page/messaging/content-rpc-client';
import { ChromeContentRpcClient } from '../../page/messaging/content-rpc-client';
import { buildStructuredPageData } from '../../page/structured/structured-page-data';
import { ERROR_CODES } from '../../shared/constants/error-codes';
import type { Observation } from '../../shared/schemas/observation.schema';
import type { ToolResult } from '../../shared/schemas/tool-result.schema';
import { ToolRouter } from '../../tools/core/tool-router';
import { createToolRegistry } from '../../tools';
import type { RunSnapshot, StartRunInput } from '../../runtime/runtime-messages';
import type { RunMode } from '../../shared/schemas/tool.schema';

type RunManagerDeps = {
  getActiveTabId?: () => Promise<number | undefined>;
  createContentRpcClient?: (tabId: number) => ContentRpcClient;
};

export class RunManager {
  private nextId = 1;
  private readonly snapshots = new Map<string, RunSnapshot>();

  constructor(private readonly deps: RunManagerDeps = {}) {}

  async startRun(input: StartRunInput): Promise<{ runId: string }> {
    const runId = `run_${this.nextId}`;
    this.nextId += 1;
    const mode = input.mode ?? 'ask';
    this.snapshots.set(runId, {
      runId,
      mode,
      status: 'created'
    });

    const tabId = input.tabId ?? (await this.getActiveTabId());
    if (!tabId) {
      this.snapshots.set(runId, {
        runId,
        mode,
        status: 'error',
        refs: [],
        error: {
          code: ERROR_CODES.CONTENT_SCRIPT_UNAVAILABLE,
          message: 'No active browser tab is available'
        }
      });
      return { runId };
    }

    const router = this.createToolRouter(tabId);
    const result = await router.execute(
      { tool: 'bh_page_observe', args: {} },
      { runId, stepId: `${runId}:observe`, runMode: mode }
    );
    this.snapshots.set(runId, this.snapshotFromToolResult(runId, mode, result));
    return { runId };
  }

  getSnapshot(runId: string): RunSnapshot {
    return (
      this.snapshots.get(runId) ?? {
        runId,
        mode: 'ask',
        status: 'not_found'
      }
    );
  }

  private createToolRouter(tabId: number): ToolRouter {
    const rpc = this.createContentRpcClient(tabId);
    return new ToolRouter(createToolRegistry(rpc));
  }

  private createContentRpcClient(tabId: number): ContentRpcClient {
    return this.deps.createContentRpcClient?.(tabId) ?? new ChromeContentRpcClient(tabId);
  }

  private async getActiveTabId(): Promise<number | undefined> {
    if (this.deps.getActiveTabId) {
      return this.deps.getActiveTabId();
    }
    if (!globalThis.chrome?.tabs?.query) {
      return undefined;
    }
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });
    return tab?.id;
  }

  private snapshotFromToolResult(
    runId: string,
    mode: RunMode,
    result: ToolResult
  ): RunSnapshot {
    const toolResult = {
      tool: 'bh_page_observe',
      ok: result.ok,
      code: result.code,
      summary: result.summary
    };

    if (!result.ok) {
      return {
        runId,
        mode,
        status: 'error',
        refs: [],
        toolResult,
        error: {
          code: result.code,
          message: result.error?.message ?? result.summary
        }
      };
    }

    const observation = result.data as Observation;
    const refs = observation.refSummary;
    const structuredPageData = buildStructuredPageData(observation);
    return {
      runId,
      mode,
      status: refs.length > 0 ? 'observed' : 'empty',
      observation: {
        url: observation.url,
        title: observation.title,
        currentDomain: observation.currentDomain,
        origin: observation.origin,
        visibleTextSummary: observation.visibleTextSummary,
        pageStateSummary: observation.pageStateSummary,
        interactiveCount: refs.length,
        warnings: observation.warnings
      },
      refs,
      structuredPageData,
      toolResult
    };
  }
}
