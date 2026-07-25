import { DEFAULT_CONFIG, STORAGE_KEYS } from './config.js';
import { catalogVersionPayload } from './core/catalog.js';
import { escapeHtml, isActive, money, normalizeSearch, number, productImage, productKey, productName, text } from './core/utils.js';
import { loadProducts } from './services/firebase.js';
import { readJsonFile, upsertText } from './services/github.js';

const QUICK_PATH = 'site/compra-rapida.json';
const AUDIT_KEY = 'da_admin_v2_audit_log';

function loadConfig() {
  try { return { ...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem(STORAGE_KEYS.config) || '{}') }; }
  catch { return { ...DEFAULT_CONFIG }; }
}

function toast(message, type = '') {
  const region = document.getElementById('toastRegion');
  if (!region) return;
  const node = document.createElement('div');
  node.className = `toast ${type}`.trim();
  node.textContent = message;
  region.appendChild(node);
  setTimeout(() => node.remove(), type === 'error' ? 7000 : 4000);
}

function audit(action, details = {}) {
  try {
    const current = JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]');
    current.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, action, at: new Date().toISOString(), details });
    localStorage.setItem(AUDIT_KEY, JSON.stringify(current.slice(-1000)));
  } catch {}
}

function installStyle() {
  if (document.getElementById('quickPurchaseAdminStyle')) return;
  const style = document.createElement('style');
  style.id = 'quickPurchaseAdminStyle';
  style.textContent = `
    .suite-panel{margin-bottom:16px}.suite-toolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:14px}.suite-toolbar .search-field{min-width:240px;flex:1}.suite-grid{display:grid;grid-template-columns:minmax(240px,330px) 1fr;gap:16px;padding:0 16px 16px}.suite-tree,.suite-editor{border:1px solid #e2e3df;border-radius:14px;background:#fff;padding:14px}.suite-list{display:grid;gap:8px;max-height:520px;overflow:auto}.suite-list button{width:100%;text-align:left;border:1px solid #e2e3df;background:#fff;border-radius:10px;padding:10px}.suite-list button.active{border-color:#161616;background:#f3f4f1}.suite-list small{display:block;color:#697067}.suite-products{display:grid;gap:8px;max-height:330px;overflow:auto}.suite-product{display:grid;grid-template-columns:44px 1fr auto;gap:10px;align-items:center;border:1px solid #e2e3df;border-radius:10px;padding:8px}.suite-product img{width:44px;height:44px;object-fit:contain;background:#f2f3f0;border-radius:8px}.suite-product small{display:block;color:#697067}.suite-actions{display:flex;gap:6px;flex-wrap:wrap}.suite-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px}.suite-form label{display:grid;gap:6px;font-weight:700}.suite-form .wide{grid-column:1/-1}.suite-form input,.suite-form select,.suite-form textarea{padding:10px;border:1px solid #cfd2ca;border-radius:9px;font:inherit}.suite-form textarea{min-height:86px}.suite-summary{display:flex;gap:12px;flex-wrap:wrap;padding:14px 16px}.suite-summary span{padding:8px 10px;background:#f1f2ef;border-radius:10px}.suite-check-row{display:flex!important;align-items:center;gap:8px}.suite-check-row input{width:auto}.suite-danger{color:#9b1c1c}.suite-empty{padding:24px;text-align:center;color:#697067}
    @media(max-width:800px){.suite-grid{grid-template-columns:1fr;padding:0 11px 11px}.suite-form{grid-template-columns:1fr}.suite-form .wide{grid-column:auto}.suite-product{grid-template-columns:42px 1fr}.suite-product .suite-actions{grid-column:1/-1}}
  `;
  document.head.appendChild(style);
}

async function loadGithubJson(path, fallback) {
  const file = await readJsonFile(loadConfig(), path);
  return file?.data ?? fallback;
}

