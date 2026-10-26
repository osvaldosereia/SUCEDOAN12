(() => {
  'use strict';

  const ENDPOINT = 'https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-basket-guided-v1';
  const state = { basketId: '', model: null, categories: [], subcategories: [], positions: [] };
  const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
  const bridge = () => window.DonaAntoniaAdminBridge || {};
  const toast = message => typeof bridge().toast === 'function' ? bridge().toast(message) : console.warn(message);
  const operator = () => typeof bridge().operator === 'function' ? bridge().operator() || 'Operação' : 'Operação';

  async function call(action, payload = {}) {
    const token = await bridge().token?.();
    if (!token) throw new Error('Sessão administrativa indisponível.');
    const response = await fetch(ENDPOINT, {
      method: 'POST', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ action, ...payload })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      const error = new Error(data.message || data.error || 'Não foi possível salvar a cesta.');
      error.data = data;
      throw error;
    }
    return data;
  }

  function dialog() {
    let modal = document.getElementById('simpleBasketEditor');
    if (modal) return modal;
    const style = document.createElement('style');
    style.id = 'simpleBasketEditorStyles';
    style.textContent = `
      #simpleBasketEditor{width:min(96vw,980px);max-height:94vh;border:0;border-radius:14px;padding:0;color:#18221c;box-shadow:0 20px 70px #0004}
      #simpleBasketEditor::backdrop{background:#10181488}.simple-basket-head{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:12px;padding:14px;background:#fff;border-bottom:1px solid #e5e9e6}.simple-basket-head strong{flex:1;font-size:18px}
      .simple-basket-editor-body{padding:14px;background:#f7f8f7}.simple-basket-form,.simple-basket-positions{display:grid;gap:10px}.simple-basket-card{padding:14px;margin-bottom:12px;background:white;border:1px solid #e2e7e3;border-radius:12px}.simple-basket-card h3{margin:0 0 10px;font-size:16px}.simple-basket-card p{margin:0 0 10px;color:#66716a;font-size:12px}
      .simple-basket-form{grid-template-columns:1fr 1fr}.simple-basket-form label,.simple-basket-position label{display:grid;gap:4px;font-size:12px;font-weight:800}.simple-basket-form input,.simple-basket-form select,.simple-basket-position input{min-width:0;min-height:40px;padding:8px 10px;border:1px solid #dce2de;border-radius:8px;background:white}.simple-basket-wide{grid-column:1/-1}
      .simple-basket-position{display:grid;grid-template-columns:minmax(160px,1fr) 100px auto;gap:8px;align-items:end;padding:10px;border:1px solid #e1e6e2;border-radius:10px}.simple-basket-position-controls{display:flex;gap:6px}.simple-basket-product-list{display:flex;gap:8px;overflow:auto;padding:8px 0}.simple-basket-product{flex:0 0 170px;padding:9px;border:1px solid #e1e6e2;border-radius:10px;background:#fff}.simple-basket-product.selected{border:2px solid #176b43}.simple-basket-product img{width:100%;height:86px;object-fit:contain}.simple-basket-product strong,.simple-basket-product small{display:block}.simple-basket-product small{margin-top:5px;color:#66716a}.simple-basket-product button{width:100%;margin-top:8px}
      .simple-basket-summary{position:sticky;bottom:0;display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:12px;padding:10px;background:white;border:1px solid #dce2de;border-radius:10px;box-shadow:0 -4px 12px #0001}.simple-basket-summary span{display:grid;gap:3px;font-size:10px;color:#66716a}.simple-basket-summary strong{font-size:14px;color:#18221c}.simple-basket-actions{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:10px}.simple-basket-empty{padding:14px;text-align:center;color:#66716a}
      @media(max-width:640px){#simpleBasketEditor{width:100vw;max-width:none;height:100vh;max-height:100vh;border-radius:0}.simple-basket-form{grid-template-columns:1fr}.simple-basket-wide{grid-column:auto}.simple-basket-position{grid-template-columns:1fr 90px}.simple-basket-position-controls{grid-column:1/-1}.simple-basket-summary{grid-template-columns:1fr 1fr}}
    `;
    document.head.append(style);
    modal = document.createElement('dialog');
    modal.id = 'simpleBasketEditor';
    modal.innerHTML = '<div class="simple-basket-head"><strong id="simpleBasketTitle">Editar cesta</strong><button type="button" class="secondary" id="closeSimpleBasket">Fechar</button></div><div class="simple-basket-editor-body" id="simpleBasketBody"></div>';
    document.body.append(modal);
    modal.querySelector('#closeSimpleBasket').addEventListener('click', () => modal.close());
    return modal;
  }

  function normalizePosition(position, index) {
    return {
      ...position,
      id: position.id || null,
      product_id: position.product_id || null,
      product_name: position.product_name || '',
      position_label: position.position_label || position.product_name || '',
      family_key: position.family_key || null,
      search_query: position.search_query || position.product_name || position.position_label || '',
      quantity: Number(position.quantity || 1),
      removable: position.removable !== false,
      quantity_editable: position.quantity_editable !== false,
      min_quantity: Number(position.min_quantity || 0),
      max_quantity: position.max_quantity == null ? null : Number(position.max_quantity),
      remove_unit_delta: position.remove_unit_delta == null ? null : Number(position.remove_unit_delta),
      add_unit_delta: position.add_unit_delta == null ? null : Number(position.add_unit_delta),
      sort_order: index,
      catalog: [], next_offset: null, loading: false,
      selectedProduct: position.product_id ? {
        id: position.product_id, name: position.product_name || '',
        sale_price: Number(position.price || 0), cost_price: null
      } : null
    };
  }

  async function loadModel() {
    const result = await call('model_editor', { basket_id: state.basketId });
    state.model = result.editor || result.model || {};
    state.categories = Array.isArray(result.categories) ? result.categories : [];
    state.subcategories = Array.isArray(result.subcategories) ? result.subcategories : [];
    state.positions = (state.model.positions || []).map(normalizePosition);
  }

  function categoryOptions(selected) {
    return state.categories.map(category => '<option value="' + esc(category.id) + '" ' +
      (String(category.id) === String(selected || '') ? 'selected' : '') + '>' + esc(category.name) + '</option>').join('');
  }

  function subcategoryOptions(categoryId, selected) {
    return state.subcategories.filter(item => String(item.category_id) === String(categoryId || '')).map(item =>
      '<option value="' + esc(item.id) + '" ' + (String(item.id) === String(selected || '') ? 'selected' : '') + '>' + esc(item.name) + '</option>').join('');
  }

  function currentForm() {
    const root = document.getElementById('simpleBasketBody');
    const basket = state.model?.basket || {};
    const categoryId = root.querySelector('#basketCategory')?.value || basket.category_id || '';
    return {
      name: root.querySelector('#basketName')?.value.trim() || '',
      category_id: categoryId,
      subcategory_id: root.querySelector('#basketSubcategory')?.value || '',
      base_price: Number(String(root.querySelector('#basketPrice')?.value || '0').replace(',', '.')),
      image_url: root.querySelector('#basketImage')?.value.trim() || ''
    };
  }

  function selectedProduct(position) {
    return position.selectedProduct || { name: position.product_name, sale_price: 0, cost_price: null };
  }

  function summary() {
    let cost = 0, sale = 0, known = true;
    for (const position of state.positions) {
      const product = selectedProduct(position), quantity = Number(position.quantity || 0);
      sale += Number(product.sale_price || 0) * quantity;
      if (product.cost_price == null || !Number.isFinite(Number(product.cost_price))) known = false;
      else cost += Number(product.cost_price) * quantity;
    }
    const final = Number(currentForm().base_price || 0);
    return '<div class="simple-basket-summary">' +
      '<span>Custo interno<strong>' + (known ? money(cost) : '—') + '</strong></span>' +
      '<span>Venda dos itens<strong>' + money(sale) + '</strong></span>' +
      '<span>Valor da cesta<strong>' + money(final) + '</strong></span>' +
      '<span>Valor oculto<strong>' + money(final - sale) + '</strong></span></div>';
  }

  function productCard(product, position, index) {
    const active = String(position.product_id) === String(product.id);
    const enabled = product.selectable !== false || active;
    return '<article class="simple-basket-product ' + (active ? 'selected' : '') + '">' +
      '<img src="' + esc(product.image_url || '/img/sem-foto.svg') + '" alt="">' +
      '<strong>' + esc(product.name) + '</strong><small>Custo interno: ' + money(product.cost_price) + '<br>Venda: ' + money(product.sale_price) + '</small>' +
      '<button type="button" class="' + (active ? 'secondary' : 'primary') + '" data-select-product="' + index + '" data-product-id="' + esc(product.id) + '" ' + (!enabled ? 'disabled' : '') + '>' +
      (active ? 'Selecionado' : 'Selecionar') + '</button></article>';
  }

  function positionHtml(position, index) {
    const chosen = position.selectedProduct ? '<p>Produto atual: <strong>' + esc(position.selectedProduct.name || position.product_name || 'Produto') + '</strong></p>' : '';
    const products = (position.catalog || []).map(product => productCard(product, position, index)).join('');
    return '<section class="simple-basket-card simple-basket-position-card" data-position="' + index + '">' +
      '<div class="simple-basket-position"><label>Item da cesta<input data-position-name value="' + esc(position.position_label) + '" placeholder="Ex.: Arroz"></label>' +
      '<label>Quantidade<input data-position-quantity type="number" min="0.001" max="100" step="0.001" value="' + esc(position.quantity) + '"></label>' +
      '<div class="simple-basket-position-controls"><button type="button" class="secondary" data-search-products="' + index + '" ' + (position.loading ? 'disabled' : '') + '>Buscar produtos</button>' +
      (position.next_offset != null ? '<button type="button" class="secondary" data-more-products="' + index + '">Mais</button>' : '') +
      '<button type="button" class="text danger" data-remove-position="' + index + '">Remover</button></div></div>' + chosen +
      '<div class="simple-basket-product-list">' + (products || '<div class="simple-basket-empty">Use “Buscar produtos” para escolher o item.</div>') + '</div></section>';
  }

  function render() {
    const modal = dialog(), basket = state.model?.basket || {}, form = currentForm();
    modal.querySelector('#simpleBasketTitle').textContent = (basket.name || 'Cesta') + ' · composição';
    modal.querySelector('#simpleBasketBody').innerHTML = '<section class="simple-basket-card"><h3>Dados da cesta</h3>' +
      '<div class="simple-basket-form"><label class="simple-basket-wide">Nome<input id="basketName" maxlength="180" value="' + esc(form.name || basket.name || '') + '"></label>' +
      '<label>Categoria<select id="basketCategory"><option value="">Selecione</option>' + categoryOptions(form.category_id || basket.category_id) + '</select></label>' +
      '<label>Subcategoria<select id="basketSubcategory"><option value="">Selecione</option>' + subcategoryOptions(form.category_id || basket.category_id, form.subcategory_id || basket.subcategory_id) + '</select></label>' +
      '<label>Valor da cesta<input id="basketPrice" type="number" min="0" step="0.01" value="' + esc(Number(form.base_price ?? basket.base_price ?? 0).toFixed(2)) + '"></label>' +
      '<label>Imagem (URL)<input id="basketImage" maxlength="1000" value="' + esc(form.image_url || basket.image_url || '') + '"></label></div></section>' +
      '<section class="simple-basket-card"><h3>Composição</h3><p>Escolha os produtos e quantidades que formam a cesta.</p>' +
      '<div class="simple-basket-actions"><button type="button" class="secondary" id="addBasketPosition">+ Adicionar item</button><button type="button" class="primary" id="saveBasketModel">Salvar cesta</button></div>' +
      '<div class="simple-basket-positions">' + (state.positions.map(positionHtml).join('') || '<div class="simple-basket-empty">Adicione o primeiro item da cesta.</div>') + '</div>' + summary() + '</section>';
    bind(modal);
  }

  function syncPositions() {
    document.querySelectorAll('#simpleBasketBody [data-position]').forEach(element => {
      const position = state.positions[Number(element.dataset.position)];
      if (!position) return;
      const name = element.querySelector('[data-position-name]')?.value.trim();
      const quantity = Number(element.querySelector('[data-position-quantity]')?.value || 1);
      if (name) {
        position.position_label = name;
        if (!position.family_key) position.search_query = name;
      }
      if (quantity > 0) position.quantity = quantity;
    });
  }

  function bind(modal) {
    const root = modal.querySelector('#simpleBasketBody');
    root.querySelector('#basketCategory')?.addEventListener('change', event => {
      const subcategory = root.querySelector('#basketSubcategory');
      subcategory.innerHTML = '<option value="">Selecione</option>' + subcategoryOptions(event.target.value, '');
    });
    root.querySelector('#basketPrice')?.addEventListener('input', () => {
      const box = root.querySelector('.simple-basket-summary');
      if (box) box.outerHTML = summary();
    });
    root.querySelector('#addBasketPosition')?.addEventListener('click', () => {
      const name = prompt('Qual item deve entrar na cesta?');
      if (!name?.trim()) return;
      syncPositions();
      state.positions.push(normalizePosition({ position_label: name.trim(), search_query: name.trim(), quantity: 1, removable: true, quantity_editable: true }, state.positions.length));
      render();
      void loadProducts(state.positions.length - 1);
    });
    root.querySelector('#saveBasketModel')?.addEventListener('click', save);
    root.querySelectorAll('[data-search-products]').forEach(button => button.addEventListener('click', () => {
      syncPositions(); void loadProducts(Number(button.dataset.searchProducts));
    }));
    root.querySelectorAll('[data-more-products]').forEach(button => button.addEventListener('click', () => {
      const index = Number(button.dataset.moreProducts); void loadProducts(index, state.positions[index]?.next_offset || 0);
    }));
    root.querySelectorAll('[data-remove-position]').forEach(button => button.addEventListener('click', () => {
      syncPositions(); state.positions.splice(Number(button.dataset.removePosition), 1); render();
    }));
    root.querySelectorAll('[data-select-product]').forEach(button => button.addEventListener('click', () => {
      syncPositions();
      const index = Number(button.dataset.selectProduct), position = state.positions[index];
      const product = position?.catalog.find(item => String(item.id) === String(button.dataset.productId));
      if (!position || !product) return;
      if (product.selectable === false && String(position.product_id) !== String(product.id)) {
        toast('Este produto está sem estoque avulso.'); return;
      }
      position.product_id = product.id;
      position.product_name = product.name;
      position.selectedProduct = product;
      render();
    }));
  }

  async function loadProducts(index, offset = 0) {
    const position = state.positions[index];
    if (!position || position.loading) return;
    position.loading = true;
    render();
    try {
      const result = await call('position_products', {
        kit_template_item_id: position.id,
        family_key: position.family_key,
        q: position.search_query || position.position_label,
        limit: 12, offset
      });
      const products = result.products || [];
      position.catalog = offset ? [...position.catalog, ...products] : products;
      position.next_offset = result.next_offset ?? null;
      const selected = position.catalog.find(product => String(product.id) === String(position.product_id));
      if (selected) position.selectedProduct = selected;
      else if (position.product_id && typeof bridge().api === 'function') {
        const detail = await bridge().api('product_detail', { id: position.product_id });
        const product = detail.product || {};
        position.selectedProduct = {
          id: position.product_id,
          name: position.product_name || product.name || '',
          cost_price: Number(product.cost_cents || 0) / 100,
          sale_price: Number(product.sale_price_cents || 0) / 100
        };
      }
    } catch (error) {
      toast(error.data?.message || error.message || 'Não foi possível buscar produtos.');
    } finally {
      position.loading = false;
      render();
    }
  }

  function validate() {
    syncPositions();
    const form = currentForm();
    if (!form.name || !form.category_id || !form.subcategory_id || !Number.isFinite(form.base_price) || form.base_price < 0) {
      toast('Preencha nome, categoria, subcategoria e valor da cesta.'); return false;
    }
    if (!state.positions.length || state.positions.some(position => !position.position_label || !position.product_id || !(position.quantity > 0))) {
      toast('Confira os itens, produtos e quantidades da composição.'); return false;
    }
    const repeated = new Map();
    state.positions.forEach((position, index) => {
      const group = repeated.get(position.product_id) || [];
      group.push(index); repeated.set(position.product_id, group);
    });
    const duplicates = [...repeated.values()].filter(group => group.length > 1);
    if (duplicates.length && !confirm('O mesmo produto aparece em mais de um item. Deseja continuar?')) return false;
    return { form, duplicateIndexes: new Set(duplicates.flat()) };
  }

  async function save() {
    const valid = validate();
    if (!valid) return;
    const button = document.getElementById('saveBasketModel');
    button.disabled = true;
    button.textContent = 'Salvando…';
    const positions = state.positions.map((position, index) => ({
      id: position.id || null, product_id: position.product_id,
      position_label: position.position_label, family_key: position.family_key || null,
      search_query: position.family_key ? null : position.search_query || position.position_label,
      quantity: Number(position.quantity), removable: position.removable,
      quantity_editable: position.quantity_editable, min_quantity: Number(position.min_quantity || 0),
      max_quantity: position.max_quantity == null ? null : Number(position.max_quantity),
      remove_unit_delta: position.remove_unit_delta, add_unit_delta: position.add_unit_delta,
      duplicate_confirmed: valid.duplicateIndexes.has(index), sort_order: index
    }));
    try {
      await call('model_save', { basket_id: state.basketId, commercial: valid.form, positions, operator: operator() });
      await loadModel();
      toast('Cesta salva.');
      render();
      await bridge().refresh?.();
    } catch (error) {
      toast(error.data?.message || error.message || 'Não foi possível salvar a cesta.');
      button.disabled = false;
      button.textContent = 'Salvar cesta';
    }
  }

  async function open(basketId) {
    if (!basketId) return;
    state.basketId = String(basketId);
    state.model = null; state.positions = [];
    const modal = dialog();
    modal.querySelector('#simpleBasketBody').innerHTML = '<div class="simple-basket-empty">Carregando composição…</div>';
    if (!modal.open) modal.showModal();
    try {
      await loadModel();
      render();
      await Promise.all(state.positions.map((_, index) => loadProducts(index)));
    } catch (error) {
      modal.querySelector('#simpleBasketBody').innerHTML = '<div class="simple-basket-empty">' + esc(error.data?.message || error.message || 'Não foi possível abrir a cesta.') + '</div>';
    }
  }

  window.DonaAntoniaBasketGuided = { open };
})();
