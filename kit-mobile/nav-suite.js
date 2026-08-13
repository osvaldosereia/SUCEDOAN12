const BUILD = '20260813-suite-v2';

function navMarkup() {
  return `
    <a href="../contagem/"><span class="ops-app-nav-icon">📦</span><span>Contagem</span></a>
    <a href="../cadastro/"><span class="ops-app-nav-icon">➕</span><span>Cadastro</span></a>
    <a href="../validades/"><span class="ops-app-nav-icon">📅</span><span>Validades</span></a>
    <a class="active" aria-current="page" href="../kit-mobile/"><span class="ops-app-nav-icon">🎁</span><span>Kits</span></a>`;
}

function installSuiteNavigation() {
  document.body?.classList.add('ops-suite', 'ops-kits');

  const theme = document.querySelector('meta[name="theme-color"]');
  if (theme) theme.setAttribute('content', '#173f2a');

  const existingNav = document.querySelector('.ops-app-nav');
  if (existingNav) {
    existingNav.innerHTML = navMarkup();
    existingNav.style.gridTemplateColumns = 'repeat(4,minmax(0,1fr))';
    return;
  }

  const currentHeader = document.querySelector('.app > header');
  if (!currentHeader) return;

  const settingsButton = document.getElementById('settingsOpen');
  const header = document.createElement('header');
  header.className = 'ops-topbar';
  header.innerHTML = `
    <div class="ops-topbar-inner">
      <div class="ops-topbar-main">
        <div class="ops-brand">
          <div class="ops-brand-mark">DA</div>
          <div class="ops-brand-copy">
            <strong class="ops-brand-title">Criador mobile de kits</strong>
            <small class="ops-brand-subtitle">Firebase · Make · Admin V2</small>
          </div>
        </div>
        <div class="ops-actions"></div>
      </div>
      <nav class="ops-app-nav" aria-label="Trocar aplicação">${navMarkup()}</nav>
    </div>`;

  header.querySelector('.ops-app-nav').style.gridTemplateColumns = 'repeat(4,minmax(0,1fr))';

  if (settingsButton) {
    settingsButton.classList.add('ops-icon-button');
    header.querySelector('.ops-actions')?.appendChild(settingsButton);
  }

  currentHeader.replaceWith(header);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', installSuiteNavigation, { once: true });
} else {
  installSuiteNavigation();
}

export const OPS_KIT_NAV_BUILD = BUILD;
