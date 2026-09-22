/* Home Assistant Ingress reserializes query parameters while proxying them.
   Tachyon's cached Message/MessageList GET URLs encode the action in repeated
   q[] parameters, which can disappear before Tachyon reconstructs the route.
   Send only these two JSON actions as POST, preserving the existing CSRF header.
   Keep this comment block-style: Tachyon removes newlines from Index.html. */
(() => {
  if (!/^\/api\/hassio_ingress\/[A-Za-z0-9_-]+\/?$/.test(location.pathname)) {
    return;
  }

  const originalFetch = window.fetch.bind(window);
  window.fetch = (resource, init) => {
    if (typeof resource !== 'string' ||
        (init?.method && init.method.toUpperCase() !== 'GET')) {
      return originalFetch(resource, init);
    }

    const url = new URL(resource, location.href);
    if (url.origin !== location.origin ||
        url.pathname !== location.pathname ||
        !url.search.startsWith('?/Json/')) {
      return originalFetch(resource, init);
    }

    const segments = url.searchParams.getAll('q[]');
    const route = segments[0]?.split('/').filter(Boolean);
    const action = route?.length === 2 && route[0] === '0' ? route[1] : '';
    const rawKey = segments[1]?.replace(/^\/+|\/+$/g, '');
    if (!['Message', 'MessageList'].includes(action) ||
        !rawKey || !/^[A-Za-z0-9_-]+$/.test(rawKey)) {
      return originalFetch(resource, init);
    }

    const headers = new Headers(init?.headers);
    headers.set('Content-Type', 'application/json');
    return originalFetch(location.pathname + '?/Json/', {
      ...init,
      method: 'POST',
      headers,
      body: JSON.stringify({Action: action, RawKey: rawKey})
    });
  };
})();
