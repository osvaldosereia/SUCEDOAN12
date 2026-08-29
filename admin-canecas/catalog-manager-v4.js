import {
  FIREBASE_BASE, MUG_NODES, text, norm, money, dateTime, mugImage, mugArt,
  fbGet, fbWrite, audit, safeKey, nowIso
} from '../shared/mug-commerce-v1.js?v=20260828-1';

const BUILD = '20260829-admin-canecas-catalog-manager-v4-li-completo';
const MAKE_WEBHOOK = window.__CANECAS_ADMIN_CONFIG__?.makeWebhook || 'https://hook.eu1.make.com/cl3r1f56r9txezvltkkwlsspmnja6sw4';
const PERSONALIZER_BASE = 'https://donaantonia.com.br/loja-integrada/personalizar/';
const LI_EDITOR_BASE = 'https://app.lojaintegrada.com.br/painel/catalogo/produto/';
const LOAD_TIMEOUT = 20000;
const REF_PATH = 'canecas/integracoes/loja_integrada/catalog_refs';

const DEFAULTS = Object.freeze({
  brandName: 'Caneca Fácil',
  categoryPersonal: 'Canecas Personalizáveis',
  categoryStandard: 'Canecas Padronizadas',
  categoryBusiness: 'Canecas para Empresas',
  material: 'Porcelana',
  ncmPorcelain: '69111090',
  ncmCeramic: '69120000',
  productionType: 'revenda',
  originCode: '0',
  manufacturer: 'Caneca Fácil',
  unitsPerKit: 1,
  availabilityDays: 0,
  outOfStockDays: -1,
});

const state = { products: [], query: '', filter: 'all', loading: false, loaded: false, lastError: '', refs: null, refsLoading: false };
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');

