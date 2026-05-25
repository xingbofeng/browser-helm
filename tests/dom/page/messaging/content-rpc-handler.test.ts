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
      <input id="company" name="company" type="text" />
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
        text: 'BrowserHelm',
        actionToken: IFRAME_ACTION_TOKEN,
        valuePreview: {
          masked: false,
          preview: 'non-empty'
        }
      })
    ).toMatchObject({
      ok: true,
      changedPage: true
    });
    expect((document.getElementById('company') as HTMLInputElement).value).toBe(
      'BrowserHelm'
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

  it('blocks tokened iframe click when readiness says the target is disabled', () => {
    document.body.innerHTML = `
      <button id="delete" type="button" disabled>删除账号</button>
    `;
    let clicked = false;
    document.getElementById('delete')?.addEventListener('click', () => {
      clicked = true;
    });
    const handler = new ContentRpcHandler(document);
    const snapshot = handler.handle({ type: CONTENT_RPC_MESSAGES.A11Y_SNAPSHOT });
    if (!snapshot.ok || !('snapshot' in snapshot)) {
      throw new Error('expected snapshot');
    }
    const buttonRef = snapshot.snapshot.elements.find(
      (element) => element.name === '删除账号'
    )?.refId;

    expect(
      handler.handle({
        type: CONTENT_RPC_MESSAGES.IFRAME_CLICK,
        frameId: 4,
        refId: buttonRef,
        actionToken: IFRAME_ACTION_TOKEN
      })
    ).toMatchObject({
      ok: false,
      code: ERROR_CODES.ELEMENT_DISABLED
    });
    expect(clicked).toBe(false);
  });

  it('blocks tokened iframe type when readiness says the target still requires approval', () => {
    document.body.innerHTML = `
      <label>Password <input id="password" type="password" autocomplete="current-password" /></label>
    `;
    const handler = new ContentRpcHandler(document);
    const snapshot = handler.handle({ type: CONTENT_RPC_MESSAGES.A11Y_SNAPSHOT });
    if (!snapshot.ok || !('snapshot' in snapshot)) {
      throw new Error('expected snapshot');
    }
    const passwordRef = snapshot.snapshot.elements.find(
      (element) => element.tagName === 'input'
    )?.refId;

    expect(
      handler.handle({
        type: CONTENT_RPC_MESSAGES.IFRAME_TYPE,
        frameId: 4,
        refId: passwordRef,
        text: 'super-secret',
        actionToken: IFRAME_ACTION_TOKEN,
        valuePreview: {
          masked: true,
          preview: '[MASKED]',
          reason: 'password'
        }
      })
    ).toMatchObject({
      ok: false,
      code: ERROR_CODES.APPROVAL_REQUIRED
    });
    expect((document.getElementById('password') as HTMLInputElement).value).toBe('');
  });
});
