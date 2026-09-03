import { FIREBASE_BASE } from '../shared/mug-commerce-v1.js?v=20260828-1';

const BUILD = '20260903-admin-canecas-generator-category-v1.2';
const SETTINGS_PATH = 'canecas/configuracoes/cadastro_produto_v2';
const OPTIONS = Object.freeze({
  padronizadas: 'Canecas Padronizadas',
  personalizaveis: 'Canecas Personalizáveis',
  empresas: 'Canecas para Empresas',
});
const DEFAULT_PRODUCT_CONFIG = Object.freeze({
  fiscal: Object.freeze({ tipo_producao: 'revenda', origem_mercadoria: '0', ncm: '69111090' }),
  publicacao: Object.freeze({ ativo: true, visivel: true, a_venda: true })
});

const $ = (selector, root = document) => root.querySelector(selector);
let activeCategory = null;
let productDefaults = { fiscal: { ...DEFAULT_PRODUCT_CONFIG.fiscal }, publicacao: { ...DEFAULT_PRODUCT_CONFIG.publicacao } };

function normalizeDefaults(raw = {}) {
  const fiscal = raw?.fiscal && typeof raw.fiscal === 'object' ? raw.fiscal : {};
  const pub = raw?.publicacao && typeof raw.publicacao === 'object' ? raw.publicacao : {};
  return {
    fiscal: {
      tipo_producao: String(fiscal.tipo_producao || DEFAULT_PRODUCT_CONFIG.fiscal.tipo_producao),
      origem_mercadoria: String(fiscal.origem_mercadoria || DEFAULT_PRODUCT_CONFIG.fiscal.origem_mercadoria),
      ncm: String(fiscal.ncm || DEFAULT_PRODUCT_CONFIG.fiscal.ncm).replace(/\D/g, '') || DEFAULT_PRODUCT_CONFIG.fiscal.ncm
    },
    publicacao: {
      ativo: typeof pub.ativo === 'boolean' ? pub.ativo : DEFAULT_PRODUCT_CONFIG.publicacao.ativo,
      visivel: typeof pub.visivel === 'boolean' ? pub.visivel : DEFAULT_PRODUCT_CONFIG.publicacao.visivel,
      a_venda: typeof pub.a_venda === 'boolean' ? pub.a_venda : DEFAULT_PRODUCT_CONFIG.publicacao.a_venda
    }
  };
}
async function refreshProductDefaults() {
  try {
    const response = await fetch(`${FIREBASE_BASE}/${SETTINGS_PATH}.json?_=${Date.now()}`, { cache: 'no-store', headers: { Accept: 'application/json' } });
    if (response.ok) productDefaults = normalizeDefaults((await response.json()) || {});
  } catch (error) {
    console.warn('[Admin Canecas] padrões de cadastro: usando defaults seguros.', error);
  }
  return productDefaults;
}
void refreshProductDefaults();
window.addEventListener('cf-product-admin-defaults-updated', event => { productDefaults = normalizeDefaults(event.detail || {}); });

