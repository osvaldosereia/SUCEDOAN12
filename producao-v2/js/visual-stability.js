(() => {
  const root = document.documentElement;
  const bootScreen = document.getElementById('adminBootScreen');
  const bootMessage = document.getElementById('adminBootMessage');
  const statusTitle = document.getElementById('sidebarStatusTitle');
  const dashboardMetrics = document.getElementById('dashboardMetrics');
  let coreReady = false;
  let modulesReady = false;
  let revealed = false;

  function reveal() {
    if (revealed) return;
    revealed = true;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      root.classList.remove('admin-booting');
      root.classList.add('admin-ready');
      bootScreen?.setAttribute('aria-hidden', 'true');
    }));
  }

  function maybeReveal() {
    if (coreReady && modulesReady) reveal();
  }

  function checkCore() {
    if (coreReady) return;
    const title = String(statusTitle?.textContent || '').trim();
    const metricsReady = (dashboardMetrics?.children?.length || 0) >= 4;
    const finished = /Dados carregados|Sem produtos|Falha na atualização/i.test(title);
    if (!finished || (!metricsReady && !/Falha na atualização/i.test(title))) return;
    coreReady = true;
    root.dataset.adminCoreReady = '1';
    if (bootMessage) bootMessage.textContent = 'Finalizando os módulos do sistema…';
    window.dispatchEvent(new CustomEvent('admin-v2-core-ready'));
    maybeReveal();
  }

  const observer = new MutationObserver(checkCore);
  if (statusTitle) observer.observe(statusTitle, { childList: true, subtree: true, characterData: true });
  if (dashboardMetrics) observer.observe(dashboardMetrics, { childList: true, subtree: true });

  window.addEventListener('admin-v2-modules-ready', () => {
    modulesReady = true;
    root.dataset.adminModulesReady = '1';
    maybeReveal();
  }, { once: true });

  window.addEventListener('admin-v2-ready', () => {
    coreReady = true;
    modulesReady = true;
    root.dataset.adminCoreReady = '1';
    root.dataset.adminModulesReady = '1';
    reveal();
  }, { once: true });

  checkCore();

  setTimeout(() => {
    if (revealed) return;
    if (bootMessage) bootMessage.textContent = 'Abrindo o painel com os módulos disponíveis…';
    reveal();
  }, 12000);
})();
