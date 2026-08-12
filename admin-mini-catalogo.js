(() => {
  'use strict';
  const OWNER = 'osvaldosereia';
  const REPO = 'SUCEDOAN12';
  const CONFIG_PATH = 'site/mini-catalogo-links.json';
  const SHORT_BASE = 'https://donaantonia.com.br/c/';
  const PRODUCTS_URL = 'site/produtos-home.json';
  const COUPONS_URL = 'site/cuponsativos.json';
  const BASKETS_URL = 'site/produtos-cesta-basica.json';
  const KITS_URL = 'site/kits.json';
  const SHORT_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const DESTINATIONS = {
    mini: [
      ['offers','Todas as ofertas'], ['category','Categoria'], ['search','Termo de busca'],
      ['product','Produto específico'], ['home','Página inicial de ofertas'], ['categories','Lista de categorias']
    ],
    main: [
      ['home','Página inicial'], ['offers','Ofertas'], ['categories','Lista de categorias'],
      ['category','Categoria'], ['subcategory','Subcategoria'], ['brand','Marca'],
      ['search','Termo de busca'], ['product','Produto específico'], ['baskets','Cestas básicas'],
      ['basket','Cesta específica'], ['kits','Kits promocionais'], ['kit','Kit específico']
    ]
  };
  const state = { campaigns: [], sha: '', editingId: '', catalog: [], coupons: [], baskets: [], kits: [], loaded: false, siteFilter: 'all' };
  const $ = selector => document.querySelector(selector);
  const notice = $('#notice');

  function showNotice(message, type = 'info') {
    notice.className = `notice show ${type}`;
    notice.textContent = message;
    clearTimeout(showNotice.timer);
    showNotice.timer = setTimeout(() => notice.classList.remove('show'), 5200);
  }

  function slug(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 42);
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }

  function randomToken(bytes = 15) {
    const data = new Uint8Array(bytes);
    crypto.getRandomValues(data);
    return Array.from(data, value => value.toString(36).padStart(2, '0')).join('').slice(0, 28);
  }

  function rawShortCode(length = 7) {
    const data = new Uint8Array(length);
    crypto.getRandomValues(data);
    return Array.from(data, value => SHORT_ALPHABET[value % SHORT_ALPHABET.length]).join('');
  }

  function fallbackShortCode(token) {
    return String(token || '').replace(/[^a-z0-9]/gi, '').slice(0, 7).toUpperCase();
  }

  function normalizeShortCode(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32)
      .replace(/-+$/g, '');
  }

  function shortCodeInUse(code, exceptId = '') {
    const candidate = normalizeShortCode(code);
    if (!candidate) return false;
    return state.campaigns.some(item => {
      if (item.id === exceptId) return false;
      const codes = [item.shortCode, ...(Array.isArray(item.aliases) ? item.aliases : [])];
      return codes.some(value => normalizeShortCode(value) === candidate);
    });
  }

  function uniqueShortCode(preferred = '', exceptId = '') {
    let candidate = normalizeShortCode(preferred);
    if (candidate && !shortCodeInUse(candidate, exceptId)) return candidate;
    do { candidate = rawShortCode(); } while (shortCodeInUse(candidate, exceptId));
    return candidate;
  }

  function encodeBase64(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    return btoa(binary);
  }

  function normalizeCampaign(raw = {}) {
    const token = String(raw.token || '').trim();
    const id = String(raw.id || '').trim();
    const shortCode = normalizeShortCode(raw.shortCode || raw.short_code || fallbackShortCode(token));
    const aliases = [...new Set((Array.isArray(raw.aliases) ? raw.aliases : [])
      .map(normalizeShortCode)
      .filter(value => value && value !== shortCode))];
    return {
      id,
      token,
      shortCode,
      aliases,
      name: String(raw.name || 'Campanha').trim(),
      code: String(raw.code || raw.id || '').trim().toUpperCase(),
      targetSite: raw.targetSite === 'main' || raw.site === 'main' ? 'main' : 'mini',
      active: raw.active !== false,
      discountPercent: Math.max(0, Math.min(30, Number(raw.discountPercent || 0) || 0)),
      couponCode: String(raw.couponCode || raw.cupom || '').trim().toUpperCase(),
      scope: raw.scope === 'all' ? 'all' : 'destination',
      destination: { type: String(raw.destination?.type || 'offers').trim(), value: String(raw.destination?.value || '').trim() },
      startsAt: String(raw.startsAt || '').trim(),
      expiresAt: String(raw.expiresAt || '').trim(),
      note: String(raw.note || '').trim(),
      createdAt: String(raw.createdAt || '').trim(),
      updatedAt: String(raw.updatedAt || '').trim()
    };
  }

  function destinationHash(campaign) {
    const type = campaign.destination.type;
    const value = campaign.destination.value.trim();
    if (type === 'offers') return '#/ofertas';
    if (type === 'categories') return '#/categorias';
    if (type === 'category') return `#/categoria/${encodeURIComponent(value)}`;
    if (type === 'subcategory') return `#/subcategoria/${encodeURIComponent(value)}`;
    if (type === 'brand') return `#/marca/${encodeURIComponent(value)}`;
    if (type === 'search') return `#/busca/${encodeURIComponent(value)}`;
    if (type === 'product') return `#/produto/${encodeURIComponent(value)}`;
    if (type === 'baskets') return '#/cestas';
    if (type === 'basket') return `#/cesta/${encodeURIComponent(value)}`;
    if (type === 'kits') return '#/kits';
    if (type === 'kit') return `#/kit/${encodeURIComponent(value)}`;
    return '#/';
  }

  function publicUrl(campaign) {
    if (!campaign?.shortCode) return '';
    return `${SHORT_BASE}#${encodeURIComponent(campaign.shortCode)}`;
  }

  function directUrl(campaign) {
    if (!campaign?.id || !campaign?.token) return '';
    if (campaign.targetSite === 'main') {
      const coupon = campaign.couponCode ? `?cupom=${encodeURIComponent(campaign.couponCode)}` : '';
      return `https://donaantonia.com.br/${destinationHash(campaign)}${coupon}`;
    }
    return `https://donaantonia.com.br/complemente/${destinationHash(campaign)}?c=${encodeURIComponent(`${campaign.id}.${campaign.token}`)}`;
  }

  function formCampaign() {
    const name = $('#campaign-name').value.trim();
    const existingId = $('#campaign-id').value.trim();
    const existingToken = $('#campaign-token').value.trim();
    const id = existingId || `${slug(name || $('#campaign-code').value || 'campanha')}-${randomToken(3).slice(0, 5)}`;
    const shortCode = normalizeShortCode($('#campaign-short-code').value);
    const targetSite = $('#campaign-target-site').value === 'main' ? 'main' : 'mini';
    return normalizeCampaign({
      id,
      token: existingToken || randomToken(),
      shortCode,
      name,
      code: ($('#campaign-code').value.trim() || name).toUpperCase().replace(/\s+/g, '').slice(0, 24),
      targetSite,
      active: $('#campaign-active').checked,
      discountPercent: targetSite === 'mini' ? Number($('#campaign-discount').value || 0) : 0,
      couponCode: targetSite === 'main' ? $('#campaign-coupon-code').value.trim() : '',
      scope: targetSite === 'mini' ? $('#campaign-scope').value : 'all',
      destination: { type: $('#destination-type').value, value: $('#destination-value').value.trim() },
      startsAt: $('#campaign-start').value,
      expiresAt: $('#campaign-end').value,
      note: $('#campaign-note').value.trim()
    });
  }

  function validateCampaign(campaign) {
    if (!campaign.name) return 'Informe o nome da campanha.';
    if (!campaign.id || !campaign.token || !campaign.shortCode) return 'Não foi possível gerar a segurança do link.';
    if (campaign.shortCode.length < 3) return 'O nome do link curto precisa ter pelo menos 3 caracteres.';
    if (shortCodeInUse(campaign.shortCode, campaign.id)) return 'Este nome de link curto já está sendo usado por outra campanha.';
    const needsValue = ['category','subcategory','brand','search','product','basket','kit'].includes(campaign.destination.type);
    if (needsValue && !campaign.destination.value) return 'Informe o destino específico deste link.';
    const allowed = (DESTINATIONS[campaign.targetSite] || []).map(([value]) => value);
    if (!allowed.includes(campaign.destination.type)) return 'O destino escolhido não pertence ao tipo de site selecionado.';
    if (campaign.targetSite === 'main' && campaign.couponCode && state.coupons.length && !state.coupons.some(item => String(item.codigo || '').toUpperCase() === campaign.couponCode)) {
      return 'Este cupom não existe no cadastro atual do site principal.';
    }
    if (campaign.expiresAt && campaign.startsAt && campaign.expiresAt < campaign.startsAt) return 'A data final não pode ser anterior à data inicial.';
    return '';
  }

  function campaignStatus(campaign) {
    if (!campaign.active) return 'inactive';
    const now = new Date();
    const start = campaign.startsAt ? new Date(`${campaign.startsAt}T00:00:00`) : null;
    const end = campaign.expiresAt ? new Date(`${campaign.expiresAt}T23:59:59`) : null;
    if (start && now < start) return 'scheduled';
    if (end && now > end) return 'expired';
    return 'active';
  }

  function typeLabel(type) {
    return ({offers:'Ofertas',category:'Categoria',subcategory:'Subcategoria',brand:'Marca',search:'Busca',product:'Produto',home:'Início',categories:'Categorias',baskets:'Cestas básicas',basket:'Cesta',kits:'Kits promocionais',kit:'Kit'})[type] || type;
  }

  function formatDate(value) {
    if (!value) return 'sem limite';
    const [year, month, day] = value.split('-');
    return `${day}/${month}/${year}`;
  }

  function updateDestinationInput() {
    const targetSite = $('#campaign-target-site').value === 'main' ? 'main' : 'mini';
    const select = $('#destination-type');
    const options = DESTINATIONS[targetSite];
    const previous = select.value;
    select.innerHTML = options.map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
    select.value = options.some(([value]) => value === previous) ? previous : options[0][0];
    const type = select.value;
    const needsValue = ['category','subcategory','brand','search','product','basket','kit'].includes(type);
    const input = $('#destination-value');
    input.disabled = !needsValue;
    if (!needsValue) input.value = '';
    const placeholders = {category:'Ex.: BELEZA',subcategory:'Ex.: SHAMPOO',brand:'Ex.: OMO',search:'Ex.: arroz integral',product:'Código, ID ou nome do produto',basket:'Código ou ID da cesta',kit:'Código ou ID do kit'};
    input.placeholder = placeholders[type] || 'Não necessário';
    $('#mini-discount-field').hidden = targetSite !== 'mini';
    $('#main-coupon-field').hidden = targetSite !== 'main';
    $('#campaign-scope').closest('.field').hidden = targetSite !== 'mini';
    fillDatalist(type);
  }

  function updatePreview() {
    updateDestinationInput();
    const campaign = formCampaign();
    const url = publicUrl(campaign);
    $('#link-preview').textContent = url || 'Preencha os campos para gerar o link.';
    $('#open-preview').href = url || '#';
  }

  function resetForm() {
    state.editingId = '';
    $('#campaign-form').reset();
    $('#campaign-active').checked = true;
    $('#campaign-discount').value = '10';
    $('#campaign-scope').value = 'destination';
    $('#campaign-target-site').value = 'mini';
    $('#campaign-coupon-code').value = '';
    updateDestinationInput();
    $('#destination-type').value = 'offers';
    $('#campaign-id').value = '';
    $('#campaign-token').value = '';
    $('#campaign-short-code').value = uniqueShortCode();
    $('#form-title').textContent = 'Criar link';
    $('#delete-campaign').disabled = true;
    updatePreview();
    if (window.innerWidth < 980) $('#editor-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function editCampaign(id) {
    const campaign = state.campaigns.find(item => item.id === id);
    if (!campaign) return;
    state.editingId = id;
    $('#campaign-id').value = campaign.id;
    $('#campaign-token').value = campaign.token;
    $('#campaign-short-code').value = campaign.shortCode;
    $('#campaign-name').value = campaign.name;
    $('#campaign-code').value = campaign.code;
    $('#campaign-target-site').value = campaign.targetSite;
    $('#campaign-discount').value = String(campaign.discountPercent);
    $('#campaign-coupon-code').value = campaign.couponCode;
    $('#campaign-scope').value = campaign.scope;
    updateDestinationInput();
    $('#destination-type').value = campaign.destination.type;
    updateDestinationInput();
    $('#destination-value').value = campaign.destination.value;
    $('#campaign-start').value = campaign.startsAt;
    $('#campaign-end').value = campaign.expiresAt;
    $('#campaign-note').value = campaign.note;
    $('#campaign-active').checked = campaign.active;
    $('#form-title').textContent = campaign.targetSite === 'main' ? 'Editar link do site principal' : 'Editar link do mini catálogo';
    $('#delete-campaign').disabled = false;
    updatePreview();
    $('#editor-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderList() {
    const query = $('#campaign-search').value.trim().toLowerCase();
    const campaigns = [...state.campaigns]
      .sort((a,b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)))
      .filter(campaign => state.siteFilter === 'all' || campaign.targetSite === state.siteFilter)
      .filter(campaign => !query || [campaign.name,campaign.code,campaign.shortCode,...(campaign.aliases || []),campaign.targetSite,campaign.couponCode,campaign.destination.type,campaign.destination.value].join(' ').toLowerCase().includes(query));
    const counts = state.campaigns.reduce((map, campaign) => { const status = campaignStatus(campaign); map[status] = (map[status] || 0) + 1; return map; }, {});
    $('#stat-total').textContent = state.campaigns.length;
    $('#stat-active').textContent = counts.active || 0;
    $('#stat-scheduled').textContent = counts.scheduled || 0;
    $('#stat-expired').textContent = (counts.expired || 0) + (counts.inactive || 0);
    const labels = {active:'Ativa',inactive:'Desativada',expired:'Encerrada',scheduled:'Agendada'};
    $('#campaign-list').innerHTML = campaigns.length ? campaigns.map(campaign => {
      const status = campaignStatus(campaign);
      const url = publicUrl(campaign);
      const targetLabel = campaign.targetSite === 'main' ? 'Site principal' : 'Mini catálogo';
      const benefit = campaign.targetSite === 'main'
        ? (campaign.couponCode ? `cupom ${escapeHtml(campaign.couponCode)}` : 'sem cupom')
        : (campaign.discountPercent ? `${campaign.discountPercent}% OFF` : 'sem desconto');
      return `<article class="campaign ${status === 'active' ? '' : 'inactive'}"><div class="campaign-title"><strong>${escapeHtml(campaign.name)}</strong><span class="pill ${campaign.targetSite}">${targetLabel}</span><span class="pill ${status}">${labels[status]}</span><span class="pill benefit">${benefit}</span></div><div class="campaign-meta"><span>${escapeHtml(typeLabel(campaign.destination.type))}${campaign.destination.value ? `: ${escapeHtml(campaign.destination.value)}` : ''}</span><span>•</span><span>${campaign.targetSite === 'mini' ? (campaign.scope === 'all' ? 'todos os produtos' : 'escopo protegido') : 'pedido completo'}</span><span>•</span><span>até ${escapeHtml(formatDate(campaign.expiresAt))}</span></div><div class="campaign-link">${escapeHtml(url)}</div><div class="campaign-actions"><button data-action="edit" data-id="${escapeHtml(campaign.id)}">Editar</button><button data-action="copy" data-id="${escapeHtml(campaign.id)}">Copiar</button><button data-action="share" data-id="${escapeHtml(campaign.id)}">Enviar</button><button data-action="toggle" data-id="${escapeHtml(campaign.id)}">${campaign.active ? 'Desativar' : 'Ativar'}</button><button data-action="delete-list" data-id="${escapeHtml(campaign.id)}">Excluir</button></div></article>`;
    }).join('') : '<div class="empty">Nenhuma campanha encontrada.</div>';
  }

  function fillDatalist(type = $('#destination-type').value) {
    const list = $('#destination-options');
    let values = [];
    if (type === 'category') values = state.catalog.map(item => item.categoria);
    if (type === 'subcategory') values = state.catalog.map(item => item.subcategoria);
    if (type === 'brand') values = state.catalog.map(item => item.marca);
    if (type === 'product') values = state.catalog.slice(0, 1800).map(item => item.codigo || item.id || item.nome);
    if (type === 'basket') values = state.baskets.map(item => item.id || item.codigo || item.nome);
    if (type === 'kit') values = state.kits.map(item => item.id || item.codigo || item.nome);
    values = [...new Set(values.filter(Boolean))].sort((a,b) => String(a).localeCompare(String(b),'pt-BR'));
    list.innerHTML = values.slice(0, 1800).map(value => `<option value="${escapeHtml(value)}"></option>`).join('');
  }

  function fillCouponDatalist() {
    $('#coupon-options').innerHTML = state.coupons
      .map(item => String(item.codigo || '').trim().toUpperCase())
      .filter(Boolean)
      .map(value => `<option value="${escapeHtml(value)}"></option>`).join('');
  }

  async function loadCatalogOptions() {
    const read = async url => {
      const response = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      return (Array.isArray(data) ? data : Object.values(data || {})).filter(Boolean);
    };
    const [products, coupons, baskets, kits] = await Promise.allSettled([
      read(PRODUCTS_URL), read(COUPONS_URL), read(BASKETS_URL), read(KITS_URL)
    ]);
    if (products.status === 'fulfilled') state.catalog = products.value;
    if (coupons.status === 'fulfilled') state.coupons = coupons.value;
    if (baskets.status === 'fulfilled') state.baskets = baskets.value;
    if (kits.status === 'fulfilled') state.kits = kits.value;
    fillDatalist();
    fillCouponDatalist();
  }

  async function copyText(text) {
    await navigator.clipboard.writeText(text);
    showNotice('Link curto copiado.', 'ok');
  }

  async function shareCampaign(campaign) {
    const url = publicUrl(campaign);
    const text = campaign.targetSite === 'main' ? 'Veja estas ofertas no site Dona Antônia:' : 'Veja estas ofertas para complementar seu pedido:';
    if (navigator.share) await navigator.share({ title: campaign.name, text, url });
    else await copyText(url);
  }

  function authHeaders(token) {
    const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }

  async function fetchGitHubFile() {
    const token = $('#github-token').value.trim();
    const branch = $('#github-branch').value.trim() || 'main';
    sessionStorage.setItem('da_mini_github_token', token);
    const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${CONFIG_PATH}?ref=${encodeURIComponent(branch)}&t=${Date.now()}`;
    const response = await fetch(url, { headers: authHeaders(token), cache: 'no-store' });
    if (response.status === 404) {
      state.campaigns = []; state.sha = ''; state.loaded = true; renderList(); showNotice('Arquivo ainda não existe nesta branch. Ao salvar, ele será criado.', 'info'); return;
    }
    if (!response.ok) throw new Error(`GitHub respondeu ${response.status}. Verifique o token e a branch.`);
    const data = await response.json();
    const binary = atob(String(data.content || '').replace(/\n/g,''));
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    state.campaigns = [];
    const rawCampaigns = Array.isArray(parsed) ? parsed : parsed.campaigns || [];
    rawCampaigns.forEach(raw => state.campaigns.push(normalizeCampaign(raw)));
    state.campaigns = state.campaigns.filter(item => item.id && item.token);
    state.sha = data.sha || '';
    state.loaded = true;
    renderList();
    showNotice(`${state.campaigns.length} campanha(s) carregada(s). Links antigos agora aparecem em formato curto.`, 'ok');
  }

  async function saveGitHub() {
    const token = $('#github-token').value.trim();
    const branch = $('#github-branch').value.trim() || 'main';
    if (!token) throw new Error('Informe um token do GitHub com permissão de escrita no repositório.');
    const payload = { version: 5, updatedAt: new Date().toISOString(), campaigns: state.campaigns };
    const body = { message: 'Atualiza links curtos dos catálogos', content: encodeBase64(`${JSON.stringify(payload, null, 2)}\n`), branch };
    if (state.sha) body.sha = state.sha;
    const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${CONFIG_PATH}`;
    const response = await fetch(url, { method: 'PUT', headers: { ...authHeaders(token), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw new Error(detail.message || `GitHub respondeu ${response.status}.`);
    }
    const data = await response.json();
    state.sha = data.content?.sha || '';
    showNotice('Links do mini catálogo e do site principal salvos no GitHub.', 'ok');
  }

  async function saveForm(event) {
    event?.preventDefault();
    try {
      const campaign = formCampaign();
      const error = validateCampaign(campaign);
      if (error) throw new Error(error);
      const now = new Date().toISOString();
      const current = state.campaigns.find(item => item.id === campaign.id);
      const previousCodes = current ? [current.shortCode, ...(current.aliases || [])] : [];
      campaign.aliases = [...new Set(previousCodes.map(normalizeShortCode))]
        .filter(code => code && code !== campaign.shortCode)
        .slice(0, 20);
      campaign.createdAt = current?.createdAt || now;
      campaign.updatedAt = now;
      const index = state.campaigns.findIndex(item => item.id === campaign.id);
      if (index >= 0) state.campaigns[index] = campaign; else state.campaigns.unshift(campaign);
      renderList();
      await saveGitHub();
      editCampaign(campaign.id);
    } catch (error) { showNotice(error.message || 'Não foi possível salvar.', 'error'); }
  }

  async function toggleCampaign(id) {
    const campaign = state.campaigns.find(item => item.id === id);
    if (!campaign) return;
    campaign.active = !campaign.active;
    campaign.updatedAt = new Date().toISOString();
    renderList();
    try { await saveGitHub(); } catch (error) { showNotice(error.message, 'error'); }
  }

  async function removeCampaign(id) {
    if (!id || !confirm('Excluir definitivamente esta campanha e invalidar o link?')) return;
    state.campaigns = state.campaigns.filter(item => item.id !== id);
    renderList();
    try { await saveGitHub(); if ($('#campaign-id').value === id) resetForm(); } catch (error) { showNotice(error.message, 'error'); }
  }

  function duplicateCampaign() {
    const source = formCampaign();
    $('#campaign-id').value = '';
    $('#campaign-token').value = '';
    $('#campaign-short-code').value = uniqueShortCode();
    $('#campaign-name').value = `${source.name} - cópia`;
    $('#campaign-code').value = `${source.code}C`.slice(0,24);
    state.editingId = '';
    $('#form-title').textContent = 'Criar link duplicado';
    $('#delete-campaign').disabled = true;
    updatePreview();
  }

  $('#campaign-form').addEventListener('submit', saveForm);
  $('#mobile-save').addEventListener('click', () => $('#campaign-form').requestSubmit());
  $('#new-campaign').addEventListener('click', resetForm);
  $('#duplicate-campaign').addEventListener('click', duplicateCampaign);
  $('#delete-campaign').addEventListener('click', () => removeCampaign($('#campaign-id').value.trim()));
  $('#load-github').addEventListener('click', () => fetchGitHubFile().catch(error => showNotice(error.message, 'error')));
  $('#refresh-list').addEventListener('click', () => fetchGitHubFile().catch(error => showNotice(error.message, 'error')));
  $('#campaign-search').addEventListener('input', renderList);
  $('#destination-type').addEventListener('change', updatePreview);
  $('#campaign-target-site').addEventListener('change', updatePreview);
  $('#campaign-form').addEventListener('input', updatePreview);
  document.querySelector('.link-tabs').addEventListener('click', event => {
    const button = event.target.closest('[data-site-filter]');
    if (!button) return;
    state.siteFilter = button.dataset.siteFilter;
    document.querySelectorAll('[data-site-filter]').forEach(item => item.classList.toggle('active', item === button));
    renderList();
  });
  $('#campaign-short-code').addEventListener('blur', event => {
    event.target.value = normalizeShortCode(event.target.value);
    updatePreview();
  });
  $('#regenerate-short-code').addEventListener('click', () => {
    if ($('#campaign-id').value && !confirm('Gerar outro nome para o link curto? O endereço anterior continuará funcionando.')) return;
    $('#campaign-short-code').value = uniqueShortCode('', $('#campaign-id').value);
    updatePreview();
  });
  $('#copy-preview').addEventListener('click', () => copyText($('#link-preview').textContent).catch(error => showNotice(error.message, 'error')));
  $('#share-preview').addEventListener('click', () => shareCampaign(formCampaign()).catch(error => showNotice(error.message, 'error')));
  $('#campaign-list').addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const campaign = state.campaigns.find(item => item.id === button.dataset.id);
    if (!campaign) return;
    if (button.dataset.action === 'edit') editCampaign(campaign.id);
    else if (button.dataset.action === 'copy') copyText(publicUrl(campaign)).catch(error => showNotice(error.message, 'error'));
    else if (button.dataset.action === 'share') shareCampaign(campaign).catch(error => showNotice(error.message, 'error'));
    else if (button.dataset.action === 'toggle') toggleCampaign(campaign.id);
    else if (button.dataset.action === 'delete-list') removeCampaign(campaign.id);
  });

  $('#github-token').value = sessionStorage.getItem('da_mini_github_token') || '';
  resetForm();
  renderList();
  Promise.allSettled([loadCatalogOptions(), fetchGitHubFile()]);
  window.__DA_MINI_LINKS_ADMIN__ = { publicUrl, directUrl };
})();
