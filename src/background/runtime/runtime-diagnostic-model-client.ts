import type {
  ModelClient,
  ModelInput,
  ModelOutput
} from '../../agent/model/model-client';

export class RuntimeDiagnosticModelClient implements ModelClient {
  async complete(input: ModelInput): Promise<ModelOutput> {
    const systemText = input.messages[0]?.content ?? '';
    const mode = extractMode(systemText);
    if (input.stepIndex === 0 && mode === 'form') {
      return decision({
        type: 'tool_call',
        tool: 'bh_form_read_fields',
        args: {}
      });
    }
    if (input.stepIndex === 0 && mode === 'debug') {
      return decision({
        type: 'tool_call',
        tool: 'bh_debug_collect_page_health',
        args: {}
      });
    }
    return decision({
      type: 'finish',
      message: mode === 'form'
        ? 'Form Doctor 诊断报告已生成'
        : mode === 'debug'
          ? 'Page Inspector 诊断报告已生成'
          : '诊断准备完成'
    });
  }
}

function extractMode(systemText: string): 'ask' | 'debug' | 'form' | 'act' {
  const match = /Current run mode: (ask|debug|form|act)\./u.exec(systemText);
  return match?.[1] as 'ask' | 'debug' | 'form' | 'act' | undefined ?? 'ask';
}

function decision(value: unknown): Promise<ModelOutput> {
  return Promise.resolve({
    text: JSON.stringify(value)
  });
}
