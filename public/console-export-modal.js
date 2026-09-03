(() => {
  let backdrop = null;

  function openMenu() {
    return document.querySelector('.portable-menu[open]');
  }

  function closeAll() {
    document.querySelectorAll('.portable-menu[open]').forEach((menu) => menu.removeAttribute('open'));
    backdrop?.remove();
    backdrop = null;
    document.body.classList.remove('console-modal-open');
  }

  function ensureCloseButton(menu) {
    const panel = menu.querySelector('.portable-menu-panel');
    if (!panel || panel.querySelector('.console-export-close')) return;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'console-export-close';
    close.setAttribute('aria-label', 'Close export dialog');
    close.textContent = '×';
    close.addEventListener('click', closeAll);
    panel.prepend(close);
  }

  function syncModal() {
    const menu = openMenu();
    if (!menu) {
      if (backdrop) closeAll();
      return;
    }
    ensureCloseButton(menu);
    document.body.classList.add('console-modal-open');
    if (!backdrop) {
      backdrop = document.createElement('button');
      backdrop.type = 'button';
      backdrop.className = 'console-export-backdrop';
      backdrop.setAttribute('aria-label', 'Close export dialog');
      backdrop.addEventListener('click', closeAll);
      document.body.append(backdrop);
    }
  }

  const observer = new MutationObserver((mutations) => {
    if (mutations.some((mutation) => mutation.type === 'attributes' && mutation.attributeName === 'open')) syncModal();
    if (mutations.some((mutation) => mutation.type === 'childList')) {
      const menu = openMenu();
      if (menu) ensureCloseButton(menu);
    }
  });
  observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['open'] });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && openMenu()) closeAll();
  });
})();
