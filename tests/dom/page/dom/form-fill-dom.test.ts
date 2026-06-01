// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import { Window } from 'happy-dom';

import {
  readWritabilityMeta,
  setFieldText,
  setContentEditableText,
  setSelectOption,
  setRadioChecked,
  setCheckboxState,
  fillSingleField,
  fillManyFields,
  verifyForm,
  executeSubmit,
  observeSubmitResult,
  detectSyntheticForm,
} from '../../../../src/page/dom/form-fill-dom';
import { RefMap } from '../../../../src/page/a11y/ref-map';

function createRefMap(): RefMap {
  return new RefMap({ tabId: 1, documentId: 'doc-1', origin: 'https://demo.example.com' });
}

let document: Document;
let refMap: RefMap;

function setupPage(html: string) {
  const win = new Window({ url: 'https://demo.example.com/test' });
  win.document.body.innerHTML = html;
  document = win.document as unknown as Document;
  refMap = createRefMap();
}

function reg(el: Element, opts: { role?: string; name?: string; tagName?: string; visible?: boolean; disabled?: boolean } = {}) {
  return refMap.register(el, {
    role: opts.role ?? 'textbox',
    name: opts.name ?? el.getAttribute('name') ?? 'field',
    tagName: opts.tagName ?? el.tagName.toLowerCase(),
    visible: opts.visible ?? true,
    disabled: opts.disabled ?? false,
  }).refId;
}

describe('readWritabilityMeta', () => {
  it('text input returns writable meta', () => {
    setupPage('<input type="text" value="hello">');
    const meta = readWritabilityMeta(document.querySelector('input')!);
    expect(meta).toBeDefined();
    expect(meta!.visible).toBe(true);
    expect(meta!.readonly).toBe(false);
    expect(meta!.hidden).toBe(false);
    expect(meta!.isFileUpload).toBe(false);
    expect(meta!.honeypotCandidate).toBe(false);
    expect(meta!.actualValue).toBe('hello');
  });

  it('detects readonly', () => {
    setupPage('<input type="text" readonly>');
    const meta = readWritabilityMeta(document.querySelector('input')!);
    expect(meta!.readonly).toBe(true);
  });

  it('detects hidden type', () => {
    setupPage('<input type="hidden">');
    const meta = readWritabilityMeta(document.querySelector('input')!);
    expect(meta!.hidden).toBe(true);
  });

  it('detects file upload', () => {
    setupPage('<input type="file">');
    const meta = readWritabilityMeta(document.querySelector('input')!);
    expect(meta!.isFileUpload).toBe(true);
  });

  it('detects contenteditable', () => {
    setupPage('<div contenteditable="true">hello</div>');
    const meta = readWritabilityMeta(document.querySelector('div')!);
    expect(meta!.isContentEditable).toBe(true);
    expect(meta!.actualValue).toBe('hello');
  });

  it('select with options', () => {
    setupPage('<select><option value="a" selected>A</option><option value="b">B</option></select>');
    const meta = readWritabilityMeta(document.querySelector('select')!);
    expect(meta!.actualTagName).toBe('select');
    expect(meta!.actualValue).toBe('a');
    expect(meta!.options).toHaveLength(2);
    expect(meta!.options![0]!.selected).toBe(true);
  });

  it('checkbox state', () => {
    setupPage('<input type="checkbox" checked>');
    const meta = readWritabilityMeta(document.querySelector('input')!);
    expect(meta!.checked).toBe(true);
  });

  it('honeypot by aria-hidden', () => {
    setupPage('<input type="text" aria-hidden="true">');
    const meta = readWritabilityMeta(document.querySelector('input')!);
    expect(meta!.honeypotCandidate).toBe(true);
  });

  it('honeypot by name pattern', () => {
    setupPage('<input type="text" name="hpot_field">');
    const meta = readWritabilityMeta(document.querySelector('input')!);
    expect(meta!.honeypotCandidate).toBe(true);
  });

  it('non-form div returns undefined', () => {
    setupPage('<div>not a field</div>');
    expect(readWritabilityMeta(document.querySelector('div')! as HTMLElement)).toBeUndefined();
  });
});

