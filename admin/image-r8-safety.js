// R8 — UI safety only. No API/storage side effects.
(() => {
  'use strict';
  const guarded = new Set([
    'runNow','saveFrequency','automationToggle','bulkApproveSelected','bulkUnprocessed',
    'approveGeneratedManual','generateIndividualManual','useCurrentSource','saveNote',
    'retryOnly','saveSourceRetry','ignoreProduct','restoreProduct','bulkRegenerateSelectedGrid18'
  ]);
  const locks = new WeakMap();
  const release = button => {
    const timer = locks.get(button);
    if (timer) clearTimeout(timer);
    locks.delete(button);
    button.removeAttribute('aria-busy');
  };
  document.addEventListener('click', event => {
    const button = event.target.closest('button[id]');
    if (!button || !guarded.has(button.id)) return;
    if (locks.has(button)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    button.setAttribute('aria-busy','true');
    locks.set(button, setTimeout(() => release(button), 30000));
    // Functional code owns disabled/busy state. This guard only suppresses accidental rapid repeats.
    setTimeout(() => {
      const area = document.getElementById('automationArea');
      if (!area?.classList.contains('busy')) release(button);
    }, 1200);
  }, true);
  const area = document.getElementById('automationArea');
  if (area) new MutationObserver(() => {
    if (area.classList.contains('busy')) return;
    document.querySelectorAll('button[aria-busy="true"]').forEach(release);
  }).observe(area,{attributes:true,attributeFilter:['class']});
})();
