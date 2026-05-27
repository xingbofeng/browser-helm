import { maskProviderSecret } from '../../shared/redaction';

type StreamParseResult = {
  deltas: string[];
  reasoningDeltas: string[];
  done: boolean;
  errors?: string[] | undefined;
};

type OpenAICompatibleStreamPayload = {
  choices?: Array<{
    delta?: {
      content?: string | null;
      reasoning_content?: string | null;
    };
  }>;
  error?: {
    message?: string | null;
  };
};

export function parseOpenAICompatibleStreamChunk(chunk: string): StreamParseResult {
  const deltas: string[] = [];
  const reasoningDeltas: string[] = [];
  const errors: string[] = [];
  let done = false;

  for (const rawLine of chunk.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith(':')) {
      continue;
    }
    if (!line.startsWith('data:')) {
      continue;
    }
    const data = line.slice('data:'.length).trim();
    if (!data) {
      continue;
    }
    if (data === '[DONE]') {
      done = true;
      continue;
    }

    let parsed: OpenAICompatibleStreamPayload;
    try {
      parsed = JSON.parse(data) as OpenAICompatibleStreamPayload;
    } catch {
      errors.push('Invalid stream JSON');
      continue;
    }

    const errorMessage = parsed.error?.message;
    if (typeof errorMessage === 'string' && errorMessage.length > 0) {
      errors.push(maskProviderSecret(errorMessage));
      continue;
    }

    for (const choice of parsed.choices ?? []) {
      const content = choice.delta?.content;
      if (typeof content === 'string' && content.length > 0) {
        deltas.push(content);
      }
      const reasoning = choice.delta?.reasoning_content;
      if (typeof reasoning === 'string' && reasoning.length > 0) {
        reasoningDeltas.push(reasoning);
      }
    }
  }

  return {
    deltas,
    reasoningDeltas,
    done,
    ...(errors.length > 0 ? { errors } : {})
  };
}
