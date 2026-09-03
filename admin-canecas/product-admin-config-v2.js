import { FIREBASE_BASE, text, nowIso, audit } from '../shared/mug-commerce-v1.js?v=20260828-1';
import { getMug, patchMug } from './mug-store-v2.js?v=20260829-1';

const BUILD = '20260903-admin-canecas-product-admin-config-v2';
const SETTINGS_NODE = 'canecas/configuracoes/cadastro_produto_v2';
const REFS_NODE = 'canecas/integracoes/loja_integrada/catalog_refs';
const DEFAULTS = Object.freeze({
  fiscal: Object.freeze({ tipo_producao: 'revenda', origem_mercadoria: '0', ncm: '69111090' }),
  publicacao: Object.freeze({ ativo: true, visivel: true, a_venda: true }),
  categoria_padrao_uri: ''
});
const ORIGINS = Object.freeze([
  ['0', '0 - 100% produzido nacionalmente'],
  ['1', '1 - Estrangeira · importação direta'],
  ['2', '2 - Estrangeira · adquirida no mercado interno'],
  ['3', '3 - Nacional · conteúdo de importação superior a 40% e até 70%'],
  ['4', '4 - Nacional · produção conforme processos produtivos básicos'],
  ['5', '5 - Nacional · conteúdo de importação até 40%'],
  ['6', '6 - Estrangeira · importação direta sem similar nacional'],
  ['7', '7 - Estrangeira · adquirida no mercado interno sem similar nacional'],
  ['8', '8 - Nacional · conteúdo de importação superior a 70%']
]);

const $ = (s, r = document) => r.querySelector(s);
const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
const bool = (value, fallback = false) => typeof value === 'boolean' ? value : fallback;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let settingsCache = null;
let refsCache = null;

