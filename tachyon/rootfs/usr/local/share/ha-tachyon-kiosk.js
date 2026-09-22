/* Home Assistant's app panel supports the same kiosk messages used by Music
   Assistant. Only request kiosk mode inside a Home Assistant Ingress iframe.
   Keep comments block-style: Tachyon compacts newlines in its HTML template. */
(() => {
  const ingressApp = {{HAIngressKiosk}};
  if (!ingressApp || window.parent === window) {
    return;
  }

  const parentOrigin = location.origin;
  let buttonAdded = false;

  const addMenuButton = () => {
    if (buttonAdded || !document.body) {
      return;
    }
    buttonAdded = true;

    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'ha-tachyon-sidebar-button';
    button.setAttribute('aria-label', 'Показать боковую панель Home Assistant');
    button.title = 'Показать боковую панель Home Assistant';
    button.textContent = '☰  Home Assistant';
    Object.assign(button.style, {
      position: 'fixed',
      right: '16px',
      bottom: 'max(12px, env(safe-area-inset-bottom))',
      zIndex: '2147483647',
      display: 'flex',
      alignItems: 'center',
      height: '40px',
      padding: '0 14px',
      border: '1px solid rgba(255,255,255,.25)',
      borderRadius: '20px',
      background: '#1673a7',
      color: '#fff',
      boxShadow: '0 2px 10px rgba(0,0,0,.35)',
      cursor: 'pointer',
      font: '600 13px sans-serif'
    });
    button.addEventListener('click', () => {
      window.parent.postMessage({type: 'home-assistant/toggle-menu'}, parentOrigin);
    });
    document.body.appendChild(button);
  };

  window.addEventListener('message', (event) => {
    if (event.source !== window.parent || event.origin !== parentOrigin ||
        event.data?.type !== 'home-assistant/properties') {
      return;
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', addMenuButton, {once: true});
    } else {
      addMenuButton();
    }
  });

  window.parent.postMessage({
    type: 'home-assistant/subscribe-properties',
    kioskMode: true
  }, parentOrigin);

  window.addEventListener('pagehide', () => {
    window.parent.postMessage({type: 'home-assistant/unsubscribe-properties'}, parentOrigin);
  });
})();