function toast(message, error = false) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = message;
  el.className = `toast${error ? ' error' : ''}`;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.hidden = true; }, error ? 6000 : 3200);
}
function seoSlug(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 110) || 'caneca-personalizada';
}
function selectedCategory() {
  const type = String($('#mugStoreCategory')?.value || '').trim();
  return type && OPTIONS[type] ? { type, name: OPTIONS[type] } : null;
}
function installStyles() {
  if ($('#cfGeneratorCategoryStyles')) return;
  const style = document.createElement('style');
  style.id = 'cfGeneratorCategoryStyles';
  style.textContent = `
    .cf-generator-category{display:grid;gap:7px;padding:12px 14px;border:1px solid #dedfd9;border-radius:12px;background:#fff}
    .cf-generator-category strong{font-size:13px;color:#1d211f}.cf-generator-category small{font-size:11px;line-height:1.45;color:#697069}
    .cf-generator-category select{width:100%;min-height:43px;padding:9px 11px;border:1px solid #cfd3cc;border-radius:9px;background:#fff;font:inherit;color:#1d211f}
    .cf-generator-category select:focus{outline:2px solid rgba(17,19,21,.14);outline-offset:1px}
  `;
  document.head.appendChild(style);
}
function installSelector() {
  const root = $('#generator');
  const create = $('.mug-prod-create', root);
  const instruction = $('.mug-prod-instruction', create);
  if (!root || !create || !instruction || $('#mugStoreCategory', root)) return false;
  installStyles();
  const box = document.createElement('label');
  box.className = 'cf-generator-category';
  box.innerHTML = `
    <strong>Categoria da caneca na CanecaFácil</strong>
    <select id="mugStoreCategory" required aria-required="true">
      <option value="">Selecione antes de gerar…</option>
      <option value="padronizadas">Canecas Padronizadas</option>
      <option value="personalizaveis">Canecas Personalizáveis</option>
      <option value="empresas">Canecas para Empresas</option>
    </select>
    <small>Essa escolha nasce com o produto no Firebase e será usada para vincular a categoria correta na Loja Integrada.</small>`;
  instruction.insertAdjacentElement('beforebegin', box);
  return true;
}
function patchTemplate(payload) {
  const category = activeCategory || selectedCategory();
  if (!category || payload?.action !== 'finalize_mug_product') return payload;
  let template = {};
  try { template = JSON.parse(payload.firebase_template_json || '{}') || {}; }
  catch { template = {}; }
  const personalizable = category.type === 'personalizaveis';
  const li = template.loja_integrada && typeof template.loja_integrada === 'object' ? template.loja_integrada : {};
  const cfg = productDefaults || DEFAULT_PRODUCT_CONFIG;
  const ativo = cfg.publicacao.ativo !== false;
  const visivel = cfg.publicacao.visivel !== false;
  const aVenda = cfg.publicacao.a_venda !== false;
  const ncm = String(template.ncm || cfg.fiscal.ncm || '69111090').replace(/\D/g, '') || '69111090';
  template = {
    ...template,
    ncm,
    loja_integrada_categoria_tipo: category.type,
    loja_integrada_categoria_nome: category.name,
    canecafacil_categoria_tipo: category.type,
    canecafacil_categoria_nome: category.name,
    personalizavel: personalizable,
    loja_integrada_personalizavel: personalizable,
    canecafacil_personalizavel: personalizable,
    loja_integrada_ativo: ativo,
    canecafacil_ativo: ativo,
    loja_integrada_visivel: visivel,
    loja_integrada_a_venda: aVenda,
    loja_integrada_tipo_producao: cfg.fiscal.tipo_producao,
    loja_integrada_origem_mercadoria: cfg.fiscal.origem_mercadoria,
    loja_integrada: {
      ...li,
      categoria_tipo: category.type,
      categoria_nome: category.name,
      marca_nome: 'Caneca Fácil',
      tipo_producao: cfg.fiscal.tipo_producao,
      origem_mercadoria: cfg.fiscal.origem_mercadoria,
      ativo,
      visivel,
      a_venda: aVenda,
      personalizavel: personalizable,
    },
  };
  return {
    ...payload,
    generator_category_type: category.type,
    generator_category_name: category.name,
    seo_slug: seoSlug(payload.product_name || template.nome || payload.request_id),
    firebase_template_json: JSON.stringify(template),
  };
}
const originalFetch = window.fetch.bind(window);
window.fetch = async function cfGeneratorCategoryFetch(input, init = {}) {
  try {
    if (typeof init?.body === 'string' && /hook\.eu1\.make\.com/i.test(String(input))) {
      const wrapper = JSON.parse(init.body);
      if (wrapper && typeof wrapper.payload === 'string') {
        const payload = JSON.parse(wrapper.payload);
        if (payload?.action === 'finalize_mug_product') {
          const patched = patchTemplate(payload);
          wrapper.payload = JSON.stringify(patched);
          init = { ...init, body: JSON.stringify(wrapper) };
          const select = $('#mugStoreCategory');
          if (select) select.value = '';
          activeCategory = null;
        }
      }
    }
  } catch (error) {
    console.warn('[Admin Canecas] categoria/SEO do gerador: não foi possível enriquecer o payload.', error);
  }
  return originalFetch(input, init);
};
document.addEventListener('click', event => {
  const generate = event.target.closest?.('#mugArtGenerate');
  if (generate) {
    const category = selectedCategory();
    if (!category) {
      event.preventDefault();
      event.stopImmediatePropagation();
      $('#mugStoreCategory')?.focus();
      toast('Escolha uma das 3 categorias da CanecaFácil antes de gerar a caneca.', true);
      return;
    }
    activeCategory = category;
    void refreshProductDefaults();
  }
  if (event.target.closest?.('#mugArtClear')) {
    activeCategory = null;
    const select = $('#mugStoreCategory');
    if (select) select.value = '';
  }
}, true);
const observer = new MutationObserver(() => installSelector());
observer.observe(document.documentElement, { childList: true, subtree: true });
document.addEventListener('DOMContentLoaded', () => setTimeout(installSelector, 120));
setTimeout(installSelector, 250);
document.documentElement.dataset.cfGeneratorCategory = BUILD;
export { BUILD, OPTIONS, selectedCategory, seoSlug };
