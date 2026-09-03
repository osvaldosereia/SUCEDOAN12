(() => {
  'use strict';

  const BUILD = '20260903-personalized-order-link-hardening-v1';
  const FIREBASE = 'https://cedar-chemist-310801-default-rtdb.firebaseio.com';
  const STORAGE_KEY = 'cf_personalized_cart_v2';
  const RECENT_MS = 12 * 60 * 60 * 1000;

  if (window.__CF_PERSONALIZED_ORDER_LINK_HARDENING__ === BUILD) return;
  window.__CF_PERSONALIZED_ORDER_LINK_HARDENING__ = BUILD;

  const text = value => String(value ?? '').trim();
  const safeKey = value => text(value).replace(/[.#$\[\]/]/g, '_');

  function readQueue() {
    try {
      const rows = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      const cutoff = Date.now() - RECENT_MS;
      return (Array.isArray(rows) ? rows : []).filter(row => row && /^CF-/i.test(text(row.code)) && Number(row.addedAt || 0) >= cutoff);
    } catch { return []; }
  }
  function saveQueue(rows) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(rows.slice(-50))); } catch {}
  }
  async function patchFirebase(path, data) {
    const response = await fetch(`${FIREBASE}/${path}.json`, {
      method:'PATCH',
      headers:{ 'Content-Type':'application/json', Accept:'application/json' },
      body:JSON.stringify(data)
    });
    if (!response.ok) throw new Error(`Firebase ${response.status}`);
    return response.json().catch(() => null);
  }

  function productIdFromElement(element) {
    if (!element) return '';
    const direct = text(element.dataset?.produtoId || element.dataset?.productId || element.getAttribute?.('data-produto-id') || element.getAttribute?.('data-product-id'));
    if (/^\d+$/.test(direct)) return direct;
    const html = element.innerHTML || '';
    return html.match(/\/carrinho\/produto\/(\d+)\/(?:adicionar|remover|atualizar)/i)?.[1]
      || html.match(/[?&](?:produto|produto_id|id_produto)=(\d+)/i)?.[1] || '';
  }
  function visibleProductIds() {
    const selectors = ['.carrinho .item','.item-produto','.produto-carrinho','[data-produto-id]','[data-product-id]','tr'];
    const ids = new Set();
    for (const selector of selectors) document.querySelectorAll(selector).forEach(node => {
      const id = productIdFromElement(node); if (id) ids.add(id);
    });
    return ids;
  }
  function currentEntries() {
    const rows = readQueue();
    const visible = visibleProductIds();
    if (visible.size) return rows.filter(row => visible.has(text(row.productId)));
    return rows.filter(row => ['carrinho','verificar','pedido_identificado'].includes(text(row.status || 'carrinho')));
  }
  function findCommentField() {
    const selectors = [
      'textarea[name="cliente_obs"]','#id_cliente_obs','textarea[name*="cliente_obs" i]',
      'textarea[name*="coment" i]','textarea[id*="coment" i]','textarea[name*="observ" i]','textarea[id*="observ" i]',
      'input[name="cliente_obs"]','input[name*="coment" i]','input[name*="observ" i]'
    ];
    for (const selector of selectors) { const node = document.querySelector(selector); if (node) return node; }
    return null;
  }
  function fillComment() {
    const entries = currentEntries(); if (!entries.length) return false;
    const field = findCommentField(); if (!field) return false;
    const codes = [...new Set(entries.map(entry => text(entry.code).toUpperCase()).filter(Boolean))];
    if (!codes.length) return false;
    const marker = `CanecaFácil PERSONALIZADA: ${codes.join(', ')}`;
    const current = text(field.value);
    const next = /CanecaFácil PERSONALIZADA:[^\n\r]*/i.test(current)
      ? current.replace(/CanecaFácil PERSONALIZADA:[^\n\r]*/i, marker)
      : [current, marker].filter(Boolean).join('\n');
    if (field.value === next) return true;
    field.value = next;
    field.dispatchEvent(new Event('input', { bubbles:true }));
    field.dispatchEvent(new Event('change', { bubbles:true }));
    document.documentElement.dataset.cfOrderLinkComment = 'filled';
    return true;
  }
  function detectOrderId() {
    const params = new URLSearchParams(location.search);
    for (const key of ['pedido_id','pedido','order_id','order']) {
      const value = text(params.get(key)); if (/^\d+$/.test(value)) return value;
    }
    const path = location.pathname.match(/\/(?:pedido|pedidos|order|orders)\/(\d+)/i)?.[1];
    if (path) return path;
    const bodyText = text(document.body?.innerText).slice(0, 16000);
    return bodyText.match(/(?:pedido|ordem)\s*(?:n[º°o.]*)?\s*#?\s*(\d{3,})/i)?.[1] || '';
  }
  async function recordOrderHint() {
    const orderId = detectOrderId(); if (!orderId) return false;
    const queue = currentEntries(); if (!queue.length) return false;
    const now = new Date().toISOString();
    const stored = readQueue();
    const tasks = [];
    for (const entry of queue) {
      const code = text(entry.code).toUpperCase();
      const row = stored.find(item => text(item.code).toUpperCase() === code);
      if (row) { row.status='pedido_identificado'; row.orderId=orderId; row.updatedAt=Date.now(); }
      tasks.push(
        patchFirebase(`canecas/encomendas_pendentes/${safeKey(code)}`, { status:'pedido_identificado', pedido_id_hint:orderId, atualizado_em:now }),
        patchFirebase(`canecas/personalizadas/${safeKey(code)}/encomenda`, { status:'pedido_identificado', pedido_id_hint:orderId, atualizado_em:now })
      );
    }
    await Promise.all(tasks);
    saveQueue(stored);
    document.documentElement.dataset.cfOrderLinkHint = orderId;
    return true;
  }

  let runs = 0, hintDone = false;
  async function tick() {
    runs += 1;
    fillComment();
    if (!hintDone) {
      try { hintDone = await recordOrderHint(); }
      catch (error) { console.debug('[CanecaFácil] vínculo do pedido:', error?.message || error); }
    }
    if (runs >= 80 || hintDone) clearInterval(timer);
  }
  const timer = setInterval(() => void tick(), 500);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => void tick(), { once:true });
  else void tick();

  document.documentElement.dataset.cfPersonalizedOrderLinkHardening = BUILD;
  console.info(`CanecaFácil · vínculo forte CF-ID ${BUILD}`);
})();