function toast(message, error = false) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = message;
  el.className = `toast${error ? ' error' : ''}`;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { el.hidden = true; }, error ? 5200 : 3000);
}
async function readNode(path) {
  const r = await fetch(`${FIREBASE_BASE}/${path}.json?_=${Date.now()}`, { cache: 'no-store', headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`Firebase ${r.status}`);
  return (await r.json()) || null;
}
async function putNode(path, value) {
  const r = await fetch(`${FIREBASE_BASE}/${path}.json`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(value)
  });
  if (!r.ok) throw new Error(`Firebase ${r.status}`);
  return r.json().catch(() => null);
}
function normalizeSettings(raw = {}) {
  const fiscal = raw?.fiscal && typeof raw.fiscal === 'object' ? raw.fiscal : {};
  const pub = raw?.publicacao && typeof raw.publicacao === 'object' ? raw.publicacao : {};
  return {
    fiscal: {
      tipo_producao: text(fiscal.tipo_producao) || DEFAULTS.fiscal.tipo_producao,
      origem_mercadoria: text(fiscal.origem_mercadoria) || DEFAULTS.fiscal.origem_mercadoria,
      ncm: text(fiscal.ncm).replace(/\D/g, '') || DEFAULTS.fiscal.ncm
    },
    publicacao: {
      ativo: bool(pub.ativo, DEFAULTS.publicacao.ativo),
      visivel: bool(pub.visivel, DEFAULTS.publicacao.visivel),
      a_venda: bool(pub.a_venda, DEFAULTS.publicacao.a_venda)
    },
    categoria_padrao_uri: text(raw?.categoria_padrao_uri),
    atualizado_em: text(raw?.atualizado_em)
  };
}
async function loadSettings(force = false) {
  if (settingsCache && !force) return settingsCache;
  settingsCache = normalizeSettings((await readNode(SETTINGS_NODE).catch(() => null)) || {});
  return settingsCache;
}
async function loadRefs(force = false) {
  if (refsCache && !force) return refsCache;
  refsCache = (await readNode(REFS_NODE).catch(() => null)) || {};
  return refsCache;
}
function categoriesOf(refs = {}) {
  return Object.values(refs.categorias_lista || {})
    .filter(item => item && text(item.nome) && text(item.resource_uri) && item.ativo !== false)
    .sort((a, b) => text(a.nome).localeCompare(text(b.nome), 'pt-BR'));
}
function categoryId(uri = '') {
  return text(uri).match(/\/categoria\/(\d+)/i)?.[1] || '';
}
function optionList(categories, selected = '', allowEmpty = true) {
  const selectedId = categoryId(selected);
  const empty = allowEmpty ? '<option value="">Escolha uma categoria</option>' : '';
  return empty + categories.map(item => {
    const uri = text(item.resource_uri), id = text(item.id) || categoryId(uri);
    const on = uri === selected || (selectedId && id === selectedId);
    return `<option value="${esc(uri)}" data-id="${esc(id)}" ${on ? 'selected' : ''}>${esc(item.nome)}</option>`;
  }).join('');
}
function originOptions(selected = '0') {
  return ORIGINS.map(([id, label]) => `<option value="${id}" ${id === selected ? 'selected' : ''}>${esc(label)}</option>`).join('');
}
function productLi(p = {}) { return p.loja_integrada && typeof p.loja_integrada === 'object' ? p.loja_integrada : {}; }
function productCategoryUri(p = {}, defaults = {}, refs = {}) {
  const li = productLi(p);
  const explicit = text(p.loja_integrada_categoria_uri || li.categoria_uri);
  if (explicit) return explicit;
  if (text(defaults.categoria_padrao_uri)) return text(defaults.categoria_padrao_uri);
  const type = text(p.loja_integrada_categoria_tipo || li.categoria_tipo || p.canecafacil_categoria_tipo) || (p.personalizavel === true ? 'personalizaveis' : 'padronizadas');
  return text(refs?.tipos?.[type]?.resource_uri);
}
function productActive(p = {}, defaults = {}) {
  const li = productLi(p);
  if (typeof p.loja_integrada_ativo === 'boolean') return p.loja_integrada_ativo;
  if (typeof li.ativo === 'boolean') return li.ativo;
  if (typeof p.canecafacil_ativo === 'boolean') return p.canecafacil_ativo;
  return defaults.publicacao.ativo;
}
function productVisible(p = {}, defaults = {}) {
  const li = productLi(p);
  if (typeof p.loja_integrada_visivel === 'boolean') return p.loja_integrada_visivel;
  if (typeof li.visivel === 'boolean') return li.visivel;
  return defaults.publicacao.visivel;
}
function productForSale(p = {}, defaults = {}) {
  const li = productLi(p);
  if (typeof p.loja_integrada_a_venda === 'boolean') return p.loja_integrada_a_venda;
  if (typeof li.a_venda === 'boolean') return li.a_venda;
  return defaults.publicacao.a_venda;
}
function productFiscal(p = {}, defaults = {}) {
  const li = productLi(p);
  return {
    tipo: text(p.loja_integrada_tipo_producao || li.tipo_producao) || defaults.fiscal.tipo_producao,
    origem: text(p.loja_integrada_origem_mercadoria || li.origem_mercadoria) || defaults.fiscal.origem_mercadoria,
    ncm: text(p.ncm).replace(/\D/g, '') || defaults.fiscal.ncm
  };
}

