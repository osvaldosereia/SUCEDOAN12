(() => {
  'use strict';

  const BUILD = '20260901-admin-creation-order-status-v1';
  const FIREBASE = 'https://cedar-chemist-310801-default-rtdb.firebaseio.com';
  const CREATIONS = 'canecas/personalizadas';

  if (window.__CF_CREATION_ORDER_STATUS__ === BUILD) return;
  window.__CF_CREATION_ORDER_STATUS__ = BUILD;

  const text = value => String(value ?? '').trim();
  const safeKey = value => text(value).replace(/[.#$\[\]/]/g, '_');
  const esc = value => String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');

  async function fetchCreation(id) {
    const response = await fetch(`${FIREBASE}/${CREATIONS}/${safeKey(id)}.json?_=${Date.now()}`, { cache:'no-store', headers:{ Accept:'application/json' } });
    if (!response.ok) throw new Error(`Firebase ${response.status}`);
    return response.json();
  }

  function statusLabel(creation = {}) {
    const status = text(creation?.encomenda?.status || creation.atendimento_status || creation.status || 'arte_pronta').toLowerCase();
    if (/paga/.test(status)) return 'Paga · pronta para produção';
    if (/pedido_criado|vinculad|encomend/.test(status)) return 'Encomendada';
    if (/carrinho|aguardando_pedido|encomendando/.test(status)) return 'No carrinho / aguardando pedido';
    if (/cancel/.test(status)) return 'Pedido cancelado';
    if (/gerando/.test(status)) return 'Gerando arte';
    return 'Arte criada · ainda não encomendada';
  }

  async function enhance(id) {
    const drawer = document.getElementById('drawerContent');
    if (!drawer || !id) return;
    try {
      const creation = await fetchCreation(id);
      if (!creation || drawer.querySelector('[data-cf-encomenda-status]')) return;
      const orderId = text(creation.pedido_id || creation.pedido_loja_integrada_id || creation?.encomenda?.pedido_id);
      const block = document.createElement('div');
      block.className = 'form-section';
      block.dataset.cfEncomendaStatus = BUILD;
      block.innerHTML = `<h3>Encomenda</h3><div class="notice"><b>${esc(statusLabel(creation))}</b><br>Código da arte: <b>${esc(id)}</b>${orderId ? `<br>Pedido Loja Integrada: <b>${esc(orderId)}</b>` : '<br>Esta criação permanece em Minhas Artes até o cliente comprar.'}</div>${orderId ? '<div class="mini-actions" style="margin-top:8px"><button class="secondary" type="button" data-cf-open-order>Ver em Pedidos</button></div>' : ''}`;
      const actions = drawer.querySelector('.drawer-actions');
      if (actions) drawer.insertBefore(block, actions);
      else drawer.appendChild(block);
      block.querySelector('[data-cf-open-order]')?.addEventListener('click', () => document.querySelector('#nav [data-route="orders"]')?.click());
    } catch (error) {
      console.debug('[Admin Canecas] status da encomenda:', error?.message || error);
    }
  }

  document.addEventListener('click', event => {
    const button = event.target?.closest?.('[data-creation]');
    if (!button) return;
    const id = text(button.dataset.creation);
    setTimeout(() => enhance(id), 80);
  });

  console.info(`Admin Canecas · vínculo criação/pedido ${BUILD}`);
})();