describe('setFieldText', () => {
  it('sets input value and dispatches events', () => {
    setupPage('<input type="text">');
    const el = document.querySelector('input')!;
    const events: string[] = [];
    ['input', 'change', 'blur'].forEach(n => el.addEventListener(n, () => events.push(n)));
    setFieldText(el, 'hello');
    expect((el).value).toBe('hello');
    expect(events).toContain('input');
    expect(events).toContain('change');
    expect(events).toContain('blur');
  });

  it('sets textarea value', () => {
    setupPage('<textarea></textarea>');
    const el = document.querySelector('textarea')!;
    setFieldText(el, 'multi\nline');
    expect(el.value).toBe('multi\nline');
  });
});

describe('setContentEditableText', () => {
  it('sets contenteditable text', () => {
    setupPage('<div contenteditable="true"></div>');
    const el = document.querySelector('div')! as HTMLElement;
    setContentEditableText(el, 'text');
    expect(el.textContent).toBe('text');
  });
});

describe('setSelectOption', () => {
  it('selects option by value', () => {
    setupPage('<select><option value="a">A</option><option value="b">B</option></select>');
    const el = document.querySelector('select')!;
    expect(setSelectOption(el, 'b')).toBe(true);
    expect(el.value).toBe('b');
  });

  it('selects option by visible label', () => {
    setupPage('<select><option value="CHN">中国</option><option value="USA">美国</option></select>');
    const el = document.querySelector('select')!;
    expect(setSelectOption(el, '美国')).toBe(true);
    expect(el.value).toBe('USA');
  });

  it('returns false for unknown value', () => {
    setupPage('<select><option value="a">A</option></select>');
    expect(setSelectOption(document.querySelector('select')!, 'missing')).toBe(false);
  });
});

describe('setCheckboxState', () => {
  it('checks checkbox', () => {
    setupPage('<input type="checkbox">');
    const el = document.querySelector('input')!;
    setCheckboxState(el, true);
    expect(el.checked).toBe(true);
  });

  it('unchecks checkbox', () => {
    setupPage('<input type="checkbox" checked>');
    const el = document.querySelector('input')!;
    setCheckboxState(el, false);
    expect(el.checked).toBe(false);
  });
});

describe('setRadioChecked', () => {
  it('selects radio by value', () => {
    setupPage('<input type="radio" name="color" value="red"><input type="radio" name="color" value="blue">');
    const red = document.querySelector('input[value="red"]') as HTMLInputElement;
    setRadioChecked(red, 'blue');
    const blue = document.querySelector('input[value="blue"]') as HTMLInputElement;
    expect(blue.checked).toBe(true);
  });
});

