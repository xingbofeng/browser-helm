import { describe, expect, it } from 'vitest';
import { ToolManifestPromptSerializer } from '../../../../src/agent/loop/prompt/tool-manifest-prompt-serializer';
import type { ToolPromptContract } from '../../../../src/tools/core/tool-router';
import { toolManifestHash } from '../../../../src/tools/core/tool-prompt-contract';

describe('ToolManifestPromptSerializer', () => {
  it('returns an explicit manifest hash and compact sorted tool args schema', () => {
    const tools: ToolPromptContract[] = [
      toolContract('z_tool', {
        type: 'object',
        required: ['query'],
        properties: {
          query: {
            type: 'string',
            description: 'Long schema descriptions should not enter the prompt manifest.'
          },
          mode: {
            enum: ['fast', 'careful'],
            description: 'Also omitted.'
          }
        },
        additionalProperties: false
      }),
      toolContract('a_tool', {
        type: 'object',
        properties: {
          nested: {
            type: 'object',
            properties: {
              count: { type: 'number', description: 'omitted' }
            }
          }
        }
      })
    ];

    const manifest = new ToolManifestPromptSerializer().serialize(tools);

    expect(manifest.hash).toBe(toolManifestHash(tools));
    expect(manifest.tools.map((tool) => tool.name)).toEqual(['a_tool', 'z_tool']);
    expect(manifest.tools[1]?.argsSchema).toEqual({
      type: 'object',
      required: ['query'],
      properties: {
        query: { type: 'string' },
        mode: { enum: ['fast', 'careful'] }
      }
    });
    expect(JSON.stringify(manifest)).not.toContain('Long schema descriptions');
    expect(JSON.stringify(manifest)).not.toContain('Also omitted');
    expect(JSON.stringify(manifest)).not.toContain('additionalProperties');
  });
});

function toolContract(name: string, argsSchema: unknown): ToolPromptContract {
  return {
    name,
    title: name,
    description: `${name} description`,
    modes: ['ask'],
    risk: 'safe',
    argsSchema,
    readOnly: true,
    requiresApproval: false,
    contextVisibility: 'summary'
  };
}
