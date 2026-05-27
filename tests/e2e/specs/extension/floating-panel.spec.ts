import { test } from '@playwright/test';

import { FloatingPanelFlow } from '../../flows/floating-panel-flow';

test('页面加载后右侧出现 BrowserHelm floating icon', async () => {
  const flow = await FloatingPanelFlow.start();
  try {
    await flow.expectFloatingIconVisible();
  } finally {
    await flow.close();
  }
});

test('点击 icon 设置 data-open="true" 展开面板', async () => {
  const flow = await FloatingPanelFlow.start();
  try {
    await flow.expectExpandSetsDataOpen();
  } finally {
    await flow.close();
  }
});

test('展开面板 iframe 使用 active target URL 和当前 tabId', async () => {
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

test('再次点击 icon 收起面板', async () => {
  const flow = await FloatingPanelFlow.start();
  try {
    await flow.expectToggleCollapse();
  } finally {
    await flow.close();
  }
});

test('icon tooltip 包含 Ctrl+Shift+B / Opt+Shift+B 快捷键', async () => {
  const flow = await FloatingPanelFlow.start();
  try {
    await flow.expectIconHasShortcutTooltip();
  } finally {
    await flow.close();
  }
});

test('icon 图片正常加载不挂图 (naturalWidth > 0)', async () => {
  const flow = await FloatingPanelFlow.start();
  try {
    await flow.expectIconImageLoaded();
  } finally {
    await flow.close();
  }
});

test('icon 图片使用 chrome-extension:// 协议的扩展资源路径', async () => {
  const flow = await FloatingPanelFlow.start();
  try {
    await flow.expectIconUsesExtensionUrl();
  } finally {
    await flow.close();
  }
});

test('floating host 只在 top frame 创建，iframe 内不创建', async () => {
  const flow = await FloatingPanelFlow.start();
  try {
    await flow.expectOnlyTopFrameCreatesHost();
  } finally {
    await flow.close();
  }
});
