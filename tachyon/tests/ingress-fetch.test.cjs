const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = readFileSync(join(__dirname, '../rootfs/usr/local/share/ha-tachyon-ingress-fetch.js'), 'utf8');
const base = 'http://ha.test/api/hassio_ingress/testtoken/';

function setup(pathname = '/api/hassio_ingress/testtoken/', script = source) {
  const calls = [];
  const originalFetch = (resource, init) => {
    calls.push({resource, init});
    return Promise.resolve({ok: true});
  };
  const window = {fetch: originalFetch};
  vm.runInNewContext(script, {
    window,
    location: {pathname, origin: 'http://ha.test', href: base},
    URL,
    Headers
  });
  return {window, calls, originalFetch};
}

test('fetch override survives Tachyon HTML whitespace compaction', async () => {
  const compactedScript = source.replace(/[\r\n\t]+/g, ' ');
  const {window, calls, originalFetch} = setup('/api/hassio_ingress/testtoken/', compactedScript);
  assert.notEqual(window.fetch, originalFetch);
  await window.fetch(`${base}?/Json/&q[]=/0/Message/&q[]=/WyJJTkJPWCJd`);
  assert.equal(calls[0].init.method, 'POST');
});

if (process.env.TACHYON_RENDERED_PAGE) {
  test('fetch override executes from the rendered Ingress page', async () => {
    const html = readFileSync(process.env.TACHYON_RENDERED_PAGE, 'utf8');
    const marker = 'Home Assistant Ingress reserializes query parameters';
    const markerAt = html.indexOf(marker);
    assert.notEqual(markerAt, -1);
    const start = html.lastIndexOf('<script', markerAt);
    const bodyStart = html.indexOf('>', start) + 1;
    const bodyEnd = html.indexOf('</script>', bodyStart);
    assert.ok(start >= 0 && bodyStart > start && bodyEnd > bodyStart);
    const renderedScript = html.slice(bodyStart, bodyEnd);
    const {window, calls, originalFetch} = setup('/api/hassio_ingress/testtoken/', renderedScript);
    assert.notEqual(window.fetch, originalFetch);
    await window.fetch(`${base}?/Json/&q[]=/0/Message/&q[]=/WyJJTkJPWCJd`);
    assert.equal(calls[0].init.method, 'POST');
  });
}

for (const action of ['Message', 'MessageList']) {
  test(`${action} GET becomes JSON POST with its original request key`, async () => {
    const {window, calls} = setup();
    const requestKey = 'WyJJTkJPWCIsOTAzNzcsMCwiZSJd';
    const requestUrl = `${base}?/Json/&q[]=/0/${action}/&q[]=/${requestKey}`;
    await window.fetch(requestUrl, {headers: {'X-SM-Token': 'csrf', Accept: 'application/json'}});

    assert.equal(calls.length, 1);
    assert.equal(calls[0].resource, '/api/hassio_ingress/testtoken/?/Json/');
    assert.equal(calls[0].init.method, 'POST');
    assert.equal(calls[0].init.headers.get('X-SM-Token'), 'csrf');
    assert.equal(calls[0].init.headers.get('Content-Type'), 'application/json');
    assert.deepEqual(JSON.parse(calls[0].init.body), {Action: action, RawKey: requestKey});
  });
}

test('other requests and non-Ingress pages keep their original fetch', async () => {
  const {window, calls} = setup();
  await window.fetch(`${base}?/Raw/&q[]=/0/Download/`);
  await window.fetch(`${base}?/Json/&q[]=/0/Message/&q[]=/key`, {method: 'POST', body: '{}'});
  assert.equal(calls[0].resource, `${base}?/Raw/&q[]=/0/Download/`);
  assert.equal(calls[1].init.method, 'POST');

  const outside = setup('/plain-webmail/');
  assert.equal(outside.window.fetch, outside.originalFetch);
});
