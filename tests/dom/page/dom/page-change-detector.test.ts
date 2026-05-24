// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';

import { detectPageChange } from '../../../../src/page/dom/page-change-detector';

describe('page-change-detector', () => {
  it('does not require observe when page metadata is unchanged', () => {
    expect(
      detectPageChange({
        previous: {
          url: 'https://demo.example.com/form',
          origin: 'https://demo.example.com',
          title: 'Form'
        },
        current: {
          url: 'https://demo.example.com/form',
          origin: 'https://demo.example.com',
          title: 'Form'
        }
      })
    ).toMatchObject({
      changedPage: false,
      requiresObserve: false
    });
  });

  it('requires observe when URL changes', () => {
    expect(
      detectPageChange({
        previous: {
          url: 'https://demo.example.com/form',
          origin: 'https://demo.example.com',
          title: 'Form'
        },
        current: {
          url: 'https://demo.example.com/next',
          origin: 'https://demo.example.com',
          title: 'Form'
        }
      })
    ).toMatchObject({
      changedPage: true,
      requiresObserve: true,
      reason: 'Page URL changed'
    });
  });

  it('requires observe when origin changes', () => {
    expect(
      detectPageChange({
        previous: {
          url: 'https://demo.example.com/form',
          origin: 'https://demo.example.com',
          title: 'Form'
        },
        current: {
          url: 'https://other.example/form',
          origin: 'https://other.example',
          title: 'Form'
        }
      })
    ).toMatchObject({
      changedPage: true,
      requiresObserve: true,
      reason: 'Page origin changed'
    });
  });

  it('requires observe when frame URL changes', () => {
    expect(
      detectPageChange({
        previous: {
          url: 'https://demo.example.com/form',
          origin: 'https://demo.example.com',
          title: 'Form',
          frameUrl: 'https://frame.example.com/a'
        },
        current: {
          url: 'https://demo.example.com/form',
          origin: 'https://demo.example.com',
          title: 'Form',
          frameUrl: 'https://frame.example.com/b'
        }
      })
    ).toMatchObject({
      changedPage: true,
      requiresObserve: true,
      reason: 'Frame URL changed'
    });
  });

  it('requires observe when target frame is no longer reachable', () => {
    expect(
      detectPageChange({
        previous: {
          url: 'https://demo.example.com/form',
          origin: 'https://demo.example.com',
          title: 'Form',
          frameReachable: true
        },
        current: {
          url: 'https://demo.example.com/form',
          origin: 'https://demo.example.com',
          title: 'Form',
          frameReachable: false
        }
      })
    ).toMatchObject({
      changedPage: true,
      requiresObserve: true,
      reason: 'Frame is no longer reachable'
    });
  });
});
