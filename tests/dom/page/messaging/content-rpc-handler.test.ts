// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest';

import { ContentRpcHandler } from '../../../../src/page/messaging/content-rpc-handler';
import { CONTENT_RPC_MESSAGES } from '../../../../src/shared/constants/event-names';
import { ERROR_CODES } from '../../../../src/shared/constants/error-codes';

describe('content-rpc-handler iframe actions', () => {
  it('waits for a quiet DOM window before reporting page stability', async () => {
    document.body.innerHTML = '<div id="root"></div>';
    const handler = new ContentRpcHandler(document);
    const root = document.getElementById('root')!;
    setTimeout(() => {
      root.textContent = 'changed';
    }, 0);

    const response = await handler.handle({
      type: CONTENT_RPC_MESSAGES.PAGE_WAIT_UNTIL_STABLE,
      quietMs: 20
    });

    expect(response).toMatchObject({
      ok: true,
      stable: true,
      layoutStableFrames: 2,
      networkIdle: 'unavailable'
    });
    expect('waitedMs' in response && response.waitedMs).toBeGreaterThanOrEqual(20);
  });

  it('resolves submit ref when verifying a filled form', () => {
    document.body.innerHTML = `
      <form>
        <label for="email">Email</label>
        <input id="email" name="email" type="email" required value="counter@example.com" />
        <button id="submit" type="submit">Submit</button>
      </form>
    `;
    const handler = new ContentRpcHandler(document);
    const snapshot = handler.handle({ type: CONTENT_RPC_MESSAGES.A11Y_SNAPSHOT });
    if (!snapshot.ok || !('snapshot' in snapshot)) {
      throw new Error('expected snapshot');
    }
    const fieldRefId = snapshot.snapshot.elements.find(
      (element) => element.tagName === 'input'
    )?.refId ?? '';
    const submitRefId = snapshot.snapshot.elements.find(
      (element) => element.tagName === 'button'
    )?.refId ?? '';

    expect(
      handler.handle({
        type: CONTENT_RPC_MESSAGES.FORM_VERIFY,
        fieldRefIds: [fieldRefId ?? 'missing'],
        submitRefId
      })
    ).toMatchObject({
      ok: true,
      verifyResult: {
        status: 'pass',
        submitAvailable: true
      }
    });
  });

  it('requires a one-time form action token for form fill mutations', () => {
    document.body.innerHTML = '<input id="name" name="name" type="text" />';
    const handler = new ContentRpcHandler(document);
    const snapshot = handler.handle({ type: CONTENT_RPC_MESSAGES.A11Y_SNAPSHOT });
    if (!snapshot.ok || !('snapshot' in snapshot)) {
      throw new Error('expected snapshot');
    }
    const fieldRefId = snapshot.snapshot.elements.find(
      (element) => element.tagName === 'input'
    )?.refId ?? '';

    expect(handler.handle({
      type: CONTENT_RPC_MESSAGES.FORM_FILL_FIELD,
      fieldRefId,
      value: 'Alice'
    })).toMatchObject({
      ok: false,
      code: ERROR_CODES.FORM_ACTION_UNAUTHORIZED
    });

    const grant = handler.handle({
      type: CONTENT_RPC_MESSAGES.FORM_ACTION_AUTHORIZE,
      action: 'fill',
      fieldRefIds: [fieldRefId]
    });
    if (!grant.ok || !('actionToken' in grant)) {
      throw new Error('expected form action token');
    }

    expect(handler.handle({
      type: CONTENT_RPC_MESSAGES.FORM_FILL_FIELD,
      fieldRefId,
      value: 'Alice',
      actionToken: grant.actionToken
    })).toMatchObject({
      ok: true
    });
    expect((document.getElementById('name') as HTMLInputElement).value).toBe('Alice');
    expect(handler.handle({
      type: CONTENT_RPC_MESSAGES.FORM_FILL_FIELD,
      fieldRefId,
      value: 'Bob',
      actionToken: grant.actionToken
    })).toMatchObject({
      ok: false,
      code: ERROR_CODES.FORM_ACTION_UNAUTHORIZED
    });
  });

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
    )?.refId ?? '';
    const inputRef = snapshot.snapshot.elements.find(
      (element) => element.tagName === 'input'
    )?.refId ?? '';

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
    const clickGrant = handler.handle({
      type: CONTENT_RPC_MESSAGES.IFRAME_ACTION_AUTHORIZE,
      frameId: 4,
      refId: buttonRef,
      action: 'click'
    });
    if (!clickGrant.ok || !('actionToken' in clickGrant)) {
      throw new Error('expected iframe action token');
    }
    expect(clickGrant.actionToken).not.toBe('BH_RUNTIME_AUTHORIZED_IFRAME_ACTION');
    expect(
      handler.handle({
        type: CONTENT_RPC_MESSAGES.IFRAME_CLICK,
        frameId: 4,
        refId: buttonRef,
        actionToken: clickGrant.actionToken
      })
    ).toMatchObject({
      ok: true,
      changedPage: true
    });
    expect(clicked).toBe(true);
    const typeGrant = handler.handle({
      type: CONTENT_RPC_MESSAGES.IFRAME_ACTION_AUTHORIZE,
      frameId: 4,
      refId: inputRef,
      action: 'type'
    });
    if (!typeGrant.ok || !('actionToken' in typeGrant)) {
      throw new Error('expected iframe type action token');
    }
    expect(
      handler.handle({
        type: CONTENT_RPC_MESSAGES.IFRAME_TYPE,
        frameId: 4,
        refId: inputRef,
        text: 'BrowserHelm',
        actionToken: typeGrant.actionToken,
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

  it('scrolls and highlights a resolved ref without mutating page data', () => {
    document.body.innerHTML = `
      <button id="target" type="button">定位我</button>
    `;
    const target = document.getElementById('target');
    const scrollIntoView = vi.fn();
    if (!target) {
      throw new Error('expected target');
    }
    target.scrollIntoView = scrollIntoView;
    const handler = new ContentRpcHandler(document);
    const snapshot = handler.handle({ type: CONTENT_RPC_MESSAGES.A11Y_SNAPSHOT });
    if (!snapshot.ok || !('snapshot' in snapshot)) {
      throw new Error('expected snapshot');
    }
    const buttonRef = snapshot.snapshot.elements.find(
      (element) => element.name === '定位我'
    )?.refId ?? '';

    expect(
      handler.handle({
        type: CONTENT_RPC_MESSAGES.A11Y_HIGHLIGHT_REF,
        refId: buttonRef
      })
    ).toMatchObject({
      ok: true,
      changedPage: false,
      ref: {
        refId: buttonRef,
        name: '定位我'
      }
    });
    expect(scrollIntoView).toHaveBeenCalledWith({
      block: 'center',
      inline: 'center',
      behavior: 'smooth'
    });
    expect(target?.classList.contains('bh-page-ref-highlight')).toBe(true);
    expect(document.getElementById('browserhelm-ref-highlight-style')).toBeTruthy();
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
    )?.refId ?? '';
    const inputRef = snapshot.snapshot.elements.find(
      (element) => element.tagName === 'input'
    )?.refId ?? '';

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

  it('consumes iframe action tokens once and binds them to the authorized action', () => {
    document.body.innerHTML = `
      <button id="toggle" type="button">展开详情</button>
      <input id="company" name="company" type="text" />
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
    )?.refId ?? '';
    const inputRef = snapshot.snapshot.elements.find(
      (element) => element.tagName === 'input'
    )?.refId ?? '';
    const grant = handler.handle({
      type: CONTENT_RPC_MESSAGES.IFRAME_ACTION_AUTHORIZE,
      frameId: 4,
      refId: buttonRef,
      action: 'click'
    });
    if (!grant.ok || !('actionToken' in grant)) {
      throw new Error('expected iframe action token');
    }

    expect(
      handler.handle({
        type: CONTENT_RPC_MESSAGES.IFRAME_TYPE,
        frameId: 4,
        refId: inputRef,
        text: 'wrong action',
        actionToken: grant.actionToken,
        valuePreview: {
          masked: false,
          preview: 'wrong action'
        }
      })
    ).toMatchObject({
      ok: false,
      code: ERROR_CODES.IFRAME_ACTION_UNAUTHORIZED
    });
    expect((document.getElementById('company') as HTMLInputElement).value).toBe('');

    expect(
      handler.handle({
        type: CONTENT_RPC_MESSAGES.IFRAME_CLICK,
        frameId: 4,
        refId: buttonRef,
        actionToken: grant.actionToken
      })
    ).toMatchObject({
      ok: true,
      changedPage: true
    });
    expect(clicked).toBe(true);
    expect(
      handler.handle({
        type: CONTENT_RPC_MESSAGES.IFRAME_CLICK,
        frameId: 4,
        refId: buttonRef,
        actionToken: grant.actionToken
      })
    ).toMatchObject({
      ok: false,
      code: ERROR_CODES.IFRAME_ACTION_UNAUTHORIZED
    });
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
    )?.refId ?? '';
    const grant = handler.handle({
      type: CONTENT_RPC_MESSAGES.IFRAME_ACTION_AUTHORIZE,
      frameId: 4,
      refId: buttonRef,
      action: 'click'
    });
    if (!grant.ok || !('actionToken' in grant)) {
      throw new Error('expected iframe action token');
    }

    expect(
      handler.handle({
        type: CONTENT_RPC_MESSAGES.IFRAME_CLICK,
        frameId: 4,
        refId: buttonRef,
        actionToken: grant.actionToken
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
    )?.refId ?? '';
    const grant = handler.handle({
      type: CONTENT_RPC_MESSAGES.IFRAME_ACTION_AUTHORIZE,
      frameId: 4,
      refId: passwordRef,
      action: 'type'
    });
    if (!grant.ok || !('actionToken' in grant)) {
      throw new Error('expected iframe action token');
    }

    expect(
      handler.handle({
        type: CONTENT_RPC_MESSAGES.IFRAME_TYPE,
        frameId: 4,
        refId: passwordRef,
        text: 'super-secret',
        actionToken: grant.actionToken,
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
