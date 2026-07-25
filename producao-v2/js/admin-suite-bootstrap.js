import { DEFAULT_CONFIG, STORAGE_KEYS } from './config.js';
import { catalogVersionPayload } from './core/catalog.js';
import {
  escapeHtml, isActive, money, normalizeSearch, number, productImage, productKey, productName, text,
} from './core/utils.js';
import { loadOrders, loadProducts, patchOrder } from './services/firebase.js';
import { readJsonFile, upsertText } from './services/github.js';

const COUPONS_PATH = 'site/cuponsativos.json';
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

function download(name, content, type = 'application/json') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvCell(value) {
  const raw = String(value ?? '').replace(/\r?\n/g, ' ');
  return `"${raw.replace(/"/g, '""')}"`;
}

function installStyle() {
  if (document.getElementById('adminSuiteStyle')) return;
  const style = document.createElement('style');
  style.id = 'adminSuiteStyle';
  style.textContent = `
    .suite-panel{margin-top:20px}.suite-toolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:14px}.suite-toolbar .search-field{min-width:240px;flex:1}.suite-grid{display:grid;grid-template-columns:minmax(240px,330px) 1fr;gap:16px}.suite-tree,.suite-editor{border:1px solid #e2e3df;border-radius:14px;background:#fff;padding:14px}.suite-list{display:grid;gap:8px;max-height:520px;overflow:auto}.suite-list button{width:100%;text-align:left;border:1px solid #e2e3df;background:#fff;border-radius:10px;padding:10px}.suite-list button.active{border-color:#161616;background:#f3f4f1}.suite-list small{display:block;color:#697067}.suite-products{display:grid;gap:8px;max-height:330px;overflow:auto}.suite-product{display:grid;grid-template-columns:44px 1fr auto;gap:10px;align-items:center;border:1px solid #e2e3df;border-radius:10px;padding:8px}.suite-product img{width:44px;height:44px;object-fit:contain;background:#f2f3f0;border-radius:8px}.suite-product small{display:block;color:#697067}.suite-actions{display:flex;gap:6px;flex-wrap:wrap}.suite-modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.52);z-index:1300}.suite-modal{position:fixed;z-index:1301;inset:5vh max(18px,calc((100vw - 900px)/2));background:#fff;border-radius:18px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 28px 90px rgba(0,0,0,.3)}.suite-modal header,.suite-modal footer{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:18px 22px;border-bottom:1px solid #e4e5e1}.suite-modal footer{border-top:1px solid #e4e5e1;border-bottom:0;justify-content:flex-end}.suite-modal-body{padding:20px 22px;overflow:auto}.suite-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px}.suite-form label{display:grid;gap:6px;font-weight:700}.suite-form .wide{grid-column:1/-1}.suite-form input,.suite-form select,.suite-form textarea{padding:10px;border:1px solid #cfd2ca;border-radius:9px;font:inherit}.suite-form textarea{min-height:86px}.order-items{display:grid;gap:8px}.order-item{display:grid;grid-template-columns:1fr auto;gap:10px;border-bottom:1px solid #eee;padding:8px 0}.order-status-actions{display:flex;gap:8px;flex-wrap:wrap}.suite-badge{display:inline-flex;padding:4px 8px;border-radius:999px;background:#eef0eb;font-size:12px;font-weight:800}.suite-badge.ok{background:#dff3e5;color:#17602d}.suite-badge.warn{background:#fff0c9;color:#6b4a00}.suite-badge.bad{background:#ffe0e0;color:#8d1d1d}.suite-json-preview{white-space:pre-wrap;background:#151515;color:#eee;border-radius:12px;padding:14px;max-height:360px;overflow:auto;font:12px/1.45 monospace}.suite-empty{padding:24px;text-align:center;color:#697067}.suite-summary{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px}.suite-summary span{padding:8px 10px;background:#f1f2ef;border-radius:10px}.suite-check-row{display:flex!important;grid-template-columns:none!important;align-items:center;gap:8px}.suite-check-row input{width:auto}.suite-danger{color:#9b1c1c}.suite-muted{color:#697067;font-size:13px}
    @media(max-width:800px){.suite-grid{grid-template-columns:1fr}.suite-form{grid-template-columns:1fr}.suite-form .wide{grid-column:auto}.suite-modal{inset:0;border-radius:0}.suite-product{grid-template-columns:42px 1fr}.suite-product .suite-actions{grid-column:1/-1}}
  `;
  document.head.appendChild(style);
}