async function renderSettings() {
  if (!location.hash.includes('settings')) return;
  const root = $('#settings');
  if (!root) return;
  const [defaults, refs] = await Promise.all([loadSettings(true), loadRefs(true)]);
  const cats = categoriesOf(refs);
  let section = $('#cfProductAdminSettings', root);
  if (!section) {
    section = document.createElement('section');
    section.className = 'panel';
    section.id = 'cfProductAdminSettings';
    root.appendChild(section);
  }
  const updated = refs.atualizado_em ? new Date(refs.atualizado_em).toLocaleString('pt-BR') : 'ainda sem data';
  section.innerHTML = `
    <div class="panel-head"><div><h2>Cadastro e publicação das canecas</h2><p>Padrões usados no Admin e na sincronização GitHub → Loja Integrada.</p></div></div>
    <div class="panel-body">
      <div class="notice"><b>Categorias da Loja Integrada:</b> ${cats.length} categoria(s) · última leitura ${esc(updated)} · fonte: ${esc(refs.fonte || 'API Loja Integrada')} / ${esc(refs.via || 'GitHub Actions')}.<br><small>O GitHub consulta a Loja Integrada automaticamente a cada 5 minutos. O Admin usa exatamente esse catálogo salvo, sem Make.</small></div>
      <div class="mini-actions" style="margin:10px 0 14px"><button class="secondary" id="cfProductAdminReloadCategories" type="button">Recarregar categorias no Admin</button></div>
      <div class="form">
        <label class="span2">Categoria padrão para novas canecas
          <select id="cfDefaultLiCategory">${optionList(cats, defaults.categoria_padrao_uri)}</select>
        </label>
        <label>Tipo de produção padrão
          <select id="cfDefaultProductionType"><option value="revenda" ${defaults.fiscal.tipo_producao === 'revenda' ? 'selected' : ''}>Revenda</option><option value="fabricacao_propria" ${defaults.fiscal.tipo_producao === 'fabricacao_propria' ? 'selected' : ''}>Fabricação própria</option></select>
        </label>
        <label>Origem da mercadoria padrão
          <select id="cfDefaultOrigin">${originOptions(defaults.fiscal.origem_mercadoria)}</select>
        </label>
        <label>NCM padrão<input id="cfDefaultNcm" inputmode="numeric" maxlength="8" value="${esc(defaults.fiscal.ncm)}"></label>
      </div>
      <h3 style="margin:16px 0 8px">Publicação padrão</h3>
      <div class="form">
        <label>Ativo na Loja Integrada<select id="cfDefaultLiActive"><option value="1" ${defaults.publicacao.ativo ? 'selected' : ''}>Sim</option><option value="0" ${!defaults.publicacao.ativo ? 'selected' : ''}>Não</option></select></label>
        <label>Visível na loja<select id="cfDefaultLiVisible"><option value="1" ${defaults.publicacao.visivel ? 'selected' : ''}>Sim</option><option value="0" ${!defaults.publicacao.visivel ? 'selected' : ''}>Não</option></select></label>
        <label>À venda<select id="cfDefaultLiForSale"><option value="1" ${defaults.publicacao.a_venda ? 'selected' : ''}>Sim</option><option value="0" ${!defaults.publicacao.a_venda ? 'selected' : ''}>Não</option></select></label>
      </div>
      <div class="notice" style="margin-top:12px"><b>O que sincroniza automaticamente:</b> “Ativo” é suportado pela API pública da Loja Integrada. “Visível” e “À venda” nascem como Sim por padrão em produto novo, mas a API pública não expõe esses dois controles para alteração posterior. Se você escolher Não, o Admin registra sua intenção e avisa que a mudança precisa ser concluída no painel da Loja Integrada.</div>
      <div class="notice" style="margin-top:8px"><b>Informação fiscal:</b> Tipo de produção e Origem ficam centralizados no CanecaFácil. O endpoint público de produto da Loja Integrada não expõe esses dois campos fiscais. Para não preencher produto por produto, mantenha os mesmos valores como padrão no emissor de NF-e da Loja Integrada. O NCM é sincronizado normalmente pela API.</div>
      <div class="mini-actions" style="margin-top:12px"><button class="primary" id="cfSaveProductDefaults" type="button">Salvar padrões de cadastro</button></div>
    </div>`;
  $('#cfSaveProductDefaults', section).onclick = saveSettings;
  $('#cfProductAdminReloadCategories', section).onclick = async () => {
    refsCache = null;
    if (window.__CF_LI_CATALOG_REFRESH_GITHUB__?.reloadCatalog) await window.__CF_LI_CATALOG_REFRESH_GITHUB__.reloadCatalog();
    await renderSettings();
  };
}

async function saveSettings() {
  const ncm = text($('#cfDefaultNcm')?.value).replace(/\D/g, '');
  if (ncm.length !== 8) return toast('O NCM padrão precisa ter 8 dígitos.', true);
  const value = {
    fiscal: {
      tipo_producao: text($('#cfDefaultProductionType')?.value) || 'revenda',
      origem_mercadoria: text($('#cfDefaultOrigin')?.value) || '0',
      ncm
    },
    publicacao: {
      ativo: $('#cfDefaultLiActive')?.value !== '0',
      visivel: $('#cfDefaultLiVisible')?.value !== '0',
      a_venda: $('#cfDefaultLiForSale')?.value !== '0'
    },
    categoria_padrao_uri: text($('#cfDefaultLiCategory')?.value),
    atualizado_em: nowIso(),
    atualizado_por: 'admin_canecas'
  };
  await putNode(SETTINGS_NODE, value);
  settingsCache = normalizeSettings(value);
  await audit('canecas_config_cadastro_produto_v2', value).catch(() => {});
  toast('Padrões de cadastro salvos.');
}

