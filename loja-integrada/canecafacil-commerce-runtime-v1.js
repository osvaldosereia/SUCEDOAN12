(() => {
  'use strict';

  const BUILD = '20260902-canecafacil-commerce-runtime-v1.2';
  const FIREBASE = 'https://cedar-chemist-310801-default-rtdb.firebaseio.com';
  const CREATIONS_NODE = 'canecas/personalizadas';
  const ART_STORAGE = 'cf_minhas_artes_v1';
  const MAX_DAYS = 30;
  const PERSONALIZER = 'https://donaantonia.com.br/loja-integrada/personalizar/';
  const BRIDGE = 'https://donaantonia.com.br/loja-integrada/personalized-order-bridge-v2.js?v=20260902-4';

  if (window.__CF_COMMERCE_RUNTIME__ === BUILD) return;
  window.__CF_COMMERCE_RUNTIME__ = BUILD;

  const text = value => String(value ?? '').trim();
  const safeKey = value => text(value).replace(/[.#$\[\]/]/g, '_');
  const esc = value => String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  const validImage = value => /^(?:https?:\/\/|data:image\/)/i.test(text(value));

  function loadBridge() {
    if ([...document.scripts].some(script => /personalized-order-bridge-v2\.js/i.test(script.src || ''))) return;
    const script = document.createElement('script');
    script.src = BRIDGE;
    script.async = true;
    script.onerror = () => console.error('[CanecaFácil] Falha ao carregar vínculo do carrinho personalizado.');
    document.head.appendChild(script);
  }

  function readArts() {
    try {
      const rows = JSON.parse(localStorage.getItem(ART_STORAGE) || '[]');
      const cutoff = Date.now() - MAX_DAYS * 86400000;
      return (Array.isArray(rows) ? rows : [])
        .filter(row => row && /^CF-/i.test(text(row.code)) && Number(row.savedAt || 0) >= cutoff)
        .sort((a,b) => Number(b.savedAt || 0) - Number(a.savedAt || 0));
    } catch { return []; }
  }

  function saveArts(rows) {
    try { localStorage.setItem(ART_STORAGE, JSON.stringify(rows.slice(0, 60))); } catch {}
  }

  function rememberArt(code, extra = {}) {
    code = text(code).toUpperCase();
    if (!/^CF-/i.test(code)) return;
    const rows = readArts().filter(row => text(row.code).toUpperCase() !== code);
    rows.unshift({ code, savedAt:Date.now(), ...extra });
    saveArts(rows);
    renderTrigger();
  }

  async function fetchCreation(code) {
    const response = await fetch(`${FIREBASE}/${CREATIONS_NODE}/${safeKey(code)}.json?_=${Date.now()}`, { cache:'no-store', headers:{ Accept:'application/json' } });
    if (!response.ok) throw new Error(`Firebase ${response.status}`);
    return response.json();
  }

  function artUrl(creation = {}) {
    return text(creation?.arte_aprovada?.url || creation.arte_horizontal || creation.arte_personalizacao || creation.arte_final_url || creation.arte_impressao?.url);
  }

  function cropUrls(creation = {}) {
    const left = text(
      creation?.preview_recortes?.esquerda || creation?.recortes?.esquerda || creation?.vitrine_recorte_esquerda ||
      creation?.vitrine_recortes?.esquerda || creation?.recorte_esquerdo || creation?.recorte_1 || creation?.crop_left_url
    );
    const right = text(
      creation?.preview_recortes?.direita || creation?.recortes?.direita || creation?.vitrine_recorte_direita ||
      creation?.vitrine_recortes?.direita || creation?.recorte_direito || creation?.recorte_2 || creation?.crop_right_url
    );
    return { left:validImage(left) ? left : '', right:validImage(right) ? right : '' };
  }

  function statusInfo(creation = {}) {
    const raw = text(creation.atendimento_status || creation.status || creation?.encomenda?.status).toLowerCase();
    if (/enviad/.test(raw)) return ['ENVIADA','good'];
    if (/produc|impress|pago/.test(raw)) return ['EM PRODUÇÃO','good'];
    if (/carrinho/.test(raw)) return ['NO CARRINHO','cart'];
    if (/encomend|pedido/.test(raw)) return ['ENCOMENDADA','good'];
    if (/gerando|aguard/.test(raw)) return ['GERANDO','wait'];
    return ['ARTE PRONTA','ready'];
  }

  function installStyle() {
    if (document.getElementById('cfMyArtsStyle')) return;
    const style = document.createElement('style');
    style.id = 'cfMyArtsStyle';
    style.textContent = `
      #cfMyArtsTrigger{border:1px solid #dedede;background:#fff;color:#171717;border-radius:999px;min-height:38px;padding:8px 13px;display:inline-flex;align-items:center;gap:7px;font:800 12px/1 Arial,sans-serif;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.06);z-index:9997}
      #cfMyArtsTrigger .cf-count{display:inline-grid;place-items:center;min-width:20px;height:20px;padding:0 5px;border-radius:999px;background:#ff7420;color:#fff;font-size:10px}
      #cfMyArtsTrigger.cf-floating{position:fixed;right:14px;top:92px}
      #cfMyArtsOverlay[hidden]{display:none!important}#cfMyArtsOverlay{position:fixed;inset:0;background:rgba(0,0,0,.48);z-index:999999;display:flex;justify-content:flex-end}
      .cf-arts-drawer{width:min(460px,100%);height:100%;background:#fff;display:flex;flex-direction:column;box-shadow:-12px 0 40px rgba(0,0,0,.16)}
      .cf-arts-head{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:18px;border-bottom:1px solid #eee;flex:0 0 auto}.cf-arts-head h2{margin:0;font:900 22px/1.1 Arial,sans-serif;color:#171717}.cf-arts-head p{margin:4px 0 0;color:#737373;font:12px/1.35 Arial,sans-serif}.cf-arts-close{border:0;background:#f2f2f2;width:38px;height:38px;border-radius:50%;font-size:25px;cursor:pointer}
      .cf-arts-list{padding:14px;overflow:auto;display:grid;gap:14px;align-content:start}.cf-art-card{border:1px solid #e4e4e4;border-radius:16px;overflow:hidden;background:#fff;box-shadow:0 3px 12px rgba(0,0,0,.035)}
      .cf-art-media{position:relative;width:100%;height:190px;border:0;padding:0;margin:0;background:#f3f3f1;display:flex;align-items:center;justify-content:center;overflow:hidden;cursor:pointer}
      .cf-art-media img{display:block;width:100%;height:100%;object-fit:contain;background:#f3f3f1}.cf-art-media:hover .cf-art-open{opacity:1}.cf-art-open{position:absolute;right:10px;bottom:10px;background:rgba(20,20,20,.82);color:#fff;border-radius:999px;padding:6px 9px;font:800 9px/1 Arial,sans-serif;opacity:.9}
      .cf-art-side-strip{display:flex;gap:4px;padding:4px;background:#eceeed}.cf-art-side-strip img{width:50%;height:62px;object-fit:contain;background:#fff;border-radius:7px}
      .cf-art-body{padding:12px}.cf-art-top{display:flex;justify-content:space-between;gap:8px;align-items:center}.cf-art-status{font:900 10px/1 Arial,sans-serif;padding:5px 7px;border-radius:999px;background:#eef7ee;color:#256a32}.cf-art-status.wait{background:#fff4e6;color:#a65400}.cf-art-status.cart{background:#fff0e7;color:#b04f0d}.cf-art-code{color:#777;font:700 9px/1 Arial,sans-serif;max-width:52%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cf-art-body strong{display:block;margin:8px 0 3px;font:900 14px/1.25 Arial,sans-serif;color:#171717}.cf-art-body small{display:block;color:#777;font:11px/1.35 Arial,sans-serif}.cf-art-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:11px}.cf-art-actions button{min-height:42px;border-radius:10px;border:1px solid #d8d8d8;background:#fff;color:#171717;font:900 11px Arial,sans-serif;cursor:pointer}.cf-art-actions .primary{border-color:#ff7420;background:#ff7420;color:#fff}.cf-art-actions button:hover{filter:brightness(.97)}
      .cf-arts-empty{padding:30px 16px;text-align:center;color:#777;font:13px/1.45 Arial,sans-serif}.cf-art-frame-wrap[hidden]{display:none!important}.cf-art-frame-wrap{position:fixed;inset:0;z-index:1000001;background:#fff}.cf-art-frame-bar{height:48px;display:flex;justify-content:space-between;align-items:center;padding:0 12px;border-bottom:1px solid #eee;font:800 12px Arial,sans-serif}.cf-art-frame-bar button{border:0;background:#f1f1f1;border-radius:8px;padding:8px 11px;font-weight:800;cursor:pointer}.cf-art-frame{width:100%;height:calc(100% - 48px);border:0;background:#fff}
      @media(max-width:720px){#cfMyArtsTrigger.cf-floating{top:auto;bottom:76px;right:12px}.cf-arts-drawer{width:100%}.cf-art-media{height:175px}.cf-art-side-strip img{height:54px}}
    `;
    document.head.appendChild(style);
  }

  function ensureUi() {
    installStyle();
    if (!document.getElementById('cfMyArtsTrigger')) {
      const trigger = document.createElement('button');
      trigger.id = 'cfMyArtsTrigger';
      trigger.type = 'button';
      trigger.innerHTML = `☕ <span>Minhas Artes</span> <span class="cf-count">0</span>`;
      trigger.hidden = true;
      trigger.addEventListener('click', openDrawer);
      const host = document.querySelector('.cabecalho-interno .conteiner,header .conteiner,.cabecalho .conteiner,.menu.superior .conteiner');
      if (host) host.appendChild(trigger);
      else { trigger.classList.add('cf-floating'); document.body.appendChild(trigger); }
    }
    if (!document.getElementById('cfMyArtsOverlay')) {
      const overlay = document.createElement('div');
      overlay.id = 'cfMyArtsOverlay'; overlay.hidden = true;
      overlay.innerHTML = `<aside class="cf-arts-drawer" role="dialog" aria-modal="true" aria-label="Minhas Artes"><div class="cf-arts-head"><div><h2>Minhas Artes</h2><p>Criações geradas neste aparelho. O e-mail recupera em outro dispositivo.</p></div><button type="button" class="cf-arts-close" aria-label="Fechar">×</button></div><div class="cf-arts-list" id="cfMyArtsList"></div></aside>`;
      overlay.addEventListener('click', event => { if (event.target === overlay || event.target.closest('.cf-arts-close')) closeDrawer(); });
      document.body.appendChild(overlay);
    }
    if (!document.getElementById('cfArtFrameWrap')) {
      const wrap = document.createElement('div');
      wrap.id = 'cfArtFrameWrap'; wrap.className = 'cf-art-frame-wrap'; wrap.hidden = true;
      wrap.innerHTML = `<div class="cf-art-frame-bar"><span>Sua arte personalizada</span><button type="button" id="cfCloseArtFrame">FECHAR</button></div><iframe id="cfArtFrame" class="cf-art-frame" title="Sua arte personalizada"></iframe>`;
      document.body.appendChild(wrap);
      document.getElementById('cfCloseArtFrame').addEventListener('click', () => { wrap.hidden = true; document.getElementById('cfArtFrame').src = 'about:blank'; });
    }
  }

  function renderTrigger() {
    ensureUi();
    const trigger = document.getElementById('cfMyArtsTrigger');
    const count = readArts().length;
    trigger.hidden = count === 0;
    trigger.querySelector('.cf-count').textContent = count;
  }

  async function renderArts() {
    const root = document.getElementById('cfMyArtsList');
    const rows = readArts();
    if (!rows.length) { root.innerHTML = '<div class="cf-arts-empty">Você ainda não gerou nenhuma arte neste aparelho.</div>'; return; }
    root.innerHTML = '<div class="cf-arts-empty">Carregando suas artes…</div>';
    const cards = [];
    for (const row of rows) {
      try {
        const creation = await fetchCreation(row.code);
        if (!creation) continue;
        const image = artUrl(creation);
        const crops = cropUrls(creation);
        const [status, statusClass] = statusInfo(creation);
        const name = text(creation.modelo_nome || 'Caneca personalizada');
        const when = creation.criado_em ? new Date(creation.criado_em).toLocaleDateString('pt-BR') : '';
        const media = validImage(image)
          ? `<button type="button" class="cf-art-media" data-cf-view="${esc(row.code)}" aria-label="Abrir arte ${esc(row.code)}"><img src="${esc(image)}" alt="Arte horizontal completa ${esc(row.code)}"><span class="cf-art-open">ABRIR ARTE</span></button>`
          : `<button type="button" class="cf-art-media" data-cf-view="${esc(row.code)}" aria-label="Abrir arte ${esc(row.code)}"><span class="cf-art-open">ABRIR ARTE</span></button>`;
        const sides = crops.left && crops.right
          ? `<div class="cf-art-side-strip" aria-label="Dois lados da arte"><img src="${esc(crops.left)}" alt="Lado 1"><img src="${esc(crops.right)}" alt="Lado 2"></div>`
          : '';
        const action = /encomend|produ|enviad|pago/.test(status.toLowerCase()) ? 'ACOMPANHAR' : 'COMPRAR';
        cards.push(`<article class="cf-art-card" data-code="${esc(row.code)}">${media}${sides}<div class="cf-art-body"><div class="cf-art-top"><span class="cf-art-status ${esc(statusClass)}">${esc(status)}</span><span class="cf-art-code">${esc(row.code)}</span></div><strong>${esc(name)}</strong><small>${esc(when)}</small><div class="cf-art-actions"><button type="button" data-cf-view="${esc(row.code)}">VER ARTE</button><button type="button" class="primary" data-cf-buy="${esc(row.code)}">${action}</button></div></div></article>`);
      } catch {}
    }
    root.innerHTML = cards.join('') || '<div class="cf-arts-empty">As artes salvas neste aparelho não estão mais disponíveis.</div>';
    root.querySelectorAll('[data-cf-view],[data-cf-buy]').forEach(button => button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      openCreation(button.dataset.cfView || button.dataset.cfBuy);
    }));
  }

  function openDrawer() {
    ensureUi();
    document.getElementById('cfMyArtsOverlay').hidden = false;
    renderArts();
  }
  function closeDrawer() { const node = document.getElementById('cfMyArtsOverlay'); if (node) node.hidden = true; }

  function openCreation(code) {
    code = text(code).toUpperCase();
    if (!/^CF-/i.test(code)) return;
    rememberArt(code);
    ensureUi(); closeDrawer();
    const wrap = document.getElementById('cfArtFrameWrap');
    const frame = document.getElementById('cfArtFrame');
    const url = new URL(PERSONALIZER);
    url.searchParams.set('creation', code);
    url.searchParams.set('embed', '1');
    url.searchParams.set('ui', 'minhas-artes');
    url.searchParams.set('return', location.href.split('#')[0]);
    frame.src = url.href;
    wrap.hidden = false;
  }

  window.addEventListener('message', event => {
    if (event.origin !== 'https://donaantonia.com.br') return;
    const data = event.data || {};
    if (data.type !== 'canecafacil:minha-arte') return;
    rememberArt(data.code, { status:text(data.status), modelId:text(data.modelId) });
  });

  function consumeArtParam() {
    const url = new URL(location.href);
    const code = text(url.searchParams.get('cf_arte')).toUpperCase();
    if (!/^CF-/i.test(code)) return;
    rememberArt(code);
    url.searchParams.delete('cf_arte');
    history.replaceState(history.state, '', url.href);
    setTimeout(() => openCreation(code), 350);
  }

  loadBridge();
  const start = () => { ensureUi(); renderTrigger(); consumeArtParam(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();

  window.CFMinhasArtes = { open:openDrawer, add:rememberArt, openCreation };
  console.info(`CanecaFácil · Minhas Artes ${BUILD}`);
})();