function modal(title, subtitle = '') {
  const backdrop = document.createElement('div');
  backdrop.className = 'suite-modal-backdrop';
  const dialog = document.createElement('section');
  dialog.className = 'suite-modal';
  dialog.innerHTML = `<header><div><span class="eyebrow">Admin oficial</span><h2>${escapeHtml(title)}</h2>${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}</div><button class="icon-button" type="button" data-close>×</button></header><div class="suite-modal-body"></div><footer></footer>`;
  const close = () => { backdrop.remove(); dialog.remove(); };
  backdrop.addEventListener('click', close);
  dialog.querySelector('[data-close]').addEventListener('click', close);
  document.body.append(backdrop, dialog);
  return { dialog, body: dialog.querySelector('.suite-modal-body'), foot: dialog.querySelector('footer'), close };
}

async function loadGithubJson(path, fallback) {
  const file = await readJsonFile(loadConfig(), path);
  return file?.data ?? fallback;
}

async function saveGithubJson(path, value, changed = ['admin']) {
  const config = loadConfig();
  if (!config.githubToken) throw new Error('Informe o token do GitHub nas configurações.');
  const result = await upsertText(config, path, JSON.stringify(value, null, 2), `Atualiza ${path} pelo Admin oficial`);
  await upsertText(config, config.catalogVersionPath || 'catalog-version.json', JSON.stringify(catalogVersionPayload(config, changed), null, 2), `Atualiza versão do catálogo: ${changed.join(', ')}`);
  return result;
}

function couponForm(coupon = {}) {
  return `<form class="suite-form" id="couponForm">
    <label>Código<input name="codigo" required value="${escapeHtml(coupon.codigo || '')}"></label>
    <label>Posição<input name="posicao" type="number" min="1" step="1" value="${escapeHtml(coupon.posicao || 1)}"></label>
    <label>Tipo<select name="tipo"><option value="percentual" ${coupon.tipo !== 'fixo' ? 'selected' : ''}>Percentual</option><option value="fixo" ${coupon.tipo === 'fixo' ? 'selected' : ''}>Valor fixo</option></select></label>
    <label>Desconto<input name="desconto" type="number" min="0" step="0.01" required value="${escapeHtml(coupon.desconto || 0)}"></label>
    <label>Valor mínimo<input name="valorMinimo" type="number" min="0" step="0.01" value="${escapeHtml(coupon.valorMinimo || 0)}"></label>
    <label>Validade<input name="validade" type="date" value="${escapeHtml(String(coupon.validade || '').slice(0, 10))}"></label>
    <label class="wide suite-check-row"><input name="ativo" type="checkbox" ${coupon.ativo !== false ? 'checked' : ''}> Cupom ativo</label>
    <label class="wide">Título<input name="tituloBanner" value="${escapeHtml(coupon.tituloBanner || '')}"></label>
    <label class="wide">Descrição<textarea name="descricao">${escapeHtml(coupon.descricao || '')}</textarea></label>
    <label class="wide">Categorias<textarea name="categorias" placeholder="Uma por linha ou separadas por vírgula">${escapeHtml((coupon.categorias || []).join('\n'))}</textarea></label>
    <label class="wide">Marcas<textarea name="marcas">${escapeHtml((coupon.marcas || []).join('\n'))}</textarea></label>
    <label class="wide">Palavras-chave<textarea name="palavras_chave">${escapeHtml((coupon.palavras_chave || []).join('\n'))}</textarea></label>
  </form>`;
}

function listValues(value) {
  return [...new Set(String(value || '').split(/[,;\n|]/).map(item => item.trim()).filter(Boolean))];
}

class CouponsPanel {
  constructor(container) {
    this.container = container;
    this.coupons = [];
    this.renderShell();
    this.reload();
  }

