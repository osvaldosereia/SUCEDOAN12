(() => {
  'use strict';

  const state = { baskets: [], loading: false };
  const host = () => document.querySelector('#content');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
  const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
  const bridge = () => window.DonaAntoniaAdminBridge || {};
  const toast = message => typeof bridge().toast === 'function' ? bridge().toast(message) : console.warn(message);

  function render() {
    const root = host();
    if (!root) return;
    const rows = state.baskets.map(basket => '<article class="simple-basket-row">' +
      (basket.image_url ? '<img src="' + esc(basket.image_url) + '" alt="">' : '<span class="simple-basket-image">Cesta</span>') +
      '<div class="simple-basket-info"><strong>' + esc(basket.name || 'Cesta sem nome') + '</strong>' +
      '<small>' + (basket.is_active === false ? 'Inativa' : 'Ativa') + ' · ' + Number(basket.template_item_count || 0) + ' itens</small></div>' +
      '<strong class="simple-basket-price">' + money(basket.base_price) + '</strong>' +
      '<button type="button" class="primary" data-edit-basket="' + esc(basket.id) + '">Editar composição</button></article>').join('');

    root.innerHTML = '<div class="page-head"><div><h1>Cestas</h1><p>Composição, custo interno e preço final.</p></div>' +
      '<button type="button" class="secondary" id="refreshBaskets" ' + (state.loading ? 'disabled' : '') + '>Atualizar</button></div>' +
      '<div class="panel simple-basket-list">' + (state.loading ? '<div class="loading">Carregando cestas…</div>' :
        rows || '<div class="empty">Nenhuma cesta cadastrada.</div>') + '</div>';
    root.querySelector('#refreshBaskets')?.addEventListener('click', refresh);
    root.querySelectorAll('[data-edit-basket]').forEach(button => button.addEventListener('click', () => {
      const id = button.dataset.editBasket;
      if (window.DonaAntoniaBasketGuided?.open) void window.DonaAntoniaBasketGuided.open(id);
      else toast('O editor de composição não carregou. Atualize a página.');
    }));
  }

  async function refresh() {
    const api = bridge().api;
    if (typeof api !== 'function' || state.loading) return;
    state.loading = true;
    render();
    try {
      const result = await api('baskets_admin');
      state.baskets = Array.isArray(result.baskets) ? result.baskets : [];
    } catch (error) {
      toast(error.message || 'Não foi possível carregar as cestas.');
    } finally {
      state.loading = false;
      render();
    }
  }

  async function renderSection() {
    render();
    await refresh();
  }

  window.DonaAntoniaBasketAdmin = { render: renderSection, refresh };
})();
