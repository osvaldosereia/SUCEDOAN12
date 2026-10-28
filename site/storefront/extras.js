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
  
    function homeCategoriesFor() {
      if (!Array.isArray(state.homeExtraCategories)) {
        state.homeExtraCategories = EXTRA_CATEGORIES.map((category) => ({
          key: category.key, label: category.label, products: [], loaded: false,
          loading: false, error: false, nextOffset: 0, hasMore: true, scrollLeft: 0
        }));
      }
      if (!(state.homeExtraSelections instanceof Map)) state.homeExtraSelections = new Map();
      if (!(state.homeExtraProducts instanceof Map)) state.homeExtraProducts = new Map();
      return state.homeExtraCategories;
    }

    function homeProductSelection(product, quantity) {
      return {
        id: String(product.id),
        name: product.name || "Produto",
        image_url: product.image_url || "",
        price_cents: Number(product.price_cents || 0),
        stock_quantity: Number(product.stock_quantity || 0),
        quantity: Number(quantity || 0)
      };
    }

    function homeExtraProductMarkup(product) {
      const id = String(product.id || "");
      const name = product.name || "Produto";
      const selection = state.homeExtraSelections.get(id);
      const quantity = Number(selection && selection.quantity || 0);
      const stock = Math.max(0, Number(product.stock_quantity || 0));
      const detail = product.brand || product.packaging || "";
      return '<article class="home-extra-card" role="listitem" data-home-extra-product="' + esc(id) + '">' +
        '<img class="home-extra-photo" src="' + esc(product.image_url || "../img/logoantonia5.png") + '" alt="" width="72" height="72" loading="lazy" decoding="async">' +
        '<div class="home-extra-copy"><strong>' + esc(name) + '</strong>' +
        (detail ? '<span>' + esc(detail) + '</span>' : '') +
        '<b>' + esc(money(product.price_cents)) + '</b></div>' +
        '<div class="home-extra-controls"><span>Quantidade</span><div class="home-extra-stepper">' +
        '<button class="quantity-button" type="button" data-home-extra-adjust="' + esc(id) + '" data-delta="-1" aria-label="Diminuir ' + esc(name) + '"' + (quantity <= 0 ? " disabled" : "") + '>−</button>' +
        '<output class="quantity-value" data-home-extra-quantity="' + esc(id) + '" aria-live="polite">' + quantity + '</output>' +
        '<button class="quantity-button" type="button" data-home-extra-adjust="' + esc(id) + '" data-delta="1" aria-label="Adicionar ' + esc(name) + '"' + (quantity >= stock ? " disabled" : "") + '>+</button></div></div></article>';
    }

    function homeExtraCategoryMarkup(category) {
      const panelId = "home-extra-" + category.key;
      const status = category.loading
        ? category.products.length ? "Carregando mais produtos…" : "Carregando produtos…"
        : category.error ? "Não foi possível carregar os produtos."
          : category.loaded && !category.products.length ? "Nenhum produto disponível nesta categoria."
            : category.hasMore ? "Arraste ou deslize a faixa para ver mais produtos."
              : "";
      const loadMore = category.error
        ? '<button class="button button-outline home-extra-more" type="button" data-home-extra-retry="' + esc(category.key) + '">Tentar novamente</button>'
        : category.hasMore && category.products.length
          ? '<button class="button button-outline home-extra-more" type="button" data-home-extra-more="' + esc(category.key) + '">' + (category.loading ? "Carregando produtos…" : "Carregar mais produtos") + '</button>'
          : "";
      return '<section class="home-extra-category" data-home-extra-section="' + esc(category.key) + '" aria-labelledby="' + esc(panelId) + '-title">' +
        '<div class="home-extra-category-heading"><h3 id="' + esc(panelId) + '-title" tabindex="-1">' + esc(category.label) + '</h3></div>' +
        '<div class="home-extra-rail" data-home-extra-rail="' + esc(category.key) + '" role="list" aria-label="Produtos de ' + esc(category.label) + '">' +
        category.products.map(homeExtraProductMarkup).join("") + '</div>' +
        (status ? '<p class="home-extra-status" role="status">' + esc(status) + '</p>' : '') + loadMore + '</section>';
    }

    function homeFocusSnapshot(host) {
      const active = document.activeElement;
      if (!active || !host.contains(active)) return null;
      if (active.matches("[data-home-extra-adjust]")) {
        return { kind: "adjust", key: active.closest("[data-home-extra-section]")?.dataset.homeExtraSection || "", id: active.dataset.homeExtraAdjust, delta: active.dataset.delta };
      }
      if (active.matches("[data-home-extra-more]")) return { kind: "more", key: active.dataset.homeExtraMore };
      if (active.matches("[data-home-extra-retry]")) return { kind: "retry", key: active.dataset.homeExtraRetry };
      return null;
    }

    function restoreHomeFocus(host, focus) {
      if (!focus) return;
      const section = Array.from(host.querySelectorAll("[data-home-extra-section]"))
        .find((entry) => entry.dataset.homeExtraSection === focus.key);
      if (!section) return;
      const controls = Array.from(section.querySelectorAll("[data-home-extra-adjust]"));
      let target = focus.kind === "more"
        ? section.querySelector("[data-home-extra-more]")
        : focus.kind === "retry"
          ? section.querySelector("[data-home-extra-retry]")
          : controls.find((button) => button.dataset.homeExtraAdjust === focus.id && button.dataset.delta === focus.delta);
      if (!target || target.disabled) {
        if (focus.kind === "adjust") {
          target = controls.find((button) => button.dataset.homeExtraAdjust === focus.id && !button.disabled) ||
            controls.find((button) => !button.disabled);
        }
        if (!target || target.disabled) target = section.querySelector(".home-extra-category-heading h3");
      }
      if (target) target.focus({ preventScroll: true });
    }

    function renderHomeExtras() {
      const host = $("home-extra-categories");
      if (!host) return;
      const focus = homeFocusSnapshot(host);
      host.querySelectorAll("[data-home-extra-rail]").forEach((rail) => {
        const category = homeCategoriesFor().find((entry) => entry.key === rail.dataset.homeExtraRail);
        if (category) category.scrollLeft = rail.scrollLeft;
      });
      const categories = homeCategoriesFor();
      host.innerHTML = categories.map(homeExtraCategoryMarkup).join("");
      host.querySelectorAll("[data-home-extra-rail]").forEach((rail) => {
        const category = categories.find((entry) => entry.key === rail.dataset.homeExtraRail);
        if (category) rail.scrollLeft = category.scrollLeft;
        rail.addEventListener("scroll", () => {
          if (category) category.scrollLeft = rail.scrollLeft;
          if (category && category.hasMore && !category.loading &&
              rail.scrollWidth - rail.scrollLeft - rail.clientWidth < 100) {
            loadHomeExtraCategory(category);
          }
        }, { passive: true });
      });
      host.querySelectorAll("[data-home-extra-adjust]").forEach((button) => {
        button.addEventListener("click", () => changeHomeExtraQuantity(button.dataset.homeExtraAdjust, Number(button.dataset.delta || 0)));
      });
      host.querySelectorAll("[data-home-extra-more]").forEach((button) => {
        button.addEventListener("click", () => {
          const category = categories.find((entry) => entry.key === button.dataset.homeExtraMore);
          if (category) loadHomeExtraCategory(category);
        });
      });
      host.querySelectorAll("[data-home-extra-retry]").forEach((button) => {
        button.addEventListener("click", () => {
          const category = categories.find((entry) => entry.key === button.dataset.homeExtraRetry);
          if (category) loadHomeExtraCategory(category);
        });
      });
      host.querySelectorAll("img").forEach((image) => image.addEventListener("error", () => {
        image.src = "../img/logoantonia5.png";
      }, { once: true }));
      restoreHomeFocus(host, focus);
      renderHomeExtraSummary();
    }

    function renderHomeExtraSummary() {
      const summary = $("home-extra-summary");
      if (!summary) return;
      const selections = state.homeExtraSelections instanceof Map ? Array.from(state.homeExtraSelections.values()) : [];
      const quantity = selections.reduce((sum, item) => sum + Math.max(0, Math.trunc(Number(item.quantity || 0))), 0);
      const subtotal = selections.reduce((sum, item) =>
        sum + Math.max(0, Number(item.price_cents || 0)) * Math.max(0, Math.trunc(Number(item.quantity || 0))), 0);
      summary.hidden = quantity === 0;
      const count = $("home-extra-summary-count");
      const total = $("home-extra-summary-total");
      if (count) count.textContent = quantity + (quantity === 1 ? " produto extra escolhido" : " produtos extras escolhidos");
      if (total) total.textContent = "Subtotal dos extras: " + money(subtotal);
    }

    function updateHomeExtraCard(productId) {
      const host = $("home-extra-categories");
      if (!host) return;
      const id = String(productId);
      const selection = state.homeExtraSelections.get(id);
      const quantity = Number(selection && selection.quantity || 0);
      host.querySelectorAll("[data-home-extra-product]").forEach((card) => {
        if (card.dataset.homeExtraProduct !== id) return;
        const active = document.activeElement;
        const focusedDelta = active && card.contains(active) && active.matches("[data-home-extra-adjust]")
          ? active.dataset.delta
          : "";
        const product = state.homeExtraProducts.get(id);
        const stock = Math.max(0, Number(product && product.stock_quantity || selection && selection.stock_quantity || 0));
        const output = card.querySelector("[data-home-extra-quantity]");
        const minus = card.querySelector('[data-home-extra-adjust][data-delta="-1"]');
        const plus = card.querySelector('[data-home-extra-adjust][data-delta="1"]');
        if (output) output.textContent = String(quantity);
        if (minus) minus.disabled = quantity <= 0;
        if (plus) plus.disabled = quantity >= stock;
        if (focusedDelta) {
          let target = focusedDelta === "1" ? plus : minus;
          if (target && target.disabled) target = focusedDelta === "1" ? minus : plus;
          if (target && !target.disabled) target.focus({ preventScroll: true });
        }
      });
    }

    function homeSelectionReviewMarkup(data) {
      const selections = data && data.extraSelections instanceof Map ? data.extraSelections : new Map();
      const ids = data && data.homeExtraProductIds instanceof Set ? Array.from(data.homeExtraProductIds) : [];
      const items = ids.map((id) => {
        const selected = selections.get(id);
        if (!selected || Number(selected.quantity || 0) <= 0) return null;
        return { id, product: state.homeExtraProducts.get(id) || selected, selected };
      }).filter(Boolean);
      if (!items.length) return "";
      return '<section class="home-extra-review" aria-labelledby="home-extra-review-title"><h3 id="home-extra-review-title">Extras escolhidos</h3>' +
        items.map(({ id, product, selected }) => {
          const name = product.name || selected.name || "Produto";
          const quantity = Number(selected.quantity || 0);
          const price = Number(selected.price_cents || product.price_cents || 0);
          const stock = Math.max(0, Number(product.stock_quantity || selected.stock_quantity || 0));
          return '<article class="home-extra-review-item" data-home-extra-review-item="' + esc(id) + '">' +
            '<div class="home-extra-review-copy"><strong>' + esc(name) + '</strong><span>' + esc(money(price * quantity)) + '</span></div>' +
            '<div class="quantity-stepper"><button class="quantity-button" type="button" data-home-review-adjust="' + esc(id) + '" data-delta="-1" aria-label="Diminuir ' + esc(name) + '"' + (quantity <= 0 ? " disabled" : "") + '>−</button>' +
            '<output class="quantity-value" data-home-review-quantity="' + esc(id) + '" aria-live="polite">' + quantity + '</output>' +
            '<button class="quantity-button" type="button" data-home-review-adjust="' + esc(id) + '" data-delta="1" aria-label="Adicionar ' + esc(name) + '"' + (quantity >= stock ? " disabled" : "") + '>+</button></div></article>';
        }).join("") + '</section>';
    }

    function isActiveVisibleBasket(data) {
      return !!data && state.baskets.get(state.activeKey) === data && !$("detail-sheet").hidden;
    }

    function updateBasketExtraCards(productId, quantity, stockQuantity) {
      const content = $("detail-content");
      if (!content) return;
      const id = String(productId);
      const stock = Math.max(0, Number(stockQuantity || 0));
      content.querySelectorAll("[data-extra-product]").forEach((card) => {
        if (card.dataset.extraProduct !== id) return;
        const active = document.activeElement;
        const focusedDelta = active && card.contains(active) && active.matches("[data-extra-adjust]")
          ? active.dataset.delta
          : "";
        const output = card.querySelector('[data-extra-quantity="' + id + '"]');
        const minus = card.querySelector('[data-extra-adjust][data-delta="-1"]');
        const plus = card.querySelector('[data-extra-adjust][data-delta="1"]');
        if (output) output.textContent = String(quantity);
        if (minus) minus.disabled = quantity <= 0;
        if (plus) plus.disabled = quantity >= stock;
        if (focusedDelta) {
          let target = focusedDelta === "1" ? plus : minus;
          if (target && target.disabled) target = focusedDelta === "1" ? minus : plus;
          if (target && !target.disabled) target.focus({ preventScroll: true });
        }
      });
    }

    function refreshHomeSelectionReview(data) {
      const content = $("detail-content");
      const mount = content && content.querySelector("[data-home-extra-review-mount]");
      if (!mount || !isActiveVisibleBasket(data)) return;
      const active = document.activeElement;
      const focused = mount.contains(active) && active.matches("[data-home-review-adjust]")
        ? { id: active.dataset.homeReviewAdjust, delta: active.dataset.delta }
        : null;
      mount.innerHTML = homeSelectionReviewMarkup(data);
      bindHomeSelectionControls(mount, data);
      if (focused) {
        const controls = Array.from(mount.querySelectorAll("[data-home-review-adjust]"));
        let target = controls.find((button) => button.dataset.homeReviewAdjust === focused.id && button.dataset.delta === focused.delta);
        if (!target || target.disabled) target = controls.find((button) => !button.disabled);
        if (target) target.focus({ preventScroll: true });
        else {
          const nextCategory = content.querySelector("[data-extra-category]");
          if (nextCategory) nextCategory.focus({ preventScroll: true });
        }
      }
    }

    function bindHomeSelectionControls(container, data) {
      if (!container) return;
      container.querySelectorAll("[data-home-review-adjust]").forEach((button) => {
        button.addEventListener("click", () => changeBasketHomeQuantity(data, button.dataset.homeReviewAdjust, Number(button.dataset.delta || 0)));
      });
    }

    function changeBasketHomeQuantity(data, productId, delta) {
      const id = String(productId || "");
      if (!data || !id || !delta || !(data.extraSelections instanceof Map)) return;
      const current = data.extraSelections.get(id);
      const product = state.homeExtraProducts.get(id) || current;
      if (!product) return;
      const currentQuantity = Number(current && current.quantity || 0);
      const stock = Math.max(0, Number(product.stock_quantity || current && current.stock_quantity || 0));
      const quantity = Math.max(0, Math.min(stock, currentQuantity + delta));
      if (quantity === currentQuantity) return;
      if (quantity === 0) data.extraSelections.delete(id);
      else data.extraSelections.set(id, homeProductSelection(product, quantity));
      if (state.homeExtraProducts.has(id)) syncHomeSelectionFromBasket(product, quantity, data);
      else {
        if (isActiveVisibleBasket(data)) $("detail-total").textContent = money(displayedTotalCents(data));
        refreshHomeSelectionReview(data);
      }
    }

    function setHomeExtraQuantity(product, quantity, data) {
      const id = String(product && product.id || "");
      if (!id) return;
      const selection = homeProductSelection(product, quantity);
      if (quantity > 0) state.homeExtraSelections.set(id, selection);
      else state.homeExtraSelections.delete(id);
      if (data) {
        if (!(data.extraSelections instanceof Map)) data.extraSelections = new Map();
        if (quantity > 0) data.extraSelections.set(id, selection);
        else data.extraSelections.delete(id);
        if (!(data.homeExtraProductIds instanceof Set)) data.homeExtraProductIds = new Set();
        data.homeExtraProductIds.add(id);
        if (isActiveVisibleBasket(data)) $("detail-total").textContent = money(displayedTotalCents(data));
        refreshHomeSelectionReview(data);
      }
      updateHomeExtraCard(id);
      updateBasketExtraCards(id, quantity, product.stock_quantity);
      renderHomeExtraSummary();
    }

    function syncHomeSelectionFromBasket(product, quantity, data) {
      if (!product || !state.homeExtraProducts.has(String(product.id))) return;
      setHomeExtraQuantity(product, quantity, data);
    }

    function changeHomeExtraQuantity(productId, delta) {
      const id = String(productId || "");
      const product = state.homeExtraProducts.get(id);
      if (!product || !delta) return;
      const current = state.homeExtraSelections.get(id);
      const currentQuantity = Number(current && current.quantity || 0);
      const stock = Math.max(0, Number(product.stock_quantity || 0));
      const quantity = Math.max(0, Math.min(stock, currentQuantity + delta));
      if (quantity === currentQuantity) return;
      setHomeExtraQuantity(product, quantity, state.baskets.get(state.activeKey));
    }

    async function loadHomeExtraCategory(category) {
      if (!category || category.loading || !category.hasMore) return;
      category.loading = true;
      category.error = false;
      renderHomeExtras();
      try {
        const result = await request("products", { params: {
          category: category.key, limit: 6, offset: category.nextOffset
        } });
        const fetched = Array.isArray(result.products) ? result.products : [];
        category.nextOffset = result.next_offset == null ? category.nextOffset : Number(result.next_offset);
        category.hasMore = result.next_offset != null;
        category.products = category.products.concat(fetched);
        category.loaded = true;
        fetched.forEach((product) => {
          const id = String(product.id || "");
          if (!id) return;
          state.homeExtraProducts.set(id, product);
          const active = state.baskets.get(state.activeKey);
          const existing = active && active.extraSelections instanceof Map ? active.extraSelections.get(id) : null;
          if (existing && !state.homeExtraSelections.has(id)) {
            if (!(active.homeExtraProductIds instanceof Set)) active.homeExtraProductIds = new Set();
            active.homeExtraProductIds.add(id);
            setHomeExtraQuantity(product, Number(existing.quantity || 0), active);
          } else {
            updateHomeExtraCard(id);
          }
        });
      } catch (_) {
        category.error = true;
      } finally {
        category.loading = false;
        renderHomeExtras();
      }
    }

    function initHomeExtras() {
      const host = $("home-extra-categories");
      if (!host) return;
      const categories = homeCategoriesFor();
      renderHomeExtras();
      if (state.homeExtraStarted) return;
      state.homeExtraStarted = true;
      Promise.all(categories.map((category) => loadHomeExtraCategory(category)));
    }

    function attachHomeSelections(data) {
      if (!data) return data;
      homeCategoriesFor();
      if (!(data.extraSelections instanceof Map)) data.extraSelections = new Map();
      const managed = data.homeExtraProductIds instanceof Set ? new Set(data.homeExtraProductIds) : new Set();
      managed.forEach((id) => {
        if (!state.homeExtraSelections.has(id)) data.extraSelections.delete(id);
      });
      state.homeExtraSelections.forEach((item, id) => {
        data.extraSelections.set(id, homeProductSelection(item, item.quantity));
        managed.add(id);
      });
      data.homeExtraProductIds = managed;
      refreshHomeSelectionReview(data);
      return data;
    }

    function changeExtraQuantity(productId, delta, button) {
      const data = state.baskets.get(state.activeKey);
      if (!data || !productId || !delta) return;
      const category = extraCategoriesFor(data).find((entry) => entry.products.some((product) => String(product.id) === String(productId)));
      const product = (category && category.products.find((entry) => String(entry.id) === String(productId))) ||
        state.homeExtraProducts.get(String(productId));
      if (!product) return;
      const current = data.extraSelections.get(String(productId));
      const currentQuantity = Number(current && current.quantity || 0);
      const quantity = Math.max(0, Math.min(Number(product.stock_quantity || 0), currentQuantity + delta));
      if (quantity === currentQuantity) return;
      if (quantity === 0) data.extraSelections.delete(String(productId));
      else data.extraSelections.set(String(productId), {
        id: String(product.id), name: product.name || "Produto", image_url: product.image_url || "",
        price_cents: Number(product.price_cents || 0), stock_quantity: Number(product.stock_quantity || 0), quantity
      });
      if (state.homeExtraProducts.has(String(productId))) syncHomeSelectionFromBasket(product, quantity, data);
      updateBasketExtraCards(productId, quantity, product.stock_quantity);
      $("detail-total").textContent = money(displayedTotalCents(data));
    }

    return {
      extraTotalCents,
      displayedTotalCents,
      extraCategoriesFor,
      extraCategoriesMarkup,
      bindExtraProductControls,
      toggleExtraCategory,
      loadMoreExtraProducts,
      initHomeExtras,
      homeSelectionReviewMarkup,
      bindHomeSelectionControls,
      attachHomeSelections
    };
  }

  window.DonaStorefrontExtras = { create };
})();