  renderShell() {
    this.container.innerHTML = `<section class="panel suite-panel"><div class="panel-header"><div><span class="eyebrow">Promoções</span><h2>Cupons de desconto</h2><p>Crie, edite, desative e publique os cupons usados pelo checkout.</p></div><button class="button primary" type="button" data-coupon-new>Novo cupom</button></div><div class="suite-toolbar"><div class="search-field"><span>⌕</span><input type="search" placeholder="Buscar cupom" data-coupon-search></div><button class="button secondary" type="button" data-coupon-reload>Atualizar</button></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Código</th><th>Desconto</th><th>Mínimo</th><th>Validade</th><th>Status</th><th></th></tr></thead><tbody data-coupon-rows></tbody></table></div></section>`;
    this.container.querySelector('[data-coupon-new]').addEventListener('click', () => this.openEditor());
    this.container.querySelector('[data-coupon-reload]').addEventListener('click', () => this.reload());
    this.container.querySelector('[data-coupon-search]').addEventListener('input', () => this.renderRows());
    this.container.querySelector('[data-coupon-rows]').addEventListener('click', event => {
      const edit = event.target.closest('[data-coupon-edit]');
      const remove = event.target.closest('[data-coupon-delete]');
      if (edit) this.openEditor(this.coupons[Number(edit.dataset.couponEdit)]);
      if (remove) this.remove(Number(remove.dataset.couponDelete));
    });
  }

  async reload() {
    const rows = this.container.querySelector('[data-coupon-rows]');
    rows.innerHTML = '<tr><td colspan="6">Carregando…</td></tr>';
    try {
      const data = await loadGithubJson(COUPONS_PATH, []);
      this.coupons = (Array.isArray(data) ? data : Object.values(data || {})).filter(Boolean).sort((a, b) => number(a.posicao || 999) - number(b.posicao || 999));
      this.renderRows();
    } catch (error) {
      rows.innerHTML = `<tr><td colspan="6">${escapeHtml(error?.message || String(error))}</td></tr>`;
    }
  }

  renderRows() {
    const query = normalizeSearch(this.container.querySelector('[data-coupon-search]').value);
    const visible = this.coupons.map((coupon, index) => ({ coupon, index })).filter(({ coupon }) => !query || normalizeSearch([coupon.codigo, coupon.descricao, ...(coupon.categorias || []), ...(coupon.marcas || [])].join(' ')).includes(query));
    this.container.querySelector('[data-coupon-rows]').innerHTML = visible.length ? visible.map(({ coupon, index }) => `<tr><td><strong>${escapeHtml(coupon.codigo)}</strong><small>${escapeHtml(coupon.tituloBanner || coupon.descricao || '')}</small></td><td>${coupon.tipo === 'fixo' ? money(coupon.desconto) : `${number(coupon.desconto)}%`}</td><td>${money(coupon.valorMinimo || 0)}</td><td>${escapeHtml(coupon.validade || 'Sem limite')}</td><td><span class="badge ${coupon.ativo !== false ? 'success' : 'neutral'}">${coupon.ativo !== false ? 'Ativo' : 'Inativo'}</span></td><td><div class="suite-actions"><button class="row-action" type="button" data-coupon-edit="${index}">Editar</button><button class="row-action suite-danger" type="button" data-coupon-delete="${index}">Excluir</button></div></td></tr>`).join('') : '<tr><td colspan="6" class="empty-state">Nenhum cupom encontrado.</td></tr>';
  }

