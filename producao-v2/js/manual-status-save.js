(() => {
  'use strict';

  const CONFIG_KEY = 'da_admin_v2_config';
  const DEFAULT_FIREBASE_URL = 'https://cedar-chemist-310801-default-rtdb.firebaseio.com';
  const pending = new Map();
  let selectedEditorKey = '';

  const text = value => String(value ?? '').trim();

  function config() {
    try {
      return {
        firebaseUrl: DEFAULT_FIREBASE_URL,
        productsNode: 'produtos',
        ...JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}'),
      };
    } catch {
      return { firebaseUrl: DEFAULT_FIREBASE_URL, productsNode: 'produtos' };
    }
  }

  function productUrl(key) {
    const current = config();
    const base = text(current.firebaseUrl || DEFAULT_FIREBASE_URL).replace(/\/+$/, '');
    const node = text(current.productsNode || 'produtos').replace(/^\/+|\/+$/g, '').replace(/\.json$/i, '');
    return `${base}/${node}/${encodeURIComponent(key)}.json`;
  }

  function toast(message, type = '') {
    const region = document.getElementById('toastRegion');
    if (!region || !message) return;
    const normalized = text(message);
    if ([...region.querySelectorAll('.toast')].some(node => node.textContent === normalized)) return;
    const node = document.createElement('div');
    node.className = `toast ${type}`.trim();
    node.textContent = normalized;
    region.appendChild(node);
    setTimeout(() => node.remove(), type === 'error' ? 7000 : 4200);
  }

  function matchesStatus(product, active) {
    if (!product || typeof product !== 'object') return false;
    const wanted = active ? 'A' : 'I';
    return text(product.situacao).toUpperCase() === wanted
      && text(product.status).toUpperCase() === wanted
      && product.ativo === active
      && product.visivel === active
      && text(product.situacao_manual_override).toUpperCase() === wanted;
  }

  async function request(url, options = {}, timeout = 20000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { cache: 'no-store', ...options, signal: controller.signal });
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`Firebase retornou ${response.status}${detail ? `: ${detail.slice(0, 180)}` : ''}`);
      }
      return response.status === 204 ? null : response.json().catch(() => null);
    } finally {
      clearTimeout(timer);
    }
  }

  async function persistStatus(key, active, { announce = true } = {}) {
    const normalizedKey = text(key);
    if (!normalizedKey) throw new Error('Produto sem chave para salvar o status.');
    const wanted = active ? 'A' : 'I';
    const timestamp = new Date().toISOString();
    const payload = {
      situacao: wanted,
      status: wanted,
      ativo: active,
      visivel: active,
      situacao_manual_override: wanted,
      situacao_manual_em: timestamp,
      situacao_manual_origem: 'admin-produtivo',
      updated_at: timestamp,
      last_update: Date.now(),
    };

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      await request(productUrl(normalizedKey), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const verified = await request(`${productUrl(normalizedKey)}?_verify_status=${Date.now()}`);
      if (matchesStatus(verified, active)) {
        pending.delete(normalizedKey);
        window.dispatchEvent(new CustomEvent('admin-v2-status-confirmed', {
          detail: { key: normalizedKey, active, product: verified },
        }));
        if (announce) toast(`Status ${active ? 'Ativo' : 'Inativo'} confirmado no Firebase.`, 'success');
        return verified;
      }
      if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 350));
    }
    throw new Error('O Firebase não confirmou o status escolhido. A alteração não foi considerada salva.');
  }

  function statusFromRow(button) {
    const row = button?.closest('tr');
    const select = row?.querySelector('[data-inline-field="situacao"]');
    if (!select) return null;
    return select.value !== 'I';
  }

  function schedulePersistence(key, active) {
    const normalizedKey = text(key);
    if (!normalizedKey || typeof active !== 'boolean') return;
    pending.set(normalizedKey, active);
    setTimeout(() => {
      if (pending.get(normalizedKey) !== active) return;
      persistStatus(normalizedKey, active).catch(error => {
        console.error(error);
        toast(error?.message || String(error), 'error');
      });
    }, 650);
  }

  document.addEventListener('click', event => {
    const open = event.target.closest?.('[data-product-key]');
    if (open) selectedEditorKey = text(open.dataset.productKey);

    const inlineSave = event.target.closest?.('[data-inline-save]');
    if (inlineSave) {
      const key = text(inlineSave.dataset.inlineSave);
      const active = statusFromRow(inlineSave);
      if (typeof active === 'boolean') schedulePersistence(key, active);
      return;
    }

    if (event.target.closest?.('#saveProductButton') && selectedEditorKey) {
      const select = document.querySelector('#productForm [data-field="situacao"]');
      if (select) schedulePersistence(selectedEditorKey, select.value !== 'I');
    }
  });

  document.addEventListener('change', event => {
    const inline = event.target.closest?.('[data-inline-product][data-inline-field="situacao"]');
    if (inline) {
      pending.set(text(inline.dataset.inlineProduct), inline.value !== 'I');
      return;
    }
    if (event.target.matches?.('#productForm [data-field="situacao"]') && selectedEditorKey) {
      pending.set(selectedEditorKey, event.target.value !== 'I');
    }
  }, true);

  window.adminV2ConfirmProductStatus = (key, active) => persistStatus(key, Boolean(active));
})();
