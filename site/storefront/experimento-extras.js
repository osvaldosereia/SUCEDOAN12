(() => {
  "use strict";

  const HOME_EXTRA_INITIAL_PAGE_SIZE = 6;
  const HOME_EXTRA_MORE_PAGE_SIZE = 6;
  const BASKET_EXTRA_INITIAL_PAGE_SIZE = 3;
  const BASKET_EXTRA_MORE_PAGE_SIZE = 12;
  const OFFER_INITIAL_PAGE_SIZE = 3;
  const OFFER_MORE_PAGE_SIZE = 12;
  const HOME_EXTRA_PREFETCH_MARGIN = "140px 0px";

  const EXTRA_CATEGORIES = [
    { key: "mais_vendidos", label: "Mais vendidos", special: true },
    { key: "mercearia", label: "Mercearia" },
    { key: "limpeza_lavanderia", label: "Limpeza e lavanderia" },
    { key: "higiene_beleza", label: "Higiene e beleza" },
    { key: "casa_pet", label: "Casa e pet" }
  ];
  const BUILDER_CATEGORY_DEFAULTS = EXTRA_CATEGORIES.filter((category) => category.key !== "mais_vendidos");

  function create({ state, $, esc, money, request, toast, productChoiceMarkup }) {
    let homeExtraObserver = null;
    let homeExtraLoadQueue = Promise.resolve();
    let publicOffersPromise = null;
    let publicOffersLoaded = false;
    let publicOffersLoading = false;
    let publicOffersError = false;
    let publicOfferProducts = [];
    let publicOfferVisibleCount = 0;
    let homeBuilderCategoriesPromise = null;
    function extraTotalCents(data) {
      const selections = data && data.extraSelections instanceof Map ? data.extraSelections : new Map();
      return Array.from(selections.values()).reduce((total, item) =>
        total + Math.max(0, Number(item.price_cents || 0)) * Math.max(0, Math.trunc(Number(item.quantity || 0))), 0);
    }
  
    function displayedTotalCents(data) {
      return Math.max(0, Number(data && data.totalCents || 0)) + extraTotalCents(data);
    }
  
    function createProductSearchState() {
      return { query: "", products: [], nextOffset: null, hasMore: false, loading: false, pending: false, error: false, sequence: 0, timer: 0, lastOffset: 0 };
    }

    const homeExtrasSearchState = createProductSearchState();
    let productSearchBound = false;

    function normalizeProductSearchText(value) {
      return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]+/g, " ").trim();
    }

    function productSearchStateFor(scope, data) {
      if (scope === "home-extras") return homeExtrasSearchState;
      const current = data || state.baskets.get(state.activeKey);
      if (!current) return null;
      if (!current.extraProductSearch) current.extraProductSearch = createProductSearchState();
      return current.extraProductSearch;
    }

    function productSearchRootFor(scope, data) {
      if (scope === "home-extras") return $("home-extra-product-search");
      if (scope === "basket-extras") {
        if (data && state.baskets.get(state.activeKey) !== data) return null;
        const content = $("detail-content");
        return content && content.querySelector('[data-product-search-root="basket-extras"]');
      }
      return null;
    }

    function productSearchStatus(search) {
      const normalized = normalizeProductSearchText(search.query);
      if (!normalized) return "";
      if (normalized.length < 2) return "Digite pelo menos 2 caracteres para buscar.";
      if (search.pending || search.loading) return search.products.length ? "Carregando mais produtos…" : "Buscando produtos…";
      if (search.error) return search.products.length ? "Não foi possível carregar mais produtos." : "Não foi possível concluir a busca.";
      if (!search.products.length) return "Nenhum produto encontrado. Confira o nome ou código.";
      return search.products.length + (search.hasMore ? " produtos carregados." : " produtos encontrados.");
    }

    function productSearchResultsMarkup(scope, search, data) {
      const products = Array.isArray(search.products) ? search.products : [];
      const cards = scope === "basket-extras"
        ? products.map((product) => extraProductMarkup(data, product)).join("")
        : products.map(homeExtraProductMarkup).join("");
      const list = cards
        ? (scope === "basket-extras"
          ? '<div class="product-search-results-list basket-option-carousel" tabindex="0" role="list" aria-label="Resultados dos produtos extras. Deslize horizontalmente para ver os produtos.">' + cards + "</div>"
          : '<div class="home-extra-grid product-search-results-grid" role="list" aria-label="Resultados da busca">' + cards + "</div>")
        : "";
      const action = search.error
        ? '<button class="button button-outline product-search-more" type="button" data-product-search-retry="' + esc(scope) + '">Tentar novamente</button>'
        : search.hasMore && !search.loading
          ? '<button class="button button-outline product-search-more" type="button" data-product-search-more="' + esc(scope) + '">Ver mais produtos</button>'
          : "";
      return list + action;
    }

    function productSearchPanelMarkup(scope, label, placeholder, search, data) {
      const normalized = normalizeProductSearchText(search.query);
      const searching = normalized.length >= 2;
      return '<div class="product-search product-search-compact" data-product-search-root="' + esc(scope) + '">' +
        '<label class="product-search-label" for="basket-extra-product-search-input">' + esc(label) + '</label>' +
        '<div class="product-search-control">' +
        '<input id="basket-extra-product-search-input" data-product-search-input="' + esc(scope) + '" type="search" maxlength="100" autocomplete="off" enterkeyhint="search" placeholder="' + esc(placeholder) + '" value="' + esc(search.query) + '" aria-describedby="basket-extra-product-search-status">' +
        '<button class="product-search-clear" type="button" data-product-search-clear="' + esc(scope) + '" aria-label="Limpar busca" hidden>×</button></div>' +
        '<p id="basket-extra-product-search-status" class="product-search-status" data-product-search-status="' + esc(scope) + '" role="status" aria-live="polite">' + esc(productSearchStatus(search)) + '</p>' +
        '<div class="product-search-results" data-product-search-results="' + esc(scope) + '"' + (searching ? "" : " hidden") + '>' +
        productSearchResultsMarkup(scope, search, data) + "</div></div>";
    }

    function renderProductSearch(scope, data) {
      const search = productSearchStateFor(scope, data);
      const root = productSearchRootFor(scope, data);
      if (!search || !root) return;
      const normalized = normalizeProductSearchText(search.query);
      const searching = normalized.length >= 2;
      const input = root.querySelector("[data-product-search-input]");
      const clear = root.querySelector("[data-product-search-clear]");
      const status = root.querySelector("[data-product-search-status]");
      const results = root.querySelector("[data-product-search-results]");
      if (input && input.value !== search.query) input.value = search.query;
      if (clear) clear.hidden = !search.query;
      if (status) status.textContent = productSearchStatus(search);
      if (results) {
        results.hidden = !searching;
        results.setAttribute("aria-busy", String(search.pending || search.loading));
        results.innerHTML = productSearchResultsMarkup(scope, search, data);
        if (scope === "basket-extras") bindExtraProductControls(results);
        else bindHomeSearchProductCards(results);
      }
      if (scope === "home-extras") {
        const categories = $("home-extra-categories");
        if (categories) categories.hidden = searching;
      } else if (scope === "basket-extras") {
        const categories = root.querySelector("[data-extra-category-list]");
        if (categories) categories.hidden = searching;
      }
    }

    async function loadProductSearchPage(scope, data, offset, sequence) {
      const search = productSearchStateFor(scope, data);
      if (!search || search.sequence !== sequence || (scope === "basket-extras" && state.baskets.get(state.activeKey) !== data)) return;
      search.pending = false;
      search.loading = true;
      search.error = false;
      search.lastOffset = offset;
      renderProductSearch(scope, data);
      try {
        const params = { q: search.query, limit: scope === "home-extras" ? 6 : 12, offset };
        const result = await request("products", { params });
        if (search.sequence !== sequence || (scope === "basket-extras" && state.baskets.get(state.activeKey) !== data)) return;
        const fetched = Array.isArray(result.products) ? result.products : [];
        if (!(state.homeExtraProducts instanceof Map)) state.homeExtraProducts = new Map();
        fetched.forEach((product) => {
          const id = String(product.id || "");
          if (id) state.homeExtraProducts.set(id, product);
        });
        if (offset > 0) {
          const unique = new Map(search.products.map((product) => [String(product.id), product]));
          fetched.forEach((product) => unique.set(String(product.id), product));
          search.products = Array.from(unique.values());
        } else {
          search.products = fetched;
        }
        search.nextOffset = result.next_offset == null ? null : Number(result.next_offset);
        search.hasMore = result.next_offset != null;
      } catch (_) {
        if (search.sequence === sequence) search.error = true;
      } finally {
        if (search.sequence === sequence) {
          search.loading = false;
          search.pending = false;
          renderProductSearch(scope, data);
        }
      }
    }

    function setProductSearchQuery(scope, input) {
      const data = scope === "basket-extras" ? state.baskets.get(state.activeKey) : null;
      const search = productSearchStateFor(scope, data);
      if (!search) return;
      search.query = String(input.value || "").trim().slice(0, 100);
      search.sequence += 1;
      const sequence = search.sequence;
      if (search.timer) window.clearTimeout(search.timer);
      search.products = [];
      search.nextOffset = null;
      search.hasMore = false;
      search.loading = false;
      search.error = false;
      search.lastOffset = 0;
      search.pending = normalizeProductSearchText(search.query).length >= 2;
      renderProductSearch(scope, data);
      if (!search.pending) return;
      search.timer = window.setTimeout(() => loadProductSearchPage(scope, data, 0, sequence), 280);
    }

    function bindHomeSearchProductCards(container) {
      if (!container) return;
      container.querySelectorAll("[data-home-extra-adjust]").forEach((button) => {
        button.addEventListener("click", () => changeHomeExtraQuantity(button.dataset.homeExtraAdjust, Number(button.dataset.delta || 0)));
      });
      container.querySelectorAll("img").forEach((image) => image.addEventListener("error", () => {
        image.src = "../img/logoantonia5.png";
      }, { once: true }));
    }

    function bindProductSearchEvents(container) {
      if (!container || container.dataset.productSearchBound === "true") return;
      container.dataset.productSearchBound = "true";
      container.addEventListener("input", (event) => {
        const input = event.target.closest("[data-product-search-input]");
        if (!input || !container.contains(input)) return;
        setProductSearchQuery(input.dataset.productSearchInput, input);
      });
      container.addEventListener("click", (event) => {
        const clear = event.target.closest("[data-product-search-clear]");
        if (clear && container.contains(clear)) {
          const scope = clear.dataset.productSearchClear;
          const root = productSearchRootFor(scope, scope === "basket-extras" ? state.baskets.get(state.activeKey) : null);
          const input = root && root.querySelector("[data-product-search-input]");
          if (input) {
            input.value = "";
            setProductSearchQuery(scope, input);
            input.focus({ preventScroll: true });
          }
          return;
        }
        const more = event.target.closest("[data-product-search-more]");
        const retry = event.target.closest("[data-product-search-retry]");
        const action = more || retry;
        if (!action || !container.contains(action)) return;
        const scope = action.dataset.productSearchMore || action.dataset.productSearchRetry;
        const data = scope === "basket-extras" ? state.baskets.get(state.activeKey) : null;
        const search = productSearchStateFor(scope, data);
        if (!search || search.loading) return;
        loadProductSearchPage(scope, data, retry ? search.lastOffset : (search.nextOffset || 0), search.sequence);
      });
    }

    function bindProductSearch() {
      if (productSearchBound) return;
      bindProductSearchEvents($("home-extra-product-search"));
      bindProductSearchEvents($("detail-content"));
      productSearchBound = true;
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
      return productChoiceMarkup(product, {
        role: "listitem",
        quantity,
        attributes: { "data-extra-product": id },
        quantityAttributes: { "data-extra-quantity": id },
        adjustAttributes: { "data-extra-adjust": id },
        decreaseDisabled: quantity <= 0,
        increaseDisabled: quantity >= stock
      });
    }
  
    function offerStatusText(data) {
      if (data.offersLoading) return "Carregando ofertas…";
      if (data.offersError) return "Não foi possível carregar as ofertas.";
      if (data.offersLoaded && !(data.offerProducts || []).length) return "Nenhum produto em oferta disponível no momento.";
      return "";
    }

    function offerCategoryMarkup(data) {
      const products = Array.isArray(data.offerProducts) ? data.offerProducts : [];
      const visibleCount = Math.max(OFFER_INITIAL_PAGE_SIZE, Math.trunc(Number(data.offerVisibleCount || OFFER_INITIAL_PAGE_SIZE)));
      const visible = products.slice(0, visibleCount);
      const expanded = data.offersExpanded === true;
      const status = offerStatusText(data);
      return '<section class="extra-category" data-extra-offers-card>' +
        '<button class="extra-category-toggle" type="button" data-offers-toggle aria-expanded="' + String(expanded) + '" aria-controls="extra-panel-offers">' +
        '<span>Ofertas</span><span class="variation-chevron" aria-hidden="true">' + (expanded ? "−" : "+") + '</span></button>' +
        '<div class="extra-category-panel" id="extra-panel-offers"' + (expanded ? "" : " hidden") + '>' +
        '<div class="extra-product-list basket-option-carousel" data-offers-list tabindex="0" role="list" aria-label="Produtos em oferta. Deslize horizontalmente para ver os produtos">' +
        visible.map((product) => extraProductMarkup(data, product)).join("") + '</div>' +
        '<p class="extra-product-status" data-offers-status role="status">' + esc(status) + '</p>' +
        '<button class="button button-outline extra-product-more" type="button" data-offers-more' + (products.length > visible.length ? "" : " hidden") + (data.offersLoading ? " disabled" : "") + '>Carregar mais ofertas</button>' +
        '<button class="button button-outline extra-product-more" type="button" data-offers-retry' + (data.offersError ? "" : " hidden") + '>Tentar novamente</button>' +
        '</div></section>';
    }

    function extraCategoriesMarkup(data) {
      const categories = extraCategoriesFor(data);
      const search = productSearchStateFor("basket-extras", data);
      const activeSearch = normalizeProductSearchText(search.query).length >= 2;
      const searchPanel = productSearchPanelMarkup("basket-extras", "Buscar um produto extra", "Ex.: arroz, sabão ou óleo", search, data);
      const emptyMessage = data.extraCategoriesConfigured && !categories.length
        ? '<p class="extra-sections-empty">Nenhuma seção extra está ativa no momento.</p>'
        : "";
      return '<section class="extras-section" aria-labelledby="extras-title"><h3 id="extras-title">Produtos Extras</h3>' + searchPanel + emptyMessage + '<div class="extra-category-list" data-extra-category-list' + (activeSearch ? " hidden" : "") + '>' +
        offerCategoryMarkup(data) + categories.map((category) => {
          const panelId = "extra-panel-" + category.key;
          const status = category.loading
            ? category.products.length ? "Carregando mais produtos…" : "Carregando produtos…"
            : category.error ? "Não foi possível carregar. Tente novamente."
              : category.loaded && !category.products.length ? "Nenhum produto disponível nesta categoria."
                : "";
          const showMore = category.error || (category.loaded && category.hasMore);
          const moreLabel = category.error ? "Tentar novamente" : "Carregar mais produtos";
          const products = category.products.map((product) => extraProductMarkup(data, product)).join("");
          return '<section class="extra-category" data-extra-category-card="' + esc(category.key) + '">' +
            '<button class="extra-category-toggle" type="button" data-extra-category="' + esc(category.key) + '" aria-expanded="' + String(category.expanded) + '" aria-controls="' + esc(panelId) + '">' +
            '<span>' + esc(category.label) + '</span><span class="variation-chevron" aria-hidden="true">' + (category.expanded ? "−" : "+") + '</span></button>' +
            '<div class="extra-category-panel" id="' + esc(panelId) + '"' + (category.expanded ? "" : " hidden") + '>' +
            '<div class="extra-product-list basket-option-carousel" data-extra-list="' + esc(category.key) + '" tabindex="0" role="list" aria-label="Produtos de ' + esc(category.label) + '. Deslize horizontalmente para ver os produtos.">' + products + '</div>' +
            '<p class="extra-product-status" data-extra-status="' + esc(category.key) + '" role="status">' + esc(status) + '</p>' +
            '<button class="button button-outline extra-product-more" type="button" data-extra-more="' + esc(category.key) + '"' + (showMore ? "" : " hidden") + (category.loading ? " disabled" : "") + '>' + esc(moreLabel) + '</button></div></section>';
        }).join("") + '</div></section>';
    }
  
  
    function bindExtraProductControls(container) {
      if (!container || container.closest?.("[data-extra-controls-bound='true']")) return;
      container.dataset.extraControlsBound = "true";
      container.addEventListener("click", (event) => {
        const offersToggle = event.target?.closest?.("[data-offers-toggle]");
        if (offersToggle && container.contains(offersToggle)) {
          toggleOffers();
          return;
        }
        const offersMore = event.target?.closest?.("[data-offers-more]");
        if (offersMore && container.contains(offersMore) && !offersMore.disabled) {
          showMoreOffers();
          return;
        }
        const offersRetry = event.target?.closest?.("[data-offers-retry]");
        if (offersRetry && container.contains(offersRetry) && !offersRetry.disabled) {
          const data = state.baskets.get(state.activeKey);
          if (data) loadOffers(data);
          return;
        }
        const moreButton = event.target?.closest?.("[data-extra-more]");
        if (moreButton && container.contains(moreButton) && !moreButton.disabled) {
          const categoryCard = moreButton.closest("[data-extra-category-card]");
          const listElement = categoryCard && categoryCard.querySelector("[data-extra-list]");
          if (listElement) loadMoreExtraProducts(moreButton.dataset.extraMore, listElement);
          return;
        }
        const button = event.target?.closest?.("[data-extra-adjust]");
        if (!button || !container.contains(button) || button.disabled) return;
        changeExtraQuantity(button.dataset.extraAdjust, Number(button.dataset.delta || 0));
      });
    }
    function toggleExtraCategory(categoryKey) {
      const data = state.baskets.get(state.activeKey);
      const category = data && extraCategoriesFor(data).find((entry) => entry.key === String(categoryKey));
      if (!data || !category) return;
      category.expanded = !category.expanded;
      const content = $("detail-content");
      const button = content.querySelector('[data-extra-category="' + category.key + '"]');
      const list = content.querySelector('[data-extra-list="' + category.key + '"]');
      const panel = list && list.parentElement;
      if (button) {
        button.setAttribute("aria-expanded", String(category.expanded));
        const icon = button.querySelector(".variation-chevron");
        if (icon) icon.textContent = category.expanded ? "−" : "+";
      }
      if (panel) panel.hidden = !category.expanded;
      if (category.expanded && (!category.loaded || category.error)) {
        loadExtraCategory(data, category, list);
      }
    }
  
    function updateOffersPanel(data) {
      const content = $("detail-content");
      if (!data || state.baskets.get(state.activeKey) !== data || !content) return;
      const card = content.querySelector("[data-extra-offers-card]");
      if (!card) return;
      const products = Array.isArray(data.offerProducts) ? data.offerProducts : [];
      const visibleCount = Math.max(OFFER_INITIAL_PAGE_SIZE, Math.trunc(Number(data.offerVisibleCount || OFFER_INITIAL_PAGE_SIZE)));
      const visible = products.slice(0, visibleCount);
      const list = card.querySelector("[data-offers-list]");
      const status = card.querySelector("[data-offers-status]");
      const more = card.querySelector("[data-offers-more]");
      const retry = card.querySelector("[data-offers-retry]");
      const button = card.querySelector("[data-offers-toggle]");
      const panel = card.querySelector("#extra-panel-offers");
      if (list) list.innerHTML = visible.map((product) => extraProductMarkup(data, product)).join("");
      if (status) status.textContent = offerStatusText(data);
      if (more) {
        more.hidden = products.length <= visible.length;
        more.disabled = data.offersLoading === true;
      }
      if (retry) retry.hidden = data.offersError !== true;
      if (button) button.setAttribute("aria-expanded", String(data.offersExpanded === true));
      if (panel) panel.hidden = data.offersExpanded !== true;
    }

    async function loadOffers(data) {
      if (!data || data.offersLoading || (data.offersLoaded && !data.offersError)) return;
      data.offersLoading = true;
      data.offersError = false;
      updateOffersPanel(data);
      try {
        const result = await request("offers");
        const products = Array.isArray(result.offers) ? result.offers : [];
        const unique = new Map();
        products.forEach((product) => {
          const id = String(product && (product.id || product.product_id) || "");
          if (!id || product.is_offer !== true || Number(product.stock_quantity || 0) <= 0 || product.price_available === false) return;
          unique.set(id, Object.assign({}, product, { id }));
        });
        data.offerProducts = Array.from(unique.values());
        data.offerVisibleCount = Math.min(OFFER_INITIAL_PAGE_SIZE, data.offerProducts.length);
        data.offersLoaded = true;
        data.offersError = false;
      } catch (_) {
        data.offersError = true;
        data.offersLoaded = false;
      } finally {
        data.offersLoading = false;
        updateOffersPanel(data);
      }
    }

    function toggleOffers() {
      const data = state.baskets.get(state.activeKey);
      if (!data) return;
      data.offersExpanded = data.offersExpanded !== true;
      updateOffersPanel(data);
      if (data.offersExpanded && (!data.offersLoaded || data.offersError)) loadOffers(data);
    }

    function showMoreOffers() {
      const data = state.baskets.get(state.activeKey);
      if (!data || data.offersLoading || !data.offersLoaded) return;
      data.offerVisibleCount = Math.min(
        data.offerProducts.length,
        Math.max(OFFER_INITIAL_PAGE_SIZE, Number(data.offerVisibleCount || OFFER_INITIAL_PAGE_SIZE)) + OFFER_MORE_PAGE_SIZE
      );
      updateOffersPanel(data);
    }

    function loadMoreExtraProducts(categoryKey, listElement) {
      const data = state.baskets.get(state.activeKey);
      const category = data && extraCategoriesFor(data).find((entry) => entry.key === String(categoryKey));
      if (category && category.expanded && category.loaded && category.hasMore) {
        loadExtraCategory(data, category, listElement);
      }
    }
  
    async function loadExtraCategory(data, category, listElement) {
      if (!category || category.loading || !category.hasMore) return;
      category.loading = true;
      category.error = false;

      const sameActiveBasket = () => {
        const activeData = state.baskets.get(state.activeKey);
        if (!activeData) return null;
        const sourceId = String(data.basket && data.basket.id || "");
        const activeId = String(activeData.basket && activeData.basket.id || "");
        if (sourceId ? sourceId !== activeId : activeData !== data) return null;
        const activeCategory = extraCategoriesFor(activeData).find((entry) => entry.key === String(category.key));
        return activeCategory ? { data: activeData, category: activeCategory } : null;
      };
      const currentElements = () => {
        const content = $("detail-content");
        if (!content) return {};
        const card = Array.from(content.querySelectorAll("[data-extra-category-card]"))
          .find((element) => String(element.dataset.extraCategoryCard || "") === String(category.key));
        return {
          card,
          list: card && card.querySelector("[data-extra-list]"),
          status: card && card.querySelector("[data-extra-status]"),
          more: card && card.querySelector("[data-extra-more]")
        };
      };

      const initial = currentElements();
      if (initial.status) initial.status.textContent = category.products.length ? "Carregando mais produtos…" : "Carregando produtos…";
      if (initial.more) {
        initial.more.disabled = true;
        initial.more.textContent = "Carregando…";
      }
      try {
        let fetched = [];
        let pages = 0;
        do {
          const pageSize = category.loaded ? BASKET_EXTRA_MORE_PAGE_SIZE : BASKET_EXTRA_INITIAL_PAGE_SIZE;
          const result = category.searchEnabled
            ? await request("basket_extra_products", { params: {
              basket_id: String(data.basket && data.basket.id || ""),
              theme_id: category.key,
              limit: pageSize,
              offset: category.nextOffset
            } })
            : await request("products", { params: {
              category: category.key,
              limit: pageSize,
              offset: category.nextOffset
            } });
          fetched = Array.isArray(result.products) ? result.products : [];
          category.nextOffset = result.next_offset == null ? category.nextOffset : Number(result.next_offset);
          category.hasMore = result.next_offset != null;
          pages += 1;
        } while (!fetched.length && category.hasMore && pages < 8);
        category.products = category.products.concat(fetched);
        category.loaded = true;

        const active = sameActiveBasket();
        if (active) {
          if (active.category !== category) {
            const merged = new Map();
            for (const product of [...(active.category.products || []), ...(category.products || [])]) {
              const id = String(product && product.id || "");
              if (id) merged.set(id, product);
            }
            active.category.products = Array.from(merged.values());
            active.category.nextOffset = category.nextOffset;
            active.category.hasMore = category.hasMore;
            active.category.loaded = category.loaded;
          }
          const elements = currentElements();
          if (elements.list && !$("detail-sheet").hidden) {
            elements.list.innerHTML = active.category.products
              .map((product) => extraProductMarkup(active.data, product)).join("");
            elements.list.querySelectorAll("img").forEach((image) => image.addEventListener("error", () => {
              image.src = "../img/logoantonia5.png";
            }, { once: true }));
            bindExtraProductControls(elements.list);
            if (elements.status) elements.status.textContent = !active.category.products.length
              ? "Nenhum produto disponível nesta categoria."
              : "";
          }
        }
      } catch (_) {
        category.error = true;
        const active = sameActiveBasket();
        if (active) {
          if (active.category !== category) active.category.error = true;
          const elements = currentElements();
          if (elements.status && !$("detail-sheet").hidden) {
            elements.status.textContent = "Não foi possível carregar. Tente novamente.";
          }
        }
      } finally {
        category.loading = false;
        const active = sameActiveBasket();
        if (active) active.category.loading = false;
        const elements = currentElements();
        const currentCategory = active ? active.category : category;
        if (elements.more) {
          elements.more.hidden = !(currentCategory.error || (currentCategory.loaded && currentCategory.hasMore));
          elements.more.disabled = false;
          elements.more.textContent = currentCategory.error ? "Tentar novamente" : "Carregar mais produtos";
        }
      }
    }

    function freshHomeCategory(category) {
      return { key: category.key, label: category.label, products: [], loaded: false, loading: false, error: false, nextOffset: 0, hasMore: true };
    }

    function homeCategoriesFor() {
      if (!Array.isArray(state.homeExtraCategories)) state.homeExtraCategories = [EXTRA_CATEGORIES[0], ...BUILDER_CATEGORY_DEFAULTS].map(freshHomeCategory);
      if (!state.homeExtraCategories.some((category) => category.key === "mais_vendidos")) state.homeExtraCategories.unshift(freshHomeCategory(EXTRA_CATEGORIES[0]));
      if (!(state.homeExtraSelections instanceof Map)) state.homeExtraSelections = new Map();
      if (!(state.homeExtraProducts instanceof Map)) state.homeExtraProducts = new Map();
      return state.homeExtraCategories;
    }

    function applyBuilderCategories(rows) {
      const current = new Map(homeCategoriesFor().map((category) => [String(category.key), category]));
      const allowed = new Map(BUILDER_CATEGORY_DEFAULTS.map((category) => [category.key, category]));
      const popular = current.get("mais_vendidos") || freshHomeCategory(EXTRA_CATEGORIES[0]);
      const configured = rows.map((row) => {
        const key = String(row && (row.category_key || row.key) || "").trim(), fallback = allowed.get(key);
        if (!fallback) return null;
        const category = current.get(key) || freshHomeCategory(fallback);
        category.key = key; category.label = String(row.label || fallback.label).trim().slice(0, 80) || fallback.label;
        return category;
      }).filter(Boolean);
      state.homeExtraCategories = [popular, ...configured];
      return state.homeExtraCategories;
    }

    function loadBuilderCategories() {
      if (!homeBuilderCategoriesPromise) {
        homeBuilderCategoriesPromise = request("builder_categories").then((result) => {
          if (!Array.isArray(result.categories)) throw new Error("invalid categories");
          return applyBuilderCategories(result.categories);
        }).catch(() => applyBuilderCategories(BUILDER_CATEGORY_DEFAULTS.map((category) => ({ category_key: category.key, label: category.label }))));
      }
      return homeBuilderCategoriesPromise;
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
      const selection = state.homeExtraSelections.get(id);
      const quantity = Number(selection && selection.quantity || 0);
      const stock = Math.max(0, Number(product.stock_quantity || 0));
      return productChoiceMarkup(product, {
        tag: "article",
        role: "listitem",
        quantity,
        attributes: { "data-home-extra-product": id },
        quantityAttributes: { "data-home-extra-quantity": id },
        adjustAttributes: { "data-home-extra-adjust": id },
        decreaseDisabled: quantity <= 0,
        increaseDisabled: quantity >= stock
      });
    }

    function publicOffersStatusText() {
      if (publicOffersLoading) return "Carregando ofertas de hoje…";
      if (publicOffersError) return "Não foi possível carregar as ofertas. Tente novamente.";
      if (!publicOfferProducts.length) return "Nenhum produto em oferta disponível no momento.";
      return publicOfferProducts.length + (publicOfferProducts.length === 1 ? " produto em oferta hoje." : " produtos em oferta hoje.");
    }

    function renderPublicOffers() {
      const host = $("public-offers-products");
      const status = $("public-offers-status");
      const retry = $("public-offers-retry");
      if (!host || !status) return;
      status.textContent = publicOffersStatusText();
      status.dataset.error = String(publicOffersError);
      if (retry) {
        retry.hidden = !publicOffersError;
        retry.disabled = publicOffersLoading;
      }
      const visibleProducts = publicOfferProducts.slice(0, publicOfferVisibleCount);
      host.innerHTML = visibleProducts.map(homeExtraProductMarkup).join("");
      const more = $("public-offers-more");
      if (more) {
        more.hidden = publicOfferProducts.length <= visibleProducts.length;
        more.disabled = publicOffersLoading;
      }
      host.querySelectorAll("[data-home-extra-adjust]").forEach((button) => {
        button.addEventListener("click", () => changeHomeExtraQuantity(button.dataset.homeExtraAdjust, Number(button.dataset.delta || 0)));
      });
      host.querySelectorAll("img").forEach((image) => image.addEventListener("error", () => {
        image.src = "../img/logoantonia5.png";
      }, { once: true }));
    }

    function showMorePublicOffers() {
      publicOfferVisibleCount = Math.min(publicOfferProducts.length, publicOfferVisibleCount + 6);
      renderPublicOffers();
    }

    async function loadPublicOffers(force = false) {
      if (publicOffersLoading && publicOffersPromise) return publicOffersPromise;
      if (publicOffersLoaded && !publicOffersError && !force) return publicOfferProducts;
      publicOffersLoading = true;
      publicOffersError = false;
      if (force) publicOfferVisibleCount = Math.min(6, publicOfferProducts.length);
      homeCategoriesFor();
      renderPublicOffers();
      publicOffersPromise = (async () => {
        try {
          const result = await request("offers");
          const unique = new Map();
          (Array.isArray(result.offers) ? result.offers : []).forEach((product) => {
            const id = String(product && (product.id || product.product_id) || "");
            if (!id || product.is_offer !== true || Number(product.stock_quantity || 0) <= 0 || product.price_available === false) return;
            unique.set(id, Object.assign({}, product, { id }));
          });
          publicOfferProducts = Array.from(unique.values());
          publicOfferVisibleCount = Math.min(6, publicOfferProducts.length);
          publicOfferProducts.forEach((product) => state.homeExtraProducts.set(String(product.id), product));
          publicOffersLoaded = true;
          publicOffersError = false;
          return publicOfferProducts;
        } catch (_) {
          publicOffersError = true;
          publicOffersLoaded = false;
          publicOfferProducts = [];
          publicOfferVisibleCount = 0;
          return [];
        } finally {
          publicOffersLoading = false;
          renderPublicOffers();
        }
      })();
      return publicOffersPromise;
    }

    function initPublicOffers() {
      const host = $("public-offers-products");
      const retry = $("public-offers-retry");
      const more = $("public-offers-more");
      if (!host) return;
      homeCategoriesFor();
      if (retry && retry.dataset.bound !== "true") {
        retry.dataset.bound = "true";
        retry.addEventListener("click", () => { loadPublicOffers(true); });
      }
      if (more && more.dataset.bound !== "true") {
        more.dataset.bound = "true";
        more.addEventListener("click", showMorePublicOffers);
      }
      renderPublicOffers();
      loadPublicOffers();
    }

    function homeExtraCategoryMarkup(category) {
      const panelId = "home-extra-" + category.key, popular = category.key === "mais_vendidos";
      const href = popular ? "#mais-vendidos" : "#categoria/" + encodeURIComponent(category.key);
      const navAttrs = popular ? ' data-experiment-nav="popular"' : ' data-experiment-nav="category" data-category-key="' + esc(category.key) + '"';
      const status = category.loading ? (category.products.length ? "Carregando mais produtos…" : "Carregando produtos…")
        : category.error ? "Não foi possível carregar os produtos." : category.loaded && !category.products.length ? "Nenhum produto disponível nesta categoria." : "";
      const placeholders = !category.loaded && !category.error
        ? Array.from({ length: HOME_EXTRA_INITIAL_PAGE_SIZE }, () => '<div class="home-extra-skeleton" aria-hidden="true"><span></span><i></i><small></small><em></em></div>').join("") : "";
      const loadMore = category.error
        ? '<button class="button button-outline home-extra-more" type="button" data-home-extra-retry="' + esc(category.key) + '">Tentar novamente</button>'
        : category.loaded && category.hasMore
          ? '<button class="button button-outline home-extra-more" type="button" data-home-extra-more="' + esc(category.key) + '"' + (category.loading ? " disabled" : "") + '>' + (category.loading ? "Carregando produtos…" : category.products.length ? "Ver mais produtos" : "Carregar produtos") + '</button>' : "";
      return '<section class="home-extra-category" data-home-extra-section="' + esc(category.key) + '" aria-labelledby="' + esc(panelId) + '-title">' +
        '<div class="home-extra-category-heading"><h3 id="' + esc(panelId) + '-title"><a class="home-extra-category-link" href="' + href + '"' + navAttrs + '>' + esc(category.label) + '</a></h3></div>' +
        '<div class="home-extra-grid" data-home-extra-grid="' + esc(category.key) + '" role="list" aria-label="Produtos de ' + esc(category.label) + '">' +
        (category.products.length ? category.products.map(homeExtraProductMarkup).join("") : placeholders) + '</div>' +
        (status ? '<p class="home-extra-status" role="status">' + esc(status) + '</p>' : '') + loadMore + '</section>';
    }

    function renderBuilderTabs(categories) {
      const host = $("home-extra-category-tabs"); if (!host) return;
      const hash = String(window.location.hash || "").replace(/^#/, "");
      const tabs = [
        { nav: "popular", label: "Mais vendidos", href: "#mais-vendidos", active: hash === "" || hash === "monte-sua-cesta" || hash === "mais-vendidos" },
        { nav: "offers", label: "Ofertas", href: "#ofertas", active: hash === "ofertas" },
        ...categories.map((category) => ({ nav: "category", key: category.key, label: category.label, href: "#categoria/" + encodeURIComponent(category.key), active: hash === "categoria/" + category.key }))
      ];
      host.innerHTML = tabs.map((tab) => '<a class="home-extra-category-tab' + (tab.active ? " is-active" : "") + '" href="' + esc(tab.href) +
        '" data-experiment-nav="' + tab.nav + '"' + (tab.key ? ' data-category-key="' + esc(tab.key) + '"' : "") +
        (tab.active ? ' aria-current="page"' : "") + '>' + esc(tab.label) + '</a>').join("");
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
        if (!target || target.disabled) target = controls.find((button) => !button.disabled);
        if (!target) target = section.querySelector(".home-extra-category-heading h3");
      }
      if (target) target.focus({ preventScroll: true });
    }

    function renderHomeExtras() {
      const all = homeCategoriesFor(), popular = all.filter((category) => category.key === "mais_vendidos"), categories = all.filter((category) => category.key !== "mais_vendidos");
      if (homeExtraObserver) homeExtraObserver.disconnect();
      [{ node: $("home-extra-popular"), items: popular }, { node: $("home-extra-categories"), items: categories }].forEach(({ node, items }) => {
        if (!node) return;
        const focus = homeFocusSnapshot(node);
        node.innerHTML = items.length ? items.map(homeExtraCategoryMarkup).join("") : '<p class="home-extra-empty">Nenhuma categoria está ativa no momento.</p>';
        node.querySelectorAll("[data-home-extra-adjust]").forEach((button) => button.addEventListener("click", () => changeHomeExtraQuantity(button.dataset.homeExtraAdjust, Number(button.dataset.delta || 0))));
        node.querySelectorAll("[data-home-extra-more]").forEach((button) => button.addEventListener("click", () => {
          const category = all.find((entry) => entry.key === button.dataset.homeExtraMore); if (category) loadHomeExtraCategory(category);
        }));
        node.querySelectorAll("[data-home-extra-retry]").forEach((button) => button.addEventListener("click", () => {
          const category = all.find((entry) => entry.key === button.dataset.homeExtraRetry); if (category) loadHomeExtraCategory(category);
        }));
        node.querySelectorAll("img").forEach((image) => image.addEventListener("error", () => { image.src = "../img/logoantonia5.png"; }, { once: true }));
        restoreHomeFocus(node, focus);
      });
      renderBuilderTabs(categories);
      renderHomeExtraSummary();
      if (homeExtraObserver) document.querySelectorAll("#home-extra-popular [data-home-extra-section], #home-extra-categories [data-home-extra-section]").forEach((section) => {
        const category = all.find((entry) => entry.key === section.dataset.homeExtraSection);
        if (category && !category.loaded && !category.loading && !category.error) homeExtraObserver.observe(section);
      });
    }

    function renderHomeExtraSummary() {
      const summary = $("home-extra-summary");
      if (!summary) return;
      const selections = state.homeExtraSelections instanceof Map ? Array.from(state.homeExtraSelections.values()) : [];
      const quantity = selections.reduce((sum, item) => sum + Math.max(0, Math.trunc(Number(item.quantity || 0))), 0);
      const subtotal = selections.reduce((sum, item) =>
        sum + Math.max(0, Number(item.price_cents || 0)) * Math.max(0, Math.trunc(Number(item.quantity || 0))), 0);
      summary.hidden = quantity === 0;
      document.body.classList.toggle("has-home-extra-selection", quantity > 0);
      const count = $("home-extra-summary-count");
      const total = $("home-extra-summary-total");
      const hint = $("home-extra-summary-hint");
      if (count) count.textContent = quantity + (quantity === 1 ? " produto escolhido" : " produtos escolhidos");
      if (total) total.textContent = "Subtotal dos produtos: " + money(subtotal);
      if (hint) hint.textContent = subtotal < 7500
        ? "Pedido personalizado. Mínimo de R$ 75,00; faltam " + money(7500 - subtotal) + ". Cesta pronta não incluída."
        : "Pedido personalizado com estes produtos. Cesta pronta não incluída.";
    }

    function updateHomeExtraCard(productId) {
      const id = String(productId);
      const selection = state.homeExtraSelections.get(id);
      const quantity = Number(selection && selection.quantity || 0);
      const hosts = ["home-extra-popular", "home-extra-categories", "home-extra-product-search-results", "public-offers-products"]
        .map((hostId) => $(hostId)).filter(Boolean);
      hosts.forEach((host) => host.querySelectorAll("[data-home-extra-product]").forEach((card) => {
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
        const selectedLabel = card.querySelector(".product-choice-selected-label");
        if (selectedLabel) {
          selectedLabel.textContent = "Na cesta: " + quantity;
          selectedLabel.hidden = quantity <= 0;
        }
        card.classList.toggle("is-selected", quantity > 0);
        if (minus) minus.disabled = quantity <= 0;
        if (plus) plus.disabled = quantity >= stock;
        if (focusedDelta) {
          let target = focusedDelta === "1" ? plus : minus;
          if (target && target.disabled) target = focusedDelta === "1" ? minus : plus;
          if (target && !target.disabled) target.focus({ preventScroll: true });
        }
      }));
    }

    function syncHomeExtraSelection(productId) {
      renderHomeExtraSummary();
      updateHomeExtraCard(productId);
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
        const selectedLabel = card.querySelector(".product-choice-selected-label");
        if (selectedLabel) {
          selectedLabel.textContent = "Na cesta: " + quantity;
          selectedLabel.hidden = Number(quantity) <= 0;
        }
        card.classList.toggle("is-selected", Number(quantity) > 0);
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
      const quantity = Math.max(0, Math.min(stock, currentQuantity + (Number(delta) > 0 ? 1 : -1)));
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
      if (typeof state.updateSidebarCheckoutCount === "function") state.updateSidebarCheckoutCount();
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
      const quantity = Math.max(0, Math.min(stock, currentQuantity + (Number(delta) > 0 ? 1 : -1)));
      if (quantity === currentQuantity) return;
      setHomeExtraQuantity(product, quantity, state.baskets.get(state.activeKey));
    }

    function loadHomeExtraCategory(category) {
      if (!category) return Promise.resolve(false);
      if (category.loading && category.loadPromise) return category.loadPromise;
      if (category.loading || !category.hasMore) return Promise.resolve(category.loaded);
      category.loading = true;
      category.error = false;
      renderHomeExtras();
      const load = async () => {
        try {
          const result = await request("products", { params: {
            category: category.key, limit: category.loaded ? HOME_EXTRA_MORE_PAGE_SIZE : HOME_EXTRA_INITIAL_PAGE_SIZE, offset: category.nextOffset
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
      };
      const pending = homeExtraLoadQueue.then(load, load);
      category.loadPromise = pending;
      homeExtraLoadQueue = pending.catch(() => {});
      return pending;
    }

    function clearHomeExtraSelections() {
      homeCategoriesFor();
      const selectedIds = new Set(Array.from(state.homeExtraSelections.keys()).map(String));
      state.homeExtraSelections.clear();
      selectedIds.forEach((id) => updateHomeExtraCard(id));
      state.baskets.forEach((data) => {
        if (!(data.homeExtraProductIds instanceof Set) || !(data.extraSelections instanceof Map)) return;
        selectedIds.forEach((id) => {
          if (!data.homeExtraProductIds.has(id)) return;
          data.extraSelections.delete(id);
          data.homeExtraProductIds.delete(id);
        });
        refreshHomeSelectionReview(data);
        if (isActiveVisibleBasket(data)) $("detail-total").textContent = money(displayedTotalCents(data));
      });
      renderHomeExtras();
      if (typeof state.updateSidebarCheckoutCount === "function") state.updateSidebarCheckoutCount();
    }

    function ensureHomeCategory(key) {
      const category = homeCategoriesFor().find((entry) => String(entry.key) === String(key));
      if (!category) return Promise.resolve(false);
      if (category.loaded) return Promise.resolve(true);
      return loadHomeExtraCategory(category).then(() => category.loaded && !category.error);
    }

    function initHomeExtras() {
      const host = $("home-extra-categories");
      if (!host) return;
      bindProductSearch(); initPublicOffers();
      if (state.homeExtraStarted) return;
      state.homeExtraStarted = true;
      if (typeof window.IntersectionObserver === "function") {
        homeExtraObserver = new IntersectionObserver((entries) => entries.filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top).forEach((entry) => {
            const category = homeCategoriesFor().find((item) => item.key === entry.target.dataset.homeExtraSection);
            homeExtraObserver.unobserve(entry.target);
            if (category && !category.loaded && !category.loading && !category.error) loadHomeExtraCategory(category);
          }), { rootMargin: HOME_EXTRA_PREFETCH_MARGIN });
      }
      renderHomeExtras();
      loadBuilderCategories().then(() => {
        renderHomeExtras();
        if (!homeExtraObserver) homeCategoriesFor().reduce((queue, category) => queue.then(() => loadHomeExtraCategory(category)), Promise.resolve());
      });
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

    function changeExtraQuantity(productId, delta) {
      const data = state.baskets.get(state.activeKey);
      if (!data || !productId || !delta) return;
      const category = extraCategoriesFor(data).find((entry) => entry.products.some((product) => String(product.id) === String(productId)));
      const searched = data.extraProductSearch && Array.isArray(data.extraProductSearch.products)
        ? data.extraProductSearch.products.find((entry) => String(entry.id) === String(productId))
        : null;
      const offer = Array.isArray(data.offerProducts)
        ? data.offerProducts.find((entry) => String(entry.id) === String(productId))
        : null;
      const product = (category && category.products.find((entry) => String(entry.id) === String(productId))) ||
        searched || offer || state.homeExtraProducts.get(String(productId));
      if (!product) return;
      const current = data.extraSelections.get(String(productId));
      const currentQuantity = Number(current && current.quantity || 0);
      const quantity = Math.max(0, Math.min(Number(product.stock_quantity || 0), currentQuantity + (Number(delta) > 0 ? 1 : -1)));
      if (quantity === currentQuantity) return;
      if (quantity === 0) data.extraSelections.delete(String(productId));
      else data.extraSelections.set(String(productId), {
        id: String(product.id), name: product.name || "Produto", image_url: product.image_url || "",
        price_cents: Number(product.price_cents || 0), stock_quantity: Number(product.stock_quantity || 0), quantity
      });
      if (state.homeExtraProducts.has(String(productId))) syncHomeSelectionFromBasket(product, quantity, data);
      updateBasketExtraCards(productId, quantity, product.stock_quantity);
      $("detail-total").textContent = money(displayedTotalCents(data));
      if (typeof state.updateSidebarCheckoutCount === "function") state.updateSidebarCheckoutCount();
    }

    return {
      extraTotalCents,
      displayedTotalCents,
      extraCategoriesFor,
      extraCategoriesMarkup,
      bindExtraProductControls,
      toggleExtraCategory,
      initHomeExtras,
      initPublicOffers,
      loadPublicOffers,
      ensureHomeCategory,
      clearHomeExtraSelections,
      syncHomeExtraSelection,
      homeSelectionReviewMarkup,
      bindHomeSelectionControls,
      attachHomeSelections
    };
  }

  window.DonaStorefrontExtras = { create };
})();
