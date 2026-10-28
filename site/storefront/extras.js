(() => {
  "use strict";

  const EXTRA_CATEGORIES = [
    { key: "mercearia", label: "Mercearia" },
    { key: "limpeza_lavanderia", label: "Limpeza e lavanderia" },
    { key: "higiene_beleza", label: "Higiene e beleza" },
    { key: "casa_pet", label: "Casa e pet" }
  ];

  function create({ state, $, esc, money, request, toast }) {
    function extraTotalCents(data) {
      const selections = data && data.extraSelections instanceof Map ? data.extraSelections : new Map();
      return Array.from(selections.values()).reduce((total, item) =>
        total + Math.max(0, Number(item.price_cents || 0)) * Math.max(0, Math.trunc(Number(item.quantity || 0))), 0);
    }
  
    function displayedTotalCents(data) {
      return Math.max(0, Number(data && data.totalCents || 0)) + extraTotalCents(data);
    }
  
    function extraCategoriesFor(data) {
      if (!Array.isArray(data.extraCategories)) {
        data.extraCategories = EXTRA_CATEGORIES.map((category) => ({
          key: category.key, label: category.label, expanded: false, loaded: false,
          loading: false, error: false, products: [], nextOffset: 0, hasMore: true
        }));
      }
      if (!(data.extraSelections instanceof Map)) data.extraSelections = new Map();
      return data.extraCategories;
    }
  
    function extraProductMarkup(data, product) {
      const id = String(product.id || "");
      const selected = data.extraSelections.get(id);
      const quantity = selected ? Number(selected.quantity || 0) : 0;
      const stock = Math.max(0, Number(product.stock_quantity || 0));
      return '<article class="extra-product-card" role="listitem" data-extra-product="' + esc(id) + '">' +
        '<img src="' + esc(product.image_url || "../img/logoantonia5.png") + '" alt="" width="52" height="52" loading="lazy" decoding="async">' +
        '<div class="extra-product-copy"><strong>' + esc(product.name || "Produto") + '</strong><span>' + esc(money(product.price_cents)) + '</span>' +
        '<div class="extra-quantity"><span>Quantidade:</span><div class="quantity-stepper">' +
        '<button class="quantity-button" type="button" data-extra-adjust="' + esc(id) + '" data-delta="-1" aria-label="Diminuir ' + esc(product.name || "produto") + '"' + (quantity <= 0 ? " disabled" : "") + '>−</button>' +
        '<output class="quantity-value" data-extra-quantity="' + esc(id) + '" aria-live="polite">' + quantity + '</output>' +
        '<button class="quantity-button" type="button" data-extra-adjust="' + esc(id) + '" data-delta="1" aria-label="Adicionar ' + esc(product.name || "produto") + '"' + (quantity >= stock ? " disabled" : "") + '>+</button>' +
        '</div></div></div></article>';
    }
  
    function extraCategoriesMarkup(data) {
      const categories = extraCategoriesFor(data);
      return '<section class="extras-section" aria-labelledby="extras-title"><h3 id="extras-title">Produtos Extras</h3><div class="extra-category-list">' +
        categories.map((category) => {
          const panelId = "extra-panel-" + category.key;
          const status = category.loading
            ? category.products.length ? "Carregando mais produtos…" : "Carregando produtos…"
            : category.error ? "Não foi possível carregar. Toque na categoria para tentar novamente."
              : category.loaded && !category.products.length ? "Nenhum produto disponível nesta categoria."
                : "";
          const products = category.products.map((product) => extraProductMarkup(data, product)).join("");
          return '<section class="extra-category" data-extra-category-card="' + esc(category.key) + '">' +
            '<button class="extra-category-toggle" type="button" data-extra-category="' + esc(category.key) + '" aria-expanded="' + String(category.expanded) + '" aria-controls="' + esc(panelId) + '">' +
            '<span>' + esc(category.label) + '</span><span class="variation-chevron" aria-hidden="true">' + (category.expanded ? "−" : "+") + '</span></button>' +
            '<div class="extra-category-panel" id="' + esc(panelId) + '"' + (category.expanded ? "" : " hidden") + '>' +
            '<div class="extra-product-scroll" data-extra-scroll="' + esc(category.key) + '" role="list" aria-label="Produtos de ' + esc(category.label) + '">' + products + '</div>' +
            '<p class="extra-product-status" data-extra-status="' + esc(category.key) + '" role="status">' + esc(status) + '</p></div></section>';
        }).join("") + '</div></section>';
    }
  
  
    function bindExtraProductControls(container) {
      container.querySelectorAll("[data-extra-adjust]").forEach((button) => {
        button.addEventListener("click", () => changeExtraQuantity(button.dataset.extraAdjust, Number(button.dataset.delta || 0), button));
      });
    }
  
    function toggleExtraCategory(categoryKey) {
      const data = state.baskets.get(state.activeKey);
      const category = data && extraCategoriesFor(data).find((entry) => entry.key === String(categoryKey));
      if (!data || !category) return;
      category.expanded = !category.expanded;
      const content = $("detail-content");
      const button = content.querySelector('[data-extra-category="' + category.key + '"]');
      const scroll = content.querySelector('[data-extra-scroll="' + category.key + '"]');
      const panel = scroll && scroll.parentElement;
      if (button) {
        button.setAttribute("aria-expanded", String(category.expanded));
        const icon = button.querySelector(".variation-chevron");
        if (icon) icon.textContent = category.expanded ? "−" : "+";
      }
      if (panel) panel.hidden = !category.expanded;
      if (category.expanded && (!category.loaded || category.error)) {
        loadExtraCategory(data, category, scroll);
      }
    }
  
    function loadMoreExtraProducts(categoryKey, scrollElement) {
      const data = state.baskets.get(state.activeKey);
      const category = data && extraCategoriesFor(data).find((entry) => entry.key === String(categoryKey));
      if (category && category.expanded && category.loaded && category.hasMore) {
        loadExtraCategory(data, category, scrollElement);
      }
    }
  
    async function loadExtraCategory(data, category, scrollElement) {
      if (!category || category.loading || !category.hasMore) return;
      category.loading = true;
      category.error = false;
      const status = $("detail-content").querySelector('[data-extra-status="' + category.key + '"]');
      if (status) status.textContent = category.products.length ? "Carregando mais produtos…" : "Carregando produtos…";
      try {
        let fetched = [];
        let pages = 0;
        do {
          const result = await request("products", { params: {
            category: category.key, limit: 3, offset: category.nextOffset
          } });
          fetched = Array.isArray(result.products) ? result.products : [];
          category.nextOffset = result.next_offset == null ? category.nextOffset : Number(result.next_offset);
          category.hasMore = result.next_offset != null;
          pages += 1;
        } while (!fetched.length && category.hasMore && pages < 8);
        category.products = category.products.concat(fetched);
        category.loaded = true;
        if (scrollElement && scrollElement.isConnected && state.baskets.get(state.activeKey) === data && !$("detail-sheet").hidden) {
          if (fetched.length) {
            scrollElement.insertAdjacentHTML("beforeend", fetched.map((product) => extraProductMarkup(data, product)).join(""));
            scrollElement.querySelectorAll("img").forEach((image) => image.addEventListener("error", () => { image.src = "../img/logoantonia5.png"; }, { once: true }));
            bindExtraProductControls(scrollElement);
          }
          const currentStatus = $("detail-content").querySelector('[data-extra-status="' + category.key + '"]');
          if (currentStatus) currentStatus.textContent = !category.products.length ? "Nenhum produto disponível nesta categoria." : "";
        }
      } catch (_) {
        category.error = true;
        if (scrollElement && scrollElement.isConnected) {
          const currentStatus = $("detail-content").querySelector('[data-extra-status="' + category.key + '"]');
          if (currentStatus) currentStatus.textContent = "Não foi possível carregar. Toque na categoria para tentar novamente.";
        }
      } finally {
        category.loading = false;
      }
    }
  
    function changeExtraQuantity(productId, delta, button) {
      const data = state.baskets.get(state.activeKey);
      if (!data || !productId || !delta) return;
      const category = extraCategoriesFor(data).find((entry) => entry.products.some((product) => String(product.id) === String(productId)));
      const product = category && category.products.find((entry) => String(entry.id) === String(productId));
      if (!product) return;
      const current = data.extraSelections.get(String(productId));
      const currentQuantity = Number(current && current.quantity || 0);
      const quantity = Math.max(0, Math.min(Number(product.stock_quantity || 0), currentQuantity + delta));
      if (quantity === currentQuantity) return;
      if (quantity === 0) data.extraSelections.delete(String(productId));
      else data.extraSelections.set(String(productId), {
        id: String(product.id), name: product.name || "Produto", image_url: product.image_url || "",
        price_cents: Number(product.price_cents || 0), quantity
      });
      const card = button && button.closest("[data-extra-product]");
      if (card) {
        const output = card.querySelector('[data-extra-quantity="' + productId + '"]');
        const minus = card.querySelector('[data-delta="-1"]');
        const plus = card.querySelector('[data-delta="1"]');
        if (output) output.textContent = String(quantity);
        if (minus) minus.disabled = quantity <= 0;
        if (plus) plus.disabled = quantity >= Number(product.stock_quantity || 0);
      }
      $("detail-total").textContent = money(displayedTotalCents(data));
    }

    return {
      extraTotalCents,
      displayedTotalCents,
      extraCategoriesFor,
      extraCategoriesMarkup,
      bindExtraProductControls,
      toggleExtraCategory,
      loadMoreExtraProducts
    };
  }

  window.DonaStorefrontExtras = { create };
})();