async function saveGithubJson(path, value) {
  const config = loadConfig();
  if (!config.githubToken) throw new Error('Informe o token do GitHub em Integrações.');
  const result = await upsertText(config, path, JSON.stringify(value, null, 2), `Atualiza ${path} pelo Admin oficial`);
  await upsertText(config, config.catalogVersionPath || 'catalog-version.json', JSON.stringify(catalogVersionPayload(config, ['quick-purchase']), null, 2), 'Atualiza versão do catálogo: quick-purchase');
  return result;
}

function cleanQuick(raw = {}) {
  const data = raw && typeof raw === 'object' ? structuredClone(raw) : {};
  data.version = text(data.version || `admin-${Date.now()}`);
  data.updatedAt = text(data.updatedAt || new Date().toISOString());
  data.titulo = text(data.titulo || 'Compra Rápida');
  data.subtitulo = text(data.subtitulo || 'Monte sua compra em poucos minutos.');
  data.ativo = data.ativo !== false;
  data.configuracao = { ...(data.configuracao || {}), maxOpcoesVisiveis: Math.max(1, Math.floor(number(data.configuracao?.maxOpcoesVisiveis) || 5)), firebasePath: 'config_compra_rapida' };
  data.secoes = (Array.isArray(data.secoes) ? data.secoes : []).map((section, sectionIndex) => ({
    ...section, id: text(section.id || `secao-${sectionIndex + 1}`), titulo: text(section.titulo || `Seção ${sectionIndex + 1}`), descricao: text(section.descricao), ordem: number(section.ordem) || sectionIndex + 1, ativo: section.ativo !== false,
    itens: (Array.isArray(section.itens) ? section.itens : []).map((item, itemIndex) => ({
      ...item, id: text(item.id || `item-${sectionIndex + 1}-${itemIndex + 1}`), titulo: text(item.titulo || `Item ${itemIndex + 1}`), descricao: text(item.descricao), ordem: number(item.ordem) || itemIndex + 1, ativo: item.ativo !== false, essencial: item.essencial === true, produtoPadraoId: text(item.produtoPadraoId), produtos: Array.isArray(item.produtos) ? item.produtos : [],
    })),
  }));
  return data;
}

function productSnapshot(product) {
  return {
    id: text(product.codigo || product.id || productKey(product)), firebaseKey: productKey(product), nome: productName(product), preco: number(product.preco), estoque: Math.max(0, Math.floor(number(product.estoque))), imagem: productImage(product), marca: text(product.marca), categoria: text(product.categoria), subcategoria: text(product.subcategoria), ean: text(product.gtin || product.ean),
  };
}

class QuickPurchasePanel {
  constructor(container) {
    this.container = container;
    this.config = cleanQuick({});
    this.products = [];
    this.sectionId = '';
    this.itemId = '';
    this.query = '';
    this.renderShell();
    this.reload();
  }

  renderShell() {
    this.container.innerHTML = `<section class="panel suite-panel"><div class="panel-header"><div><span class="eyebrow">Compra do mês</span><h2>Compra Rápida</h2><p>Organize seções, itens e opções de produtos. A busca permite selecionar todos os resultados de uma vez.</p></div><div class="suite-actions"><button class="button secondary" type="button" data-quick-add-section>Nova seção</button><button class="button primary" type="button" data-quick-save>Publicar</button></div></div><div class="suite-summary" data-quick-summary></div><div class="suite-grid"><div class="suite-tree"><div class="suite-toolbar"><strong>Estrutura</strong><button class="button secondary compact" type="button" data-quick-add-item>Novo item</button></div><div class="suite-list" data-quick-tree></div></div><div class="suite-editor" data-quick-editor></div></div></section>`;
    this.container.querySelector('[data-quick-add-section]').addEventListener('click', () => this.addSection());
    this.container.querySelector('[data-quick-add-item]').addEventListener('click', () => this.addItem());
    this.container.querySelector('[data-quick-save]').addEventListener('click', event => this.save(event.currentTarget));
    this.container.querySelector('[data-quick-tree]').addEventListener('click', event => {
      const section = event.target.closest('[data-quick-section]');
      const item = event.target.closest('[data-quick-item]');
      if (item) { this.sectionId = item.dataset.section; this.itemId = item.dataset.quickItem; }
      else if (section) { this.sectionId = section.dataset.quickSection; this.itemId = ''; }
      this.render();
    });
  }

