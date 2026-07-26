(() => {
  'use strict';
  const OWNER = 'osvaldosereia';
  const REPO = 'SUCEDOAN12';
  const CONFIG_PATH = 'site/mini-catalogo-links.json';
  const SHORT_BASE = 'https://donaantonia.com.br/c/';
  const PRODUCTS_URL = 'site/produtos-home.json';
  const SHORT_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const state = { campaigns: [], sha: '', editingId: '', catalog: [], loaded: false };
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

  function uniqueShortCode(preferred = '', exceptId = '') {
    let candidate = String(preferred || '').replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 10);
    const used = code => state.campaigns.some(item => item.id !== exceptId && item.shortCode === code);
    if (candidate && !used(candidate)) return candidate;
    do { candidate = rawShortCode(); } while (used(candidate));
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
    return {
      id,
      token,
      shortCode: uniqueShortCode(raw.shortCode || raw.short_code || fallbackShortCode(token), id),
      name: String(raw.name || 'Campanha').trim(),
      code: String(raw.code || raw.id || '').trim().toUpperCase(),
      active: raw.active !== false,
      discountPercent: Math.max(0, Math.min(30, Number(raw.discountPercent || 0) || 0)),
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
    if (type === 'category') return `#/categoria/${encodeURIComponent(value)}`;
    if (type === 'search') return `#/busca/${encodeURIComponent(value)}`;
    if (type === 'product') return `#/produto/${encodeURIComponent(value)}`;
    if (type === 'categories') return '#/categorias';
    return '#/';
  }

  function publicUrl(campaign) {
    if (!campaign?.shortCode) return '';
    return `${SHORT_BASE}#${encodeURIComponent(campaign.shortCode)}`;
  }

  function directUrl(campaign) {
    if (!campaign?.id || !campaign?.token) return '';
    return `https://donaantonia.com.br/complemente/${destinationHash(campaign)}?c=${encodeURIComponent(`${campaign.id}.${campaign.token}`)}`;
  }

  function formCampaign() {
    const name = $('#campaign-name').value.trim();
    const existingId = $('#campaign-id').value.trim();
    const existingToken = $('#campaign-token').value.trim();
    const id = existingId || `${slug(name || $('#campaign-code').value || 'campanha')}-${randomToken(3).slice(0, 5)}`;
    const shortCode = uniqueShortCode($('#campaign-short-code').value, id);
    return normalizeCampaign({
      id,
      token: existingToken || randomToken(),
      shortCode,
      name,
      code: ($('#campaign-code').value.trim() || name).toUpperCase().replace(/\s+/g, '').slice(0, 24),
      active: $('#campaign-active').checked,
      discountPercent: Number($('#campaign-discount').value || 0),
      scope: $('#campaign-scope').value,
      destination: { type: $('#destination-type').value, value: $('#destination-value').value.trim() },
      startsAt: $('#campaign-start').value,
      expiresAt: $('#campaign-end').value,
      note: $('#campaign-note').value.trim()
    });
  }

  function validateCampaign(campaign) {
    if (!campaign.name) return 'Informe o nome da campanha.';
    if (!campaign.id || !campaign.token || !campaign.shortCode) return 'Não foi possível gerar a segurança do link.';
    if (['category','search','product'].includes(campaign.destination.type) && !campaign.destination.value) return 'Informe a categoria, busca ou produto de destino.';
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
    return ({offers:'Ofertas',category:'Categoria',search:'Busca',product:'Produto',home:'Início de ofertas',categories:'Categorias'})[type] || type;
  }

  function formatDate(value) {
    if (!value) return 'sem limite';
    const [year, month, day] = value.split('-');
    return `${day}/${month}/${year}`;
  }

  function updateDestinationInput() {
    const type = $('#destination-type').value;
    const needsValue = ['category','search','product'].includes(type);
    const input = $('#destination-value');
    input.disabled = !needsValue;
    if (!needsValue) input.value = '';
    input.placeholder = type === 'category' ? 'Ex.: BELEZA' : type === 'search' ? 'Ex.: shampoo' : type === 'product' ? 'Código, ID ou nome do produto' : 'Não necessário';
    fillDatalist(type);
  }

  function updatePreview() {
    if (!$('#campaign-short-code').value) $('#campaign-short-code').value = uniqueShortCode();
    const campaign = formCampaign();
    const url = publicUrl(campaign);
    $('#link-preview').textContent = url || 'Preencha os campos para gerar o link.';
    $('#open-preview').href = url || '#';
    updateDestinationInput();
  }

  function resetForm() {
    state.editingId = '';
    $('#campaign-form').reset();
    $('#campaign-active').checked = true;
    $('#campaign-discount').value = '10';
    $('#campaign-scope').value = 'destination';
    $('#destination-type').value = 'offers';
    $('#campaign-id').value = '';
    $('#campaign-token').value = '';
    $('#campaign-short-code').value = uniqueShortCode();
    $('#form-title').textContent = 'Criar campanha';
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
    $('#campaign-discount').value = String(campaign.discountPercent);
    $('#campaign-scope').value = campaign.scope;
    $('#destination-type').value = campaign.destination.type;
    $('#destination-value').value = campaign.destination.value;
    $('#campaign-start').value = campaign.startsAt;
    $('#campaign-end').value = campaign.expiresAt;
    $('#campaign-note').value = campaign.note;
    $('#campaign-active').checked = campaign.active;
    $('#form-title').textContent = 'Editar campanha';
    $('#delete-campaign').disabled = false;
    updatePreview();
    $('#editor-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderList() {
    const query = $('#campaign-search').value.trim().toLowerCase();
    const campaigns = [...state.campaigns]
      .sort((a,b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)))
      .filter(campaign => !query || [campaign.name,campaign.code,campaign.shortCode,campaign.destination.type,campaign.destination.value].join(' ').toLowerCase().includes(query));
    const counts = state.campaigns.reduce((map, campaign) => { const status = campaignStatus(campaign); map[status] = (map[status] || 0) + 1; return map; }, {});
    $('#stat-total').textContent = state.campaigns.length;
    $('#stat-active').textContent = counts.active || 0;
    $('#stat-scheduled').textContent = counts.scheduled || 0;
    $('#stat-expired').textContent = (counts.expired || 0) + (counts.inactive || 0);
    const labels = {active:'Ativa',inactive:'Desativada',expired:'Encerrada',scheduled:'Agendada'};
    $('#campaign-list').innerHTML = campaigns.length ? campaigns.map(campaign => {
      const status = campaignStatus(campaign);
      const url = publicUrl(campaign);
      return `<article class="campaign ${status === 'active' ? '' : 'inactive'}"><div class="campaign-title"><strong>${escapeHtml(campaign.name)}</strong><span class="pill ${status}">${labels[status]}</span>${campaign.discountPercent ? `<span class="pill active">${campaign.discountPercent}% OFF</span>` : ''}</div><div class="campaign-meta"><span>${escapeHtml(typeLabel(campaign.destination.type))}${campaign.destination.value ? `: ${escapeHtml(campaign.destination.value)}` : ''}</span><span>•</span><span>${campaign.scope === 'all' ? 'todos os produtos' : 'escopo protegido'}</span><span>•</span><span>até ${escapeHtml(formatDate(campaign.expiresAt))}</span></div><div class="campaign-link">${escapeHtml(url)}</div><div class="campaign-actions"><button data-action="edit" data-id="${escapeHtml(campaign.id)}">Editar</button><button data-action="copy" data-id="${escapeHtml(campaign.id)}">Copiar</button><button data-action="share" data-id="${escapeHtml(campaign.id)}">Enviar</button><button data-action="toggle" data-id="${escapeHtml(campaign.id)}">${campaign.active ? 'Desativar' : 'Ativar'}</button><button data-action="delete-list" data-id="${escapeHtml(campaign.id)}">Excluir</button></div></article>`;
    }).join('') : '<div class="empty">Nenhuma campanha encontrada.</div>';
  }

  function fillDatalist(type = $('#destination-type').value) {
    const list = $('#destination-options');
    if (!state.catalog.length || !['category','product'].includes(type)) { list.innerHTML = ''; return; }
    let values = [];
    if (type === 'category') values = [...new Set(state.catalog.map(item => item.categoria).filter(Boolean))].sort((a,b) => a.localeCompare(b,'pt-BR'));
    if (type === 'product') values = state.catalog.slice(0, 1800).map(item => item.codigo || item.id || item.nome).filter(Boolean);
    list.innerHTML = values.slice(0, 1800).map(value => `<option value="${escapeHtml(value)}"></option>`).join('');
  }

  async function loadCatalogOptions() {
    try {
      const response = await fetch(`${PRODUCTS_URL}?t=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json();
      state.catalog = (Array.isArray(data) ? data : Object.values(data || {})).filter(Boolean);
      fillDatalist();
    } catch {}
  }

  async function copyText(text) {
    await navigator.clipboard.writeText(text);
    showNotice('Link curto copiado.', 'ok');
  }

  async function shareCampaign(campaign) {
    const url = publicUrl(campaign);
    if (navigator.share) await navigator.share({ title: campaign.name, text: 'Veja estas ofertas para complementar seu pedido:', url });
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
    const payload = { version: 3, updatedAt: new Date().toISOString(), campaigns: state.campaigns };
    const body = { message: 'Atualiza links curtos do mini catálogo', content: encodeBase64(`${JSON.stringify(payload, null, 2)}\n`), branch };
    if (state.sha) body.sha = state.sha;
    const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${CONFIG_PATH}`;
    const response = await fetch(url, { method: 'PUT', headers: { ...authHeaders(token), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw new Error(detail.message || `GitHub respondeu ${response.status}.`);
    }
    const data = await response.json();
    state.sha = data.content?.sha || '';
    showNotice('Campanhas e links curtos salvos no GitHub.', 'ok');
  }

  async function saveForm(event) {
    event?.preventDefault();
    try {
      const campaign = formCampaign();
      const error = validateCampaign(campaign);
      if (error) throw new Error(error);
      const now = new Date().toISOString();
      const current = state.campaigns.find(item => item.id === campaign.id);
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
    $('#form-title').textContent = 'Criar campanha duplicada';
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
  $('#campaign-form').addEventListener('input', event => { if (event.target.id !== 'campaign-short-code') updatePreview(); });
  $('#regenerate-short-code').addEventListener('click', () => {
    if ($('#campaign-id').value && !confirm('Trocar o código curto? O link anterior deixará de funcionar depois de salvar.')) return;
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
