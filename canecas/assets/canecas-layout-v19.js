(() => {
  'use strict';

  const VERSION = '20260731-19';
  const STYLE_ID = 'canecasLayoutV19PatchStyles';
  const SHELL_ID = 'canecasTwoColumnV19';
  const LEFT_ID = 'canecasControlsV19';
  const RIGHT_ID = 'canecasViewerV19';
  const CATALOGS_ID = 'canecasCatalogsV19';
  const $ = (selector, parent = document) => parent.querySelector(selector);

  function injectStyles() {
    if ($('#' + STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      body.canecas-two-v19 main{display:block!important;width:100%!important;max-width:none!important;padding-inline:clamp(10px,2vw,26px)!important;box-sizing:border-box!important}
      #${SHELL_ID}{display:grid;grid-template-columns:minmax(330px,2fr) minmax(0,3fr);gap:22px;align-items:start;width:min(100%,1680px);margin:0 auto 24px}
      #${LEFT_ID},#${RIGHT_ID}{min-width:0}
      #${LEFT_ID}{display:flex;flex-direction:column;gap:18px}
      #${LEFT_ID}>*{width:100%!important;max-width:none!important;margin:0!important;box-sizing:border-box!important}
      #${LEFT_ID} .workspace{display:block!important;width:100%!important;max-width:none!important;margin:0!important}
      #${LEFT_ID} .workspace>*{width:100%!important;max-width:none!important;box-sizing:border-box!important}
      #${LEFT_ID} .workspace>*+*{margin-top:18px!important}
      #${RIGHT_ID}>#canecasWidePreviewV18{position:static!important;width:100%!important;max-width:none!important;margin:0!important;border-radius:18px!important}
      #${RIGHT_ID} #canecasWidePreviewV18 .wide-preview-head-v18 strong{font-size:14px}
      #${RIGHT_ID} #canecasWidePreviewV18 .wide-preview-head-v18 span{font-size:10px}
      #${RIGHT_ID} #canecasWidePreviewV18 .wide-preview-body-v18{padding:14px!important}
      #${RIGHT_ID} #canecasWidePreviewV18 canvas{display:block!important;width:100%!important;max-width:100%!important;height:auto!important;margin:auto!important}

      #${CATALOGS_ID}{display:block;width:min(100%,1680px);margin:0 auto 30px}
      #${CATALOGS_ID}>*{width:100%!important;max-width:none!important;margin-inline:0!important;box-sizing:border-box!important}
      #${CATALOGS_ID}>*+*{margin-top:22px!important}
      #${CATALOGS_ID} .library-grid-v15,#${CATALOGS_ID} .archive-grid{display:grid!important;grid-template-columns:repeat(5,minmax(0,1fr))!important;gap:14px!important}
      #${CATALOGS_ID} .library-card-v15,#${CATALOGS_ID} .archive-item{min-width:0!important}
      #${CATALOGS_ID} .library-card-v15 img,#${CATALOGS_ID} .archive-item img{width:100%!important;aspect-ratio:1!important;object-fit:contain!important;background:#fff!important}

      #importLeftBtn,#importRightBtn,#automaticBtn,.automatic-note,.brightness-enhancement,#rightBrightnessEnhancement,#targetV15,.image-adjust-v15{display:none!important}

      @media(max-width:1180px){
        #${SHELL_ID}{grid-template-columns:minmax(310px,42fr) minmax(0,58fr);gap:16px}
        #${CATALOGS_ID} .library-grid-v15,#${CATALOGS_ID} .archive-grid{grid-template-columns:repeat(4,minmax(0,1fr))!important}
      }
      @media(max-width:900px){
        #${SHELL_ID}{grid-template-columns:1fr}
        #${RIGHT_ID}{order:-1}
        #${CATALOGS_ID} .library-grid-v15,#${CATALOGS_ID} .archive-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important}
      }
      @media(max-width:680px){
        #${SHELL_ID}{gap:14px}
        #${CATALOGS_ID} .library-grid-v15,#${CATALOGS_ID} .archive-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:10px!important}
      }
      @media print{
        #${LEFT_ID},#${CATALOGS_ID}{display:none!important}
        #${SHELL_ID}{display:block!important;width:100%!important;margin:0!important}
      }
    `;
    document.head.appendChild(style);
  }

  function ensureShell(anchor) {
    let shell = $('#' + SHELL_ID);
    if (shell) return shell;
    shell = document.createElement('section');
    shell.id = SHELL_ID;
    shell.innerHTML = `<div id="${LEFT_ID}"></div><div id="${RIGHT_ID}"></div>`;
    anchor.insertAdjacentElement('beforebegin', shell);
    document.body.classList.add('canecas-two-v19');
    return shell;
  }

  function arrangeMainLayout() {
    const wide = $('#canecasWidePreviewV18');
    const workspace = $('.workspace');
    const quick = $('#dualStartV15');
    const anchor = wide || quick || workspace;
    if (!anchor?.parentElement || !wide || !workspace) return;

    const shell = ensureShell(anchor);
    const left = $('#' + LEFT_ID, shell);
    const right = $('#' + RIGHT_ID, shell);
    if (!left || !right) return;

    if (quick && quick.parentElement !== left) left.appendChild(quick);
    if (workspace.parentElement !== left) left.appendChild(workspace);
    if (wide.parentElement !== right) right.appendChild(wide);

    const title = $('.wide-preview-head-v18 strong', wide);
    const note = $('.wide-preview-head-v18 span', wide);
    if (title) title.textContent = 'Visualizador das artes';
    if (note) note.textContent = '60% da área de trabalho · impressão e PDF';

    const shortcut = $('#flowGenerateV16');
    if (shortcut) {
      shortcut.textContent = '✎ Ir para personalização';
      shortcut.title = 'Abre o formulário. A geração acontece no botão principal da personalização.';
    }
  }

  function arrangeCatalogs() {
    const main = $('main');
    if (!main) return;
    let area = $('#' + CATALOGS_ID);
    if (!area) {
      area = document.createElement('section');
      area.id = CATALOGS_ID;
      area.setAttribute('aria-label', 'Catálogos de imagens e artes');
      main.appendChild(area);
    }
    const uploads = $('#uploadLibraryV15');
    const generated = $('.archive');
    if (uploads && uploads.parentElement !== area) area.appendChild(uploads);
    if (generated && generated.parentElement !== area) area.appendChild(generated);
  }

  function removeRedundantButtons() {
    ['importLeftBtn','importRightBtn','automaticBtn'].forEach(id => {
      const button = document.getElementById(id);
      if (!button) return;
      button.hidden = true;
      button.setAttribute('aria-hidden', 'true');
    });
  }

  function initialize() {
    injectStyles();
    arrangeMainLayout();
    arrangeCatalogs();
    removeRedundantButtons();
  }

  let timer = 0;
  new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(initialize, 100);
  }).observe(document.documentElement, {childList:true, subtree:true, attributes:true, attributeFilter:['class','src']});

  const interval = setInterval(initialize, 350);
  setTimeout(() => clearInterval(interval), 20000);
  window.addEventListener('resize', initialize);
  initialize();
})();
