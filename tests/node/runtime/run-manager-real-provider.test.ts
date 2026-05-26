import { describe, expect, it } from 'vitest';

import { readDotEnvFile, resolveProviderConfigWithDotEnvFallback } from '../../../src/agent/model/provider-config';
import { RunManager } from '../../../src/background/runtime/run-manager';
import type { ContentRpcClient } from '../../../src/page/messaging/content-rpc-client';
import { CONTENT_RPC_MESSAGES, TRACE_EVENT_NAMES } from '../../../src/shared/constants/event-names';

const runRealProvider = process.env.BROWSER_HELM_REAL_PROVIDER === '1';

describe.runIf(runRealProvider)('RunManager real provider integration', () => {
  it('streams a real OpenAI-compatible provider response into agent messages', async () => {
    const config = resolveProviderConfigWithDotEnvFallback(
      process.env,
      readDotEnvFile('.env')
    );
    expect(config).toBeDefined();
    if (!config) {
      return;
    }

    const manager = new RunManager({
      getActiveTabId: async () => 42,
      settingsStore: {
        async getProviderSettings() {
          return {
            baseUrl: config.baseUrl,
            model: config.model,
            apiKey: config.apiKey,
            streamingEnabled: true
          };
        },
        async setProviderSettings() {}
      },
      createContentRpcClient: () => ({
        async request(message) {
          if (message.type !== CONTENT_RPC_MESSAGES.PAGE_OBSERVE) {
            return {
              ok: false,
              code: 'UNSUPPORTED',
              message: 'unsupported'
            };
          }
          return {
            ok: true,
            observation: {
              url: 'https://example.test/register',
              title: 'BrowserHelm 测试页面',
              currentDomain: 'example.test',
              origin: 'https://example.test',
              visibleText: '注册 邮箱 密码 提交',
              visibleTextSummary: '页面包含注册表单，字段包括邮箱和密码。',
              pageStateSummary: '页面包含 3 个可交互元素。',
              refSummary: [
                {
                  refId: 'ref_1',
                  role: 'textbox',
                  name: '邮箱',
                  tagName: 'input',
                  visible: true,
                  disabled: false
                },
                {
                  refId: 'ref_2',
                  role: 'textbox',
                  name: '密码',
                  tagName: 'input',
                  visible: true,
                  disabled: false
                },
                {
                  refId: 'ref_3',
                  role: 'button',
                  name: '提交',
                  tagName: 'button',
                  visible: true,
                  disabled: false
                }
              ],
              warnings: []
            }
          };
        }
      } satisfies ContentRpcClient)
    });

    const { runId } = await manager.startRun({
      task: '总结当前页面，说明下一步可以检查什么'
    });
    const snapshot = await waitForTraceEvent(
      manager,
      runId,
      TRACE_EVENT_NAMES.MODEL_STREAM_FINISHED
    );
    const providerMessage = snapshot.messages?.find(
      (message) => message.id === `${runId}:provider-response`
    );

    expect(providerMessage).toMatchObject({
      status: 'complete'
    });
    expect(providerMessage?.content.length).toBeGreaterThan(0);
    expect(snapshot.streaming).toMatchObject({
      enabled: true,
      active: false,
      fallbackUsed: false,
      model: config.model
    });
    expect(snapshot.streaming?.chunkCount ?? 0).toBeGreaterThan(0);
    expect(JSON.stringify(snapshot)).not.toContain(config.apiKey);
  }, 30_000);
});

async function waitForTraceEvent(
  manager: RunManager,
  runId: string,
  eventType: string
) {
  for (let index = 0; index < 120; index += 1) {
    const snapshot = manager.getSnapshot(runId);
    if (snapshot.trace?.some((event) => event.type === eventType)) {
      return snapshot;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return manager.getSnapshot(runId);
}
