import { ContextBuilder } from '../src/agent/context/ContextBuilder';
import { AgentLoop } from '../src/agent/kernel/AgentLoop';
import { DecisionParser } from '../src/agent/parser/DecisionParser';
import { MockModelClient } from '../src/agent/model/MockModelClient';
import { OpenAICompatibleClient } from '../src/agent/model/OpenAICompatibleClient';
import {
  readDotEnvFile,
  resolveProviderConfigWithDotEnvFallback
} from '../src/agent/model/provider-config';
import { InMemoryTraceRecorder } from '../src/storage/memory/in-memory-trace-recorder';
import { ToolRegistry } from '../src/tools/core/tool-registry';
import { ToolRouter } from '../src/tools/core/tool-router';
import { bhAgentAskUser } from '../src/tools/mock/bh_agent_ask_user';
import { bhAgentFail } from '../src/tools/mock/bh_agent_fail';
import { bhAgentFinish } from '../src/tools/mock/bh_agent_finish';
import { bhMockDebugErrors } from '../src/tools/mock/bh_mock_debug_errors';
import { bhMockFormList } from '../src/tools/mock/bh_mock_form_list';
import { bhMockPageObserve } from '../src/tools/mock/bh_mock_page_observe';

async function main(): Promise<void> {
  const task = process.argv.slice(2).join(' ').trim() || 'Observe current page and finish';
  const traceRecorder = new InMemoryTraceRecorder();
  const registry = new ToolRegistry();
  registry.register(bhMockPageObserve);
  registry.register(bhMockFormList);
  registry.register(bhMockDebugErrors);
  registry.register(bhAgentFinish);
  registry.register(bhAgentFail);
  registry.register(bhAgentAskUser);

  const providerConfig = resolveProviderConfigWithDotEnvFallback(
    process.env,
    readDotEnvFile('.env')
  );
  const modelClient =
    providerConfig === undefined
      ? new MockModelClient([
          JSON.stringify({
            type: 'tool_call',
            tool: 'bh_mock_page_observe',
            args: {
              page: 'current'
            }
          }),
          JSON.stringify({
            type: 'finish',
            message: 'Mock run complete'
          })
        ])
      : new OpenAICompatibleClient(providerConfig);
  const runtimeMetadata =
    providerConfig === undefined
      ? {
          model: 'mock-model'
        }
      : {
          model: providerConfig.model,
          providerBaseUrl: providerConfig.baseUrl
        };

  const loop = new AgentLoop({
    modelClient,
    decisionParser: new DecisionParser(),
    toolRouter: new ToolRouter(registry),
    contextBuilder: new ContextBuilder(),
    traceRecorder,
    runtimeMetadata
  });

  const result = await loop.run({
    task,
    maxSteps: 5
  });

  console.log(`status=${result.status}`);
  if (result.message) {
    console.log(`message=${result.message}`);
  }
  if (result.errorCode) {
    console.log(`errorCode=${result.errorCode}`);
  }
  console.log(JSON.stringify(result.trace, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
