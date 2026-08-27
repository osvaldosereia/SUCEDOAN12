import { CONFIG } from './config.js?v=20260827-customer-library-v27';

const BUILD = '20260827-customer-library-v27';
const FIREBASE = String(CONFIG.ENDPOINTS?.FIREBASE_ORDERS || 'https://cedar-chemist-310801-default-rtdb.firebaseio.com/pedidos').replace(/\/pedidos\/?$/, '');
const FAVORITES_KEY = `${CONFIG.STORAGE.PREFIX}${CONFIG.STORAGE.FAVORITES}`;
const CART_KEY = `${CONFIG.STORAGE.PREFIX}${CONFIG.STORAGE.CART}`;
const CHECKOUT_KEY = `${CONFIG.STORAGE.PREFIX}${CONFIG.STORAGE.CHECKOUT_CLIENT}`;
const MUG_CUSTOMER_KEY = `${CONFIG.STORAGE.PREFIX}mug_customer_v3`;
const MUG_LIMIT_KEY = `${CONFIG.STORAGE.PREFIX}mug_creation_limits_v3`;
const IDENTITY_KEY = `${CONFIG.STORAGE.PREFIX}customer_library_identity_v1`;
const LOCAL_MUGS_KEY = `${CONFIG.STORAGE.PREFIX}customer_mugs_v1`;
const SESSION_RELOAD_KEY = `${CONFIG.STORAGE.PREFIX}customer_library_sync_reload_v1`;
const CUSTOMER_ROOT = 'canecas/clientes';
const MAX_MUGS = 60;

