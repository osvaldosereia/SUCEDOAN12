(() => {
  'use strict';

  const BUILD = '20260903-minhas-canecas-art-viewer-v1.0';
  const FIREBASE = 'https://cedar-chemist-310801-default-rtdb.firebaseio.com';
  const NODE = 'canecas/personalizadas';

  if (window.__CF_MINHAS_CANECAS_ART_VIEWER__ === BUILD) return;
  window.__CF_MINHAS_CANECAS_ART_VIEWER__ = BUILD;

  const text = value => String(value ?? '').trim();
  const safeKey = value => text(value).replace(/[.#$\[\]/]/g, '_');
  const isImage = value => /^(https?:\/\/|data:image\/)/i.test(text(value));

  function fullArt(creation = {}) {
    const values = [
      creation?.arte_aprovada?.url,
      creation.arte_aprovada_url,
      creation.arte_horizontal,
      creation.arte_personalizacao,
      creation.arte_horizontal_url,
      creation.art_source_url,
      creation.art_url,
      creation.result_url,
      creation.arte_final_url,
      creation?.arte_impressao?.url,
      creation?.result?.art_source_url,
      creation?.result?.art_url
    ];
    return values.map(text).find(isImage) || '';
  }

  async function fetchCreation(code) {
    const response = await fetch(`${FIREBASE}/${NODE}/${safeKey(code)}.json?_=${Date.now()}`, {
      cache:'no-store',
      headers:{ Accept:'application/json' }
    });
    if (!response.ok) throw new Error(`Firebase ${response.status}`);
    return response.json();
  }

  function installStyle() {
    if (document.getElementById('cfFullArtViewerStyle')) return;
    const style = document.createElement('style');
    style.id = 'cfFullArtViewerStyle';
    style.textContent = `
#cfFullArtViewer[hidden]{display:none!important}
#cfFullArtViewer{position:fixed;inset:0;z-index:1000015;background:rgba(247,247,247,.985);display:flex;flex-direction:column;color:#222;font-family:"Roboto",Arial,sans-serif}
#cfFullArtViewer .cf-full-art-bar{height:58px;flex:0 0 58px;display:flex;align-items:center;justify-content:space-between;gap:14px;padding:0 18px;background:#fff;border-bottom:1px solid #e8e8e8;box-sizing:border-box}
#cfFullArtViewer .cf-full-art-title{min-width:0;display:flex;align-items:baseline;gap:10px;overflow:hidden}
#cfFullArtViewer .cf-full-art-title strong{font-size:15px;font-weight:400;white-space:nowrap}
#cfFullArtViewer .cf-full-art-title span{font-size:10px;font-weight:300;color:#8a8a8a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#cfFullArtViewer .cf-full-art-close{flex:0 0 auto;min-height:36px;padding:0 14px;border:1px solid #ddd;border-radius:9px;background:#fff;color:#222;font:500 11px/1 "Roboto",Arial,sans-serif;cursor:pointer}
#cfFullArtViewer .cf-full-art-stage{flex:1;min-height:0;padding:18px;display:flex;align-items:center;justify-content:center;overflow:auto;box-sizing:border-box}
#cfFullArtViewer .cf-full-art-image{display:block;width:auto;height:auto;max-width:100%;max-height:calc(100vh - 94px);object-fit:contain;background:#fff;box-shadow:0 8px 28px rgba(0,0,0,.08)}
#cfFullArtViewer .cf-full-art-loading,#cfFullArtViewer .cf-full-art-error{margin:auto;padding:20px;color:#777;font-size:13px;font-weight:300;text-align:center}
#cfFullArtViewer .cf-full-art-error{color:#8d3a33}
@media(max-width:720px){#cfFullArtViewer .cf-full-art-bar{height:52px;flex-basis:52px;padding:0 10px}#cfFullArtViewer .cf-full-art-title strong{font-size:13px}#cfFullArtViewer .cf-full-art-title span{display:none}#cfFullArtViewer .cf-full-art-close{min-height:34px;padding:0 11px}#cfFullArtViewer .cf-full-art-stage{padding:8px}#cfFullArtViewer .cf-full-art-image{max-height:calc(100vh - 68px);width:100%;height:auto}}
`;
    document.head.appendChild(style);
  }

  function ensureViewer() {
    installStyle();
    let viewer = document.getElementById('cfFullArtViewer');
    if (viewer) return viewer;

    viewer = document.createElement('div');
    viewer.id = 'cfFullArtViewer';
    viewer.hidden = true;
    viewer.innerHTML = `
      <div class="cf-full-art-bar">
        <div class="cf-full-art-title"><strong>Sua arte personalizada</strong><span id="cfFullArtCode"></span></div>
        <button type="button" class="cf-full-art-close" id="cfFullArtClose">FECHAR</button>
      </div>
      <div class="cf-full-art-stage" id="cfFullArtStage"></div>`;
    document.body.appendChild(viewer);

    const close = () => {
      viewer.hidden = true;
      document.documentElement.style.removeProperty('overflow');
      const stage = document.getElementById('cfFullArtStage');
      if (stage) stage.innerHTML = '';
    };
    document.getElementById('cfFullArtClose').addEventListener('click', close);
    viewer.addEventListener('click', event => { if (event.target === viewer) close(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && !viewer.hidden) close(); });
    return viewer;
  }

  async function open(code) {
    code = text(code).toUpperCase();
    if (!/^CF-/i.test(code)) return;

    const viewer = ensureViewer();
    const stage = document.getElementById('cfFullArtStage');
    const codeNode = document.getElementById('cfFullArtCode');
    if (codeNode) codeNode.textContent = code;
    stage.innerHTML = '<div class="cf-full-art-loading">Carregando sua arte…</div>';
    viewer.hidden = false;
    document.documentElement.style.setProperty('overflow', 'hidden');

    try {
      const creation = await fetchCreation(code);
      const source = fullArt(creation || {});
      if (!source) throw new Error('A arte completa desta personalização ainda não está disponível.');
      stage.innerHTML = '';
      const image = document.createElement('img');
      image.className = 'cf-full-art-image';
      image.alt = `Arte personalizada ${code}`;
      image.decoding = 'async';
      image.src = source;
      stage.appendChild(image);
    } catch (error) {
      stage.innerHTML = `<div class="cf-full-art-error">${text(error?.message || 'Não foi possível abrir a arte.')}</div>`;
    }
  }

  document.addEventListener('click', event => {
    const button = event.target?.closest?.('[data-view]');
    if (!button || !button.closest('#cfMyArtsOverlay')) return;
    const code = text(button.dataset.view);
    if (!/^CF-/i.test(code)) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    open(code);
  }, true);

  window.CFMinhasCanecasArtViewer = { open, build:BUILD };
  console.info(`CanecaFácil · visualizador de arte completa ${BUILD}`);
})();
