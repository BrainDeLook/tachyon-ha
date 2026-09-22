const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = readFileSync(join(__dirname, '../rootfs/usr/local/share/ha-tachyon-kiosk.js'), 'utf8');
const origin = 'http://ha.test';

function setup(pathname, framed = true, script = source, ingressApp = true) {
  const messages = [];
  const listeners = new Map();
  const nodes = [];
  const parent = {postMessage: (message, targetOrigin) => messages.push({message, targetOrigin})};
  const window = {addEventListener: (name, handler) => listeners.set(name, handler)};
  window.parent = framed ? parent : window;
  const document = {
    readyState: 'complete',
    body: {appendChild: (node) => nodes.push(node)},
    createElement: () => {
      const handlers = new Map();
      return {
        style: {},
        handlers,
        setAttribute: () => {},
        addEventListener: (name, handler) => handlers.set(name, handler)
      };
    }
  };
  vm.runInNewContext(script.replaceAll('{{HAIngressKiosk}}', String(ingressApp)), {
    window, document, location: {pathname, origin}
  });
  return {messages, listeners, nodes, parent};
}

test('Ingress iframe requests kiosk mode and exposes a separate HA sidebar button', () => {
  const app = setup('/api/hassio_ingress/testtoken/');
  assert.equal(app.messages.length, 1);
  assert.equal(app.messages[0].message.type, 'home-assistant/subscribe-properties');
  assert.equal(app.messages[0].message.kioskMode, true);
  assert.equal(app.messages[0].targetOrigin, origin);
  assert.equal(app.nodes.length, 0);

  app.listeners.get('message')({source: {}, origin, data: {type: 'home-assistant/properties'}});
  app.listeners.get('message')({source: app.parent, origin: 'http://other.test', data: {type: 'home-assistant/properties'}});
  assert.equal(app.nodes.length, 0);

  app.listeners.get('message')({source: app.parent, origin, data: {type: 'home-assistant/properties'}});
  app.listeners.get('message')({source: app.parent, origin, data: {type: 'home-assistant/properties'}});
  assert.equal(app.nodes.length, 1);
  assert.equal(app.nodes[0].id, 'ha-tachyon-sidebar-button');
  assert.equal(app.nodes[0].type, 'button');
  assert.equal(app.nodes[0].style.left, '8px');
  assert.equal(app.nodes[0].style.right, undefined);
  assert.equal(app.nodes[0].style.background, '#2e2e2e');
  assert.match(app.nodes[0].innerHTML, /<svg[^>]+aria-hidden="true"/);
  assert.match(app.nodes[0].innerHTML, /<span>Home Assistant<\/span>/);
  app.nodes[0].handlers.get('mouseenter')();
  assert.equal(app.nodes[0].style.background, '#3a3a3a');
  app.nodes[0].handlers.get('mouseleave')();
  assert.equal(app.nodes[0].style.background, '#2e2e2e');
  app.nodes[0].handlers.get('click')();
  assert.equal(app.messages[1].message.type, 'home-assistant/toggle-menu');
  assert.equal(app.messages[1].targetOrigin, origin);

  app.listeners.get('pagehide')();
  assert.equal(app.messages[2].message.type, 'home-assistant/unsubscribe-properties');
});

test('standalone Tachyon and unrelated frames remain untouched', () => {
  for (const app of [
    setup('/api/hassio_ingress/testtoken/', false),
    setup('/plain-webmail/', true, source, false)
  ]) {
    assert.equal(app.messages.length, 0);
    assert.equal(app.nodes.length, 0);
  }
});

test('Ingress app still enables kiosk when the browser shows an /app/ route', () => {
  const app = setup('/app/6d58d924_tachyon');
  assert.equal(app.messages[0].message.kioskMode, true);
});

test('kiosk script survives Tachyon HTML whitespace compaction', () => {
  const compacted = source.replace(/[\r\n\t]+/g, ' ');
  const app = setup('/api/hassio_ingress/testtoken/', true, compacted);
  assert.equal(app.messages[0].message.kioskMode, true);
});

if (process.env.TACHYON_RENDERED_PAGE) {
  test('rendered Ingress page executes the kiosk script', () => {
    const html = readFileSync(process.env.TACHYON_RENDERED_PAGE, 'utf8');
    const markerAt = html.indexOf('Home Assistant\'s app panel supports');
    assert.notEqual(markerAt, -1);
    const start = html.lastIndexOf('<script', markerAt);
    const bodyStart = html.indexOf('>', start) + 1;
    const bodyEnd = html.indexOf('</script>', bodyStart);
    assert.ok(start >= 0 && bodyStart > start && bodyEnd > bodyStart);
    const app = setup('/api/hassio_ingress/testtoken/', true, html.slice(bodyStart, bodyEnd));
    assert.equal(app.messages[0].message.kioskMode, true);
  });
}