  currentSection() { return this.config.secoes.find(section => section.id === this.sectionId) || null; }
  currentItem() { return this.currentSection()?.itens?.find(item => item.id === this.itemId) || null; }

  async reload() {
    this.container.querySelector('[data-quick-editor]').innerHTML = '<p>Carregando…</p>';
    try {
      const [config, products] = await Promise.all([loadGithubJson(QUICK_PATH, {}), loadProducts(loadConfig())]);
      this.config = cleanQuick(config);
      this.products = products.filter(product => isActive(product) && number(product.preco) > 0 && number(product.estoque) > 0);
      this.sectionId = this.config.secoes[0]?.id || '';
      this.itemId = this.config.secoes[0]?.itens?.[0]?.id || '';
      this.render();
    } catch (error) {
      this.container.querySelector('[data-quick-editor]').innerHTML = `<p>${escapeHtml(error?.message || String(error))}</p>`;
    }
  }

  render() {
    const sections = this.config.secoes.sort((a, b) => number(a.ordem) - number(b.ordem));
    this.container.querySelector('[data-quick-summary]').innerHTML = `<span>${sections.length} seções</span><span>${sections.reduce((sum, section) => sum + (section.itens || []).length, 0)} itens</span><span>${this.products.length} produtos disponíveis</span>`;
    this.container.querySelector('[data-quick-tree]').innerHTML = sections.length ? sections.map(section => `<div><button type="button" class="${section.id === this.sectionId && !this.itemId ? 'active' : ''}" data-quick-section="${escapeHtml(section.id)}"><strong>${escapeHtml(section.titulo)}</strong><small>${section.itens.length} itens · ${section.ativo ? 'ativa' : 'oculta'}</small></button>${section.id === this.sectionId || section.itens.some(item => item.id === this.itemId) ? `<div class="suite-list" style="margin:7px 0 10px 14px">${section.itens.sort((a,b)=>number(a.ordem)-number(b.ordem)).map(item => `<button type="button" class="${item.id === this.itemId ? 'active' : ''}" data-section="${escapeHtml(section.id)}" data-quick-item="${escapeHtml(item.id)}"><strong>${escapeHtml(item.titulo)}</strong><small>${item.produtos.length} opções</small></button>`).join('')}</div>` : ''}</div>`).join('') : '<div class="suite-empty">Crie a primeira seção.</div>';
    this.renderEditor();
  }

