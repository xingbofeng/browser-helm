import { describe, expect, it } from 'vitest';

import {
  runtimeRequestSchema
} from '../../../src/runtime/runtime-messages';
import { RUNTIME_MESSAGES } from '../../../src/shared/constants/event-names';

describe('runtime message schemas', () => {
  it('accepts explicit provider API key persistence mode at the public settings boundary', () => {
    const parsed = runtimeRequestSchema.parse({
      type: RUNTIME_MESSAGES.TEST_PROVIDER_CONNECTION,
      input: {
        baseUrl: 'https://api.example.com/v1',
        model: 'gpt-test',
        apiKey: 'sk-test',
        apiKeyPersistence: 'local'
      }
    });

    expect(parsed).toMatchObject({
      type: RUNTIME_MESSAGES.TEST_PROVIDER_CONNECTION,
      input: {
        apiKeyPersistence: 'local'
      }
    });
  });
});
