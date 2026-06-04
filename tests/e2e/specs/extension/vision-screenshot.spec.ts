import { test } from '@playwright/test';

import { VisionScreenshotFlow } from '../../flows/vision-screenshot-flow';

test('视觉工具截取视口并在模型不可用时回退 DOM 和无障碍结果', async () => {
  const flow = await VisionScreenshotFlow.start();
  try {
    await flow.expectScreenshotCaptureAndVisionFallback();
  } finally {
    await flow.close();
  }
});

test('指针坐标点击只在非敏感视觉回退场景执行', async () => {
  const flow = await VisionScreenshotFlow.start();
  try {
    await flow.expectPointerClickRequiresApprovalOnlyForSensitiveCoordinates();
  } finally {
    await flow.close();
  }
});

test('批量长图和图片采集会滚动触发懒加载', async () => {
  const flow = await VisionScreenshotFlow.start();
  try {
    await flow.expectBatchMediaToolsTriggerLazyLoading();
  } finally {
    await flow.close();
  }
});
