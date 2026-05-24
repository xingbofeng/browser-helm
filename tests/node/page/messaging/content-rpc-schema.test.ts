import { describe, expect, it } from 'vitest';

import {
  contentRpcRequestSchema,
  contentRpcSuccessSchema
} from '../../../../src/page/messaging/content-rpc.schema';

describe('content RPC schema', () => {
  it('accepts iframe read requests', () => {
    expect(
      contentRpcRequestSchema.parse({
        type: 'BH_IFRAME_READ',
        frameId: 7,
        refId: 'ref_102'
      })
    ).toMatchObject({
      type: 'BH_IFRAME_READ',
      frameId: 7,
      refId: 'ref_102'
    });
  });

  it('accepts iframe click requests', () => {
    expect(
      contentRpcRequestSchema.parse({
        type: 'BH_IFRAME_CLICK',
        frameId: 7,
        refId: 'ref_200'
      })
    ).toMatchObject({
      type: 'BH_IFRAME_CLICK'
    });
  });

  it('accepts iframe type requests with masked value preview', () => {
    expect(
      contentRpcRequestSchema.parse({
        type: 'BH_IFRAME_TYPE',
        frameId: 7,
        refId: 'ref_103',
        text: 'secret',
        valuePreview: {
          masked: true,
          preview: '••••••',
          reason: 'password'
        }
      })
    ).toMatchObject({
      type: 'BH_IFRAME_TYPE',
      valuePreview: {
        masked: true
      }
    });
  });

  it('accepts iframe action success responses', () => {
    expect(
      contentRpcSuccessSchema.parse({
        ok: true,
        ref: {
          refId: 'ref_103',
          role: 'textbox',
          name: '密码',
          tagName: 'input',
          visible: true,
          disabled: false
        },
        changedPage: true
      })
    ).toMatchObject({
      ok: true,
      changedPage: true
    });
  });
});
