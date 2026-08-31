(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const qs = (selector, root = document) => root.querySelector(selector);
  let observer = null;
  let scheduled = false;
  let enhancing = false;

  function setSectionCopy(sectionId, title, copy) {
    const section = $(sectionId);
    if (!section) return;
    const heading = qs('.profile-settings-head h3', section);
    const paragraph = qs('.profile-settings-head p', section);
    if (heading) heading.textContent = title;
    if (paragraph) paragraph.textContent = copy;
  }

  function ensureOperationalDefaults(view) {
    const form = $('profilePreferencesForm');
    const appearance = $('profileSectionAppearance');
    const workspace = $('profileSectionWorkspace');
    const printing = $('profileSectionPrinting');
    if (!form || !appearance || !workspace || !printing) return null;

    let details = $('profileOperationalDefaults');
    if (!details) {
      details = document.createElement('details');
      details.id = 'profileOperationalDefaults';
      details.className = 'panel profile-operational-defaults';
      details.innerHTML = `
        <summary>
          <span><strong>Operational defaults</strong><small>Density, Home detail, print margin and new-spool defaults</small></span>
          <span class="profile-disclosure-icon" aria-hidden="true">＋</span>
        </summary>
        <div class="profile-operational-body">
          <div class="profile-operational-grid" data-profile-operational-grid></div>
          <div data-profile-printing-mount></div>
        </div>`;
      const reset = qs('.profile-reset-panel', form);
      form.insertBefore(details, reset || null);
    }

    const operationalGrid = qs('[data-profile-operational-grid]', details);
    const printingMount = qs('[data-profile-printing-mount]', details);
    const density = $('profileDensity')?.closest('.profile-control-card');
    const homeDetail = $('profileDashboardDetail')?.closest('.profile-control-card');

    if (density && operationalGrid && density.parentElement !== operationalGrid) operationalGrid.appendChild(density);
    if (homeDetail && operationalGrid && homeDetail.parentElement !== operationalGrid) operationalGrid.appendChild(homeDetail);
    if (printingMount && printing.parentElement !== printingMount) printingMount.appendChild(printing);

    printing.classList.remove('panel');
    printing.classList.add('profile-operational-section');
    const printingHead = qs('.profile-settings-head h3', printing);
    const printingCopy = qs('.profile-settings-head p', printing);
    if (printingHead) printingHead.textContent = 'Print & inventory defaults';
    if (printingCopy) printingCopy.textContent = 'Defaults used for readiness checks and newly added spools. Existing measurements and spool facts are unchanged.';

    return details;
  }

  function refineSummaryNavigation(view) {
    const nav = qs('.profile-section-nav', view);
    if (!nav || nav.dataset.preferencesV12 === '1') return;
    nav.dataset.preferencesV12 = '1';
    nav.innerHTML = `
      <a href="#profileSectionIdentity">Identity</a>
      <a href="#profileSectionAppearance">Appearance</a>
      <a href="#profileSectionWorkspace">Start screen</a>
      <a href="#profileOperationalDefaults">Advanced</a>`;
  }

  function enhance() {
    scheduled = false;
    if (enhancing) return;
    const view = $('preferencesView');
    if (!view || !$('profilePreferencesForm')) return;

    const alreadyEnhanced = $('profileOperationalDefaults')
      && $('profileDensity')?.closest('#profileOperationalDefaults')
      && $('profileDashboardDetail')?.closest('#profileOperationalDefaults')
      && $('profileSectionPrinting')?.closest('#profileOperationalDefaults');
    if (alreadyEnhanced) return;

    enhancing = true;
    try {
      setSectionCopy('profileSectionIdentity', 'Workspace identity', 'Choose the name and badge shown in the header and workspace switcher.');
      setSectionCopy('profileSectionAppearance', 'Appearance', 'Set the theme and accent that make this workspace recognizable at a glance.');
      setSectionCopy('profileSectionWorkspace', 'Start screen', 'Choose where this workspace opens by default.');
      ensureOperationalDefaults(view);
      refineSummaryNavigation(view);
      view.classList.add('profile-preferences-v12');
    } finally {
      enhancing = false;
    }
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(enhance);
  }

  function observe() {
    if (observer || !document.body) return;
    observer = new MutationObserver(records => {
      if (enhancing) return;
      const relevant = records.some(record => {
        if (record.target?.id === 'preferencesView') return true;
        return [...record.addedNodes, ...record.removedNodes].some(node =>
          node.nodeType === Node.ELEMENT_NODE
          && (node.id === 'preferencesView' || node.querySelector?.('#profilePreferencesForm'))
        );
      });
      if (relevant) schedule();
    });
    observer.observe(document.body, {subtree:true, childList:true});
  }

  function init() {
    schedule();
    observe();
    document.addEventListener('fi:navigation', event => {
      if (event.detail?.view === 'preferences') schedule();
    });
    globalThis.FilamentInventoryEvents?.on?.('profile:preferences-changed', schedule);
  }

  globalThis.FilamentInventoryPreferencesV12 = Object.freeze({refresh:schedule});

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