  renderEditor() {
    const editor = this.container.querySelector('[data-quick-editor]');
    const section = this.currentSection();
    const item = this.currentItem();
    if (!section) {
      editor.innerHTML = '<div class="suite-empty">Selecione ou crie uma seção.</div>';
      return;
    }
    if (!item) {
      editor.innerHTML = `<div class="panel-header"><div><h3>Editar seção</h3><p>Defina o agrupamento exibido na Compra Rápida.</p></div><button class="button ghost suite-danger" type="button" data-delete-section>Excluir</button></div><div class="suite-form"><label class="wide">Título<input data-section-field="titulo" value="${escapeHtml(section.titulo)}"></label><label class="wide">Descrição<textarea data-section-field="descricao">${escapeHtml(section.descricao || '')}</textarea></label><label>Ordem<input data-section-field="ordem" type="number" min="1" value="${section.ordem}"></label><label class="suite-check-row"><input data-section-field="ativo" type="checkbox" ${section.ativo ? 'checked' : ''}> Seção ativa</label></div>`;
      editor.querySelectorAll('[data-section-field]').forEach(input => input.addEventListener('input', () => {
        const field = input.dataset.sectionField;
        section[field] = input.type === 'checkbox' ? input.checked : field === 'ordem' ? Math.max(1, number(input.value)) : input.value;
        this.renderTreeOnly();
      }));
      editor.querySelector('[data-delete-section]').addEventListener('click', () => this.deleteSection(section));
      return;
    }

    const existingKeys = new Set(item.produtos.map(product => text(product.firebaseKey || product.id)));
    const query = normalizeSearch(this.query);
    const results = this.products.filter(product => !existingKeys.has(productKey(product)) && (!query || normalizeSearch([productName(product), product.codigo, product.gtin, product.marca, product.categoria].join(' ')).includes(query))).slice(0, 80);
    editor.innerHTML = `<div class="panel-header"><div><h3>Editar item</h3><p>As opções ficam disponíveis para o cliente escolher.</p></div><button class="button ghost suite-danger" type="button" data-delete-item>Excluir</button></div><div class="suite-form"><label class="wide">Título<input data-item-field="titulo" value="${escapeHtml(item.titulo)}"></label><label class="wide">Descrição<textarea data-item-field="descricao">${escapeHtml(item.descricao || '')}</textarea></label><label>Ordem<input data-item-field="ordem" type="number" min="1" value="${item.ordem}"></label><label class="suite-check-row"><input data-item-field="ativo" type="checkbox" ${item.ativo ? 'checked' : ''}> Item ativo</label><label class="suite-check-row"><input data-item-field="essencial" type="checkbox" ${item.essencial ? 'checked' : ''}> Item essencial</label></div><hr><h4>Produtos selecionados</h4><div class="suite-products" data-selected-products>${item.produtos.length ? item.produtos.map((product, index) => `<article class="suite-product"><img src="${escapeHtml(product.imagem || '')}" alt=""><div><strong>${escapeHtml(product.nome || product.id)}</strong><small>${money(product.preco)} · estoque ${number(product.estoque)} ${text(item.produtoPadraoId) === text(product.id) ? '· PADRÃO' : ''}</small></div><div class="suite-actions"><button class="row-action" type="button" data-default-product="${index}">Padrão</button><button class="row-action suite-danger" type="button" data-remove-product="${index}">Remover</button></div></article>`).join('') : '<div class="suite-empty">Nenhum produto selecionado.</div>'}</div><hr><div class="suite-toolbar"><div class="search-field"><span>⌕</span><input type="search" placeholder="Buscar produtos para adicionar" value="${escapeHtml(this.query)}" data-product-search></div><button class="button secondary" type="button" data-select-all ${results.length ? '' : 'disabled'}>Selecionar todos (${results.length})</button></div><div class="suite-products" data-product-results>${results.length ? results.map(product => `<article class="suite-product"><img src="${escapeHtml(productImage(product))}" alt=""><div><strong>${escapeHtml(productName(product))}</strong><small>${escapeHtml(product.codigo || productKey(product))} · ${money(product.preco)} · estoque ${number(product.estoque)}</small></div><button class="button secondary compact" type="button" data-add-product="${escapeHtml(productKey(product))}">Adicionar</button></article>`).join('') : '<div class="suite-empty">Nenhum resultado.</div>'}</div>`;
    editor.querySelectorAll('[data-item-field]').forEach(input => input.addEventListener('input', () => {
      const field = input.dataset.itemField;
      item[field] = input.type === 'checkbox' ? input.checked : field === 'ordem' ? Math.max(1, number(input.value)) : input.value;
      this.renderTreeOnly();
    }));
    editor.querySelector('[data-delete-item]').addEventListener('click', () => this.deleteItem(section, item));
    editor.querySelector('[data-product-search]').addEventListener('input', event => { this.query = event.target.value; this.renderEditor(); });
    editor.querySelector('[data-select-all]').addEventListener('click', () => {
      results.forEach(product => item.produtos.push(productSnapshot(product)));
      if (!item.produtoPadraoId && item.produtos[0]) item.produtoPadraoId = item.produtos[0].id;
      this.query = '';
      this.render();
    });
    editor.querySelector('[data-product-results]').addEventListener('click', event => {
      const button = event.target.closest('[data-add-product]');
      if (!button) return;
      const product = this.products.find(row => productKey(row) === button.dataset.addProduct);
      if (product) {
        item.produtos.push(productSnapshot(product));
        if (!item.produtoPadraoId) item.produtoPadraoId = productSnapshot(product).id;
        this.render();
      }
    });
    editor.querySelector('[data-selected-products]').addEventListener('click', event => {
      const remove = event.target.closest('[data-remove-product]');
      const makeDefault = event.target.closest('[data-default-product]');
      if (remove) {
        const removed = item.produtos.splice(Number(remove.dataset.removeProduct), 1)[0];
        if (text(item.produtoPadraoId) === text(removed?.id)) item.produtoPadraoId = item.produtos[0]?.id || '';
        this.render();
      }
      if (makeDefault) {
        item.produtoPadraoId = item.produtos[Number(makeDefault.dataset.defaultProduct)]?.id || '';
        this.render();
      }
    });
  }

