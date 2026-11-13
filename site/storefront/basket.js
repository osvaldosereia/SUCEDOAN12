(() => {
  "use strict";

  function create({ state, $, request, toast, renderDetailPreservingScroll, quantityOf, money, displayedTotalCents }) {
    function optionRowsForItem(item) {
      const rows = (Array.isArray(item && item.selected_options) ? item.selected_options : [])
        .filter((option) => option && option.product_id)
        .map((option) => Object.assign({}, option, {
          product_id: String(option.product_id),
          quantity: Math.max(0, Math.min(1000, Math.trunc(Number(option.quantity || 0))))
        }))
        .filter((option) => option.quantity > 0);
      if (rows.length) return rows;
      const productId = String(item && item.product_id || "");
      if (!productId) return [];
      const alternative = (item && item._alternatives || []).find((option) => String(option.product_id) === productId) || {};
      return [Object.assign({}, alternative, item || {}, {
        product_id: productId,
        quantity: Math.max(0, Math.min(1000, Math.trunc(Number(quantityOf(item) || 0))))
      })];
    }

    function quoteSelectionForItem(item) {
      const options = optionRowsForItem(item);
      const quantity = options.reduce((sum, option) => sum + option.quantity, 0);
      return {
        position_id: item.position_id,
        product_id: options[0]?.product_id || item.product_id,
        quantity: options.length ? quantity : Math.max(0, Math.trunc(Number(quantityOf(item) || 0))),
        options: options.filter((option) => option.quantity > 0).map((option) => ({
          product_id: option.product_id,
          quantity: option.quantity
        }))
      };
    }

    function cloneBasketItems(items) {
      return items.map((item) => Object.assign({}, item, {
        selected_options: optionRowsForItem(item)
      }));
    }

    function applyOptionQuantity(item, productId, delta, enforceStock) {
      const id = String(productId || "");
      const currentOptions = optionRowsForItem(item);
      const existing = currentOptions.find((option) => String(option.product_id) === id);
      const choice = existing || (item._alternatives || []).find((option) => String(option.product_id) === id);
      if (!id || !choice || (delta !== -1 && delta !== 1)) return false;
      const current = existing ? Math.max(0, Math.trunc(Number(existing.quantity || 0))) : 0;
      const stock = Math.max(0, Math.trunc(Number(choice.stock_quantity || 0)));
      if (delta < 0 && current <= 0) return false;
      if (delta > 0 && (current >= 1000 || (enforceStock && (current >= stock || Number(quantityOf(item) || 0) >= 1000)))) return false;
      const next = Math.max(0, Math.min(1000, current + delta));
      const updated = currentOptions.filter((option) => String(option.product_id) !== id && option.quantity > 0);
      if (next > 0) updated.push(Object.assign({}, choice, existing || {}, { product_id: id, quantity: next }));
      item.selected_options = updated;
      item.quantity = updated.reduce((sum, option) => sum + Number(option.quantity || 0), 0);
      const representative = updated[0] || choice;
      item.product_id = representative.product_id || item.product_id;
      item.name = representative.name || item.name;
      item.image_url = representative.image_url || item.image_url;
      item.packaging = representative.packaging || item.packaging;
      item.stock_quantity = representative.stock_quantity ?? item.stock_quantity;
      item.price_cents = representative.price_cents ?? item.price_cents;
      return true;
    }

    async function quoteAndApplySelection(sizeKey, data, positionId, selectedItems, failureMessage) {
      const selections = selectedItems.map(quoteSelectionForItem);
      data.changing = true;
      data.changingPosition = String(positionId);
      setQuotePendingControls(sizeKey, positionId, true);
      const update = (async () => {
        let succeeded = false;
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
              _optionsNextOffset: Number(previous._optionsNextOffset ?? row._optionsNextOffset ?? 0),
              _optionsMoreLoading: previous._optionsMoreLoading === true,
              _optionsPageLoading: previous._optionsPageLoading === true,
              _optionsPageError: previous._optionsPageError === true
            }) : row;
          });
          Object.assign(data, quote, { orderable: true, detailLoaded: true });
          updateSelectedProductInPlace(sizeKey, positionId);
          succeeded = true;
        } catch (_) {
          toast(failureMessage);
        } finally {
          data.changing = false;
          data.changingPosition = "";
          setQuotePendingControls(sizeKey, positionId, false);
          if (typeof state.updateSidebarCheckoutCount === "function") state.updateSidebarCheckoutCount();
          if (data.changePromise === update) data.changePromise = null;
        }
        return succeeded;
      })();
      data.changePromise = update;
      return await update;
    }

    async function changeBasketItemQuantity(positionId, delta) {
      const sizeKey = state.activeKey;
      const data = state.baskets.get(sizeKey);
      if (!data || data.changing || (delta !== -1 && delta !== 1)) return;
      const current = data.items.find((row) => String(row.position_id) === String(positionId));
      if (!current) return;
      const currentQuantity = Math.max(0, Math.trunc(Number(quantityOf(current) || 0)));
      const nextQuantity = Math.max(0, Math.min(1000, currentQuantity + delta));
      if (nextQuantity === currentQuantity) return;
      const selectedItems = cloneBasketItems(data.items);
      const selected = selectedItems.find((row) => String(row.position_id) === String(positionId));
      const options = optionRowsForItem(selected);
      const target = delta > 0
        ? options[0] || (selected._alternatives || [])[0]
        : options.slice().reverse().find((option) => option.quantity > 0);
      if (!target || !applyOptionQuantity(selected, target.product_id, delta, false)) return;
      return await quoteAndApplySelection(sizeKey, data, positionId, selectedItems,
        "Não foi possível atualizar a quantidade. A quantidade anterior foi mantida.");
    }

    function normalizeOptionRows(alternatives, item) {
      const rows = Array.isArray(alternatives) ? alternatives.slice() : [];
      if (!rows.length && item.product_id && item.is_active !== false && Number(item.stock_quantity || 0) > 0) rows.push({
        product_id: item.product_id, name: item.name, image_url: item.image_url,
        price_cents: item.price_cents, stock_quantity: item.stock_quantity,
        is_active: item.is_active, default_product_id: item.default_product_id
      });
      const unique = new Map();
      rows.forEach((option) => {
        if (option && option.product_id && option.is_active !== false) unique.set(String(option.product_id), option);
      });
      const defaultId = String(item.default_product_id || item.product_id || "");
      return Array.from(unique.values()).sort((a, b) =>
        (String(a.product_id) === defaultId ? -1 : 0) - (String(b.product_id) === defaultId ? -1 : 0) ||
        Number(b.stock_quantity || 0) - Number(a.stock_quantity || 0) ||
        Number(a.sort_order || 0) - Number(b.sort_order || 0) ||
        String(a.name || "").localeCompare(String(b.name || ""), "pt-BR")
      );
    }

    function optionsPageForItem(basket, item, offset) {
      return request("basket_mold_options", { params: {
        basket_id: basket.id,
        composition_number: basket.composition_number || 1,
        position_id: item.position_id,
        selected_product_id: item.product_id || "",
        selected_product_ids: optionRowsForItem(item).map((option) => option.product_id).join(","),
        quantity: quantityOf(item),
        offset
      } });
    }

    async function optionsForItem(basket, item, requiredProductIds) {
      let alternatives = Array.isArray(item.alternatives) ? item.alternatives.slice() : [];
      const count = Number(item.alternative_count || alternatives.length);
      const required = new Set((Array.isArray(requiredProductIds) ? requiredProductIds : []).map(String));
      const hasRequiredOptions = () => !required.size || Array.from(required).every((id) =>
        alternatives.some((option) => String(option && option.product_id || "") === id)
      );
      let offset = alternatives.length;
      while (offset < count && offset < 100 && !hasRequiredOptions()) {
        const page = await optionsPageForItem(basket, item, offset);
        const rows = Array.isArray(page.alternatives) ? page.alternatives : [];
        const nextOffset = page.next_offset == null ? offset + rows.length : Number(page.next_offset);
        if (!rows.length || nextOffset <= offset) break;
        alternatives = alternatives.concat(rows);
        offset = nextOffset;
      }
      return normalizeOptionRows(alternatives, item);
    }

    let pendingOptionScanScheduled = false;

    function queuePendingOptions() {
      if (pendingOptionScanScheduled) return;
      pendingOptionScanScheduled = true;
      requestAnimationFrame(() => {
        pendingOptionScanScheduled = false;
        const sizeKey = state.activeKey;
        const data = state.baskets.get(sizeKey);
        const content = $("detail-content");
        if (!data || !data.detailLoaded || data.changing || data.optionsBatchPromise || !Array.isArray(data.items) || $("detail-sheet").hidden || !content) return;

        const viewportHeight = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);
        const rowsByPosition = new Map(Array.from(content.querySelectorAll("[data-product-row]"))
          .map((row) => [String(row.dataset.productRow || ""), row]));
        const candidates = data.items.map((item) => {
          const count = Math.max(Number(item && item.alternative_count || 0), item && Array.isArray(item._alternatives) ? item._alternatives.length : 0);
          const row = item && rowsByPosition.get(String(item.position_id || ""));
          if (!row || count <= 1) return null;
          const rect = row.getBoundingClientRect();
          if (rect.bottom <= -viewportHeight * 0.18 || rect.top >= viewportHeight * 1.45) return null;
          const visible = rect.bottom > 0 && rect.top < viewportHeight;
          const distance = visible ? Math.max(0, rect.top) : rect.top >= viewportHeight ? rect.top - viewportHeight : Math.abs(rect.bottom);
          return { item, visible, distance, top: rect.top };
        }).filter(Boolean).sort((a, b) =>
          Number(b.visible) - Number(a.visible) || a.distance - b.distance || a.top - b.top
        );

        const firstPages = candidates
          .filter(({ item }) => !item._optionsLoaded && !item._optionsLoading && !item._optionsError)
          .slice(0, 3)
          .map(({ item }) => item);
        if (firstPages.length) {
          loadOptionsForItems(sizeKey, data, firstPages);
          return;
        }

        const expandedOptionGroups = state.expandedOptionGroups instanceof Set ? state.expandedOptionGroups : null;
        const nextPage = candidates.find(({ item }) => {
          const optionGroupKey = String(sizeKey || "") + ":" + String(item.position_id || "");
          return Boolean(expandedOptionGroups && expandedOptionGroups.has(optionGroupKey)) &&
            item._optionsLoaded && item._optionsMoreLoading && !item._optionsPageLoading && !item._optionsPageError;
        });
        if (nextPage) loadNextOptionsPage(sizeKey, data, nextPage.item);
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
            readOnly: true,
            body: {
              basket_id: data.basket.id,
              composition_number: data.basket.composition_number || 1,
              positions: targets.map((item) => ({
                position_id: item.position_id,
                selected_product_id: item.product_id || "",
                selected_product_ids: optionRowsForItem(item).map((option) => option.product_id),
                quantity: quantityOf(item)
              }))
            }
          });
          const byPosition = new Map((response.positions || []).map((row) => [String(row.position_id), row]));
          const loadedOptions = [];
          for (const item of targets) {
            const result = byPosition.get(String(item.position_id));
            if (!result) throw new Error("Missing basket options result.");
            const rawAlternatives = Array.isArray(result.alternatives) ? result.alternatives : [];
            const alternativeCount = Number(result.alternative_count || 0);
            loadedOptions.push({
              item,
              alternatives: normalizeOptionRows(rawAlternatives, item),
              alternativeCount,
              nextOffset: rawAlternatives.length
            });
          }
          loadedOptions.forEach(({ item, alternatives, alternativeCount, nextOffset }) => {
            item._alternatives = alternatives;
            item.alternative_count = alternativeCount;
            item._optionsLoaded = true;
            item._optionsError = false;
            item._optionsNextOffset = nextOffset;
            item._optionsMoreLoading = alternativeCount > nextOffset && nextOffset < 100;
            item._optionsPageLoading = false;
            item._optionsPageError = false;
          });
        } catch (_) {
          targets.forEach((item) => { item._optionsError = true; });
        } finally {
          targets.forEach((item) => { item._optionsLoading = false; });
          if (data.optionsBatchPromise === operation) data.optionsBatchPromise = null;
          if (state.activeKey === sizeKey && !$("detail-sheet").hidden) {
            renderDetailPreservingScroll(positionId);
            queuePendingOptions();
          }
        }
      });
      data.optionsBatchPromise = operation;
      if (state.activeKey === sizeKey && !$("detail-sheet").hidden) renderDetailPreservingScroll(positionId);
      return operation;
    }

    function loadNextOptionsPage(sizeKey, data, item) {
      if (!data || !item || data.optionsBatchPromise || !item._optionsMoreLoading || item._optionsPageLoading) {
        return data && data.optionsBatchPromise || Promise.resolve();
      }
      const positionId = String(item.position_id || "");
      const offset = Math.max(0, Number(item._optionsNextOffset || 0));
      item._optionsPageLoading = true;
      item._optionsPageError = false;

      const operation = Promise.resolve().then(async () => {
        try {
          const page = await optionsPageForItem(data.basket, item, offset);
          const rows = Array.isArray(page.alternatives) ? page.alternatives : [];
          const nextOffset = page.next_offset == null ? offset + rows.length : Number(page.next_offset);
          const current = data.items.find((row) => String(row.position_id) === positionId) || item;
          current._alternatives = normalizeOptionRows((current._alternatives || []).concat(rows), current);
          current.alternative_count = Number(page.alternative_count || current.alternative_count || 0);
          current._optionsLoaded = true;
          current._optionsNextOffset = nextOffset;
          current._optionsMoreLoading = rows.length > 0 && nextOffset > offset &&
            nextOffset < current.alternative_count && nextOffset < 100;
          current._optionsPageError = false;
          if (current !== item) {
            item._alternatives = current._alternatives;
            item._optionsNextOffset = current._optionsNextOffset;
            item._optionsMoreLoading = current._optionsMoreLoading;
          }
        } catch (_) {
          const current = data.items.find((row) => String(row.position_id) === positionId) || item;
          current._optionsMoreLoading = true;
          current._optionsPageError = true;
          if (current !== item) item._optionsPageError = true;
        } finally {
          const current = data.items.find((row) => String(row.position_id) === positionId) || item;
          current._optionsPageLoading = false;
          item._optionsPageLoading = false;
          if (data.optionsBatchPromise === operation) data.optionsBatchPromise = null;
          if (state.activeKey === sizeKey && !$("detail-sheet").hidden) {
            renderDetailPreservingScroll(positionId);
            queuePendingOptions();
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
            _optionsNextOffset: 0,
            _optionsMoreLoading: false,
            _optionsPageLoading: false,
            _optionsPageError: false,
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
  
    async function restoreBasketSelections(data, savedRows) {
      const savedByPosition = new Map((Array.isArray(savedRows) ? savedRows : []).map((row) => [
        String(row && row.position_id || ""),
        row
      ]).filter(([positionId]) => positionId));
      let configurationChanged = savedByPosition.size !== (data.items || []).length;
      const currentPositions = new Set((data.items || []).map((item) => String(item.position_id)));
      if (Array.from(savedByPosition.keys()).some((positionId) => !currentPositions.has(positionId))) configurationChanged = true;
      const restoredItems = await Promise.all((data.items || []).map(async (item) => {
        const saved = savedByPosition.get(String(item.position_id));
        if (!saved) {
          configurationChanged = true;
          return Object.assign({}, item);
        }
        const requested = Array.isArray(saved.options) && saved.options.length
          ? saved.options
          : saved.product_id ? [{ product_id: saved.product_id, quantity: saved.quantity }] : [];
        const normalized = requested.map((option) => ({
          product_id: String(option && option.product_id || ""),
          quantity: Math.max(0, Math.min(1000, Math.trunc(Number(option && option.quantity || 0))))
        })).filter((option) => option.product_id && option.quantity > 0);
        const desiredTotal = Math.max(0, Math.min(1000, Math.trunc(Number(saved.quantity || 0))));
        let choices = (item._alternatives || []).slice();
        let optionLookupFailed = false;
        const needsOptionLookup = normalized.some((option) => option.product_id !== String(item.product_id || ""));
        if (needsOptionLookup || normalized.length > 1) {
          try {
            choices = await optionsForItem(
              data.basket,
              Object.assign({}, item, { selected_options: normalized }),
              normalized.map((option) => option.product_id)
            );
          } catch (_) {
            optionLookupFailed = true;
          }
        }
        const choiceMap = new Map(choices.map((option) => [String(option.product_id), option]));
        const restoredOptions = [];
        let unavailableQuantity = 0;
        for (const option of normalized) {
          const choice = choiceMap.get(option.product_id) ||
            (option.product_id === String(item.product_id || "") ? item : null) ||
            (optionLookupFailed ? { product_id: option.product_id } : null);
          if (choice) restoredOptions.push(Object.assign({}, choice, { product_id: option.product_id, quantity: option.quantity }));
          else {
            unavailableQuantity += option.quantity;
            configurationChanged = true;
          }
        }
        if (unavailableQuantity > 0) {
          const fallbackId = String(item.product_id || "");
          const fallback = choiceMap.get(fallbackId) || item;
          const existing = restoredOptions.find((option) => String(option.product_id) === fallbackId);
          if (existing) existing.quantity += unavailableQuantity;
          else restoredOptions.unshift(Object.assign({}, fallback, { product_id: fallbackId, quantity: unavailableQuantity }));
        }
        if (!restoredOptions.length && desiredTotal > 0 && item.product_id) {
          restoredOptions.push(Object.assign({}, item, { quantity: desiredTotal }));
          configurationChanged = true;
        }
        const quantity = restoredOptions.reduce((sum, option) => sum + option.quantity, 0);
        const representative = restoredOptions[0] || item;
        return Object.assign({}, item, {
          selected_options: restoredOptions,
          product_id: representative.product_id || item.product_id,
          name: representative.name || item.name,
          image_url: representative.image_url || item.image_url,
          packaging: representative.packaging || item.packaging,
          stock_quantity: representative.stock_quantity ?? item.stock_quantity,
          price_cents: representative.price_cents ?? item.price_cents,
          quantity
        });
      }));
      const quoteSelections = restoredItems.map(quoteSelectionForItem);
      try {
        const quote = await quoteBasket(data.basket, quoteSelections, restoredItems);
        return Object.assign({}, data, quote, {
          orderable: data.orderable !== false,
          detailLoaded: true,
          cartQuoteRefreshed: true,
          cartConfigurationChanged: configurationChanged
        });
      } catch (error) {
        const errorCode = String(error && error.message || "");
        if (!["basket_mold_option_invalid", "basket_mold_component_invalid"].includes(errorCode)) throw error;
        configurationChanged = true;
        const fallbackItems = restoredItems.map((item) => {
          const quantity = Math.max(0, Math.min(1000, Math.trunc(Number(quantityOf(item) || 0))));
          return Object.assign({}, item, {
            selected_options: quantity > 0 ? [Object.assign({}, item, { quantity })] : [],
            quantity
          });
        });
        const quote = await quoteBasket(data.basket, fallbackItems.map(quoteSelectionForItem), fallbackItems);
        return Object.assign({}, data, quote, {
          orderable: data.orderable !== false,
          detailLoaded: true,
          cartQuoteRefreshed: true,
          cartConfigurationChanged: true
        });
      }
    }

    async function retryItemOptions(positionId) {
      const sizeKey = state.activeKey;
      const data = state.baskets.get(sizeKey);
      if (!data || data.changing) return;
      let item = data.items.find((row) => String(row.position_id) === String(positionId));
      if (!item || item._optionsLoading || item._optionsPageLoading) return;
      const retryingNextPage = item._optionsLoaded && item._optionsPageError;
      if (item._optionsLoaded && !retryingNextPage) return;

      if (retryingNextPage) item._optionsPageError = false;
      else item._optionsError = false;
      renderDetailPreservingScroll(positionId);
      if (data.optionsBatchPromise) await data.optionsBatchPromise;
      item = data.items.find((row) => String(row.position_id) === String(positionId));
      if (!item) return;
      if (retryingNextPage && item._optionsMoreLoading && !item._optionsPageLoading) {
        await loadNextOptionsPage(sizeKey, data, item);
      } else if (!item._optionsLoaded && !item._optionsLoading) {
        await loadOptionsForItems(sizeKey, data, [item]);
      }
    }

    function setQuotePendingControls(sizeKey, positionId, pending) {
      if (state.activeKey !== sizeKey || $("detail-sheet").hidden) return;
      const data = state.baskets.get(sizeKey);
      const content = $("detail-content");
      content.querySelectorAll("[data-adjust-position], [data-adjust-option]").forEach((button) => {
        const buttonPosition = button.dataset.adjustPosition;
        const item = data.items.find((row) => String(row.position_id) === String(buttonPosition));
        const delta = Number(button.dataset.delta || 0);
        const isOption = button.hasAttribute("data-adjust-option");
        const option = isOption
          ? optionRowsForItem(item).find((row) => String(row.product_id) === String(button.dataset.adjustProduct))
          : null;
        const choice = isOption
          ? option || (item && item._alternatives || []).find((row) => String(row.product_id) === String(button.dataset.adjustProduct))
          : null;
        const quantity = isOption ? Number(option && option.quantity || 0) : Number(quantityOf(item) || 0);
        const stock = Number(choice && choice.stock_quantity || 0);
        const atMinimum = delta < 0 && quantity <= 0;
        const atLimit = delta > 0 && (isOption ? quantity >= stock || Number(quantityOf(item) || 0) >= 1000 : quantity >= 1000);
        button.disabled = Boolean(pending || item && item._optionsLoading || atMinimum || atLimit);
      });
      content.querySelectorAll(".variation-panel").forEach((panel) => {
        const row = panel.closest("[data-product-row]");
        const item = row && data.items.find((entry) => String(entry.position_id) === row.dataset.productRow);
        const changingThisItem = Boolean(pending && row && row.dataset.productRow === String(positionId));
        if (changingThisItem || item && (item._optionsLoading || item._optionsPageLoading)) panel.setAttribute("aria-busy", "true");
        else panel.removeAttribute("aria-busy");
      });
      if (!pending) queuePendingOptions();
    }

    function updateSelectedProductInPlace(sizeKey, positionId) {
      if (state.activeKey !== sizeKey || $("detail-sheet").hidden) return;
      const data = state.baskets.get(sizeKey);
      const item = data && data.items.find((row) => String(row.position_id) === String(positionId));
      const content = $("detail-content");
      const row = Array.from(content.querySelectorAll("[data-product-row]")).find((entry) => entry.dataset.productRow === String(positionId));
      if (!data || !item || !row) return;

      const selected = new Map(optionRowsForItem(item).map((option) => [String(option.product_id), option]));
      row.querySelectorAll("[data-option-card]").forEach((card) => {
        const productId = String(card.dataset.optionCard || "");
        const option = selected.get(productId);
        const quantity = Number(option && option.quantity || 0);
        card.classList.toggle("is-selected", quantity > 0);
        const output = Array.from(card.querySelectorAll("[data-option-quantity]")).find((node) => String(node.dataset.optionQuantity) === productId);
        if (output) output.textContent = String(quantity);
      });
      row.querySelectorAll("[data-adjust-option]").forEach((button) => {
        const option = selected.get(String(button.dataset.adjustProduct || ""));
        const alternative = (item._alternatives || []).find((entry) => String(entry.product_id) === String(button.dataset.adjustProduct || ""));
        const quantity = Number(option && option.quantity || 0);
        const stock = Number((option || alternative || {}).stock_quantity || 0);
        button.disabled = Boolean(data.changing || item._optionsLoading || (Number(button.dataset.delta || 0) < 0 ? quantity <= 0 : quantity >= stock || Number(quantityOf(item) || 0) >= 1000));
      });
      const quantityValue = row.querySelector("[data-quantity-value]");
      if (quantityValue) quantityValue.textContent = String(quantityOf(item));
      row.querySelectorAll("[data-adjust-position]:not([data-adjust-option])").forEach((button) => {
        const delta = Number(button.dataset.delta || 0);
        button.disabled = Boolean(data.changing || item._optionsLoading || (delta < 0 ? quantityOf(item) <= 0 : quantityOf(item) >= 1000));
      });
      $("detail-total").textContent = money(displayedTotalCents(data));
    }

    async function changeProduct(positionId, productId) {
      const sizeKey = state.activeKey;
      const data = state.baskets.get(sizeKey);
      if (!data || data.changing) return;
      const current = data.items.find((row) => String(row.position_id) === String(positionId));
      const choice = current && (current._alternatives || []).find((option) => String(option.product_id) === String(productId));
      if (!current || !choice || String(current.product_id) === String(productId)) return;
      const quantity = Math.max(0, Math.trunc(Number(quantityOf(current) || 0)));
      if (Number(choice.stock_quantity || 0) < quantity) {
        toast("Essa opção não tem estoque suficiente para a quantidade atual.");
        return;
      }
      const selectedItems = cloneBasketItems(data.items);
      const selected = selectedItems.find((row) => String(row.position_id) === String(positionId));
      selected.selected_options = quantity > 0 ? [Object.assign({}, choice, { quantity })] : [];
      selected.quantity = quantity;
      selected.product_id = choice.product_id;
      selected.name = choice.name || selected.name;
      selected.image_url = choice.image_url || selected.image_url;
      selected.packaging = choice.packaging || selected.packaging;
      selected.stock_quantity = choice.stock_quantity;
      selected.price_cents = choice.price_cents;
      return await quoteAndApplySelection(sizeKey, data, positionId, selectedItems,
        "Essa troca não está disponível agora. A escolha anterior foi mantida.");
    }

    async function changeProductQuantity(positionId, productId, delta) {
      const sizeKey = state.activeKey;
      const data = state.baskets.get(sizeKey);
      if (!data || data.changing || (delta !== -1 && delta !== 1)) return;
      if (data.items.some((row) => row._optionsLoading)) return;
      const selectedItems = cloneBasketItems(data.items);
      const selected = selectedItems.find((row) => String(row.position_id) === String(positionId));
      if (!selected) return;
      if (!applyOptionQuantity(selected, productId, delta, true)) {
        if (delta > 0) toast("Não há estoque disponível para aumentar essa variação.");
        return;
      }
      return await quoteAndApplySelection(sizeKey, data, positionId, selectedItems,
        "Não foi possível atualizar a quantidade da variação. A quantidade anterior foi mantida.");
    }

    window.addEventListener("scroll", queuePendingOptions, { passive: true });
    window.addEventListener("resize", queuePendingOptions, { passive: true });
    $("detail-content").addEventListener("scroll", queuePendingOptions, { passive: true });

    return {
      basketForSize,
      restoreBasketSelections,
      retryItemOptions,
      queuePendingOptions,
      changeBasketItemQuantity,
      changeProduct,
      changeProductQuantity
    };
  }

  window.DonaStorefrontBasket = { create };
})();
