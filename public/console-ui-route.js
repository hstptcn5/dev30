(() => {
  function applyRoutePresentation() {
    const sharedStakeholder = /^\/r\/[0-9a-f-]+\/?$/i.test(location.pathname);
    const reportRoute = sharedStakeholder || /^\/u\/[^/]+\/?$/.test(location.pathname);
    if (reportRoute) {
      document.querySelectorAll('[data-console-href]').forEach((link) => link.classList.remove('is-active'));
      document.querySelector('[data-console-href="#report"]')?.classList.add('is-active');
    }

    if (sharedStakeholder) {
      document.body.classList.add('console-stakeholder-view');
      const band = document.querySelector('.console-artifact-band');
      if (band) band.innerHTML = '<span>STAKEHOLDER_ARTIFACT // EVIDENCE_BACKED</span><span>READ UPDATE → VERIFY SUPPORTING SOURCES</span>';
    }

    const evidenceNav = document.querySelector('[data-console-href="#evidence-panel"]');
    if (evidenceNav) evidenceNav.hidden = sharedStakeholder || !document.querySelector('#evidence-panel');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyRoutePresentation, { once: true });
  else applyRoutePresentation();

  const report = document.querySelector('#report');
  if (report) new MutationObserver(applyRoutePresentation).observe(report, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
})();