async function waitDrawer(productKey) {
  for (let i = 0; i < 35; i += 1) {
    const root = $('#drawerContent');
    if (root?.dataset.productKey === productKey && $('#cfSaveOnly', root)) return root;
    await sleep(80);
  }
  return null;
}
async function installDrawer(productKey) {
  const root = await waitDrawer(productKey);
  if (!root || root.dataset.cfProductAdminV2 === productKey) return;
  const [p, defaults, refs] = await Promise.all([getMug(productKey), loadSettings(), loadRefs()]);
  if (!p || !root.isConnected || root.dataset.productKey !== productKey) return;
  const cats = categoriesOf(refs), currentUri = productCategoryUri(p, defaults, refs), fiscal = productFiscal(p, defaults);
  const active = productActive(p, defaults), visible = productVisible(p, defaults), forSale = productForSale(p, defaults);
  const currentCat = cats.find(item => categoryId(item.resource_uri) === categoryId(currentUri));
  const section = document.createElement('div');
  section.className = 'form-section';
  section.id = 'cfProductAdminConfigV2';
  section.innerHTML = `
    <h3>Loja Integrada · cadastro e publicação</h3>
    <p style="margin-top:0;color:#6e756d;font-size:12px">Categorias reais lidas pela automação GitHub. Fiscal e publicação ficam junto do produto para não depender de ajustes dispersos.</p>
    <div class="form">
      <label class="span2">Categoria Loja Integrada
        <select id="cfProductLiCategoryV2">${optionList(cats, currentUri)}</select>
        <small>${cats.length} categoria(s) disponíveis${currentCat ? ` · atual: ${esc(currentCat.nome)}` : ''}</small>
      </label>
      <label>Tipo de produção
        <select id="cfProductProductionTypeV2"><option value="revenda" ${fiscal.tipo === 'revenda' ? 'selected' : ''}>Revenda</option><option value="fabricacao_propria" ${fiscal.tipo === 'fabricacao_propria' ? 'selected' : ''}>Fabricação própria</option></select>
      </label>
      <label>Origem da mercadoria
        <select id="cfProductOriginV2">${originOptions(fiscal.origem)}</select>
      </label>
      <label>NCM<input id="cfProductNcmV2" inputmode="numeric" maxlength="8" value="${esc(fiscal.ncm)}"></label>
    </div>
    <h4 style="margin:14px 0 7px">Publicação</h4>
    <div class="form">
      <label>Ativo<select id="cfProductActiveV2"><option value="1" ${active ? 'selected' : ''}>Sim</option><option value="0" ${!active ? 'selected' : ''}>Não</option></select><small>API automática</small></label>
      <label>Visível<select id="cfProductVisibleV2"><option value="1" ${visible ? 'selected' : ''}>Sim</option><option value="0" ${!visible ? 'selected' : ''}>Não</option></select><small>Padrão LI = Sim</small></label>
      <label>À venda<select id="cfProductForSaleV2"><option value="1" ${forSale ? 'selected' : ''}>Sim</option><option value="0" ${!forSale ? 'selected' : ''}>Não</option></select><small>Padrão LI = Sim</small></label>
    </div>
    <div class="notice" id="cfProductAdminCapabilityV2" style="margin-top:9px">Ativo, categoria e NCM seguem pela API. Tipo de produção/origem são mantidos como política fiscal do CanecaFácil; Visível/À venda exigem o painel LI somente quando você quiser desligá-los.</div>`;
  const personal = $('#cfPersonalizationConfig', root);
  if (personal) root.insertBefore(section, personal);
  else root.appendChild(section);
  root.dataset.cfProductAdminV2 = productKey;
  const capability = () => {
    const needsManual = $('#cfProductVisibleV2', root)?.value === '0' || $('#cfProductForSaleV2', root)?.value === '0';
    const box = $('#cfProductAdminCapabilityV2', root);
    if (box) box.innerHTML = needsManual
      ? '<b>Atenção:</b> você escolheu desligar Visível ou À venda. A API pública da Loja Integrada não oferece esses controles; salve aqui e conclua essa alteração no painel da Loja Integrada.'
      : 'Ativo, categoria e NCM seguem pela API. Visível e À venda permanecem Sim, que é o padrão da Loja Integrada para produto novo.';
  };
  $('#cfProductVisibleV2', root).onchange = capability;
  $('#cfProductForSaleV2', root).onchange = capability;
  capability();
  wrapSaveButtons(productKey, root);
}

