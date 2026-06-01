import { expect } from '@playwright/test';

import { TOOL_NAMES } from '../../../src/shared/constants/tool-names';
import type { RuntimeToolExecutionResult } from '../../../src/runtime/runtime-messages';
import { E2EFlowContext } from './e2e-flow-context';

export class DomainAdapterFlow {
  private constructor(private readonly flowContext: E2EFlowContext) {}

  static async start(): Promise<DomainAdapterFlow> {
    return new DomainAdapterFlow(await E2EFlowContext.create());
  }

  async expectGitHubAdapterDetectionStatusAndFallback(): Promise<void> {
    const page = await this.flowContext.fixturePage();
    await page.goto('basic-form.html');
    const tabId = await this.flowContext.shell().activeTabId();
    const sidePanel = this.flowContext.sidePanel();
    const startedSnapshot = await sidePanel.runOnTab({
      tabId,
      task: '查看 GitHub issues',
      mode: 'ask',
      runKind: 'observe_only'
    });
    const sidePanelPage = await sidePanel.openRun(startedSnapshot.runId);
    await expect(
      sidePanelPage.getByRole('region', { name: /Domain adapter status|站点 adapter 状态/u })
    ).toContainText('Generic browser tools');

    await this.flowContext.context.route('https://github.com/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: [
          '<!doctype html>',
          '<html><head><title>Issues · openai/browser-helm</title></head>',
          '<body>',
          '<nav><a data-tab-item="issues-tab" href="/openai/browser-helm/issues">Issues</a></nav>',
          '<main><h1>Issues</h1><button>New issue</button></main>',
          '</body></html>'
        ].join('')
      });
    });
    const githubPage = await this.flowContext.context.newPage();
    await githubPage.goto('https://github.com/openai/browser-helm/issues');
    const githubTabId = await this.flowContext.shell().activeTabId();
    const githubSnapshot = await sidePanel.runOnTab({
      tabId: githubTabId,
      task: '查看 GitHub issues',
      mode: 'ask',
      runKind: 'observe_only'
    });
    const githubSidePanelPage = await sidePanel.openRun(githubSnapshot.runId);
    const adapterRegion = githubSidePanelPage.getByRole('region', { name: /Domain adapter status|站点 adapter 状态/u });
    await expect(adapterRegion).toContainText('GitHub adapter');
    await expect(adapterRegion).toContainText(/1 workflow|1 个 workflow/u);
    await githubSidePanelPage.getByRole('button', { name: /Disable GitHub adapter|禁用 GitHub adapter/u }).click();
    await expect(adapterRegion).toContainText('Generic browser tools');
    await expect(adapterRegion).toContainText('GitHub adapter disabled by user');
    await githubSidePanelPage.getByRole('button', { name: /Enable GitHub adapter|启用 GitHub adapter/u }).click();
    await expect(adapterRegion).toContainText('GitHub adapter');

    const detection = await executeToolResult(sidePanel.executeTool({
      runId: startedSnapshot.runId,
      tool: TOOL_NAMES.ADAPTER_DETECT_SITE,
      args: { url: 'https://github.com/openai/browser-helm/issues' }
    }));
    expect(detection.ok).toBe(true);
    expect(JSON.stringify(detection.data)).toContain('"id":"github"');

    const workflows = await executeToolResult(sidePanel.executeTool({
      runId: startedSnapshot.runId,
      tool: TOOL_NAMES.ADAPTER_LIST_WORKFLOWS,
      args: { url: 'https://github.com/openai/browser-helm/issues' }
    }));
    expect(workflows.ok).toBe(true);
    expect(JSON.stringify(workflows.data)).toContain('github-open-issue');
    expect(workflows.nextHints).toContain('Adapter workflows never bypass global approval policy.');

    const locatorFailure = await executeToolResult(sidePanel.executeTool({
      runId: startedSnapshot.runId,
      tool: TOOL_NAMES.ADAPTER_APPLY_LOCATOR,
      args: {
        url: 'https://github.com/openai/browser-helm/issues',
        locatorId: 'github-issues-tab',
        candidates: [{ refId: 'ref_wrong', label: 'Pull requests', selector: 'a[href$="/pulls"]' }]
      }
    }));
    expect(locatorFailure.ok).toBe(false);
    expect(locatorFailure.code).toBe('ADAPTER_LOCATOR_FAILED');
    expect(JSON.stringify(locatorFailure.data)).toContain('generic_browser_tools');
  }

  async close(): Promise<void> {
    await this.flowContext.close();
  }
}

async function executeToolResult(
  promise: Promise<unknown>
): Promise<RuntimeToolExecutionResult> {
  const result = await promise;
  if (
    typeof result !== 'object' ||
    result === null ||
    typeof (result as RuntimeToolExecutionResult).ok !== 'boolean' ||
    typeof (result as RuntimeToolExecutionResult).code !== 'string'
  ) {
    throw new Error('Unexpected runtime tool result');
  }
  return result as RuntimeToolExecutionResult;
}
