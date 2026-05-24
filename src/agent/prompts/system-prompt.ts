import { decisionContractPrompt } from './prompt-parts';
import type { ToolPromptContract } from '../../tools/core/tool-router';
import type { RunMode } from '../../shared/schemas/tool.schema';

export function buildSystemPrompt(
  tools: Array<string | ToolPromptContract>,
  runMode?: RunMode
): string {
  const normalized = tools.map((tool) =>
    typeof tool === 'string'
      ? {
          name: tool,
          title: tool,
          description: 'No description provided.',
          modes: [],
          risk: 'safe',
          argsSchema: 'object'
        }
      : tool
  );
  const toolLine =
    normalized.length > 0
      ? [
          'Available tools:',
          ...normalized.map(
            (tool) =>
              `- ${tool.name}: title=${tool.title}; description=${tool.description}; risk=${tool.risk}; modes=${tool.modes.join(',') || 'none'}; argsSchema=${JSON.stringify(tool.argsSchema)}`
          )
        ].join('\n')
      : 'No tools available.';
  return [
    'You are BrowserHelm v0.1 agent kernel.',
    runMode ? `Current run mode: ${runMode}.` : undefined,
    decisionContractPrompt,
    toolLine
  ].filter((part): part is string => typeof part === 'string').join(' ');
}
