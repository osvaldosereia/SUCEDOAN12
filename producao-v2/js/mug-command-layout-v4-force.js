const BUILD = '20260825-canecas-command-layout-v8-desktop';

function installStyles() {
  if (document.getElementById('mugCommandLayoutV4ForceStyles')) return;
  const style = document.createElement('style');
  style.id = 'mugCommandLayoutV4ForceStyles';
  style.textContent = `
    #mugAutomationPanel.mugv7{gap:12px!important;padding:14px 16px!important}
    #mugAutomationPanel.mugv7 .mugv7-head{align-items:center!important;padding-bottom:2px!important}
    #mugAutomationPanel.mugv7 .mugv7-head h2{font-size:20px!important;margin:2px 0 3px!important}
    #mugAutomationPanel.mugv7 .mugv7-head p{font-size:11px!important;line-height:1.35!important;max-width:900px!important}
    #mugAutomationPanel.mugv7 .mugv7-info{display:none!important}

    @media (min-width: 901px) {
      #mugAutomationPanel.mugv7 .mugv7-main.has-command-library{
        display:grid!important;
        grid-template-columns:minmax(210px,1fr) minmax(0,4fr)!important;
        gap:14px!important;
        align-items:start!important;
        width:100%!important;
      }
      #mugAutomationPanel.mugv7 .mugv7-main.has-command-library>.mugv7-upload{
        min-width:0!important;
        width:auto!important;
        padding:11px!important;
        gap:9px!important;
        align-self:start!important;
        position:sticky!important;
        top:10px!important;
      }
      #mugAutomationPanel.mugv7 .mugv7-main.has-command-library>.mug-command-library{
        min-width:0!important;
        width:100%!important;
        max-width:none!important;
        grid-column:auto!important;
        position:sticky!important;
        top:10px!important;
        max-height:calc(100vh - 78px)!important;
        overflow:auto!important;
        overscroll-behavior:contain!important;
      }
      #mugAutomationPanel.mugv7 .mug-command-list{
        display:grid!important;
        grid-template-columns:repeat(3,minmax(0,1fr))!important;
        gap:8px!important;
      }
    }
    @media (min-width: 1500px) {
      #mugAutomationPanel.mugv7 .mug-command-list{grid-template-columns:repeat(4,minmax(0,1fr))!important}
    }

    #mugAutomationPanel.mugv7 .mugv7-drop{
      min-height:118px!important;
      height:138px!important;
      max-height:138px!important;
      padding:8px!important;
      border-radius:12px!important;
    }
    #mugAutomationPanel.mugv7 .mugv7-drop img{width:100%!important;height:100%!important;max-height:122px!important;object-fit:contain!important}
    #mugAutomationPanel.mugv7 .mugv7-drop strong{font-size:15px!important;line-height:1.15!important}
    #mugAutomationPanel.mugv7 .mugv7-drop small{font-size:10px!important;line-height:1.25!important}
    #mugAutomationPanel.mugv7 .mugv7-instruction{gap:5px!important}
    #mugAutomationPanel.mugv7 .mugv7-instruction textarea{min-height:72px!important;max-height:118px!important;padding:9px!important;font-size:12px!important;line-height:1.35!important}
    #mugAutomationPanel.mugv7 .mugv7-instruction strong{font-size:12px!important}
    #mugAutomationPanel.mugv7 .mugv7-instruction small{font-size:9.5px!important;line-height:1.25!important}
    #mugAutomationPanel.mugv7 .mugv7-actions{display:grid!important;grid-template-columns:1fr 1fr!important;gap:6px!important;align-items:center!important}
    #mugAutomationPanel.mugv7 .mugv7-actions .button{padding:7px 8px!important;min-height:34px!important;font-size:10.5px!important}
    #mugAutomationPanel.mugv7 .mugv7-status{grid-column:1/-1!important;font-size:10px!important;line-height:1.3!important;min-height:14px!important}

    #mugAutomationPanel.mugv7 .mug-command-library{padding:11px!important;gap:9px!important;box-sizing:border-box!important}
    #mugAutomationPanel.mugv7 .mug-command-head{align-items:center!important}
    #mugAutomationPanel.mugv7 .mug-command-head h3{font-size:17px!important;line-height:1.2!important;margin:0 0 2px!important}
    #mugAutomationPanel.mugv7 .mug-command-head p{font-size:11px!important;line-height:1.3!important}
    #mugAutomationPanel.mugv7 .mug-command-form{grid-template-columns:minmax(150px,.7fr) minmax(260px,2fr) auto!important;align-items:end!important;gap:7px!important;padding:8px!important}
    #mugAutomationPanel.mugv7 .mug-command-form input,
    #mugAutomationPanel.mugv7 .mug-command-form textarea{font-size:11px!important;line-height:1.3!important;padding:7px 8px!important;margin:0!important}
    #mugAutomationPanel.mugv7 .mug-command-form textarea{min-height:38px!important;max-height:58px!important;resize:vertical!important}
    #mugAutomationPanel.mugv7 .mug-command-form-actions{align-self:stretch!important;display:flex!important;align-items:stretch!important}
    #mugAutomationPanel.mugv7 .mug-command-form-actions button,
    #mugAutomationPanel.mugv7 .mug-command-toolbar button,
    #mugAutomationPanel.mugv7 .mug-command-head button{font-size:10px!important;min-height:28px!important;padding:5px 8px!important}
    #mugAutomationPanel.mugv7 .mug-command-status{grid-column:1/-1!important;min-height:0!important;font-size:9px!important}
    #mugAutomationPanel.mugv7 .mug-command-toolbar{padding-top:7px!important}
    #mugAutomationPanel.mugv7 .mug-command-selected-count,
    #mugAutomationPanel.mugv7 .mug-command-effective{font-size:10px!important;line-height:1.3!important}
    #mugAutomationPanel.mugv7 .mug-command-effective{padding:6px 8px!important}
    #mugAutomationPanel.mugv7 .mug-command-item{padding:7px 8px!important;min-height:72px!important;grid-template-columns:20px minmax(0,1fr)!important;gap:6px!important;border-radius:10px!important}
    #mugAutomationPanel.mugv7 .mug-command-check input{width:16px!important;height:16px!important}
    #mugAutomationPanel.mugv7 .mug-command-body strong{font-size:12px!important;line-height:1.2!important;font-weight:800!important}
    #mugAutomationPanel.mugv7 .mug-command-body p{font-size:10.5px!important;line-height:1.3!important;-webkit-line-clamp:2!important}
    #mugAutomationPanel.mugv7 .mug-command-actions button{font-size:9px!important;min-height:22px!important;padding:3px 6px!important}
    #mugAutomationPanel.mugv7 .mug-command-default-toggle{font-size:12px!important;min-height:22px!important;padding:2px 6px!important}

    @media (max-width: 900px) {
      #mugAutomationPanel.mugv7 .mugv7-main.has-command-library{grid-template-columns:1fr!important}
      #mugAutomationPanel.mugv7 .mugv7-main.has-command-library>.mugv7-upload,
      #mugAutomationPanel.mugv7 .mug-command-library{position:static!important;max-height:none!important}
      #mugAutomationPanel.mugv7 .mug-command-list{grid-template-columns:repeat(2,minmax(0,1fr))!important}
      #mugAutomationPanel.mugv7 .mug-command-form{grid-template-columns:1fr!important}
    }
    @media (max-width: 560px) {
      #mugAutomationPanel.mugv7 .mug-command-list{grid-template-columns:1fr!important}
    }
  `;
  document.head.appendChild(style);
}

