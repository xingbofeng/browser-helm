(() => {
  const marker = '__BROWSER_HELM_PAGE_HEALTH_HOOK_INSTALLED__';
  const channel = 'BROWSER_HELM_PAGE_HEALTH_EVENT';
  const nonce = document.currentScript && document.currentScript.dataset
    ? document.currentScript.dataset.browserhelmPageHealthNonce
    : '';
  if (window[marker]) return;
  window[marker] = true;

  const post = (payload) => {
    if (!nonce) return;
    try {
      window.postMessage({ channel, nonce, ...payload }, window.location.origin);
    } catch {}
  };

  const text = (value) => {
    try {
      if (value instanceof Error) return value.message;
      if (typeof value === 'string') return value;
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  };

  const originalConsoleError = console.error;
  console.error = function browserHelmConsoleError(...args) {
    post({ kind: 'console_error', message: args.map(text).join(' '), source: 'console.error' });
    return originalConsoleError.apply(this, args);
  };

  for (const level of ['debug', 'info', 'log', 'warn']) {
    const original = console[level];
    if (typeof original !== 'function') continue;
    console[level] = function browserHelmConsoleMessage(...args) {
      post({
        kind: 'console_message',
        level,
        message: args.map(text).join(' '),
        source: 'console.' + level
      });
      return original.apply(this, args);
    };
  }

  window.addEventListener('error', (event) => {
    post({
      kind: 'console_error',
      message: event.message || text(event.error),
      source: event.filename || 'window.error'
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    post({ kind: 'console_error', message: text(event.reason), source: 'unhandledrejection' });
  });

  if (typeof window.fetch === 'function') {
    const originalFetch = window.fetch;
    window.fetch = async function browserHelmFetch(input, init) {
      const method = (init && init.method) || (input && input.method) || 'GET';
      const url = typeof input === 'string' ? input : (input && input.url) || String(input);
      try {
        const response = await originalFetch.apply(this, arguments);
        if (!response.ok) {
          post({
            kind: 'network_failure',
            url,
            method,
            status: response.status,
            errorText: response.statusText || 'HTTP error'
          });
        }
        return response;
      } catch (error) {
        post({ kind: 'network_failure', url, method, errorText: text(error) });
        throw error;
      }
    };
  }

  if (typeof window.XMLHttpRequest === 'function') {
    const OriginalXHR = window.XMLHttpRequest;
    window.XMLHttpRequest = function BrowserHelmXMLHttpRequest() {
      const xhr = new OriginalXHR();
      let method = 'GET';
      let url = '';
      const originalOpen = xhr.open;
      xhr.open = function browserHelmXhrOpen(nextMethod, nextUrl) {
        method = String(nextMethod || 'GET');
        url = String(nextUrl || '');
        return originalOpen.apply(xhr, arguments);
      };
      xhr.addEventListener('error', () => {
        post({ kind: 'network_failure', url, method, errorText: 'XMLHttpRequest error' });
      });
      xhr.addEventListener('loadend', () => {
        if (xhr.status >= 400) {
          post({
            kind: 'network_failure',
            url,
            method,
            status: xhr.status,
            errorText: xhr.statusText || 'HTTP error'
          });
        }
      });
      return xhr;
    };
    window.XMLHttpRequest.prototype = OriginalXHR.prototype;
  }
})();