function wrapSaveButtons(productKey, root) {
  let wrapped = 0;
  for (const id of ['cfSaveOnly', 'cfSaveSync', 'cfSyncNow']) {
    const button = $(`#${id}`, root);
    if (!button || button.dataset.cfProductAdminV2Wrapped === '1' || typeof button.onclick !== 'function') continue;
    const previous = button.onclick;
    button.dataset.cfProductAdminV2Wrapped = '1';
    button.onclick = async function(event) {
      if (button.dataset.cfProductAdminV2Saving === '1') return;
      button.dataset.cfProductAdminV2Saving = '1';
      try {
        await saveProductAdmin(productKey, root);
        return await previous.call(button, event);
      } catch (error) {
        console.error('[Admin Canecas] cadastro LI V2:', error);
        toast(`Cadastro LI: ${error.message || error}`, true);
      } finally {
        button.dataset.cfProductAdminV2Saving = '';
      }
    };
    wrapped += 1;
  }
  if (wrapped < 2) setTimeout(() => wrapSaveButtons(productKey, root), 250);
}

async function saveProductAdmin(productKey, root) {
  if (!$('#cfProductAdminConfigV2', root)) return;
  const product = await getMug(productKey);
  if (!product) throw new Error('Caneca não encontrada.');
  const uri = text($('#cfProductLiCategoryV2', root)?.value);
  if (!uri) throw new Error('Escolha uma categoria da Loja Integrada.');
  const refs = await loadRefs();
  const category = categoriesOf(refs).find(item => categoryId(item.resource_uri) === categoryId(uri));
  if (!category) throw new Error('A categoria escolhida não existe mais no catálogo atual da Loja Integrada. Recarregue as categorias.');
  const ncm = text($('#cfProductNcmV2', root)?.value).replace(/\D/g, '');
  if (ncm.length !== 8) throw new Error('O NCM precisa ter 8 dígitos.');
  const tipo = text($('#cfProductProductionTypeV2', root)?.value) || 'revenda';
  const origem = text($('#cfProductOriginV2', root)?.value) || '0';
  const ativo = $('#cfProductActiveV2', root)?.value !== '0';
  const visivel = $('#cfProductVisibleV2', root)?.value !== '0';
  const aVenda = $('#cfProductForSaleV2', root)?.value !== '0';
  const li = productLi(product);
  const patch = {
    ncm,
    loja_integrada_ativo: ativo,
    canecafacil_ativo: ativo,
    loja_integrada_visivel: visivel,
    loja_integrada_a_venda: aVenda,
    loja_integrada_categoria_id: text(category.id) || categoryId(uri),
    loja_integrada_categoria_nome: text(category.nome),
    loja_integrada_categoria_uri: text(category.resource_uri),
    loja_integrada_tipo_producao: tipo,
    loja_integrada_origem_mercadoria: origem,
    loja_integrada: {
      ...li,
      ativo,
      visivel,
      a_venda: aVenda,
      categoria_id: text(category.id) || categoryId(uri),
      categoria_nome: text(category.nome),
      categoria_uri: text(category.resource_uri),
      tipo_producao: tipo,
      origem_mercadoria: origem,
      configuracao_admin_v2_em: nowIso()
    }
  };
  await patchMug(productKey, patch);
  await audit('caneca_cadastro_li_v2_salvo', {
    produto_key: productKey,
    categoria_id: patch.loja_integrada_categoria_id,
    categoria_nome: patch.loja_integrada_categoria_nome,
    ativo, visivel, a_venda: aVenda, ncm, tipo_producao: tipo, origem_mercadoria: origem,
    requer_ajuste_manual_li: !visivel || !aVenda
  }).catch(() => {});
}

window.addEventListener('admin-canecas:drawer', event => {
  const detail = event.detail || {};
  if (detail.kind !== 'mug' || !detail.id) return;
  installDrawer(text(detail.id)).catch(error => {
    console.error('[Admin Canecas] produto V2:', error);
    toast(`Cadastro do produto: ${error.message || error}`, true);
  });
});
window.addEventListener('admin-canecas:route', event => {
  if (event.detail?.route === 'settings') setTimeout(() => renderSettings().catch(console.error), 40);
});
window.addEventListener('admin-canecas:settings-rendered', () => setTimeout(() => renderSettings().catch(console.error), 40));
if (location.hash.includes('settings')) setTimeout(() => renderSettings().catch(console.error), 250);

document.documentElement.dataset.cfProductAdminConfigV2 = BUILD;
window.__CF_PRODUCT_ADMIN_CONFIG_V2__ = { BUILD, loadSettings, loadRefs, renderSettings };
