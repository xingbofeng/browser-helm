// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest';

import { ContentRpcHandler } from '../../../../src/page/messaging/content-rpc-handler';
import { CONTENT_RPC_MESSAGES } from '../../../../src/shared/constants/event-names';
import { ERROR_CODES } from '../../../../src/shared/constants/error-codes';

describe('content-rpc-handler iframe actions', () => {
  it('summarizes Web Storage without exposing sensitive values', () => {
    const storage = createTestStorage();
    Object.defineProperty(window, 'localStorage', { value: storage, configurable: true });
    storage.setItem('theme', 'dark');
    storage.setItem('authToken', 'secret-token-value');
    const handler = new ContentRpcHandler(document);

    const listResponse = handler.handle({
      type: CONTENT_RPC_MESSAGES.STORAGE_LIST,
      area: 'localStorage',
      limit: 10
    });
    if (!listResponse.ok || !('storageList' in listResponse)) {
      throw new Error('expected storage list');
    }
    expect(listResponse.storageList.area).toBe('localStorage');
    expect(listResponse.storageList.count).toBe(2);
    expect(listResponse.storageList.entries).toEqual(expect.arrayContaining([
      {
        area: 'localStorage',
        key: 'theme',
        valuePreview: 'dark',
        valueLength: 4,
        masked: false
      },
      {
        area: 'localStorage',
        key: 'authToken',
        valueLength: 18,
        masked: true,
        reason: 'sensitive_storage_key'
      }
    ]));

    const getResponse = handler.handle({
      type: CONTENT_RPC_MESSAGES.STORAGE_GET,
      area: 'localStorage',
      key: 'authToken'
    });
    expect(JSON.stringify(getResponse)).not.toContain('secret-token-value');
  });

  it('mutates Web Storage only through explicit storage mutation RPCs', () => {
    const storage = createTestStorage();
    Object.defineProperty(window, 'sessionStorage', { value: storage, configurable: true });
    storage.setItem('wizardStep', 'shipping');
    const handler = new ContentRpcHandler(document);

    const setResponse = handler.handle({
      type: CONTENT_RPC_MESSAGES.STORAGE_SET,
      area: 'sessionStorage',
      key: 'wizardStep',
      value: 'billing'
    });
    expect(setResponse).toMatchObject({
      ok: true,
      storageMutation: {
        area: 'sessionStorage',
        operation: 'set',
        key: 'wizardStep',
        changed: true
      }
    });
    expect(storage.getItem('wizardStep')).toBe('billing');

    const deleteResponse = handler.handle({
      type: CONTENT_RPC_MESSAGES.STORAGE_DELETE,
      area: 'sessionStorage',
      key: 'wizardStep'
    });
    expect(deleteResponse).toMatchObject({
      ok: true,
      storageMutation: {
        area: 'sessionStorage',
        operation: 'delete',
        key: 'wizardStep',
        changed: true
      }
    });
    expect(storage.getItem('wizardStep')).toBeNull();

    storage.setItem('draft', 'one');
    storage.setItem('theme', 'dark');
    const clearResponse = handler.handle({
      type: CONTENT_RPC_MESSAGES.STORAGE_CLEAR,
      area: 'sessionStorage'
    });
    expect(clearResponse).toMatchObject({
      ok: true,
      storageMutation: {
        area: 'sessionStorage',
        operation: 'clear',
        changed: true,
        affectedCount: 2
      }
    });
    expect(storage.length).toBe(0);
  });

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
      value: 'Alice',
      runId: 'run_1',
      stepId: 'run_1:fill'
    })).toMatchObject({
      ok: false,
      code: ERROR_CODES.FORM_ACTION_UNAUTHORIZED
    });

    const grant = handler.handle({
      type: CONTENT_RPC_MESSAGES.FORM_ACTION_AUTHORIZE,
      action: 'fill',
      fieldRefIds: [fieldRefId],
      runId: 'run_1',
      stepId: 'run_1:fill'
    });
    if (!grant.ok || !('actionToken' in grant)) {
      throw new Error('expected form action token');
    }

    expect(handler.handle({
      type: CONTENT_RPC_MESSAGES.FORM_FILL_FIELD,
      fieldRefId,
      value: 'Alice',
      actionToken: grant.actionToken,
      runId: 'run_1',
      stepId: 'run_1:fill'
    })).toMatchObject({
      ok: true
    });
    expect((document.getElementById('name') as HTMLInputElement).value).toBe('Alice');
    expect(handler.handle({
      type: CONTENT_RPC_MESSAGES.FORM_FILL_FIELD,
      fieldRefId,
      value: 'Bob',
      actionToken: grant.actionToken,
      runId: 'run_1',
      stepId: 'run_1:fill'
    })).toMatchObject({
      ok: false,
      code: ERROR_CODES.FORM_ACTION_UNAUTHORIZED
    });
  });

  it('keeps form action grants valid if a dynamic page recreates the content handler before fill', () => {
    document.body.innerHTML = '<input id="name" name="name" type="text" />';
    const authorizingHandler = new ContentRpcHandler(document);
    const snapshot = authorizingHandler.handle({ type: CONTENT_RPC_MESSAGES.A11Y_SNAPSHOT });
    if (!snapshot.ok || !('snapshot' in snapshot)) {
      throw new Error('expected snapshot');
    }
    const fieldRefId = snapshot.snapshot.elements.find(
      (element) => element.tagName === 'input'
    )?.refId ?? '';
    const grant = authorizingHandler.handle({
      type: CONTENT_RPC_MESSAGES.FORM_ACTION_AUTHORIZE,
      action: 'fill',
      fieldRefIds: [fieldRefId],
      runId: 'run_1',
      stepId: 'run_1:fill'
    });
    if (!grant.ok || !('actionToken' in grant)) {
      throw new Error('expected form action token');
    }

    const recreatedHandler = new ContentRpcHandler(document);
    expect(recreatedHandler.handle({
      type: CONTENT_RPC_MESSAGES.FORM_FILL_FIELD,
      fieldRefId,
      value: 'Alice',
      actionToken: grant.actionToken,
      runId: 'run_1',
      stepId: 'run_1:fill'
    })).toMatchObject({
      ok: true
    });
    expect((document.getElementById('name') as HTMLInputElement).value).toBe('Alice');
    expect(recreatedHandler.handle({
      type: CONTENT_RPC_MESSAGES.FORM_FILL_FIELD,
      fieldRefId,
      value: 'Bob',
      actionToken: grant.actionToken,
      runId: 'run_1',
      stepId: 'run_1:fill'
    })).toMatchObject({
      ok: false,
      code: ERROR_CODES.FORM_ACTION_UNAUTHORIZED
    });
  });

  it('returns REF_STALE when an authorized form fill target is removed before mutation', () => {
    document.body.innerHTML = '<input id="name" name="name" type="text" />';
    const handler = new ContentRpcHandler(document, 'en');
    const snapshot = handler.handle({ type: CONTENT_RPC_MESSAGES.A11Y_SNAPSHOT });
    if (!snapshot.ok || !('snapshot' in snapshot)) {
      throw new Error('expected snapshot');
    }
    const fieldRefId = snapshot.snapshot.elements.find(
      (element) => element.tagName === 'input'
    )?.refId ?? '';
    const grant = handler.handle({
      type: CONTENT_RPC_MESSAGES.FORM_ACTION_AUTHORIZE,
      action: 'fill',
      fieldRefIds: [fieldRefId],
      runId: 'run_1',
      stepId: 'run_1:fill'
    });
    if (!grant.ok || !('actionToken' in grant)) {
      throw new Error('expected form action token');
    }

    document.getElementById('name')?.remove();

    expect(handler.handle({
      type: CONTENT_RPC_MESSAGES.FORM_FILL_FIELD,
      fieldRefId,
      value: 'Alice',
      actionToken: grant.actionToken,
      runId: 'run_1',
      stepId: 'run_1:fill'
    })).toMatchObject({
      ok: false,
      code: ERROR_CODES.REF_STALE
    });
  });

  it('rebinds a stale form field ref to the refreshed field with the same accessible name', () => {
    document.body.innerHTML = '<label for="search">Search</label><input id="search" name="search_query" type="text" />';
    const handler = new ContentRpcHandler(document);
    const snapshot = handler.handle({ type: CONTENT_RPC_MESSAGES.A11Y_SNAPSHOT });
    if (!snapshot.ok || !('snapshot' in snapshot)) {
      throw new Error('expected snapshot');
    }
    const fieldRefId = snapshot.snapshot.elements.find(
      (element) => element.tagName === 'input'
    )?.refId ?? '';
    const grant = handler.handle({
      type: CONTENT_RPC_MESSAGES.FORM_ACTION_AUTHORIZE,
      action: 'fill',
      fieldRefIds: [fieldRefId],
      runId: 'run_1',
      stepId: 'run_1:fill'
    });
    if (!grant.ok || !('actionToken' in grant)) {
      throw new Error('expected form action token');
    }

    const oldInput = document.getElementById('search')!;
    oldInput.replaceWith(oldInput.cloneNode());

    expect(handler.handle({
      type: CONTENT_RPC_MESSAGES.FORM_FILL_FIELD,
      fieldRefId,
      value: 'keyboard accessibility tutorial',
      actionToken: grant.actionToken,
      runId: 'run_1',
      stepId: 'run_1:fill'
    })).toMatchObject({
      ok: true
    });
    expect((document.getElementById('search') as HTMLInputElement).value).toBe('keyboard accessibility tutorial');
  });

  it('rebinds a stale form field ref to the only refreshed field when the label changed', () => {
    document.body.innerHTML = '<button type="button">Menu</button><label><input id="old-consent" name="old" type="checkbox" />Subscribe</label>';
    const handler = new ContentRpcHandler(document);
    const snapshot = handler.handle({ type: CONTENT_RPC_MESSAGES.A11Y_SNAPSHOT });
    if (!snapshot.ok || !('snapshot' in snapshot)) {
      throw new Error('expected snapshot');
    }
    const fieldRefId = snapshot.snapshot.elements.find(
      (element) => element.tagName === 'input'
    )?.refId ?? '';
    const grant = handler.handle({
      type: CONTENT_RPC_MESSAGES.FORM_ACTION_AUTHORIZE,
      action: 'fill',
      fieldRefIds: [fieldRefId],
      runId: 'run_1',
      stepId: 'run_1:fill'
    });
    if (!grant.ok || !('actionToken' in grant)) {
      throw new Error('expected form action token');
    }

    document.body.innerHTML = '<label><input id="new-consent" name="new" type="checkbox" />Agree</label>';

    expect(handler.handle({
      type: CONTENT_RPC_MESSAGES.FORM_FILL_FIELD,
      fieldRefId,
      value: 'true',
      actionToken: grant.actionToken,
      runId: 'run_1',
      stepId: 'run_1:fill'
    })).toMatchObject({
      ok: true
    });
    expect((document.getElementById('new-consent') as HTMLInputElement).checked).toBe(true);
  });

  it('rejects submit tokens that are not bound to a submit target or form', () => {
    document.body.innerHTML = `
      <form>
        <input id="email" name="email" value="counter@example.com" />
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

    const grant = handler.handle({
      type: CONTENT_RPC_MESSAGES.FORM_ACTION_AUTHORIZE,
      action: 'submit',
      fieldRefIds: [fieldRefId],
      runId: 'run_1',
      stepId: 'run_1:submit'
    });
    if (!grant.ok || !('actionToken' in grant)) {
      throw new Error('expected form action token');
    }

    expect(handler.handle({
      type: CONTENT_RPC_MESSAGES.FORM_EXECUTE_SUBMIT,
      actionToken: grant.actionToken,
      runId: 'run_1',
      stepId: 'run_1:submit'
    })).toMatchObject({
      ok: false,
      code: ERROR_CODES.FORM_ACTION_UNAUTHORIZED
    });
  });

  it('scopes formRef-only submit fallback to the approved field form', () => {
    document.body.innerHTML = `
      <form id="first">
        <button id="first-submit" type="submit">Submit first</button>
      </form>
      <form id="approved">
        <label for="email">Email</label>
        <input id="email" name="email" value="counter@example.com" />
        <button id="approved-submit" type="submit">Submit approved</button>
      </form>
    `;
    const firstSubmit = vi.fn();
    const approvedSubmit = vi.fn();
    document.getElementById('first-submit')?.addEventListener('click', firstSubmit);
    document.getElementById('approved-submit')?.addEventListener('click', approvedSubmit);
    const handler = new ContentRpcHandler(document);
    const snapshot = handler.handle({ type: CONTENT_RPC_MESSAGES.A11Y_SNAPSHOT });
    if (!snapshot.ok || !('snapshot' in snapshot)) {
      throw new Error('expected snapshot');
    }
    const fieldRefId = snapshot.snapshot.elements.find(
      (element) => element.tagName === 'input'
    )?.refId ?? '';

    const grant = handler.handle({
      type: CONTENT_RPC_MESSAGES.FORM_ACTION_AUTHORIZE,
      action: 'submit',
      fieldRefIds: [fieldRefId],
      formRefId: 'approved-form',
      runId: 'run_1',
      stepId: 'run_1:submit'
    });
    if (!grant.ok || !('actionToken' in grant)) {
      throw new Error('expected form action token');
    }

    expect(handler.handle({
      type: CONTENT_RPC_MESSAGES.FORM_EXECUTE_SUBMIT,
      formRefId: 'approved-form',
      actionToken: grant.actionToken,
      runId: 'run_1',
      stepId: 'run_1:submit'
    })).toMatchObject({ ok: true });
    expect(firstSubmit).not.toHaveBeenCalled();
    expect(approvedSubmit).toHaveBeenCalledTimes(1);
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
      type: 'BH_IFRAME_ACTION_AUTHORIZE',
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
        type: 'BH_IFRAME_CLICK',
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
      type: 'BH_IFRAME_ACTION_AUTHORIZE',
      frameId: 4,
      refId: inputRef,
      action: 'type'
    });
    if (!typeGrant.ok || !('actionToken' in typeGrant)) {
      throw new Error('expected iframe type action token');
    }
    expect(
      handler.handle({
        type: 'BH_IFRAME_TYPE',
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
      behavior: 'auto'
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
        type: 'BH_IFRAME_CLICK',
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
        type: 'BH_IFRAME_TYPE',
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
      type: 'BH_IFRAME_ACTION_AUTHORIZE',
      frameId: 4,
      refId: buttonRef,
      action: 'click'
    });
    if (!grant.ok || !('actionToken' in grant)) {
      throw new Error('expected iframe action token');
    }

    expect(
      handler.handle({
        type: 'BH_IFRAME_TYPE',
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
        type: 'BH_IFRAME_CLICK',
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
        type: 'BH_IFRAME_CLICK',
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
      type: 'BH_IFRAME_ACTION_AUTHORIZE',
      frameId: 4,
      refId: buttonRef,
      action: 'click'
    });
    if (!grant.ok || !('actionToken' in grant)) {
      throw new Error('expected iframe action token');
    }

    expect(
      handler.handle({
        type: 'BH_IFRAME_CLICK',
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
      type: 'BH_IFRAME_ACTION_AUTHORIZE',
      frameId: 4,
      refId: passwordRef,
      action: 'type'
    });
    if (!grant.ok || !('actionToken' in grant)) {
      throw new Error('expected iframe action token');
    }

    expect(
      handler.handle({
        type: 'BH_IFRAME_TYPE',
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

function createTestStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key: string) => data.get(key) ?? null,
    key: (index: number) => Array.from(data.keys())[index] ?? null,
    removeItem: (key: string) => {
      data.delete(key);
    },
    setItem: (key: string, value: string) => {
      data.set(key, value);
    }
  };
}
