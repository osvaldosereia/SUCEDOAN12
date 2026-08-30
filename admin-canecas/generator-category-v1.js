const BUILD = '20260830-admin-canecas-generator-category-v1.1';
const OPTIONS = Object.freeze({
  padronizadas: 'Canecas Padronizadas',
  personalizaveis: 'Canecas Personalizáveis',
  empresas: 'Canecas para Empresas',
});

const $ = (selector, root = document) => root.querySelector(selector);
let activeCategory = null;

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
  template = {
    ...template,
    loja_integrada_categoria_tipo: category.type,
    loja_integrada_categoria_nome: category.name,
    canecafacil_categoria_tipo: category.type,
    canecafacil_categoria_nome: category.name,
    personalizavel: personalizable,
    loja_integrada_personalizavel: personalizable,
    canecafacil_personalizavel: personalizable,
    loja_integrada: {
      ...li,
      categoria_tipo: category.type,
      categoria_nome: category.name,
      marca_nome: 'Caneca Fácil',
      tipo_producao: 'revenda',
      origem_mercadoria: '0',
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
