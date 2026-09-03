(() => {
  'use strict';

  const BUILD = '20260902-canecafacil-commerce-runtime-v3-retention';
  const FIREBASE = 'https://cedar-chemist-310801-default-rtdb.firebaseio.com';
  const NODE = 'canecas/personalizadas';
  const STORE = 'cf_minhas_artes_v1';
  const LOCAL_DAYS = 100;
  const DAYS_WITHOUT_ORDER = 15;
  const DAYS_ORDERED = 90;
  const PERSONALIZER = 'https://donaantonia.com.br/loja-integrada/personalizar/';

  if (window.__CF_COMMERCE_RUNTIME__ === BUILD) return;
  window.__CF_COMMERCE_RUNTIME__ = BUILD;

  const T = value => String(value ?? '').trim();
  const K = value => T(value).replace(/[.#$\[\]/]/g, '_');
  const E = value => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  const IMG = value => /^(https?:\/\/|data:image\/)/i.test(T(value));
  const DAY = 86400000;

  function rows() {
    try {
      const all = JSON.parse(localStorage.getItem(STORE) || '[]');
      const cutoff = Date.now() - LOCAL_DAYS * DAY;
      return (Array.isArray(all) ? all : [])
        .filter(row => row && /^CF-/i.test(T(row.code)) && Number(row.savedAt || 0) >= cutoff)
        .sort((a, b) => Number(b.savedAt || 0) - Number(a.savedAt || 0));
    } catch {
      return [];
    }
  }

  function save(all) {
    try { localStorage.setItem(STORE, JSON.stringify(all.slice(0, 80))); } catch {}
  }

  function remember(code, extra = {}) {
    code = T(code).toUpperCase();
    if (!/^CF-/i.test(code)) return;
    const all = rows().filter(row => T(row.code).toUpperCase() !== code);
    all.unshift({ code, savedAt:Date.now(), ...extra });
    save(all);
    trigger();
  }

  function forget(code) {
    code = T(code).toUpperCase();
    save(rows().filter(row => T(row.code).toUpperCase() !== code));
    trigger();
  }

  async function get(code) {
    const response = await fetch(`${FIREBASE}/${NODE}/${K(code)}.json?_=${Date.now()}`, {
      cache:'no-store', headers:{ Accept:'application/json' }
    });
    if (!response.ok) throw new Error(`Firebase ${response.status}`);
    return response.json();
  }

  async function patch(code, payload) {
    try {
      const response = await fetch(`${FIREBASE}/${NODE}/${K(code)}.json`, {
        method:'PATCH',
        headers:{ 'Content-Type':'application/json', Accept:'application/json' },
        body:JSON.stringify(payload)
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  function art(c = {}) {
    return T(c?.arte_aprovada?.url || c.arte_aprovada_url || c.arte_horizontal || c.arte_personalizacao || c.arte_final_url || c?.arte_impressao?.url);
  }

  function crops(c = {}) {
    const left = T(c?.preview_recortes?.esquerda || c?.preview_recortes?.left || c?.recortes?.esquerda || c?.recortes?.left || c.vitrine_recorte_esquerda || c?.vitrine_recortes?.esquerda || c.recorte_esquerdo || c.recorte_1 || c.crop_left_url);
    const right = T(c?.preview_recortes?.direita || c?.preview_recortes?.right || c?.recortes?.direita || c?.recortes?.right || c.vitrine_recorte_direita || c?.vitrine_recortes?.direita || c.recorte_direito || c.recorte_2 || c.crop_right_url);
    return { left:IMG(left) ? left : '', right:IMG(right) ? right : '' };
  }

  function thumbnail(c = {}) {
    const values = [
      c.miniatura_data_url, c.miniatura_url, c.preview_miniatura, c.thumbnail_url,
      c?.preview?.miniatura, c?.preview?.thumbnail, crops(c).left, art(c)
    ];
    return values.map(T).find(IMG) || '';
  }

  function rawStatus(c = {}) {
    return T(c.atendimento_status || c.status || c?.encomenda?.status || c?.pedido?.status).toLowerCase();
  }

  function status(c = {}) {
    const s = rawStatus(c);
    if (/enviad|entreg/.test(s)) return ['ENVIADA', 'good'];
    if (/produc|impress/.test(s)) return ['EM PRODUÇÃO', 'good'];
    if (/pago|liberado/.test(s)) return ['PAGA', 'good'];
    if (/pedido|encomend/.test(s)) return ['PEDIDO CRIADO', 'order'];
    if (/carrinho/.test(s)) return ['NO CARRINHO', 'cart'];
    if (/gerando|aguard/.test(s)) return ['GERANDO', 'wait'];
    return ['ARTE PRONTA', 'ready'];
  }

  function ordered(c = {}) {
    const s = rawStatus(c);
    return /pedido|encomend|pago|produc|impress|enviad|entreg|liberado/.test(s)
      || Boolean(c.pedido_id || c.pedido_numero || c.pedido_loja_integrada_id || c?.encomenda?.pedido_id || c?.pagamento?.status);
  }

  function protectedArt(c = {}) { return ordered(c); }

  function parseDate(value) {
    const ts = new Date(value || 0).getTime();
    return Number.isFinite(ts) && ts > 0 ? ts : 0;
  }

  function createdTs(c = {}) {
    return parseDate(c.criado_em || c.created_at || c.gerado_em || c.createdAt || c.atualizado_em) || Date.now();
  }

  function retention(c = {}) {
    const hasOrder = ordered(c);
    const policy = c.retencao && typeof c.retencao === 'object' ? c.retencao : {};
    const policyBase = parseDate(policy.base_em);
    const base = policyBase || createdTs(c);
    const days = hasOrder ? DAYS_ORDERED : DAYS_WITHOUT_ORDER;
    let expires = parseDate(policy.expira_em);
    if (!expires || Number(policy.dias) !== days || Boolean(policy.encomendada) !== hasOrder) {
      expires = base + days * DAY;
    }
    const left = Math.max(0, Math.ceil((expires - Date.now()) / DAY));
    return { ordered:hasOrder, days, base, expires, left };
  }

  function dateOf(c = {}) {
    const ts = createdTs(c);
    return ts ? new Date(ts).toLocaleDateString('pt-BR') : '';
  }

  function expiryText(c = {}) {
    const r = retention(c);
    const date = new Date(r.expires).toLocaleDateString('pt-BR');
    if (r.left <= 0) return `Expiração prevista para ${date}`;
    if (r.ordered) return `Salva por 90 dias após a encomenda · expira em ${r.left} ${r.left === 1 ? 'dia' : 'dias'} (${date})`;
    return `Sem pedido: a arte fica salva por 15 dias · expira em ${r.left} ${r.left === 1 ? 'dia' : 'dias'} (${date})`;
  }

  function qty(c = {}) {
    return Math.max(1, Number(c.quantidade || c.quantidade_encomendada || c?.encomenda?.quantidade || 1) || 1);
  }

  function toast(message) {
    let node = document.getElementById('cfArtsToast');
    if (!node) {
      node = document.createElement('div');
      node.id = 'cfArtsToast';
      document.body.appendChild(node);
    }
    node.textContent = message;
    node.classList.add('on');
    clearTimeout(window.__cfArtsToast);
    window.__cfArtsToast = setTimeout(() => node.classList.remove('on'), 2200);
  }

  function style() {
    let style = document.getElementById('cfMyArtsStyle');
    if (!style) {
      style = document.createElement('style');
      style.id = 'cfMyArtsStyle';
      document.head.appendChild(style);
    }
    style.textContent = `
#cfMyArtsTrigger{border:1px solid #dedede;background:#fff;color:#171717;border-radius:999px;min-height:38px;padding:8px 13px;display:inline-flex;align-items:center;gap:7px;font:800 12px/1 Arial,sans-serif;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.06);z-index:9997}#cfMyArtsTrigger .cf-count{display:inline-grid;place-items:center;min-width:20px;height:20px;padding:0 5px;border-radius:999px;background:#ff7420;color:#fff;font-size:10px}#cfMyArtsTrigger.cf-floating{position:fixed;right:14px;top:92px}
#cfMyArtsOverlay[hidden]{display:none!important}#cfMyArtsOverlay{position:fixed;inset:0;background:rgba(0,0,0,.46);z-index:999999;display:flex;justify-content:flex-end}.cf-arts-drawer{width:min(570px,100%);height:100%;background:#f5f5f4;display:flex;flex-direction:column;box-shadow:-12px 0 40px rgba(0,0,0,.16)}.cf-arts-head{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:18px 20px;background:#fff;border-bottom:1px solid #e8e8e8;flex:0 0 auto}.cf-arts-head h2{margin:0;font:900 24px/1.1 Arial,sans-serif;color:#171717}.cf-arts-head p{margin:5px 0 0;color:#777;font:12px/1.4 Arial,sans-serif}.cf-arts-close{border:0;background:#f2f2f2;width:40px;height:40px;border-radius:50%;font-size:25px;cursor:pointer}.cf-arts-list{padding:12px;overflow:auto;display:grid;gap:10px;align-content:start}.cf-art-card{display:grid;grid-template-columns:142px minmax(0,1fr);background:#fff;border:1px solid #e3e3e3;border-radius:15px;overflow:hidden;box-shadow:0 3px 12px rgba(0,0,0,.035)}
.cf-art-thumb{position:relative;border:0;padding:0;margin:0;min-height:164px;background:#f0f0ee;cursor:pointer;overflow:hidden}.cf-art-thumb img{width:100%;height:100%;min-height:164px;display:block;object-fit:cover;object-position:left center}.cf-art-thumb .tag{position:absolute;left:8px;bottom:8px;background:rgba(0,0,0,.72);color:#fff;padding:5px 8px;border-radius:999px;font:900 8px Arial,sans-serif}.cf-art-thumb-empty{height:100%;min-height:164px;display:grid;place-items:center;color:#999;font:800 10px Arial,sans-serif;padding:10px;text-align:center}.cf-art-info{padding:11px 12px 12px;min-width:0}.cf-art-top{display:flex;gap:7px;justify-content:space-between;align-items:center}.cf-art-status{font:900 9px/1 Arial,sans-serif;padding:5px 8px;border-radius:999px;background:#eef7ee;color:#256a32;white-space:nowrap}.cf-art-status.wait{background:#fff4e6;color:#9e5709}.cf-art-status.cart{background:#fff0e7;color:#b04f0d}.cf-art-status.order{background:#eef4ff;color:#315b9a}.cf-art-code{font:700 8px Arial,sans-serif;color:#8a8a8a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cf-art-name{display:block;margin:8px 0 4px;color:#171717;font:900 14px/1.24 Arial,sans-serif}.cf-art-meta{color:#777;font:11px/1.35 Arial,sans-serif}.cf-art-expiry{display:flex;align-items:flex-start;gap:5px;margin-top:7px;padding:7px 8px;border-radius:9px;background:#fff7ef;color:#8c4b1d;font:800 9px/1.35 Arial,sans-serif}.cf-art-expiry.ordered{background:#f0f7f1;color:#30663a}.cf-art-actions{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-top:9px}.cf-art-actions button{min-height:35px;border:1px solid #ddd;border-radius:8px;background:#fff;color:#222;font:900 8.5px/1 Arial,sans-serif;cursor:pointer;padding:6px}.cf-art-actions .buy{background:#ff7420;border-color:#ff7420;color:#fff}.cf-art-actions .del{color:#9f2f2f;background:#fff8f8;border-color:#efd8d8}.cf-arts-empty{padding:28px 16px;text-align:center;color:#777;font:13px/1.45 Arial,sans-serif}
.cf-art-frame-wrap[hidden]{display:none!important}.cf-art-frame-wrap{position:fixed;inset:0;z-index:1000001;background:#fff}.cf-art-frame-bar{height:48px;display:flex;justify-content:space-between;align-items:center;padding:0 12px;border-bottom:1px solid #eee;font:800 12px Arial,sans-serif}.cf-art-frame-bar button{border:0;background:#f1f1f1;border-radius:8px;padding:8px 11px;font-weight:800;cursor:pointer}.cf-art-frame{width:100%;height:calc(100% - 48px);border:0;background:#fff}#cfArtsToast{position:fixed;left:50%;bottom:24px;z-index:1000010;transform:translate(-50%,12px);opacity:0;pointer-events:none;background:#1e1e1e;color:#fff;border-radius:999px;padding:10px 15px;font:800 11px Arial,sans-serif;transition:.18s}#cfArtsToast.on{opacity:1;transform:translate(-50%,0)}
@media(max-width:720px){#cfMyArtsTrigger.cf-floating{top:auto;bottom:76px;right:12px}.cf-arts-drawer{width:100%}.cf-arts-head{padding:15px}.cf-arts-head h2{font-size:22px}.cf-art-card{grid-template-columns:116px minmax(0,1fr)}.cf-art-thumb,.cf-art-thumb img,.cf-art-thumb-empty{min-height:154px}.cf-art-info{padding:9px}.cf-art-name{font-size:13px}.cf-art-actions{gap:4px}.cf-art-actions button{min-height:34px;font-size:8px;padding:4px}.cf-art-expiry{font-size:8.5px}}
`;
  }

  function ui() {
    style();
    let triggerButton = document.getElementById('cfMyArtsTrigger');
    if (!triggerButton) {
      triggerButton = document.createElement('button');
      triggerButton.id = 'cfMyArtsTrigger';
      triggerButton.type = 'button';
      triggerButton.innerHTML = '☕ <span>Minhas Canecas</span> <span class="cf-count">0</span>';
      triggerButton.hidden = true;
      triggerButton.onclick = openDrawer;
      const host = document.querySelector('.cabecalho-interno .conteiner,header .conteiner,.cabecalho .conteiner,.menu.superior .conteiner');
      if (host) host.appendChild(triggerButton);
      else { triggerButton.classList.add('cf-floating'); document.body.appendChild(triggerButton); }
    } else {
      const label = triggerButton.querySelector('span:not(.cf-count)');
      if (label) label.textContent = 'Minhas Canecas';
    }

    let overlay = document.getElementById('cfMyArtsOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'cfMyArtsOverlay';
      overlay.hidden = true;
      overlay.innerHTML = '<aside class="cf-arts-drawer" role="dialog" aria-modal="true"><div class="cf-arts-head"><div><h2>Minhas Canecas</h2><p>Suas canecas criadas neste aparelho. Veja a arte, compre novamente ou apague da lista.</p></div><button type="button" class="cf-arts-close" aria-label="Fechar">×</button></div><div class="cf-arts-list" id="cfMyArtsList"></div></aside>';
      overlay.onclick = event => { if (event.target === overlay || event.target.closest('.cf-arts-close')) closeDrawer(); };
      document.body.appendChild(overlay);
    } else {
      const title = overlay.querySelector('.cf-arts-head h2');
      const intro = overlay.querySelector('.cf-arts-head p');
      if (title) title.textContent = 'Minhas Canecas';
      if (intro) intro.textContent = 'Suas canecas criadas neste aparelho. Veja a arte, compre novamente ou apague da lista.';
    }

    if (!document.getElementById('cfArtFrameWrap')) {
      const wrap = document.createElement('div');
      wrap.id = 'cfArtFrameWrap';
      wrap.className = 'cf-art-frame-wrap';
      wrap.hidden = true;
      wrap.innerHTML = '<div class="cf-art-frame-bar"><span>Sua caneca personalizada</span><button type="button" id="cfCloseArtFrame">FECHAR</button></div><iframe id="cfArtFrame" class="cf-art-frame" title="Sua caneca personalizada"></iframe>';
      document.body.appendChild(wrap);
      document.getElementById('cfCloseArtFrame').onclick = () => {
        wrap.hidden = true;
        document.getElementById('cfArtFrame').src = 'about:blank';
      };
    }
  }

  function trigger() {
    ui();
    const button = document.getElementById('cfMyArtsTrigger');
    const count = rows().length;
    button.hidden = count === 0;
    const badge = button.querySelector('.cf-count');
    if (badge) badge.textContent = count;
  }

  function loadImage(source) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = source;
    });
  }

  async function makeCompactThumb(source) {
    if (!/^https?:\/\//i.test(T(source))) return '';
    try {
      const image = await loadImage(source);
      const width = Number(image.naturalWidth || image.width || 0);
      const height = Number(image.naturalHeight || image.height || 0);
      if (!width || !height) return '';
      const side = Math.min(width, height);
      const sx = 0;
      const sy = Math.max(0, Math.floor((height - side) / 2));
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 320;
      const ctx = canvas.getContext('2d', { alpha:false });
      if (!ctx) return '';
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, 320, 320);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(image, sx, sy, side, side, 0, 0, 320, 320);
      return canvas.toDataURL('image/webp', 0.72);
    } catch {
      return '';
    }
  }

  async function ensureCompactThumb(code, creation) {
    const existing = T(creation.miniatura_data_url || creation.miniatura_url || creation.preview_miniatura);
    if (IMG(existing)) return existing;
    const crop = crops(creation).left;
    if (/^data:image\//i.test(crop)) return crop;
    const source = crop || art(creation);
    const compact = await makeCompactThumb(source);
    if (!compact) return source;
    creation.miniatura_data_url = compact;
    patch(code, { miniatura_data_url:compact, miniatura_gerada_em:new Date().toISOString() });
    return compact;
  }

  async function removeCreation(code, creation) {
    if (protectedArt(creation)) {
      if (!confirm('Esta caneca já está vinculada a um pedido. Ela será removida apenas desta lista neste aparelho; o registro do pedido será preservado por 90 dias.')) return;
      forget(code);
      toast('Caneca removida deste aparelho');
      renderArts();
      return;
    }
    if (!confirm('Apagar esta arte? Ela também será removida do registro de personalizações e não poderá ser recuperada.')) return;
    try {
      const response = await fetch(`${FIREBASE}/${NODE}/${K(code)}.json`, { method:'DELETE', headers:{ Accept:'application/json' } });
      if (!response.ok) throw new Error();
      forget(code);
      toast('Arte apagada');
      renderArts();
    } catch {
      forget(code);
      toast('Removida da lista; o registro remoto não pôde ser apagado');
      renderArts();
    }
  }

  async function renderArts() {
    const root = document.getElementById('cfMyArtsList');
    const all = rows();
    if (!all.length) {
      root.innerHTML = '<div class="cf-arts-empty">Você ainda não possui canecas criadas neste aparelho.</div>';
      return;
    }

    root.innerHTML = '<div class="cf-arts-empty">Carregando suas canecas…</div>';
    const html = [];
    const map = {};
    const missing = new Set();

    for (const row of all) {
      try {
        const creation = await get(row.code);
        if (!creation) { missing.add(row.code); continue; }
        map[row.code] = creation;
        const [st, cl] = status(creation);
        let thumb = thumbnail(creation);
        if (!T(creation.miniatura_data_url || creation.miniatura_url || creation.preview_miniatura)) {
          thumb = await ensureCompactThumb(row.code, creation) || thumb;
        }
        const name = T(creation.modelo_nome || 'Caneca personalizada');
        const dt = dateOf(creation);
        const q = qty(creation);
        const ret = retention(creation);
        html.push(`<article class="cf-art-card" data-code="${E(row.code)}">
          <button class="cf-art-thumb" type="button" data-view="${E(row.code)}" aria-label="Ver arte ${E(name)}">
            ${IMG(thumb) ? `<img loading="lazy" decoding="async" width="320" height="320" src="${E(thumb)}" alt="${E(name)}">` : '<span class="cf-art-thumb-empty">Miniatura indisponível</span>'}
            <span class="tag">VER ARTE</span>
          </button>
          <div class="cf-art-info">
            <div class="cf-art-top"><span class="cf-art-status ${E(cl)}">${E(st)}</span><span class="cf-art-code">${E(row.code)}</span></div>
            <strong class="cf-art-name">${E(name)}</strong>
            <div class="cf-art-meta">${dt ? `Criada em ${E(dt)} · ` : ''}${q} ${q === 1 ? 'unidade' : 'unidades'}</div>
            <div class="cf-art-expiry ${ret.ordered ? 'ordered' : ''}"><span>⏱</span><span>${E(expiryText(creation))}</span></div>
            <div class="cf-art-actions">
              <button type="button" data-view="${E(row.code)}">VER ARTE</button>
              <button type="button" class="buy" data-buy="${E(row.code)}">COMPRAR</button>
              <button type="button" class="del" data-del="${E(row.code)}">APAGAR</button>
            </div>
          </div>
        </article>`);
      } catch {}
    }

    if (missing.size) {
      save(all.filter(row => !missing.has(row.code)));
      trigger();
    }

    root.innerHTML = html.join('') || '<div class="cf-arts-empty">As canecas salvas neste aparelho não estão mais disponíveis.</div>';
    root.onclick = event => {
      const button = event.target.closest('[data-view],[data-buy],[data-del]');
      if (!button) return;
      event.preventDefault();
      const code = button.dataset.view || button.dataset.buy || button.dataset.del;
      const creation = map[code] || {};
      if (button.dataset.del) return removeCreation(code, creation);
      openCreation(code);
    };
  }

  function openDrawer() {
    ui();
    document.getElementById('cfMyArtsOverlay').hidden = false;
    renderArts();
  }

  function closeDrawer() {
    const node = document.getElementById('cfMyArtsOverlay');
    if (node) node.hidden = true;
  }

  function openCreation(code) {
    code = T(code).toUpperCase();
    if (!/^CF-/i.test(code)) return;
    remember(code);
    ui();
    closeDrawer();
    const wrap = document.getElementById('cfArtFrameWrap');
    const frame = document.getElementById('cfArtFrame');
    const url = new URL(PERSONALIZER);
    url.searchParams.set('creation', code);
    url.searchParams.set('embed', '1');
    url.searchParams.set('ui', 'minhas-canecas');
    url.searchParams.set('return', location.href.split('#')[0]);
    frame.src = url.href;
    wrap.hidden = false;
  }

  window.addEventListener('message', event => {
    if (event.origin !== 'https://donaantonia.com.br') return;
    const data = event.data || {};
    if (data.type === 'canecafacil:minha-arte') remember(data.code, { status:T(data.status), modelId:T(data.modelId) });
  });

  function consume() {
    const url = new URL(location.href);
    const code = T(url.searchParams.get('cf_arte')).toUpperCase();
    if (!/^CF-/i.test(code)) return;
    remember(code);
    url.searchParams.delete('cf_arte');
    history.replaceState(history.state, '', url.href);
    setTimeout(() => openCreation(code), 300);
  }

  const start = () => { ui(); trigger(); consume(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();

  window.CFMinhasArtes = { open:openDrawer, add:remember, openCreation };
  window.CFMinhasCanecas = window.CFMinhasArtes;
  console.info(`CanecaFácil · Minhas Canecas ${BUILD}`);
})();