function forceLayout() {
  if (window.adminV2CurrentRoute?.() !== 'mug-studio') return false;
  const panel = document.getElementById('mugAutomationPanel');
  if (!panel?.classList.contains('mugv7')) return false;
  const main = panel.querySelector('.mugv7-main');
  const upload = main?.querySelector(':scope > .mugv7-upload');
  const library = main?.querySelector(':scope > .mug-command-library');
  if (!main || !upload || !library) return false;

  main.querySelector(':scope > .mugv7-info')?.remove();
  main.classList.add('has-command-library');
  panel.dataset.commandLayout = BUILD;

  if (window.matchMedia('(min-width: 901px)').matches) {
    main.style.setProperty('display', 'grid', 'important');
    main.style.setProperty('grid-template-columns', 'minmax(210px, 1fr) minmax(0, 4fr)', 'important');
    main.style.setProperty('gap', '14px', 'important');
    upload.style.setProperty('min-width', '0', 'important');
    upload.style.setProperty('width', 'auto', 'important');
    library.style.setProperty('min-width', '0', 'important');
    library.style.setProperty('width', '100%', 'important');
    library.style.setProperty('max-width', 'none', 'important');
    library.style.setProperty('grid-column', 'auto', 'important');
  }
  return true;
}

function applyUntilReady(attempt = 0) {
  installStyles();
  if (forceLayout()) return;
  if (attempt < 40) setTimeout(() => applyUntilReady(attempt + 1), 100);
}

function activate() {
  setTimeout(() => applyUntilReady(), 0);
}

window.addEventListener('admin-v2-route-ready', event => {
  if (event.detail?.route === 'mug-studio') activate();
});
window.addEventListener('admin-v2-route', event => {
  if (event.detail?.route === 'mug-studio') activate();
});
window.addEventListener('mug-studio-model-applied', () => forceLayout());
window.addEventListener('resize', () => {
  if (window.adminV2CurrentRoute?.() === 'mug-studio') forceLayout();
});

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', activate, { once: true });
else activate();

export { forceLayout };
