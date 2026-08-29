import {
  FIREBASE_BASE, MUG_NODES, text, norm, money, dateTime, mugImage, mugArt,
  fbWrite, audit, safeKey, nowIso
} from '../shared/mug-commerce-v1.js?v=20260828-1';

const BUILD = '20260829-admin-canecas-catalog-manager-v3';
const MAKE_WEBHOOK = 'https://hook.eu1.make.com/cl3r1f56r9txezvltkkwlsspmnja6sw4';
const PERSONALIZER_BASE = 'https://donaantonia.com.br/loja-integrada/personalizar/';
const LOAD_TIMEOUT = 20000;

const state = {
  products: [],
  query: '',
  filter: 'all',
  loading: false,
  loaded: false,
  lastError: '',
};

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');

function productKey(p = {}) { return text(p.firebaseKey || p.id || p.__key); }
function isMug(p = {}) {
  const hay = norm([p.tipo_produto, p.categoria, p.subcategoria, p.subsubcategoria, p.nome, p.origem_cadastro].join(' '));
  return hay.includes('caneca');
}
function daActive(p = {}) {
  if (p.ativo === true) return true;
  if (p.ativo === false) return false;
  return ['a', 'ativo', 'ativa', 'active', '1', 'true', 's', 'sim'].includes(norm(p.situacao || p.status || p.ativo));
}
function liActive(p = {}) {
  if (p.loja_integrada_ativo === true) return true;
  if (p.loja_integrada_ativo === false) return false;
  return p.canecafacil_ativo === true;
}
function isPersonalizable(p = {}) {
  return p.loja_integrada_personalizavel === true || p.canecafacil_personalizavel === true || p.personalizavel === true || p.personalizacao_publica === true;
}
function liMeta(p = {}) { return p.loja_integrada && typeof p.loja_integrada === 'object' ? p.loja_integrada : {}; }
function numberValue(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const raw = text(v).replace(/\s/g, '');
  if (!raw) return 0;
  const parsed = Number(raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw);
  return Number.isFinite(parsed) ? parsed : 0;
}
function images(p = {}) {
  const arrays = [p.imagens_site, p.imagens, p.fotos, p.images].filter(Array.isArray).flat();
  const values = [p.mockup_1, p.mockup_2, p.mockup_3, ...arrays, p.url_imagem, p.imagem_url, p.imagem]
    .map(v => typeof v === 'object' ? (v?.url || v?.src || '') : v)
    .map(text)
    .filter(v => /^https?:\/\//i.test(v));
  return [...new Set(values)].slice(0, 5);
}
function slug(value) {
  return norm(value).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120) || `caneca-${Date.now()}`;
}
function setFirebaseStatus(message, type = '') {
  const status = $('#firebaseStatus');
  const dot = $('#firebaseDot');
  if (status) status.textContent = message;
  if (dot) dot.className = type;
}
function showToast(message, error = false) {
  const el = $('#toast');
  if (!el) return window.alert(message);
  el.textContent = message;
  el.className = `toast${error ? ' error' : ''}`;
  el.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { el.hidden = true; }, error ? 6000 : 3200);
}
async function fetchWithTimeout(url, options = {}, timeout = LOAD_TIMEOUT) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...options, signal: controller.signal, cache: 'no-store' });
  } finally {
    clearTimeout(timer);
  }
}
async function loadProducts(force = false) {
  if (state.loading) return;
  if (state.loaded && !force) { render(); return; }
  state.loading = true;
  state.lastError = '';
  setFirebaseStatus('Carregando catálogo de canecas…');
  try {
    const response = await fetchWithTimeout(`${FIREBASE_BASE}/${MUG_NODES.products}.json?_=${Date.now()}`);
    if (!response.ok) throw new Error(`Firebase ${response.status}`);
    const data = await response.json();
    state.products = Object.entries(data || {})
      .map(([__key, value]) => ({ __key, ...(value || {}) }))
      .filter(isMug)
      .sort((a, b) => Number(b.last_update || 0) - Number(a.last_update || 0) || text(a.nome).localeCompare(text(b.nome), 'pt-BR'));
    state.loaded = true;
    setFirebaseStatus(`Conectado · ${state.products.length} caneca(s)`, 'good');
  } catch (error) {
    state.lastError = error?.name === 'AbortError' ? 'Tempo esgotado ao carregar /produtos.' : (error?.message || String(error));
    setFirebaseStatus(`Erro · ${state.lastError}`, 'bad');
    showToast(`Catálogo: ${state.lastError}`, true);
  } finally {
    state.loading = false;
    render();
  }
}
function syncLabel(p = {}) {
  const m = liMeta(p);
  if (m.sync_status === 'erro') return ['ERRO', 'bad'];
  if (m.sync_status === 'enviando' || m.sync_status === 'pendente') return ['PENDENTE', 'warn'];
  if (m.produto_id && m.sync_status === 'sincronizado') return ['SINCRONIZADA', 'good'];
  if (m.produto_id) return ['VINCULADA', ''];
  return ['NÃO PUBLICADA', ''];
}
function matchesFilter(p) {
  if (state.filter === 'da') return daActive(p);
  if (state.filter === 'li') return liActive(p) || Boolean(liMeta(p).produto_id);
  if (state.filter === 'personal') return isPersonalizable(p);
  if (state.filter === 'error') return liMeta(p).sync_status === 'erro';
  return true;
}
function visibleProducts() {
  const q = norm(state.query);
  return state.products.filter(p => matchesFilter(p) && (!q || norm(`${p.nome} ${p.codigo} ${p.sku} ${p.categoria} ${p.subcategoria} ${p.tema_caneca}`).includes(q)));
}
function metric(label, value, detail = '') {
  return `<div class="metric"><strong>${value}</strong><span>${esc(label)}</span>${detail ? `<small>${esc(detail)}</small>` : ''}</div>`;
}
function row(p) {
  const key = productKey(p);
  const [sync, syncClass] = syncLabel(p);
  const li = liMeta(p);
  return `<tr data-cf-mug="${esc(key)}">
    <td><div class="product-cell">${mugImage(p) ? `<img class="thumb" src="${esc(mugImage(p))}" loading="lazy">` : ''}<div><strong>${esc(p.nome || 'Caneca')}</strong><small>${esc(p.tema_caneca || p.subcategoria || p.categoria || '')}</small></div></div></td>
    <td>${esc(p.codigo || p.sku || '—')}</td>
    <td>${money(p.preco)}</td>
    <td><span class="badge ${daActive(p) ? 'good' : ''}">${daActive(p) ? 'ATIVA' : 'INATIVA'}</span></td>
    <td><span class="badge ${liActive(p) ? 'cf' : ''}">${liActive(p) ? 'ATIVA' : 'INATIVA'}</span>${li.produto_id ? `<small style="display:block;margin-top:4px">ID ${esc(li.produto_id)}</small>` : ''}</td>
    <td><span class="badge ${isPersonalizable(p) ? 'warn' : ''}">${isPersonalizable(p) ? 'SIM' : 'NÃO'}</span></td>
    <td><span class="badge ${syncClass}">${sync}</span>${li.sync_error ? `<small style="display:block;max-width:220px;margin-top:4px;color:#9d302d">${esc(li.sync_error)}</small>` : ''}</td>
  </tr>`;
}
function render() {
  if (!location.hash.includes('mugs')) return;
  const root = $('#mugs');
  if (!root) return;
  const visible = visibleProducts();
  const daCount = state.products.filter(daActive).length;
  const liCount = state.products.filter(liActive).length;
  const pending = state.products.filter(p => ['pendente', 'enviando', 'erro'].includes(liMeta(p).sync_status)).length;
  root.dataset.cfCatalogManager = BUILD;
  root.innerHTML = `
    <div class="metrics" style="margin-bottom:12px">
      ${metric('Canecas no cadastro', state.products.length)}
      ${metric('Ativas Dona Antônia', daCount)}
      ${metric('Ativas Loja Integrada', liCount)}
      ${metric('Sincronização pendente/erro', pending)}
    </div>
    <div class="toolbar" id="cfCatalogToolbar">
      <input id="cfMugSearch" type="search" placeholder="Buscar nome, código, tema ou categoria…" value="${esc(state.query)}">
      <select id="cfMugFilter">
        <option value="all" ${state.filter === 'all' ? 'selected' : ''}>Todas as canecas</option>
        <option value="da" ${state.filter === 'da' ? 'selected' : ''}>Ativas Dona Antônia</option>
        <option value="li" ${state.filter === 'li' ? 'selected' : ''}>Loja Integrada</option>
        <option value="personal" ${state.filter === 'personal' ? 'selected' : ''}>Personalizáveis</option>
        <option value="error" ${state.filter === 'error' ? 'selected' : ''}>Erros de sincronização</option>
      </select>
      <button class="secondary" id="cfMugReload" type="button">Atualizar</button>
    </div>
    <div class="notice" style="margin:0 0 12px"><b>Admin Canecas é a fonte de controle.</b> Dona Antônia usa o status principal do Firebase. A Loja Integrada usa o status próprio e sincroniza pelo Make, sem expor token no navegador.</div>
    ${state.lastError ? `<div class="notice warn" style="margin-bottom:12px">${esc(state.lastError)}</div>` : ''}
    <section class="panel"><div class="table-wrap"><table class="table"><thead><tr><th>Caneca</th><th>SKU</th><th>Preço</th><th>Dona Antônia</th><th>Loja Integrada</th><th>Personalizável</th><th>Sincronização</th></tr></thead><tbody>${visible.map(row).join('') || `<tr><td colspan="7" class="empty">${state.loading ? 'Carregando canecas…' : 'Nenhuma caneca encontrada.'}</td></tr>`}</tbody></table></div></section>`;

  $('#cfMugSearch')?.addEventListener('input', e => { state.query = e.target.value; render(); });
  $('#cfMugFilter')?.addEventListener('change', e => { state.filter = e.target.value; render(); });
  $('#cfMugReload')?.addEventListener('click', () => loadProducts(true));
  $$('[data-cf-mug]', root).forEach(tr => tr.addEventListener('click', () => openDrawer(state.products.find(p => productKey(p) === tr.dataset.cfMug))));
}
function field(label, id, value = '', opts = '') { return `<label>${esc(label)}<input id="${id}" value="${esc(value)}" ${opts}></label>`; }
function textArea(label, id, value = '') { return `<label class="span2">${esc(label)}<textarea id="${id}" rows="5">${esc(value)}</textarea></label>`; }
function selectField(label, id, yes, yesLabel = 'Ativa', noLabel = 'Inativa') {
  return `<label>${esc(label)}<select id="${id}"><option value="1" ${yes ? 'selected' : ''}>${esc(yesLabel)}</option><option value="0" ${!yes ? 'selected' : ''}>${esc(noLabel)}</option></select></label>`;
}
function openDrawer(p) {
  if (!p) return;
  const key = productKey(p);
  const li = liMeta(p);
  const imgs = images(p);
  const drawer = $('#drawer');
  const overlay = $('#overlay');
  const content = $('#drawerContent');
  if (!drawer || !content) return;
  content.innerHTML = `<h2>${esc(p.nome || 'Caneca')}</h2>
    <div class="subtitle">Firebase ${esc(key)} · ${li.produto_id ? `Loja Integrada #${esc(li.produto_id)}` : 'ainda não publicada na Loja Integrada'}</div>
    ${mugImage(p) ? `<img src="${esc(mugImage(p))}" style="width:100%;max-height:250px;object-fit:contain;background:#f3f4f0;border-radius:12px">` : ''}
    <div class="form-section"><h3>Canais</h3><div class="form">
      ${selectField('Dona Antônia', 'cfDaActive', daActive(p))}
      ${selectField('Loja Integrada', 'cfLiActive', liActive(p))}
      ${selectField('Permitir personalização', 'cfPersonalizable', isPersonalizable(p), 'Sim', 'Não')}
      ${selectField('Destaque na loja', 'cfFeatured', p.destaque === true, 'Sim', 'Não')}
    </div></div>
    <div class="form-section"><h3>Produto</h3><div class="form">
      <label class="span2">Nome<input id="cfName" value="${esc(p.nome)}"></label>
      ${field('SKU / código', 'cfSku', p.codigo || p.sku)}
      ${field('Preço cheio', 'cfPrice', numberValue(p.preco), 'type="number" step="0.01" min="0"')}
      ${field('Preço promocional', 'cfPromo', numberValue(p.preco_oferta || p.preco_promocional) || '', 'type="number" step="0.01" min="0"')}
      ${field('Preço de custo', 'cfCost', numberValue(p.preco_custo || p.custo) || '', 'type="number" step="0.01" min="0"')}
      ${field('Estoque Loja Integrada', 'cfStock', Number(p.estoque ?? 100), 'type="number" step="1" min="0"')}
      ${field('NCM', 'cfNcm', p.ncm)}
      ${field('GTIN / EAN', 'cfGtin', p.gtin || p.ean || p.codigo_barras)}
      ${field('MPN', 'cfMpn', p.mpn)}
      ${textArea('Descrição comercial', 'cfDescription', p.descricao_completa || p.descricao_html || p.descricao || '')}
    </div></div>
    <div class="form-section"><h3>SEO Loja Integrada</h3><div class="form">
      <label class="span2">Título SEO<input id="cfSeoTitle" value="${esc(p.seo_title || p.seo_tag_title || p.meta_title || p.nome || '')}"></label>
      <label class="span2">Descrição SEO<input id="cfSeoDescription" maxlength="160" value="${esc(p.seo_description || p.seo_tag_description || p.meta_description || '')}"></label>
      <label class="span2">Palavras-chave<input id="cfSeoKeywords" value="${esc(p.seo_keywords || (Array.isArray(p.tags) ? p.tags.join(', ') : p.tags || ''))}"></label>
      ${field('Categoria URI Loja Integrada', 'cfLiCategory', li.categoria_uri || p.loja_integrada_categoria_uri || '', 'placeholder="/api/v1/categoria/123/"')}
      ${field('Marca URI Loja Integrada', 'cfLiBrand', li.marca_uri || p.loja_integrada_marca_uri || '', 'placeholder="/api/v1/marca/123/"')}
    </div></div>
    <div class="form-section"><h3>Arte e imagens</h3><div class="form">
      <label class="span2">Arte horizontal de impressão<input id="cfArt" value="${esc(mugArt(p))}"></label>
      <label class="span2">Mockup 1<input id="cfMockup1" value="${esc(p.mockup_1 || imgs[0] || '')}"></label>
      <label class="span2">Mockup 2<input id="cfMockup2" value="${esc(p.mockup_2 || imgs[1] || '')}"></label>
      <label class="span2">Mockup 3<input id="cfMockup3" value="${esc(p.mockup_3 || imgs[2] || '')}"></label>
    </div></div>
    <div class="form-section"><h3>Embalagem / frete</h3><div class="form">
      ${field('Peso (kg)', 'cfWeight', p.peso_embalado_kg || p.peso || '', 'type="number" step="0.001" min="0"')}
      ${field('Altura (cm)', 'cfHeight', p.altura_embalada_cm || p.altura || '', 'type="number" step="0.1" min="0"')}
      ${field('Largura (cm)', 'cfWidth', p.largura_embalada_cm || p.largura || '', 'type="number" step="0.1" min="0"')}
      ${field('Comprimento (cm)', 'cfLength', p.comprimento_embalado_cm || p.comprimento || '', 'type="number" step="0.1" min="0"')}
    </div></div>
    <div class="form-section"><h3>Loja Integrada</h3><div class="notice">Status: <b>${esc(syncLabel(p)[0])}</b>${li.sync_at ? ` · última sincronização ${esc(dateTime(li.sync_at))}` : ''}${li.sync_error ? `<br><span style="color:#9d302d">${esc(li.sync_error)}</span>` : ''}</div></div>
    <div class="drawer-actions">
      <button class="secondary" id="cfSaveOnly">Salvar cadastro</button>
      <button class="primary" id="cfSaveSync">Salvar + sincronizar Loja Integrada</button>
      ${li.produto_id ? '<button class="secondary" id="cfSyncNow">Sincronizar agora</button>' : ''}
      ${li.url ? `<a class="secondary" href="${esc(li.url)}" target="_blank" rel="noopener">Abrir na Loja Integrada</a>` : ''}
    </div>`;
  drawer.classList.add('open');
  drawer.setAttribute('aria-hidden', 'false');
  if (overlay) overlay.hidden = false;
  $('#cfSaveOnly')?.addEventListener('click', () => saveProduct(p, false));
  $('#cfSaveSync')?.addEventListener('click', () => saveProduct(p, true));
  $('#cfSyncNow')?.addEventListener('click', () => syncProduct(p));
}
function closeDrawer() {
  $('#drawer')?.classList.remove('open');
  $('#drawer')?.setAttribute('aria-hidden', 'true');
  if ($('#overlay')) $('#overlay').hidden = true;
}
function currentForm(p = {}) {
  const activeDa = $('#cfDaActive')?.value === '1';
  const activeLi = $('#cfLiActive')?.value === '1';
  const personalizable = $('#cfPersonalizable')?.value === '1';
  const art = text($('#cfArt')?.value);
  const patch = {
    nome: text($('#cfName')?.value),
    codigo: text($('#cfSku')?.value),
    sku: text($('#cfSku')?.value),
    preco: numberValue($('#cfPrice')?.value),
    preco_oferta: numberValue($('#cfPromo')?.value) || null,
    preco_promocional: numberValue($('#cfPromo')?.value) || null,
    preco_custo: numberValue($('#cfCost')?.value) || null,
    estoque: Math.max(0, Math.floor(numberValue($('#cfStock')?.value))),
    ncm: text($('#cfNcm')?.value),
    gtin: text($('#cfGtin')?.value),
    mpn: text($('#cfMpn')?.value),
    descricao: text($('#cfDescription')?.value),
    descricao_completa: text($('#cfDescription')?.value),
    seo_title: text($('#cfSeoTitle')?.value),
    seo_description: text($('#cfSeoDescription')?.value).slice(0, 160),
    seo_keywords: text($('#cfSeoKeywords')?.value),
    ativo: activeDa,
    situacao: activeDa ? 'A' : 'I',
    status: activeDa ? 'A' : 'I',
    loja_integrada_ativo: activeLi,
    canecafacil_ativo: activeLi,
    loja_integrada_personalizavel: personalizable,
    canecafacil_personalizavel: personalizable,
    personalizavel: personalizable,
    destaque: $('#cfFeatured')?.value === '1',
    peso_embalado_kg: numberValue($('#cfWeight')?.value),
    altura_embalada_cm: numberValue($('#cfHeight')?.value),
    largura_embalada_cm: numberValue($('#cfWidth')?.value),
    comprimento_embalado_cm: numberValue($('#cfLength')?.value),
    mockup_1: text($('#cfMockup1')?.value),
    mockup_2: text($('#cfMockup2')?.value),
    mockup_3: text($('#cfMockup3')?.value),
    updated_at: nowIso(),
    last_update: Date.now(),
    loja_integrada: {
      ...liMeta(p),
      categoria_uri: text($('#cfLiCategory')?.value),
      marca_uri: text($('#cfLiBrand')?.value),
      sync_status: liMeta(p).sync_status || 'nao_publicado',
    },
  };
  if (art) {
    patch.arte_horizontal = art;
    patch.arte_personalizacao = art;
    patch.arte_impressao = { ...(p.arte_impressao || {}), url: art };
  }
  return patch;
}
function validateForLi(p = {}) {
  const missing = [];
  if (!text(p.nome)) missing.push('nome');
  if (!text(p.codigo || p.sku)) missing.push('SKU');
  if (!(numberValue(p.preco) > 0)) missing.push('preço');
  if (!text(p.mockup_1)) missing.push('mockup 1');
  if (!text(p.mockup_2)) missing.push('mockup 2');
  return missing;
}
function liDescription(p = {}) {
  const base = text(p.descricao_completa || p.descricao || '');
  if (!isPersonalizable(p)) return base;
  const model = encodeURIComponent(productKey(p));
  const link = `${PERSONALIZER_BASE}?model=${model}`;
  const cta = `<div class="cf-personalizer-box" style="margin:18px 0;padding:16px;border:1px solid #e8e8e3;border-radius:12px;text-align:center"><strong style="display:block;margin-bottom:8px">Personalize esta caneca</strong><a class="cf-personalize-link" href="${link}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 18px;border-radius:9px;font-weight:700">PERSONALIZAR ESTA CANECA</a></div>`;
  return `${base}\n${cta}`;
}
function liPayload(p = {}) {
  const li = liMeta(p);
  const category = text(li.categoria_uri);
  const brand = text(li.marca_uri);
  const productBody = {
    id_externo: null,
    sku: text(p.codigo || p.sku),
    mpn: text(p.mpn) || null,
    ncm: text(p.ncm) || null,
    gtin: text(p.gtin || p.ean || p.codigo_barras) || null,
    nome: text(p.nome),
    apelido: slug(p.nome),
    descricao_completa: liDescription(p),
    ativo: liActive(p),
    destaque: p.destaque === true,
    peso: numberValue(p.peso_embalado_kg || p.peso) || null,
    altura: numberValue(p.altura_embalada_cm || p.altura) || null,
    largura: numberValue(p.largura_embalada_cm || p.largura) || null,
    profundidade: numberValue(p.comprimento_embalado_cm || p.comprimento) || null,
    tipo: 'normal',
    usado: false,
    categorias: category ? [category] : [],
    marca: brand || null,
    removido: false,
    url_video_youtube: text(p.url_video_youtube || p.video_youtube || p.youtube_url) || null,
  };
  const priceBody = {
    cheio: numberValue(p.preco),
    custo: numberValue(p.preco_custo || p.custo) || 0,
    sob_consulta: false,
    promocional: numberValue(p.preco_oferta || p.preco_promocional) || 0,
  };
  const stockBody = {
    gerenciado: true,
    quantidade: Math.max(0, Math.floor(numberValue(p.estoque))),
    situacao_em_estoque: 0,
    situacao_sem_estoque: -1,
  };
  const seoBody = {
    title: text(p.seo_title || p.seo_tag_title || p.nome).slice(0, 70),
    keyword: text(p.seo_keywords || (Array.isArray(p.tags) ? p.tags.join(', ') : p.tags || '')),
    description: text(p.seo_description || p.seo_tag_description || p.meta_description || '').slice(0, 160),
  };
  return {
    action: li.produto_id ? 'loja_integrada_update_product' : 'loja_integrada_create_product',
    request_id: `LI-${Date.now().toString(36).toUpperCase()}`,
    product_key: productKey(p),
    model_id: productKey(p),
    loja_integrada_product_id: text(li.produto_id),
    loja_integrada_seo_id: text(li.seo_id),
    firebase_url: FIREBASE_BASE,
    products_node: MUG_NODES.products,
    produto_json: JSON.stringify(productBody),
    preco_json: JSON.stringify(priceBody),
    estoque_json: JSON.stringify(stockBody),
    seo_json: JSON.stringify(seoBody),
    imagem_1_json: JSON.stringify({ produto: li.produto_id ? `/api/v1/produto/${li.produto_id}` : '', imagem_url: text(p.mockup_1) }),
    imagem_2_json: JSON.stringify({ produto: li.produto_id ? `/api/v1/produto/${li.produto_id}` : '', imagem_url: text(p.mockup_2) }),
    mockup_1: text(p.mockup_1),
    mockup_2: text(p.mockup_2),
    personalizavel: isPersonalizable(p),
    ativo_loja: liActive(p),
    sku: text(p.codigo || p.sku),
    source: BUILD,
  };
}
async function saveProduct(original, sync = false) {
  try {
    const key = productKey(original);
    const patch = currentForm(original);
    if (sync && liActive(patch)) {
      const missing = validateForLi(patch);
      if (missing.length) throw new Error(`Para publicar na Loja Integrada, complete: ${missing.join(', ')}.`);
      patch.loja_integrada = { ...patch.loja_integrada, sync_status: 'pendente', sync_error: '' };
    } else if (!liActive(patch) && liMeta(original).produto_id) {
      patch.loja_integrada = { ...patch.loja_integrada, sync_status: sync ? 'pendente' : patch.loja_integrada.sync_status };
    }
    await fbWrite(`${MUG_NODES.products}/${safeKey(key)}`, patch);
    await audit('caneca_catalogo_salva', { produto_key: key, dona_antonia: daActive(patch), loja_integrada: liActive(patch), sincronizar: sync });
    Object.assign(original, patch);
    showToast('Cadastro da caneca salvo.');
    if (sync) await syncProduct(original);
    else { closeDrawer(); await loadProducts(true); }
  } catch (error) {
    showToast(error?.message || String(error), true);
  }
}
async function syncProduct(p) {
  const key = productKey(p);
  const li = liMeta(p);
  if (!liActive(p) && !li.produto_id) {
    await fbWrite(`${MUG_NODES.products}/${safeKey(key)}/loja_integrada`, { ...li, sync_status: 'nao_publicado', sync_error: '', sync_at: nowIso() });
    showToast('Caneca salva como não publicada na Loja Integrada.');
    closeDrawer();
    await loadProducts(true);
    return;
  }
  const missing = liActive(p) ? validateForLi(p) : [];
  if (missing.length) return showToast(`Complete antes de sincronizar: ${missing.join(', ')}.`, true);
  try {
    await fbWrite(`${MUG_NODES.products}/${safeKey(key)}/loja_integrada`, { ...li, sync_status: 'enviando', sync_error: '', sync_solicitado_em: nowIso() });
    const payload = liPayload(p);
    const response = await fetchWithTimeout(MAKE_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ payload: JSON.stringify(payload) }),
    }, 60000);
    const raw = await response.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }
    if (!response.ok || data.ok === false) throw new Error(data.error || data.error_message || `Make HTTP ${response.status}: ${raw.slice(0, 180)}`);
    const next = {
      ...li,
      produto_id: data.produto_id || data.product_id || li.produto_id || '',
      seo_id: data.seo_id || li.seo_id || '',
      resource_uri: data.resource_uri || li.resource_uri || '',
      url: data.url || li.url || '',
      sync_status: 'sincronizado',
      sync_error: '',
      sync_at: nowIso(),
      ativo: liActive(p),
      personalizavel: isPersonalizable(p),
    };
    await fbWrite(`${MUG_NODES.products}/${safeKey(key)}/loja_integrada`, next);
    await audit('loja_integrada_sincronizada', { produto_key: key, produto_id: next.produto_id, ativo: next.ativo });
    showToast(next.produto_id ? `Loja Integrada sincronizada · produto ${next.produto_id}.` : 'Sincronização enviada à Loja Integrada.');
    closeDrawer();
    await loadProducts(true);
  } catch (error) {
    const message = error?.name === 'AbortError' ? 'Tempo esgotado esperando o Make.' : (error?.message || String(error));
    await fbWrite(`${MUG_NODES.products}/${safeKey(key)}/loja_integrada`, { ...li, sync_status: 'erro', sync_error: message, sync_at: nowIso() }).catch(() => null);
    showToast(`Loja Integrada: ${message}`, true);
    await loadProducts(true);
  }
}
function ensureManager() {
  if (!location.hash.includes('mugs')) return;
  const root = $('#mugs');
  if (!root) return;
  if (!$('#cfCatalogToolbar', root)) render();
  if (!state.loaded && !state.loading) loadProducts();
}
function boot() {
  document.documentElement.dataset.cfCatalogManager = BUILD;
  window.addEventListener('hashchange', () => setTimeout(ensureManager, 0));
  $('#nav')?.addEventListener('click', event => {
    if (event.target.closest('[data-route="mugs"]')) setTimeout(ensureManager, 0);
  });
  $('#reloadButton')?.addEventListener('click', () => {
    if (location.hash.includes('mugs')) setTimeout(() => loadProducts(true), 0);
  });
  setTimeout(ensureManager, 50);
  setTimeout(ensureManager, 1200);
  setInterval(() => { if (location.hash.includes('mugs')) ensureManager(); }, 1800);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