describe('fillSingleField', () => {
  it('fills text input', () => {
    setupPage('<input type="text">');
    const refId = reg(document.querySelector('input')!, { name: 'q' });
    const r = fillSingleField(document, refMap, { fieldRefId: refId, value: 'test' });
    expect(r.status).toBe('filled');
    expect(r.requestedValue).toBeUndefined();
    expect(r.actualValuePreview).toBe('non-empty');
    expect(r.maskedActualValue).toBe('[MASKED]');
  });

  it('skips disabled field', () => {
    setupPage('<input type="text" disabled>');
    const refId = reg(document.querySelector('input')!, { name: 'q', disabled: true });
    const r = fillSingleField(document, refMap, { fieldRefId: refId, value: 'x' });
    expect(r.status).toBe('skipped');
    expect(r.skipReason).toContain('\u7981\u7528');
  });

  it('skips password field', () => {
    setupPage('<input type="password" name="q">');
    const refId = reg(document.querySelector('input')!, { name: 'q' });
    const r = fillSingleField(document, refMap, { fieldRefId: refId, value: 's' });
    expect(r.status).toBe('skipped');
  });

  it('skips file upload', () => {
    setupPage('<input type="file" name="q">');
    const refId = reg(document.querySelector('input')!, { role: 'button', name: 'q' });
    const r = fillSingleField(document, refMap, { fieldRefId: refId, value: 'f' });
    expect(r.status).toBe('skipped');
    expect(r.skipReason).toContain('\u6587\u4EF6\u4E0A\u4F20');
  });

  it('stale ref returns failed', () => {
    setupPage('<input type="text">');
    const r = fillSingleField(document, refMap, { fieldRefId: 'ref_nonexistent', value: 'x' });
    expect(r.status).toBe('failed');
    expect(r.error).toContain('\u5931\u6548');
  });

  it('fills select', () => {
    setupPage('<select><option value="a">A</option><option value="b">B</option></select>');
    const refId = reg(document.querySelector('select')!, { role: 'combobox', tagName: 'select', name: 'q' });
    const r = fillSingleField(document, refMap, { fieldRefId: refId, value: 'b' });
    expect(r.status).toBe('filled');
    expect(r.actualValuePreview).toBe('non-empty');
  });

  it('fills checkbox', () => {
    setupPage('<input type="checkbox" name="q">');
    const refId = reg(document.querySelector('input')!, { role: 'checkbox', name: 'q' });
    const r = fillSingleField(document, refMap, { fieldRefId: refId, value: 'true' });
    expect(r.status).toBe('filled');
    expect((document.querySelector('input')!).checked).toBe(true);
  });

  it('fills visually hidden checkbox when it has a visible label', () => {
    setupPage('<label><input type="checkbox" name="updates" style="opacity: 0" checked>接收营销内容</label>');
    const refId = reg(document.querySelector('input')!, { role: 'checkbox', name: '接收营销内容' });
    const r = fillSingleField(document, refMap, { fieldRefId: refId, value: 'false' });
    expect(r.status).toBe('filled');
    expect((document.querySelector('input')!).checked).toBe(false);
  });

  it('fills textarea', () => {
    setupPage('<textarea name="q"></textarea>');
    const refId = reg(document.querySelector('textarea')!, { tagName: 'textarea', name: 'q' });
    const r = fillSingleField(document, refMap, { fieldRefId: refId, value: 'hello' });
    expect(r.status).toBe('filled');
    expect((document.querySelector('textarea')!).value).toBe('hello');
  });

  it('fills number input', () => {
    setupPage('<input type="number" name="q">');
    const refId = reg(document.querySelector('input')!, { role: 'spinbutton', name: 'q' });
    const r = fillSingleField(document, refMap, { fieldRefId: refId, value: '25' });
    expect(r.status).toBe('filled');
  });

  it('clears field', () => {
    setupPage('<input type="text" value="old" name="q">');
    const refId = reg(document.querySelector('input')!, { name: 'q' });
    const r = fillSingleField(document, refMap, { fieldRefId: refId, value: '', clear: true });
    expect(r.status).toBe('cleared');
  });

  it('fills field after clear is requested with a replacement value', () => {
    setupPage('<input type="text" value="old" name="q">');
    const refId = reg(document.querySelector('input')!, { name: 'q' });
    const r = fillSingleField(document, refMap, { fieldRefId: refId, value: 'new', clear: true });
    expect(r.status).toBe('filled');
    expect((document.querySelector('input')!).value).toBe('new');
  });
});

describe('fillManyFields', () => {
  it('batch fills multiple fields', () => {
    setupPage('<input type="text" id="a"><input type="text" id="b">');
    const ra = reg(document.querySelector('#a')!, { name: 'a' });
    const rb = reg(document.querySelector('#b')!, { name: 'b' });
    const r = fillManyFields(document, refMap, [
      { fieldRefId: ra, value: 'Alice' },
      { fieldRefId: rb, value: 'Bob' },
    ]);
    expect(r.filledCount).toBe(2);
    expect(r.failedCount).toBe(0);
    expect(r.summary).toContain('\u6210\u529F');
  });

  it('partial skip', () => {
    setupPage('<input type="text" id="a"><input type="file" id="f">');
    const ra = reg(document.querySelector('#a')!, { name: 'a' });
    const rf = reg(document.querySelector('#f')!, { role: 'button', name: 'f' });
    const r = fillManyFields(document, refMap, [
      { fieldRefId: ra, value: 'Alice' },
      { fieldRefId: rf, value: 'file' },
    ]);
    expect(r.filledCount).toBe(1);
    expect(r.skippedCount).toBe(1);
    expect(r.failedCount).toBe(0);
  });
});