function productKey(p = {}) { return text(p.firebaseKey || p.id || p.__key); }
function isMug(p = {}) { return norm([p.tipo_produto, p.categoria, p.subcategoria, p.subsubcategoria, p.nome, p.origem_cadastro].join(' ')).includes('caneca'); }
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
function isPersonalizable(p = {}) { return p.loja_integrada_personalizavel === true || p.canecafacil_personalizavel === true || p.personalizavel === true || p.personalizacao_publica === true; }
function liMeta(p = {}) { return p.loja_integrada && typeof p.loja_integrada === 'object' ? p.loja_integrada : {}; }
function numberValue(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const raw = text(v).replace(/\s/g, '');
  if (!raw) return 0;
  const parsed = Number(raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw);
  return Number.isFinite(parsed) ? parsed : 0;
}
function digits(v) { return text(v).replace(/\D/g, ''); }
function slug(value) { return norm(value).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 140) || `caneca-${Date.now()}`; }
function images(p = {}) {
  const arrays = [p.imagens_site, p.imagens, p.fotos, p.images].filter(Array.isArray).flat();
  const values = [p.mockup_1, p.mockup_2, p.mockup_3, ...arrays, p.url_imagem, p.imagem_url, p.imagem]
    .map(v => typeof v === 'object' ? (v?.url || v?.src || '') : v).map(text).filter(v => /^https?:\/\//i.test(v));
  return [...new Set(values)].slice(0, 5);
}
function gtinValid(value) {
  const raw = digits(value);
  if (!raw) return true;
  if (![8, 12, 13, 14].includes(raw.length)) return false;
  const nums = [...raw].map(Number), check = nums.pop();
  let sum = 0;
  [...nums].reverse().forEach((n, i) => { sum += n * (i % 2 === 0 ? 3 : 1); });
  return ((10 - (sum % 10)) % 10) === check;
}
function materialOf(p = {}) { return text(p.material_caneca || liMeta(p).material || p.material) || DEFAULTS.material; }
function defaultNcm(material) { return norm(material).includes('porcelana') ? DEFAULTS.ncmPorcelain : DEFAULTS.ncmCeramic; }
function categoryTypeOf(p = {}) { return text(p.loja_integrada_categoria_tipo || liMeta(p).categoria_tipo) || (isPersonalizable(p) ? 'personalizaveis' : 'padronizadas'); }
function categoryNameFor(type) {
  if (type === 'empresas') return DEFAULTS.categoryBusiness;
  if (type === 'personalizaveis') return DEFAULTS.categoryPersonal;
  return DEFAULTS.categoryStandard;
}
function refByName(kind, name) {
  const bucket = state.refs?.[kind];
  if (!bucket || typeof bucket !== 'object') return '';
  if (text(bucket[name])) return text(bucket[name]);
  const target = norm(name);
  for (const [k, v] of Object.entries(bucket)) if (norm(k) === target) return text(v);
  return '';
}
function brandUri(p = {}) { return text(liMeta(p).marca_uri || p.loja_integrada_marca_uri) || refByName('marcas', DEFAULTS.brandName); }
function categoryUri(p = {}) { return text(liMeta(p).categoria_uri || p.loja_integrada_categoria_uri) || refByName('categorias', categoryNameFor(categoryTypeOf(p))); }
function setFirebaseStatus(message, type = '') { if ($('#firebaseStatus')) $('#firebaseStatus').textContent = message; if ($('#firebaseDot')) $('#firebaseDot').className = type; }
function showToast(message, error = false) {
  const el = $('#toast'); if (!el) return window.alert(message);
  el.textContent = message; el.className = `toast${error ? ' error' : ''}`; el.hidden = false;
  clearTimeout(showToast.timer); showToast.timer = setTimeout(() => { el.hidden = true; }, error ? 6500 : 3400);
}
async function fetchWithTimeout(url, options = {}, timeout = LOAD_TIMEOUT) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeout);
  try { return await fetch(url, { ...options, signal: controller.signal, cache: 'no-store' }); } finally { clearTimeout(timer); }
}
async function loadRefs() { try { const refs = await fbGet(REF_PATH); state.refs = refs && typeof refs === 'object' ? refs : {}; } catch { state.refs = state.refs || {}; } }
async function loadProducts(force = false) {
  if (state.loading) return;
  if (state.loaded && !force) { render(); return; }
  state.loading = true; state.lastError = ''; setFirebaseStatus('Carregando somente canecas…');
  try {
    await loadRefs();
    const response = await fetchWithTimeout(`${FIREBASE_BASE}/${MUG_NODES.products}.json?_=${Date.now()}`);
    if (!response.ok) throw new Error(`Firebase ${response.status}`);
    const data = await response.json();
    state.products = Object.entries(data || {}).map(([__key, value]) => ({ __key, ...(value || {}) })).filter(isMug)
      .sort((a, b) => Number(b.last_update || 0) - Number(a.last_update || 0) || text(a.nome).localeCompare(text(b.nome), 'pt-BR'));
    state.loaded = true; setFirebaseStatus(`Conectado · ${state.products.length} caneca(s)`, 'good');
  } catch (error) {
    state.lastError = error?.name === 'AbortError' ? 'Tempo esgotado ao carregar as canecas.' : (error?.message || String(error));
    setFirebaseStatus(`Erro · ${state.lastError}`, 'bad'); showToast(`Catálogo: ${state.lastError}`, true);
  } finally { state.loading = false; render(); }
}
function syncLabel(p = {}) {
  const m = liMeta(p);
  if (m.sync_status === 'erro') return ['ERRO', 'bad'];
  if (['enviando', 'pendente'].includes(m.sync_status)) return ['PENDENTE', 'warn'];
  if (m.produto_id && m.sync_status === 'sincronizado') return ['SINCRONIZADA', 'good'];
  if (m.produto_id) return ['VINCULADA', ''];
  return ['NÃO PUBLICADA', ''];
}
function readiness(p = {}) {
  const material = materialOf(p), ncm = digits(p.ncm || defaultNcm(material)), gtin = digits(p.gtin || p.ean || p.codigo_barras);
  const errs = [], warns = [];
  if (!text(p.nome)) errs.push('nome'); if (!text(p.codigo || p.sku)) errs.push('SKU'); if (!(numberValue(p.preco) > 0)) errs.push('preço');
  if (!text(p.mockup_1 || images(p)[0])) errs.push('imagem 1'); if (!text(p.mockup_2 || images(p)[1])) warns.push('imagem 2');
  if (ncm.length !== 8) errs.push('NCM'); if (gtin && !gtinValid(gtin)) errs.push('GTIN inválido');
  if (!(numberValue(p.peso_embalado_kg || p.peso) > 0)) warns.push('peso');
  if (!(numberValue(p.altura_embalada_cm || p.altura) > 0) || !(numberValue(p.largura_embalada_cm || p.largura) > 0) || !(numberValue(p.comprimento_embalado_cm || p.comprimento) > 0)) warns.push('dimensões');
  if (!brandUri(p)) warns.push('marca Caneca Fácil'); if (!categoryUri(p)) warns.push('categoria');
  if (!text(p.seo_title || p.seo_tag_title)) warns.push('SEO title'); if (!text(p.seo_description || p.seo_tag_description)) warns.push('SEO description');
  if (liMeta(p).manual_reviewed !== true) warns.push('especificações manuais LI');
  return { errs, warns, score: Math.max(0, 100 - errs.length * 20 - warns.length * 5) };
}
function matchesFilter(p) {
  if (state.filter === 'da') return daActive(p); if (state.filter === 'li') return liActive(p) || Boolean(liMeta(p).produto_id);
  if (state.filter === 'personal') return isPersonalizable(p); if (state.filter === 'attention') { const r = readiness(p); return r.errs.length || r.warns.length; }
  if (state.filter === 'error') return liMeta(p).sync_status === 'erro'; return true;
}
function visibleProducts() { const q = norm(state.query); return state.products.filter(p => matchesFilter(p) && (!q || norm(`${p.nome} ${p.codigo} ${p.sku} ${p.categoria} ${p.subcategoria} ${p.tema_caneca}`).includes(q))); }
function metric(label, value) { return `<div class="metric"><strong>${value}</strong><span>${esc(label)}</span></div>`; }
function row(p) {
  const key = productKey(p), [sync, syncClass] = syncLabel(p), li = liMeta(p), ready = readiness(p);
  return `<tr data-cf-mug="${esc(key)}"><td><div class="product-cell">${mugImage(p) ? `<img class="thumb" src="${esc(mugImage(p))}" loading="lazy">` : ''}<div><strong>${esc(p.nome || 'Caneca')}</strong><small>${esc(p.tema_caneca || p.subcategoria || p.categoria || '')}</small></div></div></td><td>${esc(p.codigo || p.sku || '—')}</td><td>${money(p.preco)}</td><td><span class="badge ${daActive(p) ? 'good' : ''}">${daActive(p) ? 'ATIVA' : 'INATIVA'}</span></td><td><span class="badge ${liActive(p) ? 'cf' : ''}">${liActive(p) ? 'ATIVA' : 'INATIVA'}</span>${li.produto_id ? `<small style="display:block;margin-top:4px">ID ${esc(li.produto_id)}</small>` : ''}</td><td><span class="badge ${ready.errs.length ? 'bad' : ready.warns.length ? 'warn' : 'good'}">${ready.score}%</span></td><td><span class="badge ${syncClass}">${sync}</span>${li.sync_error ? `<small style="display:block;max-width:220px;margin-top:4px;color:#9d302d">${esc(li.sync_error)}</small>` : ''}</td></tr>`;
}
function render() {
  if (!location.hash.includes('mugs')) return; const root = $('#mugs'); if (!root) return;
  const visible = visibleProducts(), attention = state.products.filter(p => { const r = readiness(p); return r.errs.length || r.warns.length; }).length;
  root.dataset.cfCatalogManager = BUILD;
  root.innerHTML = `<div class="metrics" style="margin-bottom:12px">${metric('Canecas', state.products.length)}${metric('Ativas Dona Antônia', state.products.filter(daActive).length)}${metric('Ativas Loja Integrada', state.products.filter(liActive).length)}${metric('Precisam revisão', attention)}</div><div class="toolbar" id="cfCatalogToolbar"><input id="cfMugSearch" type="search" placeholder="Buscar nome, SKU, tema ou categoria…" value="${esc(state.query)}"><select id="cfMugFilter"><option value="all" ${state.filter === 'all' ? 'selected' : ''}>Todas</option><option value="da" ${state.filter === 'da' ? 'selected' : ''}>Ativas Dona Antônia</option><option value="li" ${state.filter === 'li' ? 'selected' : ''}>Loja Integrada</option><option value="personal" ${state.filter === 'personal' ? 'selected' : ''}>Personalizáveis</option><option value="attention" ${state.filter === 'attention' ? 'selected' : ''}>Precisam revisão</option><option value="error" ${state.filter === 'error' ? 'selected' : ''}>Erro de sincronização</option></select><button class="secondary" id="cfRefs" type="button">Atualizar marca/categorias</button><button class="secondary" id="cfMugReload" type="button">Atualizar</button></div><div class="notice" style="margin:0 0 12px"><b>Admin Canecas é o cadastro mestre.</b> A Loja Integrada recebe por API tudo o que a API pública suporta; classificação de mercado e especificações recomendadas ficam como revisão manual.</div>${state.lastError ? `<div class="notice warn" style="margin-bottom:12px">${esc(state.lastError)}</div>` : ''}<section class="panel"><div class="table-wrap"><table class="table"><thead><tr><th>Caneca</th><th>SKU</th><th>Preço</th><th>Dona Antônia</th><th>Loja Integrada</th><th>Cadastro</th><th>Sincronização</th></tr></thead><tbody>${visible.map(row).join('') || `<tr><td colspan="7" class="empty">${state.loading ? 'Carregando canecas…' : 'Nenhuma caneca encontrada.'}</td></tr>`}</tbody></table></div></section>`;
  $('#cfMugSearch')?.addEventListener('input', e => { state.query = e.target.value; render(); }); $('#cfMugFilter')?.addEventListener('change', e => { state.filter = e.target.value; render(); }); $('#cfMugReload')?.addEventListener('click', () => loadProducts(true)); $('#cfRefs')?.addEventListener('click', refreshRefsFromLi); $$('[data-cf-mug]', root).forEach(tr => tr.addEventListener('click', () => openDrawer(state.products.find(p => productKey(p) === tr.dataset.cfMug))));
}
function field(label, id, value = '', opts = '') { return `<label>${esc(label)}<input id="${id}" value="${esc(value)}" ${opts}></label>`; }
function textArea(label, id, value = '', max = '') { return `<label class="span2">${esc(label)}<textarea id="${id}" rows="5" ${max ? `maxlength="${max}"` : ''}>${esc(value)}</textarea></label>`; }
function selectBool(label, id, yes, yesLabel = 'Sim', noLabel = 'Não') { return `<label>${esc(label)}<select id="${id}"><option value="1" ${yes ? 'selected' : ''}>${esc(yesLabel)}</option><option value="0" ${!yes ? 'selected' : ''}>${esc(noLabel)}</option></select></label>`; }
function selectOptions(label, id, value, options) { return `<label>${esc(label)}<select id="${id}">${options.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`; }
function openDrawer(p) {
  if (!p) return; const key = productKey(p), li = liMeta(p), imgs = images(p), material = materialOf(p), ncm = digits(p.ncm || defaultNcm(material)), gtin = digits(p.gtin || p.ean || p.codigo_barras), mpn = text(p.mpn) || (!gtin ? text(p.codigo || p.sku) : ''), catType = categoryTypeOf(p), ready = readiness({ ...p, ncm, mpn }), content = $('#drawerContent'); if (!content) return;
  content.innerHTML = `<h2>${esc(p.nome || 'Caneca')}</h2><div class="subtitle">Firebase ${esc(key)} · ${li.produto_id ? `Loja Integrada #${esc(li.produto_id)}` : 'não publicada na Loja Integrada'} · cadastro ${ready.score}%</div>${mugImage(p) ? `<img src="${esc(mugImage(p))}" style="width:100%;max-height:250px;object-fit:contain;background:#f3f4f0;border-radius:12px">` : ''}${ready.errs.length || ready.warns.length ? `<div class="notice warn" style="margin-top:12px"><b>Revisão:</b> ${esc([...ready.errs, ...ready.warns].join(', '))}</div>` : '<div class="notice" style="margin-top:12px"><b>Cadastro pronto para sincronização.</b></div>'}
  <div class="form-section"><h3>Canais e venda</h3><div class="form">${selectBool('Ativa na Dona Antônia', 'cfDaActive', daActive(p), 'Ativa', 'Inativa')}${selectBool('Ativa na Loja Integrada', 'cfLiActive', liActive(p), 'Ativa', 'Inativa')}${selectBool('Personalizável', 'cfPersonalizable', isPersonalizable(p))}${selectBool('Em destaque', 'cfFeatured', p.destaque === true)}${selectBool('Produto usado', 'cfUsed', p.usado === true)}${selectOptions('Categoria CanecaFácil', 'cfCategoryType', catType, [['padronizadas','Canecas Padronizadas'],['personalizaveis','Canecas Personalizáveis'],['empresas','Canecas para Empresas']])}</div></div>
  <div class="form-section"><h3>Informações principais</h3><div class="form"><label class="span2">Nome do produto<input id="cfName" maxlength="120" value="${esc(p.nome)}"></label>${field('SKU / código', 'cfSku', p.codigo || p.sku)}${field('URL amigável', 'cfAlias', li.alias || p.loja_integrada_alias || slug(p.nome))}${textArea('Descrição completa', 'cfDescription', p.descricao_completa || p.descricao_html || p.descricao || '')}${field('Vídeo YouTube', 'cfYoutube', p.url_video_youtube || p.video_youtube || p.youtube_url || '', 'placeholder="https://www.youtube.com/watch?v=..."')}</div></div>
  <div class="form-section"><h3>Preço</h3><div class="form">${field('Preço de custo', 'cfCost', numberValue(p.preco_custo || p.custo) || '', 'type="number" step="0.01" min="0"')}${field('Preço de venda', 'cfPrice', numberValue(p.preco), 'type="number" step="0.01" min="0"')}${field('Preço promocional', 'cfPromo', numberValue(p.preco_oferta || p.preco_promocional) || '', 'type="number" step="0.01" min="0"')}${selectBool('Preço sob consulta', 'cfPriceConsult', p.preco_sob_consulta === true)}</div></div>
  <div class="form-section"><h3>Códigos e identificação</h3><div class="form">${selectOptions('Material', 'cfMaterial', material, [['Porcelana','Porcelana'],['Cerâmica','Cerâmica (exceto porcelana)']])}${field('NCM', 'cfNcm', ncm, 'inputmode="numeric" maxlength="8"')}${field('GTIN / EAN', 'cfGtin', gtin, 'inputmode="numeric" placeholder="Somente GTIN válido do fabricante"')}${field('MPN', 'cfMpn', mpn)}${field('Marca', 'cfBrandName', DEFAULTS.brandName, 'readonly')}${field('Fabricante / marca comercial', 'cfManufacturer', li.fabricante || p.fabricante || DEFAULTS.manufacturer)}</div><div class="notice" style="margin-top:10px">Porcelana avulsa: NCM sugerido <b>69111090</b>. Cerâmica exceto porcelana: <b>69120000</b>. Confirme com a natureza real da mercadoria/NF do fornecedor.</div></div>
  <div class="form-section"><h3>Estoque e disponibilidade</h3><div class="form">${selectBool('Gerenciar estoque', 'cfStockManaged', li.estoque_gerenciado !== false && p.estoque_gerenciado !== false)}${field('Quantidade', 'cfStock', Number(p.estoque ?? li.estoque_quantidade ?? 0), 'type="number" step="1" min="0"')}${field('Disponibilidade com estoque (dias)', 'cfAvailability', Number(li.situacao_em_estoque ?? p.estoque_situacao_em_estoque ?? DEFAULTS.availabilityDays), 'type="number" step="1" min="0" max="90"')}${selectOptions('Quando acabar', 'cfOutMode', Number(li.situacao_sem_estoque ?? p.estoque_situacao_sem_estoque ?? DEFAULTS.outOfStockDays) === -1 ? '-1' : (Number(li.situacao_sem_estoque ?? p.estoque_situacao_sem_estoque) === 0 ? '0' : 'days'), [['-1','Tornar indisponível'],['0','Continuar venda imediata'],['days','Continuar com prazo adicional']])}${field('Prazo adicional sem estoque (dias)', 'cfOutDays', Math.max(1, Number(li.situacao_sem_estoque ?? p.estoque_situacao_sem_estoque ?? 1)), 'type="number" step="1" min="1" max="90"')}</div></div>
  <div class="form-section"><h3>Embalagem e frete</h3><div class="form">${field('Peso embalado (kg)', 'cfWeight', p.peso_embalado_kg || p.peso || '', 'type="number" step="0.001" min="0"')}${field('Altura (cm)', 'cfHeight', p.altura_embalada_cm || p.altura || '', 'type="number" step="1" min="1"')}${field('Largura (cm)', 'cfWidth', p.largura_embalada_cm || p.largura || '', 'type="number" step="1" min="1"')}${field('Profundidade (cm)', 'cfLength', p.comprimento_embalado_cm || p.comprimento || '', 'type="number" step="1" min="1"')}</div><div class="notice warn" style="margin-top:10px">Peso zero não será publicado. Use o peso da caneca já com a embalagem de envio.</div></div>
  <div class="form-section"><h3>Arte, imagens e vídeo</h3><div class="form"><label class="span2">Arte horizontal mestre<input id="cfArt" value="${esc(mugArt(p))}"></label><label class="span2">Imagem / mockup 1<input id="cfMockup1" value="${esc(p.mockup_1 || imgs[0] || '')}"></label><label class="span2">Imagem / mockup 2<input id="cfMockup2" value="${esc(p.mockup_2 || imgs[1] || '')}"></label><label class="span2">Imagem / mockup 3<input id="cfMockup3" value="${esc(p.mockup_3 || imgs[2] || '')}"></label></div></div>
  <div class="form-section"><h3>Categoria e marca na Loja Integrada</h3><div class="form">${field('Categoria', 'cfCategoryName', categoryNameFor(catType), 'readonly')}${field('Categoria URI', 'cfLiCategory', categoryUri(p), 'placeholder="/api/v1/categoria/123/"')}${field('Marca', 'cfBrandName2', DEFAULTS.brandName, 'readonly')}${field('Marca URI', 'cfLiBrand', brandUri(p), 'placeholder="/api/v1/marca/123/"')}</div><div class="mini-actions" style="margin-top:10px"><button class="secondary" type="button" id="cfDrawerRefs">Buscar marca/categorias via Make</button></div></div>
  <div class="form-section"><h3>SEO</h3><div class="form"><label class="span2">Tag Title<input id="cfSeoTitle" maxlength="70" value="${esc(p.seo_title || p.seo_tag_title || p.meta_title || p.nome || '')}"></label>${textArea('Meta Tag Description', 'cfSeoDescription', p.seo_description || p.seo_tag_description || p.meta_description || '', 250)}<label class="span2">Palavras-chave<input id="cfSeoKeywords" value="${esc(p.seo_keywords || (Array.isArray(p.tags) ? p.tags.join(', ') : p.tags || ''))}"></label></div></div>
  <div class="form-section"><h3>Fiscal e especificações da Loja Integrada</h3><div class="form">${field('Tipo de produção', 'cfProductionType', 'Revenda', 'readonly')}${field('Origem da mercadoria', 'cfOrigin', '0 - 100% produzido nacionalmente', 'readonly')}${field('Classificação de mercado sugerida', 'cfMarketClass', li.classificacao_mercado || 'Casa, Móveis e Decoração » Cozinha » Louça e Artigos para Servir » Louça » Canecas')}${selectBool('É set', 'cfIsSet', li.e_set === true)}${field('Material da especificação', 'cfSpecMaterial', li.especificacao_material || material)}${field('Modelo', 'cfModel', li.modelo || 'Caneca 350ml')}${field('Unidades por kit', 'cfUnitsKit', li.unidades_por_kit || DEFAULTS.unitsPerKit, 'type="number" min="1" step="1"')}${selectBool('Revisão manual concluída', 'cfManualReviewed', li.manual_reviewed === true)}</div><div class="notice warn" style="margin-top:10px"><b>Importante:</b> classificação de mercado e especificações recomendadas não estão na API pública atual. Guardamos aqui para conferência e, depois de publicar, você confirma uma vez no painel da Loja Integrada.</div>${li.produto_id ? `<div class="mini-actions" style="margin-top:10px"><a class="secondary" target="_blank" rel="noopener" href="${LI_EDITOR_BASE}${encodeURIComponent(li.produto_id)}/editar">Abrir produto para revisão manual</a></div>` : ''}</div>
  <div class="drawer-actions"><button class="secondary" id="cfSaveOnly">Salvar cadastro</button><button class="primary" id="cfSaveSync">Salvar + sincronizar Loja Integrada</button>${li.produto_id ? '<button class="secondary" id="cfSyncNow">Sincronizar agora</button>' : ''}${li.url ? `<a class="secondary" href="${esc(li.url)}" target="_blank" rel="noopener">Ver produto na loja</a>` : ''}</div>`;
  $('#drawer')?.classList.add('open'); $('#drawer')?.setAttribute('aria-hidden', 'false'); if ($('#overlay')) $('#overlay').hidden = false;
  $('#cfMaterial')?.addEventListener('change', e => { const i = $('#cfNcm'), current = digits(i?.value); if (!current || [DEFAULTS.ncmPorcelain, DEFAULTS.ncmCeramic].includes(current)) i.value = defaultNcm(e.target.value); if ($('#cfSpecMaterial')) $('#cfSpecMaterial').value = e.target.value; });
  $('#cfCategoryType')?.addEventListener('change', e => { const name = categoryNameFor(e.target.value); if ($('#cfCategoryName')) $('#cfCategoryName').value = name; const uri = refByName('categorias', name); if (uri && $('#cfLiCategory')) $('#cfLiCategory').value = uri; });
  $('#cfDrawerRefs')?.addEventListener('click', async () => { await refreshRefsFromLi(); if ($('#cfLiBrand')) $('#cfLiBrand').value = refByName('marcas', DEFAULTS.brandName); if ($('#cfLiCategory')) $('#cfLiCategory').value = refByName('categorias', categoryNameFor($('#cfCategoryType')?.value || catType)); });
  $('#cfSaveOnly')?.addEventListener('click', () => saveProduct(p, false)); $('#cfSaveSync')?.addEventListener('click', () => saveProduct(p, true)); $('#cfSyncNow')?.addEventListener('click', () => syncProduct(p));
}
function closeDrawer() { $('#drawer')?.classList.remove('open'); $('#drawer')?.setAttribute('aria-hidden', 'true'); if ($('#overlay')) $('#overlay').hidden = true; }
function currentForm(p = {}) {
  const activeDa = $('#cfDaActive')?.value === '1', activeLi = $('#cfLiActive')?.value === '1', personalizable = $('#cfPersonalizable')?.value === '1', art = text($('#cfArt')?.value), material = text($('#cfMaterial')?.value) || DEFAULTS.material, gtin = digits($('#cfGtin')?.value), outMode = $('#cfOutMode')?.value, outDays = Math.min(90, Math.max(1, Math.floor(numberValue($('#cfOutDays')?.value) || 1)), outValue = outMode === '-1' ? -1 : outMode === '0' ? 0 : outDays, catType = text($('#cfCategoryType')?.value) || 'padronizadas';
  const patch = { nome: text($('#cfName')?.value), codigo: text($('#cfSku')?.value), sku: text($('#cfSku')?.value), preco: numberValue($('#cfPrice')?.value), preco_oferta: numberValue($('#cfPromo')?.value) || null, preco_promocional: numberValue($('#cfPromo')?.value) || null, preco_custo: numberValue($('#cfCost')?.value) || null, preco_sob_consulta: $('#cfPriceConsult')?.value === '1', estoque: Math.max(0, Math.floor(numberValue($('#cfStock')?.value))), estoque_gerenciado: $('#cfStockManaged')?.value === '1', estoque_situacao_em_estoque: Math.min(90, Math.max(0, Math.floor(numberValue($('#cfAvailability')?.value)))), estoque_situacao_sem_estoque: outValue, material_caneca: material, ncm: digits($('#cfNcm')?.value) || defaultNcm(material), gtin, mpn: text($('#cfMpn')?.value) || (!gtin ? text($('#cfSku')?.value) : ''), fabricante: text($('#cfManufacturer')?.value) || DEFAULTS.manufacturer, usado: $('#cfUsed')?.value === '1', descricao: text($('#cfDescription')?.value), descricao_completa: text($('#cfDescription')?.value), seo_title: text($('#cfSeoTitle')?.value).slice(0, 70), seo_description: text($('#cfSeoDescription')?.value).slice(0, 250), seo_keywords: text($('#cfSeoKeywords')?.value), ativo: activeDa, situacao: activeDa ? 'A' : 'I', status: activeDa ? 'A' : 'I', loja_integrada_ativo: activeLi, canecafacil_ativo: activeLi, loja_integrada_personalizavel: personalizable, canecafacil_personalizavel: personalizable, personalizavel: personalizable, destaque: $('#cfFeatured')?.value === '1', peso_embalado_kg: numberValue($('#cfWeight')?.value), altura_embalada_cm: Math.ceil(numberValue($('#cfHeight')?.value)), largura_embalada_cm: Math.ceil(numberValue($('#cfWidth')?.value)), comprimento_embalado_cm: Math.ceil(numberValue($('#cfLength')?.value)), mockup_1: text($('#cfMockup1')?.value), mockup_2: text($('#cfMockup2')?.value), mockup_3: text($('#cfMockup3')?.value), url_video_youtube: text($('#cfYoutube')?.value), loja_integrada_alias: slug($('#cfAlias')?.value || $('#cfName')?.value), loja_integrada_categoria_tipo: catType, updated_at: nowIso(), last_update: Date.now(), loja_integrada: { ...liMeta(p), marca_nome: DEFAULTS.brandName, marca_uri: text($('#cfLiBrand')?.value) || refByName('marcas', DEFAULTS.brandName), categoria_tipo: catType, categoria_nome: categoryNameFor(catType), categoria_uri: text($('#cfLiCategory')?.value) || refByName('categorias', categoryNameFor(catType)), alias: slug($('#cfAlias')?.value || $('#cfName')?.value), material, fabricante: text($('#cfManufacturer')?.value) || DEFAULTS.manufacturer, tipo_producao: DEFAULTS.productionType, origem_mercadoria: DEFAULTS.originCode, classificacao_mercado: text($('#cfMarketClass')?.value), e_set: $('#cfIsSet')?.value === '1', especificacao_material: text($('#cfSpecMaterial')?.value) || material, modelo: text($('#cfModel')?.value), unidades_por_kit: Math.max(1, Math.floor(numberValue($('#cfUnitsKit')?.value) || 1)), manual_reviewed: $('#cfManualReviewed')?.value === '1', estoque_gerenciado: $('#cfStockManaged')?.value === '1', estoque_quantidade: Math.max(0, Math.floor(numberValue($('#cfStock')?.value))), situacao_em_estoque: Math.min(90, Math.max(0, Math.floor(numberValue($('#cfAvailability')?.value)))), situacao_sem_estoque: outValue, sync_status: liMeta(p).sync_status || 'nao_publicado' } };
  if (art) { patch.arte_horizontal = art; patch.arte_personalizacao = art; patch.arte_impressao = { ...(p.arte_impressao || {}), url: art }; } return patch;
}
function validateForLi(p = {}) {
  const issues = []; if (!text(p.nome)) issues.push('nome'); if (!text(p.codigo || p.sku)) issues.push('SKU'); if (!(numberValue(p.preco) > 0) && p.preco_sob_consulta !== true) issues.push('preço de venda'); if (!text(p.mockup_1)) issues.push('imagem 1'); if (digits(p.ncm).length !== 8) issues.push('NCM com 8 dígitos'); if (digits(p.gtin) && !gtinValid(p.gtin)) issues.push('GTIN válido'); if (!(numberValue(p.peso_embalado_kg) > 0)) issues.push('peso embalado'); if (!(numberValue(p.altura_embalada_cm) > 0) || !(numberValue(p.largura_embalada_cm) > 0) || !(numberValue(p.comprimento_embalado_cm) > 0)) issues.push('dimensões da embalagem'); return issues;
}
function liDescription(p = {}) {
  const base = text(p.descricao_completa || p.descricao || ''); if (!isPersonalizable(p)) return base;
  const link = `${PERSONALIZER_BASE}?model=${encodeURIComponent(productKey(p))}`;
  return `${base}\n<div class="cf-personalizer-box" style="margin:18px 0;padding:16px;border:1px solid #e8e8e3;border-radius:12px;text-align:center"><strong style="display:block;margin-bottom:8px">Personalize esta caneca</strong><a class="cf-personalize-link" href="${link}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 18px;border-radius:9px;font-weight:700">PERSONALIZAR ESTA CANECA</a></div>`;
}
function liPayload(p = {}) {
  const li = liMeta(p);
  const productBody = { id_externo: null, sku: text(p.codigo || p.sku), mpn: text(p.mpn) || null, ncm: digits(p.ncm) || null, gtin: digits(p.gtin || p.ean || p.codigo_barras) || null, nome: text(p.nome), apelido: text(p.loja_integrada_alias || li.alias) || slug(p.nome), descricao_completa: liDescription(p), ativo: liActive(p), destaque: p.destaque === true, peso: numberValue(p.peso_embalado_kg || p.peso) || null, altura: Math.ceil(numberValue(p.altura_embalada_cm || p.altura)) || null, largura: Math.ceil(numberValue(p.largura_embalada_cm || p.largura)) || null, profundidade: Math.ceil(numberValue(p.comprimento_embalado_cm || p.comprimento)) || null, tipo: 'normal', usado: p.usado === true, categorias: text(li.categoria_uri) ? [text(li.categoria_uri)] : [], marca: text(li.marca_uri) || null, removido: false, url_video_youtube: text(p.url_video_youtube || p.video_youtube || p.youtube_url) || null };
  const priceBody = { cheio: numberValue(p.preco), custo: numberValue(p.preco_custo || p.custo) || 0, sob_consulta: p.preco_sob_consulta === true, promocional: numberValue(p.preco_oferta || p.preco_promocional) || 0 };
  const stockBody = { gerenciado: p.estoque_gerenciado !== false, quantidade: Math.max(0, Math.floor(numberValue(p.estoque))), situacao_em_estoque: Math.min(90, Math.max(0, Math.floor(numberValue(p.estoque_situacao_em_estoque)))), situacao_sem_estoque: Number(p.estoque_situacao_sem_estoque ?? -1) };
  const seoBody = { title: text(p.seo_title || p.seo_tag_title || p.nome).slice(0, 70), keyword: text(p.seo_keywords || (Array.isArray(p.tags) ? p.tags.join(', ') : p.tags || '')), description: text(p.seo_description || p.seo_tag_description || p.meta_description || '').slice(0, 250) };
  return { action: li.produto_id ? 'loja_integrada_update_product' : 'loja_integrada_create_product', request_id: `LI-${Date.now().toString(36).toUpperCase()}`, product_key: productKey(p), model_id: productKey(p), loja_integrada_product_id: text(li.produto_id), loja_integrada_seo_id: text(li.seo_id), firebase_url: FIREBASE_BASE, products_node: MUG_NODES.products, produto_json: JSON.stringify(productBody), preco_json: JSON.stringify(priceBody), estoque_json: JSON.stringify(stockBody), seo_json: JSON.stringify(seoBody), alias_json: JSON.stringify({ absolute_path: `/${text(p.loja_integrada_alias || li.alias) || slug(p.nome)}` }), mockup_1: text(p.mockup_1), mockup_2: text(p.mockup_2), mockup_3: text(p.mockup_3), personalizavel: isPersonalizable(p), ativo_loja: liActive(p), sku: text(p.codigo || p.sku), marca_nome: DEFAULTS.brandName, categoria_nome: categoryNameFor(categoryTypeOf(p)), source: BUILD };
}
async function saveProduct(original, sync = false) {
  try { const key = productKey(original), patch = currentForm(original); if (sync) { const issues = validateForLi(patch); if (issues.length) throw new Error(`Complete antes de publicar: ${issues.join(', ')}.`); patch.loja_integrada = { ...patch.loja_integrada, sync_status: 'pendente', sync_error: '' }; } await fbWrite(`${MUG_NODES.products}/${safeKey(key)}`, patch); await audit('caneca_catalogo_salva_v4', { produto_key: key, dona_antonia: daActive(patch), loja_integrada: liActive(patch), sincronizar: sync }); Object.assign(original, patch); showToast('Cadastro da caneca salvo.'); if (sync) await syncProduct(original); else { closeDrawer(); await loadProducts(true); } } catch (error) { showToast(error?.message || String(error), true); }
}
async function syncProduct(p) {
  const key = productKey(p), li = liMeta(p), issues = validateForLi(p); if (issues.length) return showToast(`Complete antes de sincronizar: ${issues.join(', ')}.`, true);
  try { await fbWrite(`${MUG_NODES.products}/${safeKey(key)}/loja_integrada`, { ...li, sync_status: 'enviando', sync_error: '', sync_solicitado_em: nowIso() }); const response = await fetchWithTimeout(MAKE_WEBHOOK, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ payload: JSON.stringify(liPayload(p)) }) }, 90000); const raw = await response.text(); let data = {}; try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; } if (!response.ok || data.ok === false) throw new Error(data.error || data.error_message || `Make HTTP ${response.status}: ${raw.slice(0, 180)}`); const next = { ...li, produto_id: data.produto_id || data.product_id || li.produto_id || '', seo_id: data.seo_id || li.seo_id || '', resource_uri: data.resource_uri || li.resource_uri || '', url: data.url || li.url || '', sync_status: 'sincronizado', sync_error: '', sync_at: nowIso(), ativo: liActive(p), personalizavel: isPersonalizable(p), synced_mockup_1: text(p.mockup_1), synced_mockup_2: text(p.mockup_2), synced_mockup_3: text(p.mockup_3) }; await fbWrite(`${MUG_NODES.products}/${safeKey(key)}/loja_integrada`, next); await audit('loja_integrada_sincronizada_v4', { produto_key: key, produto_id: next.produto_id, ativo: next.ativo }); showToast(next.produto_id ? `Loja Integrada sincronizada · produto ${next.produto_id}.` : 'Sincronização enviada.'); closeDrawer(); await loadProducts(true); } catch (error) { const message = error?.name === 'AbortError' ? 'Tempo esgotado esperando o Make.' : (error?.message || String(error)); await fbWrite(`${MUG_NODES.products}/${safeKey(key)}/loja_integrada`, { ...li, sync_status: 'erro', sync_error: message, sync_at: nowIso() }).catch(() => null); showToast(`Loja Integrada: ${message}`, true); await loadProducts(true); }
}
async function refreshRefsFromLi() {
  if (state.refsLoading) return; state.refsLoading = true; showToast('Consultando marca e categorias na Loja Integrada…');
  try { const payload = { action: 'loja_integrada_catalog_refs', request_id: `LI-REF-${Date.now().toString(36).toUpperCase()}`, source: BUILD }; const response = await fetchWithTimeout(MAKE_WEBHOOK, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ payload: JSON.stringify(payload) }) }, 60000); const raw = await response.text(), data = raw ? JSON.parse(raw) : {}; if (!response.ok || data.ok === false) throw new Error(data.error || `Make HTTP ${response.status}`); const marcas = {}, categorias = {}; for (const item of (data.marcas || [])) if (item?.nome && item?.resource_uri) marcas[item.nome] = item.resource_uri; for (const item of (data.categorias || [])) if (item?.nome && item?.resource_uri) categorias[item.nome] = item.resource_uri; state.refs = { marcas, categorias, atualizado_em: nowIso() }; await fbWrite(REF_PATH, state.refs, 'PUT'); const brand = refByName('marcas', DEFAULTS.brandName), missingCats = [DEFAULTS.categoryPersonal, DEFAULTS.categoryStandard, DEFAULTS.categoryBusiness].filter(n => !refByName('categorias', n)); if (!brand) throw new Error('A marca “Caneca Fácil” ainda não existe na Loja Integrada. Crie a marca uma vez no painel e clique novamente em atualizar.'); showToast(missingCats.length ? `Marca encontrada. Categorias não localizadas: ${missingCats.join(', ')}.` : 'Marca e categorias da Loja Integrada atualizadas.'); render(); } catch (error) { showToast(`Referências Loja Integrada: ${error?.message || error}`, true); } finally { state.refsLoading = false; }
}
function ensureManager() { if (!location.hash.includes('mugs')) return; const root = $('#mugs'); if (!root) return; if (!$('#cfCatalogToolbar', root)) render(); if (!state.loaded && !state.loading) loadProducts(); }
function boot() { document.documentElement.dataset.cfCatalogManager = BUILD; window.addEventListener('hashchange', () => setTimeout(ensureManager, 0)); $('#nav')?.addEventListener('click', event => { if (event.target.closest('[data-route="mugs"]')) setTimeout(ensureManager, 0); }); $('#reloadButton')?.addEventListener('click', () => { if (location.hash.includes('mugs')) setTimeout(() => loadProducts(true), 0); }); setTimeout(ensureManager, 80); setTimeout(ensureManager, 1100); }
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