  openEditor(coupon = null) {
    const view = modal(coupon ? `Editar ${coupon.codigo}` : 'Novo cupom');
    view.body.innerHTML = couponForm(coupon || {});
    view.foot.innerHTML = '<button class="button secondary" type="button" data-cancel>Cancelar</button><button class="button primary" type="button" data-save>Salvar cupom</button>';
    view.foot.querySelector('[data-cancel]').addEventListener('click', view.close);
    view.foot.querySelector('[data-save]').addEventListener('click', async event => {
      const form = view.body.querySelector('form');
      if (!form.reportValidity()) return;
      const values = Object.fromEntries(new FormData(form).entries());
      const code = text(values.codigo).toUpperCase().replace(/\s+/g, '');
      if (!code) return;
      const existingIndex = coupon ? this.coupons.indexOf(coupon) : this.coupons.findIndex(item => text(item.codigo).toUpperCase() === code);
      if (!coupon && existingIndex >= 0) return toast('Já existe um cupom com este código.', 'error');
      const next = {
        ...(coupon || {}), codigo: code, ativo: form.elements.ativo.checked, tipo: values.tipo === 'fixo' ? 'fixo' : 'percentual',
        desconto: Math.max(0, number(values.desconto)), valorMinimo: Math.max(0, number(values.valorMinimo)), validade: text(values.validade),
        posicao: Math.max(1, Math.floor(number(values.posicao) || this.coupons.length + 1)), tituloBanner: text(values.tituloBanner), descricao: text(values.descricao),
        categorias: listValues(values.categorias), marcas: listValues(values.marcas), palavras_chave: listValues(values.palavras_chave), atualizadoEm: new Date().toISOString(),
      };
      const button = event.currentTarget;
      button.disabled = true;
      try {
        if (existingIndex >= 0) this.coupons[existingIndex] = next; else this.coupons.push(next);
        this.coupons.sort((a, b) => number(a.posicao) - number(b.posicao));
        await saveGithubJson(COUPONS_PATH, this.coupons, ['coupons']);
        audit('cupom_salvo', { codigo: code });
        toast(`Cupom ${code} publicado.`, 'success');
        view.close();
        this.renderRows();
      } catch (error) {
        toast(error?.message || String(error), 'error');
        button.disabled = false;
      }
    });
  }

