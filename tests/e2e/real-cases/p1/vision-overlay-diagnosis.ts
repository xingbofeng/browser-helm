import { expect } from '@playwright/test';

import { TOOL_NAMES } from '../../../../src/shared/constants/tool-names';
import type { RealModelScenario } from '../../real-sites/model-scenarios/types';

export const visionOverlayDiagnosisScenario: RealModelScenario = {
  id: 'vision-overlay-diagnosis-dialogue',
  title: '通过真实模型截图、检测遮挡层并用 DOM fallback 给出视觉诊断',
  url: ({ fixtureOrigin }) => `${fixtureOrigin}/vision-overlay.html`,
  mode: 'debug',
  runKind: 'answer',
  dumpName: 'vision-overlay-diagnosis',
  task: [
    '这是一个视觉遮挡排障任务，请模拟用户说“按钮好像被挡住了”的完整流程。',
    '第一步调用 bh_vision_capture_viewport 截取当前视口，确认有视觉证据。',
    '第二步调用 bh_vision_detect_overlay 判断是否有 modal、overlay 或视觉 blocker；如果返回 VISION_UNAVAILABLE，不要重试 vision。',
    '第三步调用 bh_page_read_visible_text 或页面观察读取 DOM/a11y 文本作为 fallback 证据。',
    '最后用中文说明：遮挡层标题是什么、它挡住了哪些主要操作、provider 若不支持 vision 时如何回退到 DOM/a11y。',
    '不要调用 pointer click，不要关闭遮挡层，不要点击 Pay now。'
  ].join('\n'),
  async assert({ page, snapshot, beforeUrl }, helpers) {
    expect(page.url()).toBe(beforeUrl);
    helpers.expectTool(snapshot, TOOL_NAMES.VISION_CAPTURE_VIEWPORT);
    helpers.expectTool(snapshot, TOOL_NAMES.VISION_DETECT_OVERLAY);
    helpers.expectNoTool(snapshot, TOOL_NAMES.POINTER_CLICK);
    await expect(page.locator('#overlay')).toBeVisible();
    helpers.expectFinalMessage(snapshot, /遮挡|overlay|视觉|DOM|a11y|浮层/i);
  }
};
