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
    button.innerHTML = '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 10.5 12 2l9 8.5V21H3V10.5Z" fill="#18bcf2"/><path d="M7 15.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm10-4a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3ZM12 7a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z" fill="#fff"/><path d="M12 10v5.5l-3.5 1.5M12 15.5l3.5-2.5" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/></svg><span>Home Assistant</span>';
    Object.assign(button.style, {
      position: 'fixed',
      left: '8px',
      bottom: 'max(54px, calc(54px + env(safe-area-inset-bottom)))',
      zIndex: '2147483647',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'flex-start',
      gap: '9px',
      boxSizing: 'border-box',
      width: 'min(199px, calc(100vw - 16px))',
      height: '40px',
      padding: '0 12px',
      border: '1px solid #444',
      borderRadius: '8px',
      background: '#2e2e2e',
      color: '#fff',
      cursor: 'pointer',
      font: '600 13px sans-serif',
      textAlign: 'left'
    });
    button.addEventListener('mouseenter', () => { button.style.background = '#3a3a3a'; });
    button.addEventListener('mouseleave', () => { button.style.background = '#2e2e2e'; });
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