describe('verifyForm', () => {
  it('verifies valid required field', () => {
    setupPage('<input type="text" required value="hello" name="q"><button type="submit">Go</button>');
    const el = document.querySelector('input')! as HTMLElement;
    const refId = reg(el, { name: 'q' });
    const fieldMap = new Map<string, HTMLElement>([[refId, el]]);
    const r = verifyForm(document, fieldMap);
    expect(r.fieldResults[0]!.filled).toBe(true);
    expect(r.missingRequired).toHaveLength(0);
    expect(r.submitAvailable).toBe(true);
  });

  it('detects missing required', () => {
    setupPage('<input type="text" required name="q">');
    const el = document.querySelector('input')! as HTMLElement;
    const refId = reg(el, { name: 'q' });
    const fieldMap = new Map<string, HTMLElement>([[refId, el]]);
    const r = verifyForm(document, fieldMap);
    expect(r.missingRequired).toHaveLength(1);
  });

  it('detects visible error text', () => {
    setupPage('<input type="text" value="bad" name="q"><div role="alert" class="error">Invalid field</div>');
    const el = document.querySelector('input')! as HTMLElement;
    const refId = reg(el, { name: 'q' });
    const fieldMap = new Map<string, HTMLElement>([[refId, el]]);
    const r = verifyForm(document, fieldMap);
    expect(r.visibleErrorText).toContain('Invalid field');
  });

  it('optional field passes verify', () => {
    setupPage('<input type="text" name="q">');
    const el = document.querySelector('input')! as HTMLElement;
    const refId = reg(el, { name: 'q' });
    const fieldMap = new Map<string, HTMLElement>([[refId, el]]);
    const r = verifyForm(document, fieldMap);
    expect(r.fieldResults[0]!.valid).toBe(true);
    expect(r.fieldResults[0]!.required).toBe(false);
  });

  it('does not return raw field values in verify result previews', () => {
    setupPage('<input type="email" name="email" value="counter@example.com">');
    const el = document.querySelector('input')! as HTMLElement;
    const refId = reg(el, { name: 'email' });
    const fieldMap = new Map<string, HTMLElement>([[refId, el]]);

    const r = verifyForm(document, fieldMap);

    expect(r.fieldResults[0]!.actualValuePreview).toBe('non-empty');
    expect(r.fieldResults[0]!.maskedActualValue).toBe('[MASKED]');
    expect(JSON.stringify(r)).not.toContain('counter@example.com');
  });
});

describe('executeSubmit', () => {
  it('clicks submit button by ref', () => {
    setupPage('<button type="submit">Go</button>');
    const btn = document.querySelector('button')! as HTMLElement;
    const refId = reg(btn, { role: 'button', tagName: 'button', name: 'submit' });
    let clicked = false;
    btn.addEventListener('click', () => { clicked = true; });
    expect(executeSubmit(document, refMap, refId)).toBe('submitted');
    expect(clicked).toBe(true);
  });

  it('does not click disabled submit button by ref', () => {
    setupPage('<button type="submit" disabled>Go</button>');
    const btn = document.querySelector('button')! as HTMLElement;
    const refId = reg(btn, { role: 'button', tagName: 'button', name: 'submit' });
    let clicked = false;
    btn.addEventListener('click', () => { clicked = true; });

    expect(executeSubmit(document, refMap, refId)).toBe('no_submit_path');
    expect(clicked).toBe(false);
  });

  it('auto-finds submit button', () => {
    setupPage('<button type="submit">Go</button>');
    let clicked = false;
    document.querySelector('button')!.addEventListener('click', () => { clicked = true; });
    expect(executeSubmit(document, refMap)).toBe('submitted');
    expect(clicked).toBe(true);
  });

  it('returns no_submit_path with no submit', () => {
    setupPage('<input type="text">');
    expect(executeSubmit(document, refMap)).toBe('no_submit_path');
  });
});

describe('observeSubmitResult', () => {
  it('returns unknown when URL unchanged', () => {
    setupPage('<p>content</p>');
    const r = observeSubmitResult(document, 'https://demo.example.com/test');
    expect(r.outcome).toBe('unknown');
  });

  it('detects error text on page', () => {
    setupPage('<div role="alert" class="error">Invalid credentials</div>');
    const r = observeSubmitResult(document, 'https://demo.example.com/test');
    expect(r.outcome).toBe('failure');
    expect(r.evidence.visibleErrors).toBeDefined();
  });
});

describe('detectSyntheticForm', () => {
  it('returns undefined with native form', () => {
    setupPage('<form><input type="text"><button type="submit">Go</button></form>');
    expect(detectSyntheticForm(document, refMap)).toBeUndefined();
  });

  it('creates synthetic form without native form', () => {
    setupPage('<input type="text" id="q"><button>Search</button>');
    const r = detectSyntheticForm(document, refMap);
    expect(r).toBeDefined();
    expect(r!.hasNativeForm).toBe(false);
    expect(r!.fieldRefIds.length).toBeGreaterThan(0);
  });

  it('returns undefined with no visible fields', () => {
    setupPage('<button>Submit</button>');
    expect(detectSyntheticForm(document, refMap)).toBeUndefined();
  });
});
