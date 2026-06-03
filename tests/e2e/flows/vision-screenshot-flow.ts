import { expect, type Locator } from '@playwright/test';

import { TOOL_NAMES } from '../../../src/shared/constants/tool-names';
import { ERROR_CODES } from '../../../src/shared/constants/error-codes';
import type { RuntimeToolExecutionResult } from '../../../src/runtime/runtime-messages';
import { CockpitPanel } from '../components/side-panel/cockpit-panel';
import { E2EFlowContext } from './e2e-flow-context';

export class VisionScreenshotFlow {
  private constructor(private readonly flowContext: E2EFlowContext) {}

  static async start(): Promise<VisionScreenshotFlow> {
    return new VisionScreenshotFlow(await E2EFlowContext.create());
  }

  async expectScreenshotCaptureAndVisionFallback(): Promise<void> {
    const fixture = await this.flowContext.fixturePage();
    await fixture.goto('vision-overlay.html');
    const tabId = await this.flowContext.shell().activeTabId();
    const sidePanel = this.flowContext.sidePanel();
    const snapshot = await sidePanel.runOnTab({
      tabId,
      task: '检查页面是否有视觉遮挡和布局问题',
      mode: 'debug',
      runKind: 'observe_only'
    });

    const capture = await executeToolResult(sidePanel.executeTool({
      runId: snapshot.runId,
      tool: TOOL_NAMES.VISION_CAPTURE_VIEWPORT,
      args: {}
    }));
    expect(capture.ok, JSON.stringify(capture)).toBe(true);
    expect(readNestedString(capture.data, 'screenshot', 'mode')).toBe('viewport');
    expect(readNestedString(capture.data, 'screenshot', 'dataUrl')).toMatch(/^data:image\/png;base64,/u);

    const fullPage = await executeToolResult(sidePanel.executeTool({
      runId: snapshot.runId,
      tool: TOOL_NAMES.VISION_CAPTURE_FULL_PAGE,
      args: {}
    }));
    expect(fullPage.ok, JSON.stringify(fullPage)).toBe(true);
    expect(readNestedString(fullPage.data, 'screenshot', 'mode')).toBe('full_page');
    expect(readNestedString(fullPage.data, 'screenshot', 'dataUrl')).toMatch(/^data:image\/png;base64,/u);

    const describe = await executeToolResult(sidePanel.executeTool({
      runId: snapshot.runId,
      tool: TOOL_NAMES.VISION_DESCRIBE_VIEWPORT,
      args: { prompt: '说明遮挡层、可见文本和布局风险。' }
    }));
    expect(describe.ok).toBe(false);
    expect(describe.code).toBe(ERROR_CODES.VISION_UNAVAILABLE);
    expect(readNestedString(describe.data, 'observation', 'fallback')).toBe('dom_a11y');
    expect(readNestedString(describe.data, 'screenshot', 'mode')).toBe('viewport');

    const latest = await sidePanel.snapshot(snapshot.runId);
    expect(latest.observation?.title).toContain('Vision Overlay Fixture');
    expect(JSON.stringify(latest.trace)).toContain(TOOL_NAMES.PAGE_OBSERVE);
    expect(JSON.stringify(latest.trace)).toContain(TOOL_NAMES.VISION_DESCRIBE_VIEWPORT);

    const page = await sidePanel.openRun(snapshot.runId);
    const cockpit = new CockpitPanel(page);
    await cockpit.openDebugTab(/^(视觉检查|Vision Inspection)$/u);
    await expect(page.getByText(/当前 provider 不支持视觉输入|Vision fallback is active/u).first()).toBeVisible();
    await expect(page.getByText(/vision_not_supported/u).first()).toBeVisible();
    await page.close();
  }

  async expectPointerClickRequiresApprovalOnlyForSensitiveCoordinates(): Promise<void> {
    const fixture = await this.flowContext.fixturePage();
    await fixture.goto('vision-overlay.html');
    const tabId = await this.flowContext.shell().activeTabId();
    const sidePanel = this.flowContext.sidePanel();
    const snapshot = await sidePanel.runOnTab({
      tabId,
      task: '使用视觉 fallback 关闭遮挡层',
      mode: 'full',
      runKind: 'observe_only'
    });
    const point = await centerPoint(fixture.page.locator('#dismiss-overlay'));

    const clickRequest = await executeToolResult(sidePanel.executeTool({
      runId: snapshot.runId,
      tool: TOOL_NAMES.POINTER_CLICK,
      args: {
        ...point,
        reason: 'Visual fallback click on the dismiss overlay control after DOM ref was unavailable.',
        visionGrounding: highConfidenceVisionFallback()
      }
    }));
    expect(clickRequest.ok).toBe(false);
    expect(clickRequest.code).toBe(ERROR_CODES.APPROVAL_REQUIRED);
    expect(clickRequest.requiresApproval).toBe(true);
    const waiting = await sidePanel.snapshot(snapshot.runId);
    const click = await executeToolResult(sidePanel.decideApproval({
      runId: snapshot.runId,
      requestId: requireApprovalId(waiting.pendingApproval?.id),
      decision: 'approved',
      reason: 'e2e approve first visual fallback click'
    }));
    expect(click.ok, JSON.stringify(click)).toBe(true);
    expect(click.changedPage).toBe(true);
    await expect(fixture.page.locator('#overlay')).toBeHidden();
    await expect.poll(async () => await fixture.page.evaluate(() =>
      (window as unknown as { __visionClickCount: number }).__visionClickCount
    )).toBe(1);

    await fixture.goto('vision-overlay.html');
    const sensitiveSnapshot = await sidePanel.runOnTab({
      tabId,
      task: '验证敏感坐标点击需要 approval',
      mode: 'full',
      runKind: 'observe_only'
    });
    const sensitivePoint = await centerPoint(fixture.page.locator('#dismiss-overlay'));
    const approval = await executeToolResult(sidePanel.executeTool({
      runId: sensitiveSnapshot.runId,
      tool: TOOL_NAMES.POINTER_CLICK,
      args: {
        ...sensitivePoint,
        reason: 'Click Pay now button to submit payment from the visual fallback path.',
        visionGrounding: highConfidenceVisionFallback()
      }
    }));
    expect(approval.ok).toBe(false);
    expect(approval.code).toBe(ERROR_CODES.APPROVAL_REQUIRED);
    expect(approval.requiresApproval).toBe(true);
    await expect(fixture.page.locator('#overlay')).toBeVisible();
    await expect.poll(async () => await fixture.page.evaluate(() =>
      (window as unknown as { __visionClickCount: number }).__visionClickCount
    )).toBe(0);
  }

  async close(): Promise<void> {
    await this.flowContext.close();
  }
}

function requireApprovalId(value: string | undefined): string {
  if (!value) {
    throw new Error('Expected a pending approval id');
  }
  return value;
}

function highConfidenceVisionFallback() {
  return {
    allowed: true,
    targetConfidence: 'high',
    domRefUnavailable: true,
    reason: 'Vision grounding marked this coordinate as a high-confidence fallback target.'
  };
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

async function centerPoint(locator: Locator): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error('Unable to resolve pointer target bounds');
  }
  return {
    x: Math.round(box.x + box.width / 2),
    y: Math.round(box.y + box.height / 2)
  };
}

function readNestedString(value: unknown, parent: string, key: string): string {
  const record = readRecord(value);
  const nested = record ? readRecord(record[parent]) : undefined;
  const field = nested ? nested[key] : undefined;
  return typeof field === 'string' ? field : '';
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? value as Record<string, unknown>
    : undefined;
}