const text = value => String(value ?? '').trim();
const escapeHtml = value => text(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function readLocal(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeLocal(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function removeLocal(key) {
  try { localStorage.removeItem(key); } catch {}
}

function canonicalWhatsapp(value) {
  let number = text(value).replace(/\D+/g, '');
  if ((number.length === 12 || number.length === 13) && number.startsWith('55')) number = number.slice(2);
  if (number.length === 10 && /^[1-9]{2}\d{8}$/.test(number)) number = `${number.slice(0, 2)}9${number.slice(2)}`;
  if (!/^[1-9]{2}9\d{8}$/.test(number)) return '';
  return `55${number}`;
}

function displayLast4(phone) {
  const digits = canonicalWhatsapp(phone);
  return digits ? `•••• ${digits.slice(-4)}` : '';
}

function dateBR(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

async function sha256(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function customerKey(phone) {
  const canonical = canonicalWhatsapp(phone);
  if (!canonical) throw new Error('Informe um WhatsApp válido com DDD.');
  return sha256(`dona-antonia-customer-library-v1:${canonical}`);
}

async function firebase(path, { method = 'GET', body = null } = {}) {
  const response = await fetch(`${FIREBASE}/${path}.json${method === 'GET' ? `?_=${Date.now()}` : ''}`, {
    method,
    cache: 'no-store',
    headers: body == null ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: body == null ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Firebase ${response.status}`);
  if (response.status === 204) return null;
  return response.json().catch(() => null);
}

function favoriteKey(value) {
  const bytes = new TextEncoder().encode(text(value));
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function localFavorites() {
  const value = readLocal(FAVORITES_KEY, []);
  return Array.isArray(value) ? [...new Set(value.map(text).filter(Boolean))] : [];
}

function updateFavoriteBadges(items = localFavorites()) {
  const count = items.length;
  document.querySelectorAll('[data-favorite-count]').forEach(node => {
    node.textContent = String(count);
    node.hidden = count <= 0;
  });
}

function applyFavorites(items) {
  const merged = [...new Set((items || []).map(text).filter(Boolean))];
  writeLocal(FAVORITES_KEY, merged);
  const state = window.__DA_CATALOG_STATE__;
  if (state?.favorites instanceof Set) {
    state.favorites.clear();
    merged.forEach(key => state.favorites.add(key));
  }
  updateFavoriteBadges(merged);
  window.dispatchEvent(new CustomEvent('da:customer-favorites-updated', { detail: { items: merged, build: BUILD } }));
  return merged;
}

function addLocalFavorite(key) {
  const items = new Set(localFavorites());
  items.add(text(key));
  return applyFavorites([...items]);
}

function removeLocalFavorite(key) {
  const items = new Set(localFavorites());
  items.delete(text(key));
  return applyFavorites([...items]);
}

function identityCandidate() {
  const saved = readLocal(IDENTITY_KEY, null);
  const mug = readLocal(MUG_CUSTOMER_KEY, null);
  const checkout = readLocal(CHECKOUT_KEY, null);
  const candidates = [
    { phone: saved?.phone, name: saved?.name, source: saved?.source || 'saved' },
    { phone: mug?.whatsapp, name: mug?.name, source: 'mug' },
    { phone: checkout?.phone || checkout?.telefone || checkout?.celular, name: checkout?.name || checkout?.nome, source: 'checkout' },
  ];
  for (const item of candidates) {
    const phone = canonicalWhatsapp(item.phone);
    if (phone) return { phone, name: text(item.name), source: item.source };
  }
  return null;
}

function rememberIdentity(phone, name = '', source = 'manual') {
  const canonical = canonicalWhatsapp(phone);
  if (!canonical) throw new Error('Informe um WhatsApp válido com DDD.');
  const current = readLocal(IDENTITY_KEY, {}) || {};
  const identity = { phone: canonical, name: text(name || current.name), source, updated_at: new Date().toISOString() };
  writeLocal(IDENTITY_KEY, identity);
  return identity;
}

function clearIdentity() {
  removeLocal(IDENTITY_KEY);
}

function localMugsObject() {
  const data = readLocal(LOCAL_MUGS_KEY, {});
  return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
}

function saveLocalMug(record) {
  if (!record?.id) return;
  const all = localMugsObject();
  all[record.id] = { ...(all[record.id] || {}), ...record };
  const sorted = Object.values(all)
    .sort((a, b) => new Date(b?.criado_em || b?.updated_at || 0) - new Date(a?.criado_em || a?.updated_at || 0))
    .slice(0, MAX_MUGS);
  writeLocal(LOCAL_MUGS_KEY, Object.fromEntries(sorted.map(item => [item.id, item])));
}

function archiveLocalMug(id) {
  const all = localMugsObject();
  if (!all[id]) return;
  all[id] = { ...all[id], status: 'arquivada', favoritada: false, updated_at: new Date().toISOString() };
  writeLocal(LOCAL_MUGS_KEY, all);
}

function normalizeMugFromProduct(id, product, identity) {
  const personal = product?.personalizacao_cliente || {};
  const created = text(product?.criado_em || product?.created_at || product?.updated_at) || new Date().toISOString();
  const mockup1 = text(product?.mockup_1 || product?.url_imagem || product?.imagem || product?.imagens?.[0]);
  const mockup2 = text(product?.mockup_2 || product?.imagens?.[1]);
  const mockup3 = text(product?.mockup_3 || product?.imagens?.[2]);
  const art = text(product?.arte_horizontal || product?.arte_personalizacao || product?.arte_impressao?.url);
  return {
    id: text(id),
    produto_key: text(id),
    nome: text(product?.nome || product?.name || 'Caneca personalizada'),
    modelo_key: text(personal?.modelo_key),
    modelo_nome: text(personal?.modelo_nome),
    nome_destaque: text(personal?.nome_destaque),
    frase: text(personal?.frase),
    campos: personal?.campos && typeof personal.campos === 'object' ? personal.campos : {},
    arte_horizontal: art,
    mockup_1: mockup1,
    mockup_2: mockup2,
    mockup_3: mockup3,
    resultado_url: text(personal?.resultado_url) || `${location.origin}/caneca10/resultado.html?id=${encodeURIComponent(id)}`,
    status: 'rascunho',
    status_compra: 'adicionada_ao_carrinho',
    favoritada: true,
    privada: true,
    criado_em: created,
    updated_at: new Date().toISOString(),
    cliente_nome: text(identity?.name || product?.cliente_nome || personal?.nome),
    whatsapp_ultimos4: canonicalWhatsapp(identity?.phone || product?.cliente_whatsapp || personal?.whatsapp).slice(-4),
    origem: BUILD,
  };
}

async function writeProfile(identity, key) {
  await firebase(`${CUSTOMER_ROOT}/${key}/perfil`, {
    method: 'PATCH',
    body: {
      nome: text(identity.name),
      whatsapp_ultimos4: canonicalWhatsapp(identity.phone).slice(-4),
      atualizado_em: new Date().toISOString(),
      versao: BUILD,
    },
  });
}

async function writeFavorite(identity, key, active) {
  const customer = await customerKey(identity.phone);
  const path = `${CUSTOMER_ROOT}/${customer}/favoritos/${favoriteKey(key)}`;
  if (!active) return firebase(path, { method: 'DELETE' });
  const kind = key.startsWith('kit:') ? 'kit' : (key.startsWith('cp-') || key.startsWith('mug-') ? 'caneca' : 'produto');
  return firebase(path, {
    method: 'PUT',
    body: { key, kind, ativo: true, salvo_em: new Date().toISOString(), versao: BUILD },
  });
}

async function syncFavorites(identity, { uploadLocal = true } = {}) {
  const customer = await customerKey(identity.phone);
  const remote = await firebase(`${CUSTOMER_ROOT}/${customer}/favoritos`).catch(() => null);
  const remoteItems = remote && typeof remote === 'object'
    ? Object.values(remote).filter(item => item?.ativo !== false && item?.key).map(item => text(item.key))
    : [];
  const local = localFavorites();
  const merged = [...new Set([...remoteItems, ...local])];
  const changed = merged.length !== local.length || merged.some(item => !local.includes(item));
  applyFavorites(merged);
  if (uploadLocal) {
    const remoteSet = new Set(remoteItems);
    const missing = local.filter(item => !remoteSet.has(item));
    await Promise.all(missing.slice(0, 100).map(item => writeFavorite(identity, item, true).catch(() => null)));
  }
  await writeProfile(identity, customer).catch(() => null);
  return { items: merged, changed };
}

async function captureMug(id, { identity = null, silent = false } = {}) {
  const mugId = text(id);
  if (!mugId) return null;
  let product = null;
  try { product = await firebase(`produtos/${encodeURIComponent(mugId)}`); } catch {}
  if (!product || typeof product !== 'object') return null;
  const candidate = identity || identityCandidate() || {
    phone: canonicalWhatsapp(product?.cliente_whatsapp || product?.personalizacao_cliente?.whatsapp),
    name: text(product?.cliente_nome || product?.personalizacao_cliente?.nome),
    source: 'product',
  };
  if (!candidate?.phone) return null;
  const savedIdentity = rememberIdentity(candidate.phone, candidate.name, candidate.source || 'mug');
  const record = normalizeMugFromProduct(mugId, product, savedIdentity);
  saveLocalMug(record);
  addLocalFavorite(mugId);
  const customer = await customerKey(savedIdentity.phone);
  await Promise.all([
    firebase(`${CUSTOMER_ROOT}/${customer}/criacoes/${encodeURIComponent(mugId)}`, { method: 'PUT', body: record }).catch(error => console.debug('[Biblioteca cliente] criação cloud:', error?.message || error)),
    writeFavorite(savedIdentity, mugId, true).catch(error => console.debug('[Biblioteca cliente] favorito cloud:', error?.message || error)),
    writeProfile(savedIdentity, customer).catch(() => null),
  ]);
  if (!silent) scheduleRender(30);
  return record;
}

function knownCreationIds() {
  const limits = readLocal(MUG_LIMIT_KEY, {});
  const ids = new Set(Object.keys(localMugsObject()));
  if (limits && typeof limits === 'object') {
    Object.values(limits).forEach(day => {
      if (!day || typeof day !== 'object') return;
      Object.values(day).forEach(entries => {
        if (!Array.isArray(entries)) return;
        entries.forEach(item => { if (item?.id) ids.add(text(item.id)); });
      });
    });
  }
  const cart = readLocal(CART_KEY, null);
  Object.keys(cart?.cart || {}).forEach(id => {
    if (/^(?:cp-|mug-)/i.test(id)) ids.add(id);
  });
  return [...ids].filter(Boolean).slice(0, MAX_MUGS);
}

async function migrateKnownMugs(identity) {
  const ids = knownCreationIds();
  for (const id of ids) {
    if (localMugsObject()?.[id]?.status && localMugsObject()?.[id]?.mockup_1) continue;
    await captureMug(id, { identity, silent: true }).catch(() => null);
    await sleep(60);
  }
}

async function loadMugs(identity) {
  const customer = await customerKey(identity.phone);
  const remote = await firebase(`${CUSTOMER_ROOT}/${customer}/criacoes`).catch(() => null);
  const local = localMugsObject();
  const merged = { ...local };
  if (remote && typeof remote === 'object') {
    Object.values(remote).forEach(record => {
      if (!record?.id) return;
      const current = merged[record.id] || {};
      merged[record.id] = { ...current, ...record };
    });
  }
  Object.values(merged).forEach(saveLocalMug);
  return Object.values(localMugsObject())
    .filter(item => item?.status !== 'arquivada')
    .sort((a, b) => new Date(b?.criado_em || 0) - new Date(a?.criado_em || 0));
}

async function archiveMug(identity, id) {
  const mugId = text(id);
  if (!mugId) return;
  archiveLocalMug(mugId);
  removeLocalFavorite(mugId);
  const customer = await customerKey(identity.phone);
  await Promise.all([
    firebase(`${CUSTOMER_ROOT}/${customer}/criacoes/${encodeURIComponent(mugId)}`, {
      method: 'PATCH',
      body: { status: 'arquivada', favoritada: false, updated_at: new Date().toISOString() },
    }).catch(() => null),
    writeFavorite(identity, mugId, false).catch(() => null),
  ]);
}

function installStyles() {
  if (document.getElementById('customerFavoritesV27Styles')) return;
  const style = document.createElement('style');
  style.id = 'customerFavoritesV27Styles';
  style.textContent = `
  .customer-library{margin:0 auto 22px;max-width:1180px;padding:0 16px}.customer-library-shell{border:1px solid #e2e5df;border-radius:20px;background:#fff;box-shadow:0 10px 30px rgba(26,31,25,.05);overflow:hidden}.customer-library-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:20px 20px 14px;background:linear-gradient(135deg,#f7faf5,#fff)}.customer-library-eyebrow{display:block;font-size:10px;font-weight:900;letter-spacing:.08em;color:#64705f;margin-bottom:5px}.customer-library-head h2{margin:0;font-size:23px}.customer-library-head p{margin:5px 0 0;color:#677065;font-size:12px;line-height:1.45}.customer-library-identity{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}.customer-library-identity span{padding:7px 10px;border-radius:999px;background:#eef5eb;font-size:11px;font-weight:800}.customer-library-link{border:0;background:transparent;text-decoration:underline;color:#4b5548;cursor:pointer;font-size:11px}.customer-library-body{padding:16px 20px 20px}.customer-library-recovery{display:grid;grid-template-columns:1fr auto;gap:9px;align-items:end;padding:14px;border-radius:14px;background:#f6f8f4}.customer-library-recovery label{display:grid;gap:6px;font-size:11px;font-weight:800}.customer-library-recovery input{width:100%;box-sizing:border-box;border:1px solid #d6dbd2;border-radius:11px;padding:11px 12px;font:inherit;font-size:16px}.customer-library-recovery button,.customer-mug-actions a,.customer-mug-actions button{border:0;border-radius:11px;min-height:40px;padding:9px 13px;font-weight:800;font-size:12px;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center}.customer-library-recovery button{background:#222620;color:#fff}.customer-library-note{grid-column:1/-1;margin:0;color:#6d746a;font-size:11px;line-height:1.45}.customer-library-message{padding:14px;border-radius:13px;background:#f6f7f4;color:#62695f;font-size:12px}.customer-mug-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.customer-mug-card{border:1px solid #e0e4dd;border-radius:15px;overflow:hidden;background:#fff;display:grid}.customer-mug-media{display:block;aspect-ratio:1;background:#f2f4f0;overflow:hidden}.customer-mug-media img{width:100%;height:100%;object-fit:cover;display:block}.customer-mug-copy{padding:12px;display:grid;gap:5px}.customer-mug-copy strong{font-size:13px;line-height:1.3}.customer-mug-copy small{font-size:10px;color:#71786e}.customer-mug-status{display:inline-flex;justify-self:start;padding:4px 7px;border-radius:999px;background:#edf5ea;color:#365136;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.04em}.customer-mug-actions{display:grid;grid-template-columns:1fr auto;gap:6px;margin-top:5px}.customer-mug-actions a{background:#242821;color:#fff}.customer-mug-actions button{background:#eef1eb;color:#424940}.customer-library-products-note{margin-top:14px;padding-top:13px;border-top:1px solid #eceee9;color:#70776d;font-size:11px}.customer-library-syncing{opacity:.72}.customer-library-error{padding:10px 12px;border-radius:10px;background:#fff2f1;color:#8a332e;font-size:11px;margin-top:8px}
  @media(max-width:900px){.customer-mug-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:600px){.customer-library{padding:0 10px;margin-bottom:16px}.customer-library-head{padding:16px;display:grid}.customer-library-identity{justify-content:flex-start}.customer-library-body{padding:12px}.customer-library-recovery{grid-template-columns:1fr}.customer-library-recovery button{width:100%}.customer-mug-grid{gap:8px}.customer-mug-copy{padding:9px}.customer-mug-actions{grid-template-columns:1fr}.customer-mug-actions button{min-height:36px}}
  `;
  document.head.appendChild(style);
}

function mugCard(record) {
  const id = text(record.id);
  const image = text(record.mockup_1 || record.arte_horizontal || '/img/logoantonia5.png');
  const name = text(record.nome || (record.nome_destaque ? `Caneca personalizada ${record.nome_destaque}` : 'Caneca personalizada'));
  const result = text(record.resultado_url) || `${location.origin}/caneca10/resultado.html?id=${encodeURIComponent(id)}`;
  const modelLink = record.modelo_key ? `/#/produto/${encodeURIComponent(record.modelo_key)}` : '';
  return `<article class="customer-mug-card" data-customer-mug="${escapeHtml(id)}"><a class="customer-mug-media" href="${escapeHtml(result)}"><img src="${escapeHtml(image)}" alt="${escapeHtml(name)}" loading="lazy" decoding="async"></a><div class="customer-mug-copy"><span class="customer-mug-status">Rascunho salvo</span><strong>${escapeHtml(name)}</strong><small>${dateBR(record.criado_em)}${record.modelo_nome ? ` · ${escapeHtml(record.modelo_nome)}` : ''}</small><div class="customer-mug-actions"><a href="${escapeHtml(result)}">Abrir criação</a><button type="button" data-customer-mug-archive="${escapeHtml(id)}">Arquivar</button></div>${modelLink ? `<a class="customer-library-link" href="${escapeHtml(modelLink)}">Criar outra com este modelo</a>` : ''}</div></article>`;
}

function isFavoritesRoute() {
  return /^#\/(?:favoritos|favorites)(?:[/?#]|$)/i.test(String(location.hash || ''));
}

let renderTimer = 0;
function scheduleRender(delay = 0) {
  clearTimeout(renderTimer);
  renderTimer = window.setTimeout(renderFavoritesLibrary, delay);
}

async function renderFavoritesLibrary() {
  if (!isFavoritesRoute()) {
    document.getElementById('customerLibraryFavorites')?.remove();
    return;
  }
  installStyles();
  const app = document.getElementById('app');
  if (!app) return;
  let section = document.getElementById('customerLibraryFavorites');
  if (!section) {
    section = document.createElement('section');
    section.id = 'customerLibraryFavorites';
    section.className = 'customer-library';
    app.prepend(section);
  }

  const identity = identityCandidate();
  if (!identity) {
    section.innerHTML = `<div class="customer-library-shell"><div class="customer-library-head"><div><span class="customer-library-eyebrow">SUAS CRIAÇÕES</span><h2>Minhas canecas</h2><p>Canecas criadas ficam salvas automaticamente para você.</p></div></div><div class="customer-library-body"><form class="customer-library-recovery" id="customerLibraryRecovery"><label>WhatsApp com DDD<input type="tel" inputmode="tel" autocomplete="tel" id="customerLibraryPhone" placeholder="(65) 99999-9999" required></label><button type="submit">Recuperar minhas canecas</button><p class="customer-library-note">Use o mesmo WhatsApp informado quando criou a caneca. Seus favoritos deste aparelho também serão sincronizados.</p></form><div id="customerLibraryError"></div></div></div>`;
    section.querySelector('#customerLibraryRecovery')?.addEventListener('submit', async event => {
      event.preventDefault();
      const input = section.querySelector('#customerLibraryPhone');
      const errorBox = section.querySelector('#customerLibraryError');
      const button = event.currentTarget.querySelector('button');
      try {
        button.disabled = true;
        const saved = rememberIdentity(input?.value, '', 'recovery');
        await migrateKnownMugs(saved);
        const result = await syncFavorites(saved);
        await loadMugs(saved);
        if (result.changed) {
          try { sessionStorage.setItem(SESSION_RELOAD_KEY, '1'); } catch {}
          location.reload();
          return;
        }
        scheduleRender(0);
      } catch (error) {
        if (errorBox) errorBox.innerHTML = `<div class="customer-library-error">${escapeHtml(error?.message || error)}</div>`;
      } finally { button.disabled = false; }
    });
    return;
  }

  section.innerHTML = `<div class="customer-library-shell"><div class="customer-library-head"><div><span class="customer-library-eyebrow">SUAS CRIAÇÕES</span><h2>Minhas canecas</h2><p>As canecas que você cria são favoritadas e guardadas automaticamente.</p></div><div class="customer-library-identity"><span>WhatsApp ${escapeHtml(displayLast4(identity.phone))}</span><button type="button" class="customer-library-link" id="customerLibraryChangePhone">Trocar</button></div></div><div class="customer-library-body"><div class="customer-library-message customer-library-syncing" id="customerLibraryContent">Sincronizando suas criações…</div></div></div>`;
  section.querySelector('#customerLibraryChangePhone')?.addEventListener('click', () => {
    clearIdentity();
    scheduleRender(0);
  });

  const content = section.querySelector('#customerLibraryContent');
  try {
    await migrateKnownMugs(identity);
    const sync = await syncFavorites(identity);
    const mugs = await loadMugs(identity);
    if (sync.changed && !sessionStorage.getItem(SESSION_RELOAD_KEY)) {
      try { sessionStorage.setItem(SESSION_RELOAD_KEY, '1'); } catch {}
      location.reload();
      return;
    }
    try { sessionStorage.removeItem(SESSION_RELOAD_KEY); } catch {}
    if (!content) return;
    content.className = '';
    content.innerHTML = mugs.length
      ? `<div class="customer-mug-grid">${mugs.map(mugCard).join('')}</div><div class="customer-library-products-note">Seus produtos favoritos continuam logo abaixo. Quando o WhatsApp está identificado, eles também são sincronizados no Firebase.</div>`
      : `<div class="customer-library-message">Você ainda não tem canecas salvas neste WhatsApp. Quando criar uma, ela aparecerá aqui automaticamente.</div><div class="customer-library-products-note">Seus produtos favoritos continuam logo abaixo e também podem ser sincronizados por este WhatsApp.</div>`;
    content.querySelectorAll('[data-customer-mug-archive]').forEach(button => button.addEventListener('click', async () => {
      const id = button.dataset.customerMugArchive;
      button.disabled = true;
      await archiveMug(identity, id).catch(() => null);
      scheduleRender(0);
    }));
  } catch (error) {
    if (content) {
      content.className = '';
      content.innerHTML = `<div class="customer-library-error">Não foi possível sincronizar agora. Seus favoritos locais continuam disponíveis neste aparelho.</div>`;
    }
    console.debug('[Biblioteca cliente] render:', error?.message || error);
  }
}

async function bootstrap() {
  installStyles();
  const identity = identityCandidate();
  if (identity) {
    rememberIdentity(identity.phone, identity.name, identity.source);
    migrateKnownMugs(identity).then(() => syncFavorites(identity)).catch(() => null);
  }
  updateFavoriteBadges();
  scheduleRender(20);
}

window.addEventListener('da:mug-personalized-added', event => {
  const id = text(event.detail?.id);
  if (!id) return;
  window.setTimeout(() => captureMug(id).catch(error => console.debug('[Biblioteca cliente] captura:', error?.message || error)), 80);
});

window.addEventListener('hashchange', () => scheduleRender(30));
window.addEventListener('da:route-rendered', () => scheduleRender(30));
window.addEventListener('da:catalog-ready', () => scheduleRender(50));
window.addEventListener('da:catalog-refreshed', () => scheduleRender(50));

document.addEventListener('click', event => {
  const button = event.target.closest?.('[data-action="favorite"]');
  if (!button) return;
  const id = text(button.dataset.id);
  const kind = text(button.dataset.kind || 'product');
  const key = kind === 'kit' ? `kit:${id}` : id;
  window.setTimeout(async () => {
    const active = localFavorites().includes(key);
    updateFavoriteBadges();
    const identity = identityCandidate();
    if (!identity) return;
    await writeFavorite(identity, key, active).catch(error => console.debug('[Biblioteca cliente] favorito:', error?.message || error));
  }, 30);
});

const appObserver = new MutationObserver(() => {
  if (isFavoritesRoute() && !document.getElementById('customerLibraryFavorites')) scheduleRender(20);
});
const app = document.getElementById('app');
if (app) appObserver.observe(app, { childList: true });
else window.addEventListener('DOMContentLoaded', () => document.getElementById('app') && appObserver.observe(document.getElementById('app'), { childList: true }), { once: true });

window.__DA_CUSTOMER_LIBRARY__ = Object.freeze({
  build: BUILD,
  identify: (phone, name = '') => rememberIdentity(phone, name, 'api'),
  sync: async () => {
    const identity = identityCandidate();
    if (!identity) return { ok: false, reason: 'identity_missing' };
    const favorites = await syncFavorites(identity);
    const mugs = await loadMugs(identity);
    return { ok: true, favorites: favorites.items, mugs };
  },
  captureMug,
});

document.documentElement.dataset.customerLibrary = BUILD;
bootstrap();
console.info(`Favoritos + Minhas canecas · ${BUILD}`);

export { BUILD, captureMug, syncFavorites, renderFavoritesLibrary };
