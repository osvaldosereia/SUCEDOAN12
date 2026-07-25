import { DEFAULT_CONFIG, STORAGE_KEYS } from './config.js';
import { escapeHtml, money, number, text } from './core/utils.js';
import { ProductsModule } from './modules/products.js';
import { loadProduct, loadProducts } from './services/firebase.js';

function loadConfig() {
  try { return { ...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem(STORAGE_KEYS.config) || '{}') }; }
  catch { return { ...DEFAULT_CONFIG }; }
}

function installHydratedProductOpening() {
  const prototype = ProductsModule.prototype;
  if (prototype.__adminOfficialHydrationInstalled) return;
  prototype.__adminOfficialHydrationInstalled = true;
  const originalOpenEditor = prototype.openEditor;
  prototype.openEditor = async function openHydratedEditor(key) {
    const normalizedKey = text(key);
    if (!normalizedKey) return;
    if (!this.store.state.dirtyProducts.has(normalizedKey)) {
      try {
        const fullProduct = await loadProduct(this.store.state.config, normalizedKey);
        if (fullProduct) this.store.markProductSaved(normalizedKey, fullProduct, { emit: false });
      } catch (error) {
        console.error('Não foi possível hidratar o produto completo:', error);
        this.onToast?.(`A lista carregou, mas o cadastro completo não pôde ser consultado: ${error?.message || error}`, 'error');
      }
    }
    return originalOpenEditor.call(this, normalizedKey);
  };
}

installHydratedProductOpening();

let currentKey = '';
let renderToken = 0;
const pending = new Map();

function pendingValue(product, field, fallback = '') {
  const values = pending.get(currentKey) || {};
  return Object.prototype.hasOwnProperty.call(values, field) ? values[field] : (product?.[field] ?? fallback);
}

function field(name, label, value = '', type = 'text', attrs = '') {
  return `<label>${escapeHtml(label)}<input data-field="${escapeHtml(name)}" data-admin-extra="1" type="${escapeHtml(type)}" ${attrs} value="${escapeHtml(value ?? '')}"></label>`;
}

function textarea(name, label, value = '', full = true) {
  return `<label${full ? ' class="span-2"' : ''}>${escapeHtml(label)}<textarea data-field="${escapeHtml(name)}" data-admin-extra="1">${escapeHtml(value || '')}</textarea></label>`;
}

function formatDateTime(value) {
  if (!value) return 'Nunca';
  const date = typeof value === 'number' ? new Date(value) : new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('pt-BR');
}