  renderTreeOnly() {
    const selectedSection = this.sectionId;
    const selectedItem = this.itemId;
    this.render();
    this.sectionId = selectedSection;
    this.itemId = selectedItem;
  }

  addSection() {
    const title = prompt('Nome da nova seção:', 'Nova seção');
    if (!text(title)) return;
    const id = `${normalizeSearch(title).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'secao'}-${Date.now().toString().slice(-5)}`;
    const section = { id, titulo: title.trim(), descricao: '', ordem: this.config.secoes.length + 1, ativo: true, itens: [] };
    this.config.secoes.push(section);
    this.sectionId = id;
    this.itemId = '';
    this.render();
  }

  addItem() {
    const section = this.currentSection();
    if (!section) return toast('Selecione uma seção primeiro.', 'error');
    const title = prompt('Nome do novo item:', 'Novo item');
    if (!text(title)) return;
    const id = `${normalizeSearch(title).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item'}-${Date.now().toString().slice(-5)}`;
    const item = { id, titulo: title.trim(), descricao: '', ordem: section.itens.length + 1, ativo: true, essencial: false, produtoPadraoId: '', produtos: [] };
    section.itens.push(item);
    this.itemId = id;
    this.render();
  }

  deleteSection(section) {
    if (!confirm(`Excluir a seção ${section.titulo} e todos os seus itens?`)) return;
    this.config.secoes = this.config.secoes.filter(row => row !== section);
    this.sectionId = this.config.secoes[0]?.id || '';
    this.itemId = '';
    this.render();
  }

  deleteItem(section, item) {
    if (!confirm(`Excluir o item ${item.titulo}?`)) return;
    section.itens = section.itens.filter(row => row !== item);
    this.itemId = section.itens[0]?.id || '';
    this.render();
  }

  async save(button) {
    button.disabled = true;
    button.textContent = 'Publicando…';
    try {
      this.config.version = `admin-${Date.now()}`;
      this.config.updatedAt = new Date().toISOString();
      this.config.secoes.forEach((section, sectionIndex) => {
        section.ordem = sectionIndex + 1;
        section.itens.forEach((item, itemIndex) => { item.ordem = itemIndex + 1; });
      });
      await saveGithubJson(QUICK_PATH, this.config);
      audit('compra_rapida_publicada', { secoes: this.config.secoes.length });
      toast('Compra Rápida publicada.', 'success');
    } catch (error) {
      toast(error?.message || String(error), 'error');
    } finally {
      button.disabled = false;
      button.textContent = 'Publicar';
    }
  }
}

function start() {
  const view = document.querySelector('[data-view="quick-purchase"]');
  if (!view || document.getElementById('quickPurchaseAdminRoot')) return;
  installStyle();
  const root = document.createElement('div');
  root.id = 'quickPurchaseAdminRoot';
  view.appendChild(root);
  new QuickPurchasePanel(root);
  window.dispatchEvent(new CustomEvent('admin-v2-route-ready', { detail: { route: 'quick-purchase' } }));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();