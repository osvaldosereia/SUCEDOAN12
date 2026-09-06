const CATALOG_URL = '../data/catalogo.json';
const CONFIG_URL = '../data/site-config.json';
const DRAFT_KEY = 'dona_antonia_atendimento_admin_draft_v1';
const PREVIEW_KEY = 'dona_antonia_atendimento_preview_v1';

const state = {
  published: { catalog: null, config: null },
  catalog: null,
  config: null,
  dirty: false,
  activeView: 'dashboard',
  offerFilter: 'Todas',
};

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const clone = value => JSON.parse(JSON.stringify(value));
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));

function slugify(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 1800);
}

function markDirty() {
  state.dirty = true;
  const badge = $('#draftState');
  badge.textContent = 'Rascunho alterado';
  badge.className = 'status dirty';
  renderDashboard();
}

function setClean(label = 'Rascunho salvo') {
  state.dirty = false;
  const badge = $('#draftState');
  badge.textContent = label;
  badge.className = 'status good';
}

function getPath(object, path) {
  return path.split('.').reduce((acc, key) => acc?.[key], object);
}

function setPath(object, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  const target = keys.reduce((acc, key) => acc[key] ??= {}, object);
  target[last] = value;
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response.json();
}

async function load() {
  const [catalog, config] = await Promise.all([fetchJson(CATALOG_URL), fetchJson(CONFIG_URL)]);
  state.published = { catalog: clone(catalog), config: clone(config) };

  let draft = null;
  try { draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch {}
  state.catalog = draft?.catalog || clone(catalog);
  state.config = draft?.config || clone(config);
  state.dirty = Boolean(draft);

  if (draft) {
    $('#draftState').textContent = 'Rascunho local';
    $('#draftState').className = 'status dirty';
  }
  bind();
  renderAll();
}

function bind() {
  $('#nav').addEventListener('click', event => {
    const button = event.target.closest('[data-view]');
    if (!button) return;
    openView(button.dataset.view);
  });

  $('#saveDraft').addEventListener('click', saveDraft);
  $('#preview').addEventListener('click', preview);
  $('#addBasket').addEventListener('click', addBasket);
  $('#addOffer').addEventListener('click', addOffer);
  $('#validate').addEventListener('click', renderValidation);
  $('#exportCatalog').addEventListener('click', () => downloadJson('catalogo.json', state.catalog));
  $('#exportConfig').addEventListener('click', () => downloadJson('site-config.json', state.config));
  $('#exportBundle').addEventListener('click', () => downloadJson('atendimento-config.json', { catalog: state.catalog, config: state.config }));
  $('#restorePublished').addEventListener('click', restorePublished);

  $('main').addEventListener('input', handleInput);
  $('main').addEventListener('change', handleInput);
  $('main').addEventListener('click', handleAction);
}

function openView(view) {
  state.activeView = view;
  $$('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.view === view));
  $$('.view').forEach(el => el.classList.toggle('active', el.id === `view-${view}`));
  const titles = {dashboard:'Visão geral',site:'Site de apoio',baskets:'Cestas',offers:'Ofertas',papoai:'PapoAI',integrations:'Integrações',publish:'Publicação'};
  $('#viewTitle').textContent = titles[view] || 'Admin';
}

function handleInput(event) {
  const target = event.target;
  let changed = false;

  if (target.dataset.configPath) {
    const value = target.type === 'checkbox' ? target.checked : target.value;
    setPath(state.config, target.dataset.configPath, value);
    changed = true;
  }

  if (target.dataset.basketField !== undefined) {
    const basket = state.catalog.baskets[Number(target.dataset.basketIndex)];
    if (basket) {
      basket[target.dataset.basketField] = target.value;
      if (target.dataset.basketField === 'name' && !basket.slug) basket.slug = slugify(target.value);
      changed = true;
    }
  }

  if (target.dataset.itemField !== undefined) {
    const item = state.catalog.baskets[Number(target.dataset.basketIndex)]?.items?.[Number(target.dataset.itemIndex)];
    if (item) {
      item[target.dataset.itemField] = ['price','qty'].includes(target.dataset.itemField) ? Number(target.value || 0) : target.value;
      changed = true;
    }
  }

  if (target.dataset.offerField !== undefined) {
    const offer = state.catalog.offers[Number(target.dataset.offerIndex)];
    if (offer) {
      offer[target.dataset.offerField] = target.dataset.offerField === 'price' ? Number(target.value || 0) : target.value;
      changed = true;
    }
  }

  if (changed) {
    markDirty();
    state.config.updatedAt = new Date().toISOString();
    state.catalog.updatedAt = new Date().toISOString();
    if (state.activeView === 'site') renderMessagePreview();
    if (state.activeView === 'papoai') renderPapoAI();
  }
}

function handleAction(event) {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const action = button.dataset.action;

  if (action === 'delete-basket') {
    if (state.catalog.baskets.length <= 1) return toast('Mantenha pelo menos uma cesta');
    if (confirm('Excluir esta cesta do rascunho?')) state.catalog.baskets.splice(Number(button.dataset.basketIndex), 1);
    markDirty(); renderBaskets(); renderPapoAI(); renderDashboard();
  }

  if (action === 'add-basket-item') {
    const basket = state.catalog.baskets[Number(button.dataset.basketIndex)];
    basket.items.push({ sku: '', name: 'Novo produto', price: 0, qty: 1, category: 'Mercearia' });
    markDirty(); renderBaskets(); renderDashboard();
  }

  if (action === 'delete-basket-item') {
    state.catalog.baskets[Number(button.dataset.basketIndex)].items.splice(Number(button.dataset.itemIndex), 1);
    markDirty(); renderBaskets(); renderDashboard();
  }

  if (action === 'delete-offer') {
    state.catalog.offers.splice(Number(button.dataset.offerIndex), 1);
    markDirty(); renderOffers(); renderPapoAI(); renderDashboard();
  }

  if (action === 'filter-offer') {
    state.offerFilter = button.dataset.category;
    renderOffers();
  }

  if (action === 'copy-link') {
    navigator.clipboard.writeText(button.dataset.url).then(() => toast('Link copiado'));
  }
}

function addBasket() {
  const number = state.catalog.baskets.length + 1;
  state.catalog.baskets.push({ slug: `nova-cesta-${number}`, name: `Nova Cesta ${number}`, description: 'Descreva esta cesta.', items: [] });
  markDirty(); renderBaskets(); renderPapoAI(); renderDashboard();
}

function addOffer() {
  state.catalog.offers.push({ sku: '', name: 'Novo produto', price: 0, category: 'Mercearia' });
  state.offerFilter = 'Todas';
  markDirty(); renderOffers(); renderPapoAI(); renderDashboard();
}

function saveDraft() {
  localStorage.setItem(DRAFT_KEY, JSON.stringify({ catalog: state.catalog, config: state.config, savedAt: new Date().toISOString() }));
  setClean();
  toast('Rascunho salvo neste navegador');
}

function preview() {
  const errors = validate().filter(item => item.type === 'error');
  if (errors.length) {
    openView('publish');
    renderValidation();
    return toast('Corrija os erros antes da prévia');
  }
  localStorage.setItem(PREVIEW_KEY, JSON.stringify({ catalog: state.catalog, config: state.config }));
  const basket = state.config.site.defaultBasket || state.catalog.baskets[0]?.slug || '';
  const url = `${state.config.site.publicBaseUrl}?preview=1&cesta=${encodeURIComponent(basket)}`;
  window.open(url, '_blank', 'noopener');
}

function restorePublished() {
  if (!confirm('Descartar todas as alterações locais e voltar ao conteúdo publicado?')) return;
  state.catalog = clone(state.published.catalog);
  state.config = clone(state.published.config);
  localStorage.removeItem(DRAFT_KEY);
  localStorage.removeItem(PREVIEW_KEY);
  state.dirty = false;
  $('#draftState').textContent = 'Publicado';
  $('#draftState').className = 'status neutral';
  renderAll();
  toast('Conteúdo publicado restaurado');
}

function renderAll() {
  renderDashboard();
  renderSite();
  renderBaskets();
  renderOffers();
  renderPapoAI();
  renderIntegrations();
}

function renderDashboard() {
  const categories = new Set(state.catalog.offers.map(item => item.category).filter(Boolean));
  const skus = new Set([
    ...state.catalog.offers.map(item => item.sku),
    ...state.catalog.baskets.flatMap(basket => basket.items.map(item => item.sku)),
  ].filter(Boolean));
  $('#metrics').innerHTML = [
    ['Cestas', state.catalog.baskets.length],
    ['Produtos/SKUs', skus.size],
    ['Ofertas', state.catalog.offers.length],
    ['Categorias', categories.size],
  ].map(([label,value]) => `<div class="metric"><small>${esc(label)}</small><strong>${value}</strong></div>`).join('');

  const health = validate();
  const errors = health.filter(item => item.type === 'error').length;
  const warnings = health.filter(item => item.type === 'warn').length;
  $('#healthList').innerHTML = `
    <div class="health-item"><span>Estrutura do catálogo</span><strong class="${errors ? 'warn':'ok'}">${errors ? `${errors} erro(s)` : 'OK'}</strong></div>
    <div class="health-item"><span>Avisos de configuração</span><strong class="${warnings ? 'warn':'ok'}">${warnings || 'OK'}</strong></div>
    <div class="health-item"><span>Firebase</span><strong class="ok">Não usado</strong></div>
    <div class="health-item"><span>Segredos no frontend</span><strong class="ok">Nenhum</strong></div>`;
}

function textField(label, path, options = {}) {
  const value = getPath(state.config, path) ?? '';
  const full = options.full ? ' full' : '';
  const input = options.textarea
    ? `<textarea data-config-path="${path}">${esc(value)}</textarea>`
    : `<input type="${options.type || 'text'}" data-config-path="${path}" value="${esc(value)}">`;
  return `<div class="field${full}"><label>${esc(label)}</label>${input}</div>`;
}

function renderSite() {
  $('#siteForm').innerHTML = [
    textField('Nome curto', 'site.eyebrow'),
    textField('Título', 'site.title'),
    textField('Introdução', 'site.intro', { textarea:true, full:true }),
    textField('Título da personalização', 'site.basketSectionTitle'),
    textField('Título das ofertas', 'site.offersTitle'),
    textField('Texto das ofertas', 'site.offersSubtitle', { full:true }),
    textField('Aviso no resumo', 'site.notice', { textarea:true, full:true }),
    textField('URL pública', 'site.publicBaseUrl', { full:true }),
  ].join('');

  $('#whatsappForm').innerHTML = [
    textField('Número com DDI', 'whatsapp.number'),
    textField('Texto do botão', 'whatsapp.buttonLabel'),
    textField('Cabeçalho da mensagem', 'whatsapp.messageHeader', { full:true }),
    textField('Rodapé da mensagem', 'whatsapp.messageFooter', { textarea:true, full:true }),
  ].join('');
  renderMessagePreview();
}

function renderMessagePreview() {
  const basket = state.catalog.baskets[0];
  const items = basket?.items?.slice(0, 3) || [];
  const total = items.reduce((sum, item) => sum + Number(item.price||0) * Number(item.qty||0), 0);
  $('#messagePreview').textContent = [
    state.config.whatsapp.messageHeader,
    'Código: DA-EXEMPLO',
    `Cesta: ${basket?.name || 'Cesta'}`,
    '',
    ...items.map(item => `${item.qty}x ${item.name} — ${money.format(item.qty * item.price)}`),
    '',
    `Total calculado: ${money.format(total)}`,
    '',
    state.config.whatsapp.messageFooter,
  ].join('\n');
}

function renderBaskets() {
  $('#basketEditor').innerHTML = state.catalog.baskets.map((basket, bi) => `
    <article class="basket-card">
      <div class="basket-head-admin">
        <div class="field"><label>Nome</label><input data-basket-index="${bi}" data-basket-field="name" value="${esc(basket.name)}"></div>
        <div class="field"><label>Slug / link</label><input data-basket-index="${bi}" data-basket-field="slug" value="${esc(basket.slug)}"></div>
        <div class="field wide-field"><label>Descrição</label><input data-basket-index="${bi}" data-basket-field="description" value="${esc(basket.description || '')}"></div>
        <button class="remove" data-action="delete-basket" data-basket-index="${bi}">Excluir</button>
      </div>
      <table class="items-table">
        <thead><tr><th>SKU</th><th>Produto</th><th>Categoria</th><th>Preço</th><th>Qtd.</th><th></th></tr></thead>
        <tbody>
          ${(basket.items || []).map((item, ii) => `<tr>
            <td><input data-basket-index="${bi}" data-item-index="${ii}" data-item-field="sku" value="${esc(item.sku)}"></td>
            <td><input data-basket-index="${bi}" data-item-index="${ii}" data-item-field="name" value="${esc(item.name)}"></td>
            <td><input data-basket-index="${bi}" data-item-index="${ii}" data-item-field="category" value="${esc(item.category || '')}"></td>
            <td><input type="number" step="0.01" min="0" data-basket-index="${bi}" data-item-index="${ii}" data-item-field="price" value="${Number(item.price || 0)}"></td>
            <td><input type="number" step="1" min="0" data-basket-index="${bi}" data-item-index="${ii}" data-item-field="qty" value="${Number(item.qty || 0)}"></td>
            <td><button class="mini remove" data-action="delete-basket-item" data-basket-index="${bi}" data-item-index="${ii}">×</button></td>
          </tr>`).join('')}
        </tbody>
      </table>
      <button class="mini" data-action="add-basket-item" data-basket-index="${bi}">+ Adicionar item</button>
    </article>`).join('');
}

function renderOffers() {
  const categories = ['Todas', ...new Set(state.catalog.offers.map(item => item.category).filter(Boolean))];
  if (!categories.includes(state.offerFilter)) state.offerFilter = 'Todas';
  $('#offerFilters').innerHTML = categories.map(category => `<button class="chip ${state.offerFilter === category ? 'active':''}" data-action="filter-offer" data-category="${esc(category)}">${esc(category)}</button>`).join('');

  $('#offersEditor').innerHTML = state.catalog.offers.map((offer, oi) => ({ offer, oi })).filter(({offer}) => state.offerFilter === 'Todas' || offer.category === state.offerFilter).map(({offer, oi}) => `
    <article class="product-admin">
      <div class="form-grid">
        <div class="field"><label>SKU</label><input data-offer-index="${oi}" data-offer-field="sku" value="${esc(offer.sku)}"></div>
        <div class="field"><label>Preço</label><input type="number" step="0.01" min="0" data-offer-index="${oi}" data-offer-field="price" value="${Number(offer.price || 0)}"></div>
        <div class="field full"><label>Produto</label><input data-offer-index="${oi}" data-offer-field="name" value="${esc(offer.name)}"></div>
        <div class="field full"><label>Categoria</label><input data-offer-index="${oi}" data-offer-field="category" value="${esc(offer.category || '')}"></div>
      </div>
      <button class="mini remove" data-action="delete-offer" data-offer-index="${oi}">Remover</button>
    </article>`).join('');
}

function publicUrl(params) {
  const base = state.config.site.publicBaseUrl || 'https://donaantonia.com.br/atendimento/';
  const url = new URL(base);
  Object.entries(params).forEach(([key,value]) => value && url.searchParams.set(key, value));
  return url.toString();
}

function renderPapoAI() {
  $('#basketLinks').innerHTML = state.catalog.baskets.map(basket => {
    const url = publicUrl({ cesta: basket.slug });
    return `<div class="link-row"><strong>${esc(basket.name)}</strong><code>${esc(url)}</code><div class="link-actions"><button class="mini" data-action="copy-link" data-url="${esc(url)}">Copiar link</button></div></div>`;
  }).join('');

  const categories = [...new Set(state.catalog.offers.map(item => item.category).filter(Boolean))];
  const basket = state.config.site.defaultBasket || state.catalog.baskets[0]?.slug;
  $('#offerLinks').innerHTML = categories.map(category => {
    const url = publicUrl({ cesta: basket, secao: 'ofertas', categoria: category });
    return `<div class="link-row"><strong>${esc(category)}</strong><code>${esc(url)}</code><div class="link-actions"><button class="mini" data-action="copy-link" data-url="${esc(url)}">Copiar link</button></div></div>`;
  }).join('') || '<p>Nenhuma categoria cadastrada.</p>';
}

function renderIntegrations() {
  const cards = [
    {name:'Bling',status:state.config.integrations.bling.enabled?'Ativo':'Preparado',text:'Fonte oficial de produtos, SKU, preço, estoque, contatos e pedidos.',items:['OAuth 2.0 somente no servidor','Sincronizar produtos/preço/estoque','Composição de kits/cestas','Revalidar antes de criar pedido']},
    {name:'PapoAI',status:state.config.integrations.papoai.enabled?'Ativo':'Preparado',text:'Atendimento, CRM, automações, templates Meta, WhatsApp Flow e catálogo para busca da IA.',items:['Links dos carrosséis gerados aqui','Resposta única da IA','Catálogo PapoAI pode receber cópia do Bling','Não duplicar o CRM no nosso admin']},
    {name:'Make',status:state.config.integrations.make.enabled?'Ativo':'Planejado',text:'Ponte pequena para operações que precisam acontecer em tempo real no fechamento.',items:['CPF → localizar/criar contato','Revalidar SKUs e preços','Criar pedido de venda','Retornar número do pedido']},
  ];
  $('#integrationCards').innerHTML = cards.map(card => `<article class="integration-card"><span class="status ${card.status==='Ativo'?'good':'neutral'}">${card.status}</span><h3>${card.name}</h3><p>${card.text}</p><ul>${card.items.map(item => `<li>${item}</li>`).join('')}</ul></article>`).join('');
}

function validate() {
  const results = [];
  const wa = String(state.config.whatsapp.number || '').replace(/\D/g, '');
  if (wa.length < 12) results.push({ type:'error', text:'WhatsApp deve conter DDI + DDD + número.' });
  const slugs = state.catalog.baskets.map(item => item.slug).filter(Boolean);
  if (slugs.length !== new Set(slugs).size) results.push({ type:'error', text:'Existem slugs de cesta duplicados.' });
  if (!state.catalog.baskets.length) results.push({ type:'error', text:'Cadastre pelo menos uma cesta.' });

  state.catalog.baskets.forEach((basket, bi) => {
    if (!basket.name || !basket.slug) results.push({ type:'error', text:`Cesta ${bi+1}: nome e slug são obrigatórios.` });
    if (!basket.items?.length) results.push({ type:'warn', text:`${basket.name || `Cesta ${bi+1}`} não possui itens.` });
    basket.items?.forEach((item, ii) => {
      if (!item.sku || !item.name) results.push({ type:'error', text:`${basket.name}: item ${ii+1} sem SKU ou nome.` });
      if (Number(item.price) < 0 || Number(item.qty) < 0) results.push({ type:'error', text:`${basket.name}: item ${item.sku || ii+1} possui preço/quantidade inválidos.` });
    });
  });

  state.catalog.offers.forEach((item, index) => {
    if (!item.sku || !item.name || !item.category) results.push({ type:'warn', text:`Oferta ${index+1} está incompleta.` });
  });

  if (state.catalog.source === 'demo-local') results.push({ type:'warn', text:'Catálogo ainda está marcado como demo-local; falta sincronização real com Bling.' });
  if (!state.config.integrations.bling.enabled) results.push({ type:'warn', text:'Integração Bling ainda não está ativa.' });
  if (!state.config.integrations.make.enabled) results.push({ type:'warn', text:'Fechamento Make → Bling ainda não está ativo.' });
  if (!results.some(item => item.type === 'error')) results.unshift({ type:'success', text:'Estrutura válida para pré-visualização.' });
  return results;
}

function renderValidation() {
  const results = validate();
  $('#validationResults').innerHTML = results.map(item => `<div class="validation-item ${item.type}">${esc(item.text)}</div>`).join('');
}

function downloadJson(filename, value) {
  const blob = new Blob([JSON.stringify(value, null, 2) + '\n'], { type:'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

load().catch(error => {
  console.error(error);
  document.querySelector('main').innerHTML = `<article class="panel"><h2>Não foi possível abrir o admin</h2><p>Verifique se os arquivos de dados do atendimento estão publicados.</p></article>`;
});