  async remove(index) {
    const coupon = this.coupons[index];
    if (!coupon || !confirm(`Excluir o cupom ${coupon.codigo}?`)) return;
    const previous = [...this.coupons];
    this.coupons.splice(index, 1);
    try {
      await saveGithubJson(COUPONS_PATH, this.coupons, ['coupons']);
      audit('cupom_excluido', { codigo: coupon.codigo });
      toast('Cupom excluído.', 'success');
      this.renderRows();
    } catch (error) {
      this.coupons = previous;
      toast(error?.message || String(error), 'error');
    }
  }
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
    editor.querySelector('[data-select-all]').addEventListener('click', () => { results.forEach(product => item.produtos.push(productSnapshot(product))); if (!item.produtoPadraoId && item.produtos[0]) item.produtoPadraoId = item.produtos[0].id; this.query = ''; this.render(); });
    editor.querySelector('[data-product-results]').addEventListener('click', event => {
      const button = event.target.closest('[data-add-product]');
      if (!button) return;
      const product = this.products.find(row => productKey(row) === button.dataset.addProduct);
      if (product) { item.produtos.push(productSnapshot(product)); if (!item.produtoPadraoId) item.produtoPadraoId = productSnapshot(product).id; this.render(); }
    });
    editor.querySelector('[data-selected-products]').addEventListener('click', event => {
      const remove = event.target.closest('[data-remove-product]');
      const makeDefault = event.target.closest('[data-default-product]');
      if (remove) { const removed = item.produtos.splice(Number(remove.dataset.removeProduct), 1)[0]; if (text(item.produtoPadraoId) === text(removed?.id)) item.produtoPadraoId = item.produtos[0]?.id || ''; this.render(); }
      if (makeDefault) { item.produtoPadraoId = item.produtos[Number(makeDefault.dataset.defaultProduct)]?.id || ''; this.render(); }
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
    this.config.secoes.push(section); this.sectionId = id; this.itemId = ''; this.render();
  }

  addItem() {
    const section = this.currentSection();
    if (!section) return toast('Selecione uma seção primeiro.', 'error');
    const title = prompt('Nome do novo item:', 'Novo item');
    if (!text(title)) return;
    const id = `${normalizeSearch(title).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item'}-${Date.now().toString().slice(-5)}`;
    const item = { id, titulo: title.trim(), descricao: '', ordem: section.itens.length + 1, ativo: true, essencial: false, produtoPadraoId: '', produtos: [] };
    section.itens.push(item); this.itemId = id; this.render();
  }

  deleteSection(section) {
    if (!confirm(`Excluir a seção ${section.titulo} e todos os seus itens?`)) return;
    this.config.secoes = this.config.secoes.filter(row => row !== section); this.sectionId = this.config.secoes[0]?.id || ''; this.itemId = ''; this.render();
  }

  deleteItem(section, item) {
    if (!confirm(`Excluir o item ${item.titulo}?`)) return;
    section.itens = section.itens.filter(row => row !== item); this.itemId = section.itens[0]?.id || ''; this.render();
  }

  async save(button) {
    button.disabled = true; button.textContent = 'Publicando…';
    try {
      this.config.version = `admin-${Date.now()}`;
      this.config.updatedAt = new Date().toISOString();
      this.config.secoes.forEach((section, sectionIndex) => { section.ordem = sectionIndex + 1; section.itens.forEach((item, itemIndex) => { item.ordem = itemIndex + 1; }); });
      await saveGithubJson(QUICK_PATH, this.config, ['quick-purchase']);
      audit('compra_rapida_publicada', { secoes: this.config.secoes.length });
      toast('Compra Rápida publicada.', 'success');
    } catch (error) { toast(error?.message || String(error), 'error'); }
    finally { button.disabled = false; button.textContent = 'Publicar'; }
  }
}

function orderDate(order) {
  const value = order.criado_em || order.created_at || order.data || order.timestamp;
  const date = typeof value === 'number' ? new Date(value) : new Date(String(value || ''));
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

function orderNumber(order) { return text(order.numero_pedido || order.numero || order.id || order.firebaseKey); }
function orderCustomer(order) { return text(order.cliente?.nome || order.nome_cliente || order.nome || 'Cliente'); }
function orderPhone(order) { return text(order.cliente?.telefone || order.telefone || order.whatsapp); }
function orderStatus(order) { return text(order.status_entrega || order.status_separacao || order.status || 'novo'); }
function orderItems(order) { return Array.isArray(order.itens) ? order.itens : Array.isArray(order.produtos) ? order.produtos : []; }

class OrdersPanel {
  constructor(container) {
    this.container = container;
    this.orders = [];
    this.renderShell();
    this.reload();
  }

  renderShell() {
    this.container.innerHTML = `<section class="panel suite-panel"><div class="panel-header"><div><span class="eyebrow">Operação</span><h2>Pedidos</h2><p>Acompanhe separação, conferência, entrega e cancelamento.</p></div><button class="button secondary" type="button" data-orders-reload>Atualizar</button></div><div class="suite-toolbar"><div class="search-field"><span>⌕</span><input type="search" placeholder="Pedido, cliente ou telefone" data-orders-search></div><select data-orders-status><option value="">Todos os status</option><option value="novo">Novos</option><option value="separacao">Em separação</option><option value="conferido">Conferidos</option><option value="entregue">Entregues</option><option value="cancelado">Cancelados</option></select></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Pedido</th><th>Cliente</th><th>Data</th><th>Total</th><th>Status</th><th></th></tr></thead><tbody data-orders-rows></tbody></table></div></section>`;
    this.container.querySelector('[data-orders-reload]').addEventListener('click', () => this.reload());
    this.container.querySelector('[data-orders-search]').addEventListener('input', () => this.renderRows());
    this.container.querySelector('[data-orders-status]').addEventListener('change', () => this.renderRows());
    this.container.querySelector('[data-orders-rows]').addEventListener('click', event => {
      const button = event.target.closest('[data-order-open]');
      if (button) this.open(this.orders[Number(button.dataset.orderOpen)]);
    });
  }

  async reload() {
    const rows = this.container.querySelector('[data-orders-rows]');
    rows.innerHTML = '<tr><td colspan="6">Carregando…</td></tr>';
    try {
      this.orders = (await loadOrders(loadConfig(), 300)).sort((a, b) => orderDate(b) - orderDate(a));
      this.renderRows();
    } catch (error) { rows.innerHTML = `<tr><td colspan="6">${escapeHtml(error?.message || String(error))}</td></tr>`; }
  }

  renderRows() {
    const query = normalizeSearch(this.container.querySelector('[data-orders-search]').value);
    const status = normalizeSearch(this.container.querySelector('[data-orders-status]').value);
    const visible = this.orders.map((order, index) => ({ order, index })).filter(({ order }) => {
      const matchesQuery = !query || normalizeSearch([orderNumber(order), orderCustomer(order), orderPhone(order), orderStatus(order)].join(' ')).includes(query);
      const currentStatus = normalizeSearch(orderStatus(order));
      const matchesStatus = !status || currentStatus.includes(status) || (status === 'separacao' && currentStatus.includes('separ'));
      return matchesQuery && matchesStatus;
    });
    this.container.querySelector('[data-orders-rows]').innerHTML = visible.length ? visible.map(({ order, index }) => `<tr><td><strong>#${escapeHtml(orderNumber(order))}</strong><small>${orderItems(order).length} item(ns)</small></td><td><strong>${escapeHtml(orderCustomer(order))}</strong><small>${escapeHtml(orderPhone(order))}</small></td><td>${escapeHtml(orderDate(order).toLocaleString('pt-BR'))}</td><td>${money(order.total || order.valor_total || 0)}</td><td><span class="badge info">${escapeHtml(orderStatus(order))}</span></td><td><button class="row-action" type="button" data-order-open="${index}">Abrir</button></td></tr>`).join('') : '<tr><td colspan="6" class="empty-state">Nenhum pedido encontrado.</td></tr>';
  }

  open(order) {
    const view = modal(`Pedido #${orderNumber(order)}`, `${orderCustomer(order)} · ${orderPhone(order)}`);
    const delivery = order.entrega || order.endereco || order.cliente?.endereco || {};
    const items = orderItems(order);
    view.body.innerHTML = `<div class="suite-summary"><span>Status: ${escapeHtml(orderStatus(order))}</span><span>Total: ${money(order.total || order.valor_total || 0)}</span><span>${items.length} item(ns)</span></div><p><strong>Entrega:</strong> ${escapeHtml([delivery.logradouro || delivery.rua, delivery.numero, delivery.bairro, delivery.cidade].filter(Boolean).join(', ') || 'Não informada')}</p><p><strong>Pagamento:</strong> ${escapeHtml(order.pagamento?.forma || order.forma_pagamento || order.pagamento || 'Não informado')}</p><p><strong>Observações:</strong> ${escapeHtml(order.observacoes || order.obs || 'Nenhuma')}</p><h3>Itens</h3><div class="order-items">${items.map(item => `<div class="order-item"><span><strong>${escapeHtml(item.nome || item.produto || item.descricao || item.codigo)}</strong><small>${escapeHtml(item.codigo || item.sku || item.ean || '')}</small></span><strong>${number(item.qtd || item.quantidade || 1)} × ${money(item.price || item.preco || item.valor || 0)}</strong></div>`).join('') || '<p>Nenhum item.</p>'}</div><hr><h3>Atualizar status</h3><div class="order-status-actions"><button class="button secondary" data-order-status="separacao">Em separação</button><button class="button secondary" data-order-status="conferido">Conferido</button><button class="button primary" data-order-status="entregue">Entregue</button><button class="button ghost suite-danger" data-order-status="cancelado">Cancelado</button></div>`;
    view.foot.innerHTML = '<button class="button secondary" type="button" data-print>Imprimir</button><button class="button secondary" type="button" data-close-foot>Fechar</button>';
    view.foot.querySelector('[data-close-foot]').addEventListener('click', view.close);
    view.foot.querySelector('[data-print]').addEventListener('click', () => window.print());
    view.body.querySelector('.order-status-actions').addEventListener('click', async event => {
      const button = event.target.closest('[data-order-status]');
      if (!button) return;
      const status = button.dataset.orderStatus;
      if (status === 'cancelado' && !confirm('Cancelar este pedido?')) return;
      button.disabled = true;
      try {
        await patchOrder(loadConfig(), order.firebaseKey, { status, status_separacao: status === 'separacao' ? 'em_separacao' : status === 'conferido' ? 'conferido' : order.status_separacao, status_entrega: status === 'entregue' ? 'entregue' : order.status_entrega });
        order.status = status;
        if (status === 'conferido') order.status_separacao = 'conferido';
        if (status === 'entregue') order.status_entrega = 'entregue';
        audit('pedido_status', { pedido: orderNumber(order), status });
        toast(`Pedido atualizado para ${status}.`, 'success');
        view.close(); this.renderRows();
      } catch (error) { button.disabled = false; toast(error?.message || String(error), 'error'); }
    });
  }
}

function installBackups() {
  const grid = document.querySelector('[data-view="settings"] .settings-grid');
  if (!grid || document.getElementById('adminBackupPanel')) return;
  const section = document.createElement('section');
  section.className = 'panel span-all-settings';
  section.id = 'adminBackupPanel';
  section.innerHTML = `<div class="panel-header"><div><h2>Backup, exportação e auditoria</h2><p>Baixe cópias locais sem remover tokens do navegador.</p></div><span class="badge success">Disponível</span></div><div class="suite-actions"><button class="button secondary" data-backup-products>Produtos JSON</button><button class="button secondary" data-backup-csv>Produtos CSV</button><button class="button secondary" data-backup-config>Configurações</button><button class="button secondary" data-backup-audit>Auditoria local</button><button class="button secondary" data-backup-coupons>Cupons</button><button class="button secondary" data-backup-quick>Compra Rápida</button></div>`;
  const danger = grid.querySelector('.danger-panel');
  if (danger) danger.insertAdjacentElement('beforebegin', section); else grid.appendChild(section);
  section.addEventListener('click', async event => {
    const button = event.target.closest('button');
    if (!button) return;
    button.disabled = true;
    try {
      if (button.matches('[data-backup-products],[data-backup-csv]')) {
        const products = await loadProducts(loadConfig());
        if (button.hasAttribute('data-backup-products')) download(`produtos-${Date.now()}.json`, JSON.stringify(products, null, 2));
        else {
          const headers = ['firebaseKey','codigo','nome','gtin','preco','preco_custo','estoque','validade','categoria','subcategoria','marca','ncm','embalagem','gondola','prateleira','url_imagem'];
          const rows = [headers.map(csvCell).join(';'), ...products.map(product => headers.map(header => csvCell(product[header])).join(';'))];
          download(`produtos-${Date.now()}.csv`, `\uFEFF${rows.join('\n')}`, 'text/csv;charset=utf-8');
        }
      }
      if (button.hasAttribute('data-backup-config')) download(`admin-config-${Date.now()}.json`, JSON.stringify(loadConfig(), null, 2));
      if (button.hasAttribute('data-backup-audit')) download(`admin-auditoria-${Date.now()}.json`, JSON.stringify(JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]'), null, 2));
      if (button.hasAttribute('data-backup-coupons')) download(`cupons-${Date.now()}.json`, JSON.stringify(await loadGithubJson(COUPONS_PATH, []), null, 2));
      if (button.hasAttribute('data-backup-quick')) download(`compra-rapida-${Date.now()}.json`, JSON.stringify(await loadGithubJson(QUICK_PATH, {}), null, 2));
      toast('Arquivo de backup gerado.', 'success');
    } catch (error) { toast(error?.message || String(error), 'error'); }
    finally { button.disabled = false; }
  });
}

function start() {
  installStyle();
  const promotions = document.querySelector('[data-view="promotions"]');
  if (promotions && !document.getElementById('couponsAdminRoot')) {
    const couponsRoot = document.createElement('div'); couponsRoot.id = 'couponsAdminRoot'; promotions.appendChild(couponsRoot); new CouponsPanel(couponsRoot);
    const quickRoot = document.createElement('div'); quickRoot.id = 'quickPurchaseAdminRoot'; promotions.appendChild(quickRoot); new QuickPurchasePanel(quickRoot);
  }
  const operations = document.querySelector('[data-view="operations"]');
  if (operations && !document.getElementById('ordersAdminRoot')) {
    const ordersRoot = document.createElement('div'); ordersRoot.id = 'ordersAdminRoot'; operations.appendChild(ordersRoot); new OrdersPanel(ordersRoot);
  }
  installBackups();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();

export { audit, saveGithubJson };
