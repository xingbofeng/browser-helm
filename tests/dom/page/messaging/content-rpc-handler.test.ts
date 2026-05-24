// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';

import { ContentRpcHandler } from '../../../../src/page/messaging/content-rpc-handler';
import { CONTENT_RPC_MESSAGES } from '../../../../src/shared/constants/event-names';
import { ERROR_CODES } from '../../../../src/shared/constants/error-codes';
import { IFRAME_ACTION_TOKEN } from '../../../../src/shared/constants/runtime-auth';

describe('content-rpc-handler iframe actions', () => {
  it('reads, clicks, and types iframe-routed targets inside the current frame', () => {
    document.body.innerHTML = `
      <button id="toggle" type="button">展开详情</button>
      <input id="email" name="email" type="email" />
      <script></script>
    `;
    let clicked = false;
    document.getElementById('toggle')?.addEventListener('click', () => {
      clicked = true;
    });
    const handler = new ContentRpcHandler(document);
    const snapshot = handler.handle({ type: CONTENT_RPC_MESSAGES.A11Y_SNAPSHOT });
    if (!snapshot.ok || !('snapshot' in snapshot)) {
      throw new Error('expected snapshot');
    }
    const buttonRef = snapshot.snapshot.elements.find(
      (element) => element.name === '展开详情'
    )?.refId;
    const inputRef = snapshot.snapshot.elements.find(
      (element) => element.tagName === 'input'
    )?.refId;

    expect(
      handler.handle({
        type: CONTENT_RPC_MESSAGES.IFRAME_READ,
        frameId: 4,
        refId: buttonRef
      })
    ).toMatchObject({
        ok: true,
        ref: {
          refId: buttonRef,
          name: '展开详情'
        }
      });
    expect(
      handler.handle({
        type: CONTENT_RPC_MESSAGES.IFRAME_CLICK,
        frameId: 4,
        refId: buttonRef,
        actionToken: IFRAME_ACTION_TOKEN
      })
    ).toMatchObject({
      ok: true,
      changedPage: true
    });
    expect(clicked).toBe(true);
    expect(
      handler.handle({
        type: CONTENT_RPC_MESSAGES.IFRAME_TYPE,
        frameId: 4,
        refId: inputRef,
        text: 'hello@example.com',
        actionToken: IFRAME_ACTION_TOKEN,
        valuePreview: {
          masked: false,
          preview: 'hello@example.com'
        }
      })
    ).toMatchObject({
      ok: true,
      changedPage: true
    });
    expect((document.getElementById('email') as HTMLInputElement).value).toBe(
      'hello@example.com'
    );
  });

  it('rejects direct mutating iframe RPC without the runtime action token', () => {
    document.body.innerHTML = `
      <button id="toggle" type="button">展开详情</button>
      <input id="email" name="email" type="email" />
    `;
    let clicked = false;
    document.getElementById('toggle')?.addEventListener('click', () => {
      clicked = true;
    });
    const handler = new ContentRpcHandler(document);
    const snapshot = handler.handle({ type: CONTENT_RPC_MESSAGES.A11Y_SNAPSHOT });
    if (!snapshot.ok || !('snapshot' in snapshot)) {
      throw new Error('expected snapshot');
    }
    const buttonRef = snapshot.snapshot.elements.find(
      (element) => element.name === '展开详情'
    )?.refId;
    const inputRef = snapshot.snapshot.elements.find(
      (element) => element.tagName === 'input'
    )?.refId;

    expect(
      handler.handle({
        type: CONTENT_RPC_MESSAGES.IFRAME_CLICK,
        frameId: 4,
        refId: buttonRef
      })
    ).toMatchObject({
      ok: false,
      code: ERROR_CODES.IFRAME_ACTION_UNAUTHORIZED
    });
    expect(clicked).toBe(false);

    expect(
      handler.handle({
        type: CONTENT_RPC_MESSAGES.IFRAME_TYPE,
        frameId: 4,
        refId: inputRef,
        text: 'hello@example.com',
        valuePreview: {
          masked: false,
          preview: 'hello@example.com'
        }
      })
    ).toMatchObject({
      ok: false,
      code: ERROR_CODES.IFRAME_ACTION_UNAUTHORIZED
    });
    expect((document.getElementById('email') as HTMLInputElement).value).toBe('');
  });
});