function unique(values) {
  return [...new Set(values.map(value => text(value)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function replaceClassificationSelects(drawer, product, products) {
  const section = drawer.querySelector('[data-editor-section="classification"] .form-grid');
  if (!section || section.dataset.typableRegistries === '1') return;
  section.dataset.typableRegistries = '1';
  const definitions = [
    ['categoria', 'Categorias cadastradas'],
    ['subcategoria', 'Subcategorias cadastradas'],
    ['subsubcategoria', 'Subsubcategorias cadastradas'],
    ['marca', 'Marcas cadastradas'],
    ['fornecedor', 'Fornecedores cadastrados'],
  ];
  definitions.forEach(([name, placeholder]) => {
    const select = section.querySelector(`[data-field="${name}"]`);
    if (!select) return;
    const label = select.closest('label');
    const listId = `adminV2List-${name}`;
    const values = unique([pendingValue(product, name), ...products.map(item => item[name])]);
    const input = document.createElement('input');
    input.dataset.field = name;
    input.dataset.adminExtra = '1';
    input.setAttribute('list', listId);
    input.placeholder = placeholder;
    input.value = pendingValue(product, name);
    const dataList = document.createElement('datalist');
    dataList.id = listId;
    dataList.innerHTML = values.map(value => `<option value="${escapeHtml(value)}"></option>`).join('');
    select.replaceWith(input);
    label?.appendChild(dataList);
  });
}

function imageHistoryMarkup(product) {
  const current = text(pendingValue(product, 'url_imagem', product.url_imagem || product.imagem_url || product.imagem));
  const history = unique(Array.isArray(product.imagens_historico) ? product.imagens_historico : [])
    .filter(url => url !== current)
    .slice(-12)
    .reverse();
  if (!history.length) return '<p class="muted">Nenhuma imagem anterior registrada.</p>';
  return `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px">${history.map(url => `<article style="border:1px solid #e2e3df;border-radius:10px;padding:8px;display:grid;gap:7px"><img src="${escapeHtml(url)}" alt="Imagem anterior" style="width:100%;aspect-ratio:1;object-fit:contain;background:#f3f4f1;border-radius:8px"><button class="button secondary compact" type="button" data-restore-image="${escapeHtml(url)}">Restaurar</button></article>`).join('')}</div>`;
}

async function enhance() {
  const drawer = document.getElementById('productEditor');
  if (!drawer?.classList.contains('open') || !currentKey) return;
  const token = ++renderToken;
  const config = loadConfig();
  const [product, products] = await Promise.all([
    loadProduct(config, currentKey).catch(() => null),
    loadProducts(config).catch(() => []),
  ]);
  if (!product || token !== renderToken || !drawer.classList.contains('open')) return;

  replaceClassificationSelects(drawer, product, products);

  const logistics = drawer.querySelector('[data-editor-section="logistics"] .form-grid');
  const content = drawer.querySelector('[data-editor-section="content"] .form-grid');
  const commercial = drawer.querySelector('[data-editor-section="commercial"] .form-grid');
  if (!logistics || logistics.querySelector('[data-admin-advanced-fields]')) return;

  const commercialPanel = document.createElement('section');
  commercialPanel.className = 'span-2';
  commercialPanel.dataset.adminAdvancedFields = 'commercial';
  const sale = number(pendingValue(product, 'preco', product.preco));
  const cost = number(pendingValue(product, 'preco_custo', product.preco_custo));
  const margin = sale > 0 ? ((sale - cost) / Math.max(sale, 0.01)) * 100 : 0;
  commercialPanel.innerHTML = `<div class="validation-box ${margin >= 20 ? 'success' : margin > 0 ? 'warning' : 'danger'}"><div><strong>Margem atual: ${margin.toFixed(1)}%</strong><small>Custo ${money(cost)} · venda ${money(sale)} · estoque mínimo ${number(pendingValue(product, 'estoque_minimo'))}</small></div></div><div class="form-grid">${field('estoque_minimo','Estoque mínimo',pendingValue(product,'estoque_minimo'),'number','min="0" step="1"')}${field('multiplo_venda','Múltiplo de venda',pendingValue(product,'multiplo_venda',1),'number','min="1" step="1"')}${field('quantidade_caixa','Quantidade por caixa',pendingValue(product,'quantidade_caixa'),'number','min="0" step="1"')}${field('preco_atacado','Preço de atacado',pendingValue(product,'preco_atacado'),'number','min="0" step="0.01"')}</div>`;
  commercial?.appendChild(commercialPanel);

  const logisticsPanel = document.createElement('section');
  logisticsPanel.className = 'span-2';
  logisticsPanel.dataset.adminAdvancedFields = 'logistics';
  logisticsPanel.innerHTML = `<div class="panel-header"><div><h3>Fiscal e logística avançada</h3><p>Campos adicionais preservados no Firebase e no catálogo oficial.</p></div></div><div class="form-grid">${field('cest','CEST',pendingValue(product,'cest'),'text','inputmode="numeric"')}${field('origem_tributaria','Origem tributária',pendingValue(product,'origem_tributaria'))}${field('cfop','CFOP padrão',pendingValue(product,'cfop'))}${field('gtin_tributavel','GTIN tributável',pendingValue(product,'gtin_tributavel'),'text','inputmode="numeric"')}${field('unidade_tributavel','Unidade tributável',pendingValue(product,'unidade_tributavel'))}${field('peso','Peso (kg)',pendingValue(product,'peso'),'number','min="0" step="0.001"')}${field('largura','Largura (cm)',pendingValue(product,'largura'),'number','min="0" step="0.01"')}${field('altura','Altura (cm)',pendingValue(product,'altura'),'number','min="0" step="0.01"')}${field('comprimento','Comprimento (cm)',pendingValue(product,'comprimento'),'number','min="0" step="0.01"')}${field('codigo_fornecedor','Código no fornecedor',pendingValue(product,'codigo_fornecedor'))}${field('bling_id','ID no Bling',pendingValue(product,'bling_id'))}${field('slug','Slug',pendingValue(product,'slug'),'text','placeholder="nome-do-produto"')}</div><div class="validation-box"><div><strong>Última atualização</strong><small>${escapeHtml(formatDateTime(product.updated_at || product.last_update))} · estoque ${escapeHtml(formatDateTime(product.stock_updated_at))}</small></div></div>`;
  logistics.appendChild(logisticsPanel);

  if (content && !content.querySelector('[data-admin-advanced-content]')) {
    const contentPanel = document.createElement('section');
    contentPanel.className = 'span-2';
    contentPanel.dataset.adminAdvancedContent = '1';
    const highlighted = ['true', '1', 'sim'].includes(text(pendingValue(product, 'destaque')).toLowerCase()) || pendingValue(product, 'destaque') === true;
    contentPanel.innerHTML = `<div class="panel-header"><div><h3>SEO e publicação</h3><p>Informações usadas nos buscadores e na organização do catálogo.</p></div></div><div class="form-grid">${field('seo_titulo','Título SEO',pendingValue(product,'seo_titulo'),'text','maxlength="70"')}${field('ordem','Ordem no catálogo',pendingValue(product,'ordem'),'number','step="1"')}<label>Destaque<select data-field="destaque" data-admin-extra="1"><option value="0" ${!highlighted ? 'selected' : ''}>Não</option><option value="1" ${highlighted ? 'selected' : ''}>Sim</option></select></label>${textarea('seo_descricao','Descrição SEO',pendingValue(product,'seo_descricao'))}${field('descricao_status','Status da descrição',pendingValue(product,'descricao_status'))}${field('seo_status','Status do SEO',pendingValue(product,'seo_status'))}${field('tag_global','Tag global',pendingValue(product,'tag_global'))}</div><div class="panel-header" style="margin-top:18px"><div><h3>Histórico de imagens</h3><p>Escolha uma imagem anterior e depois clique em Salvar produto.</p></div></div>${imageHistoryMarkup(product)}`;
    content.appendChild(contentPanel);
  }
}

function restoreImage(url) {
  const input = document.querySelector('#productForm [data-field="url_imagem"]');
  if (!input) return;
  input.value = url;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  const preview = document.getElementById('editorImagePreview');
  if (preview) preview.src = url;
  const current = pending.get(currentKey) || {};
  current.url_imagem = url;
  pending.set(currentKey, current);
}

function start() {
  document.getElementById('productsTableBody')?.addEventListener('click', event => {
    const button = event.target.closest('[data-product-key]');
    if (button) currentKey = button.dataset.productKey;
  }, true);
  window.addEventListener('admin-v2-open-product', event => { currentKey = text(event.detail?.key); setTimeout(enhance, 60); });
  document.getElementById('productForm')?.addEventListener('input', event => {
    const fieldName = event.target.dataset.field;
    if (!currentKey || !fieldName || event.target.dataset.adminExtra !== '1') return;
    const current = pending.get(currentKey) || {};
    current[fieldName] = event.target.value;
    pending.set(currentKey, current);
  }, true);
  document.getElementById('productForm')?.addEventListener('change', event => {
    const fieldName = event.target.dataset.field;
    if (!currentKey || !fieldName || event.target.dataset.adminExtra !== '1') return;
    const current = pending.get(currentKey) || {};
    current[fieldName] = event.target.value;
    pending.set(currentKey, current);
  }, true);
  document.getElementById('productForm')?.addEventListener('click', event => {
    const button = event.target.closest('[data-restore-image]');
    if (!button) return;
    event.preventDefault();
    restoreImage(button.dataset.restoreImage);
  });
  document.getElementById('closeEditorButton')?.addEventListener('click', () => { currentKey = ''; renderToken += 1; });
  document.getElementById('reloadButton')?.addEventListener('click', () => pending.clear());
  const drawer = document.getElementById('productEditor');
  if (!drawer) return;
  const observer = new MutationObserver(() => {
    if (drawer.classList.contains('open')) setTimeout(enhance, 40);
  });
  observer.observe(drawer, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
