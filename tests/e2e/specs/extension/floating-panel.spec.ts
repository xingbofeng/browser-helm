import { test } from '@playwright/test';

import { FloatingPanelFlow } from '../../flows/floating-panel-flow';

test('页面加载后右侧出现 BrowserHelm 浮动图标', async () => {
  const flow = await FloatingPanelFlow.start();
  try {
    await flow.expectFloatingIconVisible();
  } finally {
    await flow.close();
  }
});

test('点击图标后设置 data-open="true" 并展开面板', async () => {
  const flow = await FloatingPanelFlow.start();
  try {
    await flow.expectExpandSetsDataOpen();
  } finally {
    await flow.close();
  }
});

test('展开面板的 iframe 使用当前目标 URL 和当前 tabId', async () => {
  const flow = await FloatingPanelFlow.start();
  try {
    await flow.expectExpandedPanelUsesActiveTargetUrl();
  } finally {
    await flow.close();
  }
});

test('Alt/Opt+Shift+B 快捷键可以展开和收起面板', async () => {
  const flow = await FloatingPanelFlow.start();
  try {
    await flow.expectKeyboardShortcutTogglesPanel();
  } finally {
    await flow.close();
  }
});

test('再次点击图标会收起面板', async () => {
  const flow = await FloatingPanelFlow.start();
  try {
    await flow.expectToggleCollapse();
  } finally {
    await flow.close();
  }
});

test('图标提示包含 Ctrl+Shift+B / Opt+Shift+B 快捷键', async () => {
  const flow = await FloatingPanelFlow.start();
  try {
    await flow.expectIconHasShortcutTooltip();
  } finally {
    await flow.close();
  }
});

test('图标图片正常加载且 naturalWidth 大于 0', async () => {
  const flow = await FloatingPanelFlow.start();
  try {
    await flow.expectIconImageLoaded();
  } finally {
    await flow.close();
  }
});

test('图标图片使用 chrome-extension:// 协议的扩展资源路径', async () => {
  const flow = await FloatingPanelFlow.start();
  try {
    await flow.expectIconUsesExtensionUrl();
  } finally {
    await flow.close();
  }
});

test('浮动宿主只在顶层 frame 创建且不在 iframe 内创建', async () => {
  const flow = await FloatingPanelFlow.start();
  try {
    await flow.expectOnlyTopFrameCreatesHost();
  } finally {
    await flow.close();
  }
});
