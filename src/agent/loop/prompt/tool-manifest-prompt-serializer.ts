import type { ToolPromptContract } from '../../../tools/core/tool-router';
import { toolManifestHash } from '../../../tools/core/tool-prompt-contract';

export type PromptToolManifestEntry = {
  name: string;
  description: string;
  risk: ToolPromptContract['risk'];
  modes: ToolPromptContract['modes'];
  argsSchema: unknown;
  readOnly: boolean;
  requiresApproval: boolean;
  contextVisibility: ToolPromptContract['contextVisibility'];
};

export type PromptToolManifest = {
  hash: string;
  tools: PromptToolManifestEntry[];
};

export class ToolManifestPromptSerializer {
  serialize(toolsContracts: ToolPromptContract[]): PromptToolManifest {
    return {
      hash: toolManifestHash(toolsContracts),
      tools: [...toolsContracts]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((tool) => ({
          name: tool.name,
          description: tool.description,
          risk: tool.risk,
          modes: tool.modes,
          argsSchema: compactArgsSchemaForPrompt(tool.argsSchema),
          readOnly: tool.readOnly,
          requiresApproval: tool.requiresApproval,
          contextVisibility: tool.contextVisibility
        }))
    };
  }
}

export function compactArgsSchemaForPrompt(schema: unknown): unknown {
  if (!isRecord(schema)) {
    return schema;
  }
  const properties = isRecord(schema.properties)
    ? Object.fromEntries(Object.entries(schema.properties).map(([key, value]) => [
        key,
        compactSchemaProperty(value)
      ]))
    : undefined;
  return {
    ...(typeof schema.type === 'string' ? { type: schema.type } : {}),
    ...(Array.isArray(schema.required) ? { required: schema.required } : {}),
    ...(properties ? { properties } : {}),
    ...(Array.isArray(schema.anyOf) ? { anyOf: schema.anyOf.map(compactSchemaProperty) } : {})
  };
}

function compactSchemaProperty(value: unknown): unknown {
  if (!isRecord(value)) {
    return {};
  }
  if (typeof value.type === 'string') {
    return {
      type: value.type,
      ...(Array.isArray(value.enum) ? { enum: value.enum } : {})
    };
  }
  if (Array.isArray(value.enum)) {
    return { enum: value.enum };
  }
  if (Array.isArray(value.anyOf)) {
    return { anyOf: value.anyOf.map(compactSchemaProperty) };
  }
  if (isRecord(value.properties)) {
    return compactArgsSchemaForPrompt(value);
  }
  return {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
