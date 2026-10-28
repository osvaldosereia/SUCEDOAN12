(() => {
  "use strict";

  function create({ state, $, request, toast, renderDetailPreservingScroll, quantityOf, money, displayedTotalCents }) {
    async function changeBasketItemQuantity(positionId, delta) {
      const sizeKey = state.activeKey;
      const data = state.baskets.get(sizeKey);
      if (!data || data.changing) return;
      const current = data.items.find((row) => String(row.position_id) === String(positionId));
      if (!current) return;
      const currentQuantity = quantityOf(current);
      const nextQuantity = Math.max(0, Math.min(1000, currentQuantity + delta));
      if (nextQuantity === currentQuantity) return;
      const selectedItems = data.items.map((row) => Object.assign({}, row));
      const selected = selectedItems.find((row) => String(row.position_id) === String(positionId));
      selected.quantity = nextQuantity;
      const selections = selectedItems.map((row) => ({
        position_id: row.position_id, product_id: row.product_id, quantity: quantityOf(row)
      }));
      data.changing = true;
      data.changingPosition = String(positionId);
      setQuotePendingControls(sizeKey, positionId, true);
      const update = (async () => {
        try {
          const quote = await quoteBasket(data.basket, selections, selectedItems);
          const currentItems = new Map(data.items.map((row) => [String(row.position_id), row]));
          quote.items = quote.items.map((row) => {
            const previous = currentItems.get(String(row.position_id));
            return previous ? Object.assign({}, row, {
              _alternatives: previous._alternatives || row._alternatives || [],
              _optionsLoaded: previous._optionsLoaded === true || row._optionsLoaded === true,
              _optionsLoading: previous._optionsLoading === true,
              _optionsError: previous._optionsError === true,
              _expanded: previous._expanded === true
            }) : row;
          });
          Object.assign(data, quote, { orderable: true, detailLoaded: true });
          updateSelectedProductInPlace(sizeKey, positionId);
        } catch (_) {
          toast("Não foi possível atualizar a quantidade. A quantidade anterior foi mantida.");
        } finally {
          data.changing = false;
          data.changingPosition = "";
          setQuotePendingControls(sizeKey, positionId, false);
          if (data.changePromise === update) data.changePromise = null;
        }
      })();
      data.changePromise = update;
      await update;
    }
  
    async function optionsForItem(basket, item) {
      let alternatives = Array.isArray(item.alternatives) ? item.alternatives.slice() : [];
      const count = Number(item.alternative_count || alternatives.length);
      let offset = alternatives.length;
      while (offset < count && offset < 100) {
        const page = await request("basket_mold_options", { params: {
          basket_id: basket.id,
          composition_number: basket.composition_number || 1,
          position_id: item.position_id,
          selected_product_id: item.product_id || "",
          quantity: item.quantity || item.base_quantity || 0,
          offset
        } });
        const rows = Array.isArray(page.alternatives) ? page.alternatives : [];
        if (!rows.length) break;
        alternatives = alternatives.concat(rows);
        offset = page.next_offset == null ? count : Number(page.next_offset);
      }
      if (!alternatives.length && item.product_id && Number(item.stock_quantity || 0) > 0) alternatives.push({
        product_id: item.product_id, name: item.name, image_url: item.image_url,
        price_cents: item.price_cents, stock_quantity: item.stock_quantity
      });
      const unique = new Map();
      alternatives.forEach((option) => {
        if (option && option.product_id) unique.set(String(option.product_id), option);
      });
      return Array.from(unique.values()).sort((a, b) =>
        Number(a.price_cents || 0) - Number(b.price_cents || 0) ||
        String(a.name || "").localeCompare(String(b.name || ""), "pt-BR")
      );
    }
  
    let visibleOptionScanScheduled = false;

    function queueVisibleOptions() {
      if (visibleOptionScanScheduled) return;
      visibleOptionScanScheduled = true;
      requestAnimationFrame(() => {
        visibleOptionScanScheduled = false;
        const sizeKey = state.activeKey;
        const data = state.baskets.get(sizeKey);
        const content = $("detail-content");
        if (!data || !data.detailLoaded || data.changing || data.optionsBatchPromise || !content || $("detail-sheet").hidden) return;

        const viewport = content.getBoundingClientRect();
        const margin = Math.max(160, Math.round(content.clientHeight * 0.55));
        const targets = Array.from(content.querySelectorAll("[data-product-row]")).filter((row) => {
          const item = data.items.find((entry) => String(entry.position_id) === row.dataset.productRow);
          const count = Math.max(Number(item && item.alternative_count || 0), item && Array.isArray(item._alternatives) ? item._alternatives.length : 0);
          if (!item || count < 2 || !item._expanded || item._optionsLoaded || item._optionsLoading || item._optionsError) return false;
          const rect = row.getBoundingClientRect();
          return rect.bottom >= viewport.top - margin && rect.top <= viewport.bottom + margin;
        }).slice(0, 8).map((row) =>
          data.items.find((entry) => String(entry.position_id) === row.dataset.productRow)
        );
        if (targets.length) loadOptionsForItems(sizeKey, data, targets);
      });
    }

    function loadOptionsForItems(sizeKey, data, items) {
      if (data.optionsBatchPromise) return data.optionsBatchPromise;
      const targets = items.filter((item) => item && !item._optionsLoaded && !item._optionsLoading);
      if (!targets.length) return Promise.resolve();

      targets.forEach((item) => {
        item._optionsLoading = true;
        item._optionsError = false;
      });
      const positionId = targets[0].position_id;
      const operation = Promise.resolve().then(async () => {
        try {
          const response = await request("basket_mold_options_batch", {
            method: "POST",
            body: {
              basket_id: data.basket.id,
              composition_number: data.basket.composition_number || 1,
              positions: targets.map((item) => ({
                position_id: item.position_id,
                selected_product_id: item.product_id || "",
                quantity: quantityOf(item)
              }))
            }
          });
          const byPosition = new Map((response.positions || []).map((row) => [String(row.position_id), row]));
          for (const item of targets) {
            const result = byPosition.get(String(item.position_id));
            if (!result) throw new Error("Missing basket options result.");
            item._alternatives = Array.isArray(result.alternatives) ? result.alternatives : [];
            item.alternative_count = Number(result.alternative_count || 0);
            if (item.alternative_count > item._alternatives.length && item.alternative_count <= 100) {
              item._alternatives = await optionsForItem(data.basket, Object.assign({}, item, {
                alternatives: item._alternatives,
                alternative_count: item.alternative_count
              }));
            }
            item._optionsLoaded = true;
            item._optionsError = false;
          }
        } catch (_) {
          targets.forEach((item) => { item._optionsError = true; });
        } finally {
          targets.forEach((item) => { item._optionsLoading = false; });
          if (data.optionsBatchPromise === operation) data.optionsBatchPromise = null;
          if (state.activeKey === sizeKey && !$("detail-sheet").hidden) {
            renderDetailPreservingScroll(positionId);
            queueVisibleOptions();
          }
        }
      });
      data.optionsBatchPromise = operation;
      if (state.activeKey === sizeKey && !$("detail-sheet").hidden) renderDetailPreservingScroll(positionId);
      return operation;
    }

    async function quoteBasket(basket, selections, alternativesByPosition) {
      const quoted = await request("basket_mold_quote", {
        method: "POST",
        body: {
          basket_id: basket.id,
          composition_number: basket.composition_number || 1,
          items: selections,
          lightweight: true
        }
      });
      const original = new Map((alternativesByPosition || []).map((item) => [String(item.position_id), item]));
      const items = (quoted.items || []).map((item) => {
        const previous = original.get(String(item.position_id)) || {};
        return Object.assign({}, item, {
          _alternatives: previous._alternatives || [],
          _optionsLoaded: previous._optionsLoaded === true,
          _optionsLoading: false,
          _optionsError: false,
          _expanded: previous._expanded === true
        });
      });
      return { basket: quoted.basket, items, totalCents: Number(quoted.total_cents || quoted.basket && quoted.basket.display_price_cents || 0) };
    }
  
    async function basketForSize(sizeKey) {
      const initial = await request("basket_by_size", { params: { size_key: sizeKey, lightweight: "1" } });
      const basket = initial.basket;
      const rawItems = Array.isArray(initial.items) ? initial.items : [];
      return {
        basket,
        items: rawItems.map((item) => {
          const alternativeCount = Math.max(
            Number(item.alternative_count || 0),
            Array.isArray(item.alternatives) ? item.alternatives.length : 0
          );
          return Object.assign({}, item, {
            _alternatives: [],
            _optionsLoaded: false,
            _optionsLoading: false,
            _optionsError: false,
            _expanded: alternativeCount > 1
          });
        }),
        totalCents: Number(basket.display_price_cents || 0),
        orderable: Number(basket.stock_quantity || 0) > 0,
        detailLoaded: true,
        detailPromise: null,
        changePromise: null,
        extraCategories: null,
        extraSelections: new Map()
      };
    }
  
    async function toggleItemOptions(positionId) {
      const sizeKey = state.activeKey;
      const data = state.baskets.get(sizeKey);
      if (!data || data.changing) return;
      const item = data.items.find((row) => String(row.position_id) === String(positionId));
      if (!item || item._optionsLoading) return;

      if (item._expanded && !item._optionsError) {
        item._expanded = false;
        renderDetailPreservingScroll(positionId);
        return;
      }

      item._expanded = true;
      item._optionsError = false;
      if (item._optionsLoaded) {
        renderDetailPreservingScroll(positionId);
        return;
      }

      renderDetailPreservingScroll(positionId);
      if (data.optionsBatchPromise) await data.optionsBatchPromise;
      if (!item._optionsLoaded && !item._optionsLoading) await loadOptionsForItems(sizeKey, data, [item]);
    }
  
    function setQuotePendingControls(sizeKey, positionId, pending) {
      if (state.activeKey !== sizeKey || $("detail-sheet").hidden) return;
      const data = state.baskets.get(sizeKey);
      const content = $("detail-content");
      content.querySelectorAll("[data-select-position], [data-toggle-position], [data-adjust-position]").forEach((button) => {
        const buttonPosition = button.dataset.selectPosition || button.dataset.togglePosition || button.dataset.adjustPosition;
        const item = data.items.find((row) => String(row.position_id) === String(buttonPosition));
        const delta = Number(button.dataset.delta || 0);
        const atMinimum = button.dataset.adjustPosition && delta < 0 && quantityOf(item) <= 0;
        const atLimit = button.dataset.adjustPosition && delta > 0 && quantityOf(item) >= 1000;
        button.disabled = Boolean(pending || item && item._optionsLoading || atMinimum || atLimit);
      });
      content.querySelectorAll(".variation-panel").forEach((panel) => {
        const row = panel.closest("[data-product-row]");
        const item = row && data.items.find((entry) => String(entry.position_id) === row.dataset.productRow);
        const changingThisItem = Boolean(pending && row && row.dataset.productRow === String(positionId));
        if (changingThisItem || item && item._optionsLoading) panel.setAttribute("aria-busy", "true");
        else panel.removeAttribute("aria-busy");
      });
      if (!pending) queueVisibleOptions();
    }
  
    function updateSelectedProductInPlace(sizeKey, positionId) {
      if (state.activeKey !== sizeKey || $("detail-sheet").hidden) return;
      const data = state.baskets.get(sizeKey);
      const item = data && data.items.find((row) => String(row.position_id) === String(positionId));
      const content = $("detail-content");
      const row = Array.from(content.querySelectorAll("[data-product-row]")).find((entry) => entry.dataset.productRow === String(positionId));
      if (!data || !item || !row) return;
  
      const image = row.querySelector(".product-row-main img");
      const name = row.querySelector(".product-name");
      const quantity = row.querySelector(".product-quantity-line strong");
      if (image) image.src = item.image_url || "../img/cestas/cesta-mini.jpg";
      if (name) name.textContent = item.name || "Produto";
      if (quantity) quantity.textContent = "Quantidade:";
      const quantityValue = row.querySelector("[data-quantity-value]");
      if (quantityValue) quantityValue.textContent = String(quantityOf(item));
      row.querySelectorAll("[data-adjust-position]").forEach((button) => {
        button.disabled = Number(button.dataset.delta || 0) < 0 ? quantityOf(item) <= 0 : quantityOf(item) >= 1000;
      });
  
      row.querySelectorAll("[data-select-product]").forEach((button) => {
        const selected = String(button.dataset.selectProduct) === String(item.product_id);
        button.classList.toggle("is-selected", selected);
        button.setAttribute("aria-pressed", String(selected));
        let marker = button.querySelector(".product-choice-check");
        if (selected && !marker) {
          marker = document.createElement("span");
          marker.className = "product-choice-check";
          marker.setAttribute("aria-hidden", "true");
          marker.textContent = "✓";
          button.appendChild(marker);
        } else if (!selected && marker) {
          marker.remove();
        }
      });
      $("detail-total").textContent = money(displayedTotalCents(data));
    }
  
    async function changeProduct(positionId, productId) {
      const sizeKey = state.activeKey;
      const data = state.baskets.get(sizeKey);
      if (!data || data.changing) return;
  
      const item = data.items.find((row) => String(row.position_id) === String(positionId));
      const choice = item && (item._alternatives || []).find((option) => String(option.product_id) === String(productId));
      if (!item || !choice || String(item.product_id) === String(productId)) return;
      if (data.items.some((row) => row._optionsLoading)) {
        toast("Aguarde o carregamento das opções antes de trocar outro produto.");
        return;
      }
  
      const selectedItems = data.items.map((row) => Object.assign({}, row));
      const selectedItem = selectedItems.find((row) => String(row.position_id) === String(positionId));
      Object.assign(selectedItem, {
        product_id: choice.product_id,
        name: choice.name || selectedItem.name,
        image_url: choice.image_url || selectedItem.image_url,
        packaging: choice.packaging || selectedItem.packaging,
        stock_quantity: choice.stock_quantity,
        price_cents: choice.price_cents
      });
      const selections = selectedItems.map((row) => ({
        position_id: row.position_id,
        product_id: row.product_id,
        quantity: quantityOf(row)
      }));
  
      data.changing = true;
      data.changingPosition = String(positionId);
      setQuotePendingControls(sizeKey, positionId, true);
  
      const update = (async () => {
        try {
          const quote = await quoteBasket(data.basket, selections, selectedItems);
          const currentItems = new Map(data.items.map((row) => [String(row.position_id), row]));
          quote.items = quote.items.map((row) => {
            const current = currentItems.get(String(row.position_id));
            return current ? Object.assign({}, row, {
              _alternatives: current._alternatives || row._alternatives || [],
              _optionsLoaded: current._optionsLoaded === true || row._optionsLoaded === true,
              _optionsLoading: current._optionsLoading === true,
              _optionsError: current._optionsError === true,
              _expanded: current._expanded === true
            }) : row;
          });
          Object.assign(data, quote, { orderable: true, detailLoaded: true });
          updateSelectedProductInPlace(sizeKey, positionId);
          return true;
        } catch (_) {
          toast("Essa troca não está disponível agora. A escolha anterior foi mantida.");
          return false;
        } finally {
          data.changing = false;
          data.changingPosition = "";
          setQuotePendingControls(sizeKey, positionId, false);
          if (data.changePromise === update) data.changePromise = null;
        }
      })();
      data.changePromise = update;
      await update;
    }

    const detailContent = $("detail-content");
    if (detailContent) detailContent.addEventListener("scroll", queueVisibleOptions, { passive: true });

    return {
      basketForSize,
      toggleItemOptions,
      queueVisibleOptions,
      changeBasketItemQuantity,
      changeProduct
    };
  }

  window.DonaStorefrontBasket = { create };
})();
