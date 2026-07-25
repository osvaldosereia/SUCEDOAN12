(() => {
  const root = document.documentElement;
  const bootScreen = document.getElementById('adminBootScreen');
  const bootMessage = document.getElementById('adminBootMessage');
  const statusTitle = document.getElementById('sidebarStatusTitle');
  const dashboardMetrics = document.getElementById('dashboardMetrics');
  let revealed = false;

  function reveal() {
    if (revealed) return;
    revealed = true;
    root.classList.remove('admin-booting');
    root.classList.add('admin-ready');
    root.dataset.adminCoreReady = '1';
    bootScreen?.setAttribute('aria-hidden', 'true');
  }

  function checkCore() {
    if (revealed) return;
    const title = String(statusTitle?.textContent || '').trim();
    const metricsCount = dashboardMetrics?.children?.length || 0;
    const finished = /Dados carregados|Sem produtos|Falha na atualização/i.test(title);
    const progressed = title && !/Inicializando|Conectando|Carregando/i.test(title);

    if (finished || metricsCount > 0 || progressed) {
      if (bootMessage) bootMessage.textContent = 'Abrindo o painel…';
      window.dispatchEvent(new CustomEvent('admin-v2-core-ready'));
      reveal();
    }
  }

  const observer = new MutationObserver(checkCore);
  if (statusTitle) observer.observe(statusTitle, { childList: true, subtree: true, characterData: true });
  if (dashboardMetrics) observer.observe(dashboardMetrics, { childList: true, subtree: true });

  window.addEventListener('admin-v2-modules-ready', checkCore);
  window.addEventListener('admin-v2-ready', reveal, { once: true });
  window.addEventListener('error', reveal, { once: true });
  window.addEventListener('unhandledrejection', reveal, { once: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkCore, { once: true });
  } else {
    checkCore();
  }

  setTimeout(() => {
    if (bootMessage) bootMessage.textContent = 'Abrindo o painel com os recursos disponíveis…';
    reveal();
  }, 2500);
})();
