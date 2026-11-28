(() => {
  "use strict";

  function migrateSavedCartSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== "object") return snapshot;
    const version = Number(snapshot.version);
    if (version === 2 || version !== 1) return snapshot;

    const migrated = Object.assign({}, snapshot, { version: 2 });
    const sizeKey = String(snapshot.size_key || "").trim();
    const hasExtraProducts =
      (Array.isArray(snapshot.extras) && snapshot.extras.length > 0) ||
      (Array.isArray(snapshot.home_extras) && snapshot.home_extras.length > 0);

    if (sizeKey && snapshot.custom !== true) {
      migrated.size_key = "";
      migrated.custom = true;
      migrated.items = [];
      migrated.legacy_basket_preview = true;
    } else if (!sizeKey && snapshot.custom !== true && hasExtraProducts) {
      migrated.custom = true;
    }

    return migrated;
  }

  function create({ state, $, esc, phoneDigits, money, toast, request, whatsappNumber, quantityOf, closeSheet, showSheet, changeBasketItemQuantity, changeBasketProductQuantity, refreshBasketQuote, attachHomeSelections, onHomeExtraQuantityChanged, onCustomOrderSubmitted, onCartCleared, onOrderSubmitted }) {
    const customOrderKey = "__custom_products__";
    const minimumOrderCents = 7500;
    function addressLines(address) {
      if (!address) return [];
      const first = [address.street, address.number, address.complement].filter(Boolean).join(", ");
      const second = [address.neighborhood, address.city, address.state].filter(Boolean).join(" · ");
      const third = address.postal_code ? "CEP " + address.postal_code : "";
      const fourth = address.reference ? "Referência: " + address.reference : "";
      return [first, second, third, fourth].filter(Boolean);
    }
  

    let lookupSequence = 0;
    let checkoutPhone = "";
    let verifiedCustomerDocumentLast4 = "";

    let previousCheckoutAddressId = "";
    let registrationMode = "new";
    let stockConflictItems = [];
    let revisedPrice = null;

    function normalizeCheckoutPhone(value) {
      let digits = phoneDigits(value);
      if (digits.startsWith("00")) digits = digits.slice(2);
      if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) digits = digits.slice(2);
      let assumedLocalDdd = false;
      if (digits.length === 8 || digits.length === 9) {
        digits = "65" + digits;
        assumedLocalDdd = true;
      }
      if (digits.length === 10 && /[6-9]/.test(digits.charAt(2))) {
        digits = digits.slice(0, 2) + "9" + digits.slice(2);
      }
      if (digits.length !== 10 && digits.length !== 11) return { phone: "", assumedLocalDdd };
      return { phone: "+55" + digits, assumedLocalDdd };
    }

    function customerHasCheckoutAddress(customer) {
      const address = customer && customer.address || {};
      return Boolean(customer && customer.registration_complete === true &&
        String(customer.display_name || "").trim() &&
        String(address.street || "").trim() &&
        String(address.number || "").trim() &&
        String(address.neighborhood || address.district || "").trim() &&
        String(address.city || "").trim());
    }

    function clearPaymentSelection() {
      document.querySelectorAll('input[name="payment"]').forEach((input) => { input.checked = false; });
    }

    function resetCustomerState(message) {
      lookupSequence += 1;
      state.customer = null;
      checkoutPhone = "";
      verifiedCustomerDocumentLast4 = "";

      previousCheckoutAddressId = "";
      registrationMode = "new";
      $("customer-card").hidden = true;
      $("customer-card").textContent = "";


      $("customer-registration").hidden = true;
      $("customer-registration").reset();
      $("customer-document-verification").hidden = true;
      $("customer-document-last4").value = "";
      $("customer-document-verification-message").textContent = "";
      $("customer-document-field").hidden = false;
      $("customer-document").required = true;
      $("customer-document-note").hidden = true;
      $("payment-options").disabled = true;
      clearPaymentSelection();
      $("lookup-button").disabled = false;
      $("lookup-button").textContent = "Buscar";
      if (message !== undefined) $("lookup-message").textContent = message;
      updateConfirmOrderAvailability();
    }

    function showRegistrationForm(customer, mode) {
      registrationMode = mode || (customer ? "add_address" : "new");
      const existingAddressMode = registrationMode === "add_address";
      const address = existingAddressMode ? {} : customer && customer.address || {};
      $("customer-registration").reset();
      $("customer-name").value = customer && customer.display_name || "";
      $("customer-street").value = address.street || "";
      $("customer-number").value = address.number || "";
      $("customer-neighborhood").value = address.neighborhood || address.district || "";
      $("customer-city").value = address.city || "";
      $("customer-complement").value = address.complement || "";
      $("customer-postal-code").value = address.postal_code || "";
      $("customer-reference").value = address.reference || "";
      $("customer-address-label").value = existingAddressMode ? "Outro endereço" : "Casa";
      $("cancel-customer-address").hidden = !existingAddressMode || !state.customer;
      if (existingAddressMode && state.customer) {
        previousCheckoutAddressId = state.customer.address && state.customer.address.id || "";
        state.customer.address = null;
        state.customer.address_id = "";
        $("customer-card").hidden = true;
        updateConfirmOrderAvailability();
      } else if (!existingAddressMode) {
        previousCheckoutAddressId = "";
      }

      $("customer-name-field").hidden = existingAddressMode;
      $("customer-name").required = !existingAddressMode;
      $("customer-document-field").hidden = existingAddressMode;
      $("customer-document").required = !existingAddressMode;
      $("customer-document").value = "";
      $("customer-document-note").hidden = true;
      $("customer-marketing-consent").hidden = existingAddressMode;
      $("customer-marketing-opt-in").checked = false;
      $("customer-address-label-field").hidden = !existingAddressMode;
      $("customer-address-label").required = existingAddressMode;

      $("registration-title").textContent = existingAddressMode
        ? "Adicionar outro endereço"
        : "Cadastre seus dados para continuar";
      $("registration-help").textContent = existingAddressMode
        ? "Este endereço ficará salvo no mesmo cadastro e não altera os outros endereços."
        : "O endereço de entrega é obrigatório. Atendemos Cuiabá e Várzea Grande.";
      $("register-customer-button").textContent = existingAddressMode
        ? "Salvar endereço e usar"
        : "Salvar cadastro e continuar";
      $("registration-message").dataset.tone = "neutral";
      $("registration-message").textContent = "";

      $("customer-registration").hidden = false;
      $("customer-document-verification").hidden = true;
    }

    function setConfirmedCustomer(customer, phone, selectedAddress) {
      const addresses = Array.isArray(customer.addresses)
        ? customer.addresses.filter((address) => address && address.id)
        : customer.address ? [customer.address] : [];
      const preferredId = selectedAddress && selectedAddress.id || customer.address && customer.address.id;
      const activeAddress = addresses.find((address) => String(address.id) === String(preferredId)) ||
        addresses.find((address) => address.is_default === true) || addresses[0] || null;
      customer.addresses = addresses;
      customer.address = activeAddress;
      customer.address_id = activeAddress && activeAddress.id || "";
      state.customer = customer;
      previousCheckoutAddressId = "";
      checkoutPhone = phone;
      const options = addresses.map((address) => {
        const lines = addressLines(address).join(" · ");
        return '<label class="customer-address-option">' +
          '<input type="radio" name="checkout-delivery-address" value="' + esc(address.id) + '"' +
          (activeAddress && String(activeAddress.id) === String(address.id) ? " checked" : "") + ">" +
          '<span class="customer-address-option-copy"><strong>' + esc(address.label || "Endereço") +
          (address.is_default ? ' <small class="customer-address-default">Principal</small>' : "") +
          '</strong><small>' + esc(lines || "Endereço cadastrado") + "</small></span></label>";
      }).join("");
      $("customer-card").innerHTML =
        "<strong>" + esc(customer.display_name || "Cliente") + "</strong>" +
        '<span class="muted-line">' + esc(String(customer.phone || phone).replace(/^\+55/, "")) + "</span>" +
        '<p class="customer-address-prompt">Escolha o endereço para este pedido:</p>' +
        '<div class="customer-address-options" role="radiogroup" aria-label="Endereço de entrega">' +
        (options || '<p class="helper">Cadastre um endereço para continuar.</p>') + "</div>" +
        '<button id="add-customer-address" class="button button-outline customer-add-address" type="button">Adicionar outro endereço</button>';
      $("customer-card").hidden = false;

      $("customer-registration").hidden = true;
      $("customer-document-verification").hidden = true;
      $("customer-document-last4").value = "";
      $("payment-options").disabled = false;
      updateConfirmOrderAvailability();
    }
    function updateConfirmOrderAvailability() {
      const select = $("delivery-date");
      const payment = document.querySelector('input[name="payment"]:checked');
      const data = state.baskets.get(state.cartKey);
      const orderItemsAvailable = Boolean(data && (data.customOrder
        ? selectedExtraEntries(data).length > 0
        : data.orderable === true));
      const subtotal = data ? orderReviewTotalCents(data) : 0;
      const minimumSatisfied = !data || subtotal >= minimumOrderCents;
      const customerConfirmed = customerHasCheckoutAddress(state.customer);
      const selectedDateIsAvailable = Boolean(select && !select.disabled && state.deliveryOptions.some((option) => option.date === select.value));
      const calculating = Boolean(data && (data.changing === true || data.changePromise));
      const cannotConfirm = state.submittingOrder || calculating || !orderItemsAvailable ||
        !minimumSatisfied || !customerConfirmed || !payment || !selectedDateIsAvailable;
      const confirmationButton = $("confirm-order");
      confirmationButton.disabled = cannotConfirm;

      // Explain the exact blocking condition near the button, visible at the
      // bottom of the checkout even when the product list is scrolled away.
      let reason = "";
      if (!state.submittingOrder) {
        if (calculating) reason = "Atualizando itens e total do pedido…";
        else if (!orderItemsAvailable) reason = "Escolha pelo menos um produto disponível para continuar.";
        else if (!minimumSatisfied) reason = "Pedido mínimo de " + money(minimumOrderCents) +
          ". Faltam " + money(minimumOrderCents - subtotal) + " em produtos para liberar a confirmação.";
        else if (!customerConfirmed) reason = "Busque seu cadastro pelo telefone para continuar.";
        else if (!selectedDateIsAvailable) reason = "Selecione uma data de entrega disponível.";
        else if (!payment) reason = "Escolha a forma de pagamento para confirmar o pedido.";
      }
      const reasonElement = $("confirm-order-reason");
      reasonElement.textContent = reason;
      reasonElement.hidden = !reason;
      $("add-more-products").hidden = !data || data.customOrder !== true ||
        orderItemsAvailable === false || state.submittingOrder;
    }
  
    function loadDeliveryOptions() {
      if (state.deliveryPromise) return state.deliveryPromise;
      const select = $("delivery-date");
      const message = $("delivery-date-message");
      const previousDate = select.value;
      state.deliveryOptions = [];
      select.disabled = true;
      select.innerHTML = '<option value="">Carregando datas disponíveis…</option>';
      message.textContent = "Carregando as datas de entrega…";
      updateConfirmOrderAvailability();
  
      state.deliveryPromise = request("delivery_options")
        .then((result) => {
          const options = (Array.isArray(result.options) ? result.options : [])
            .filter((option) => option && /^\d{4}-\d{2}-\d{2}$/.test(String(option.date || "")) && String(option.label || "").trim())
            .slice(0, 10);
          state.deliveryOptions = options;
          if (!options.length) {
            select.innerHTML = '<option value="">Nenhuma data disponível</option>';
            select.disabled = true;
            message.textContent = "No momento não há datas de entrega disponíveis.";
            return;
          }
          select.innerHTML = '<option value="">Selecione uma data</option>' +
            options.map((option) => '<option value="' + esc(option.date) + '">' + esc(option.label) + "</option>").join("");
          select.value = options.some((option) => option.date === previousDate) ? previousDate : "";
          select.disabled = false;
          message.textContent = "As datas disponíveis são atualizadas ao abrir o checkout.";
        })
        .catch(() => {
          state.deliveryOptions = [];
          select.innerHTML = '<option value="">Não foi possível carregar as datas</option>';
          select.disabled = true;
          message.textContent = "Não foi possível carregar as datas. Feche e reabra o checkout para tentar novamente.";
        })
        .finally(() => {
          state.deliveryPromise = null;
          updateConfirmOrderAvailability();
        });
      return state.deliveryPromise;
    }
  
    function selectedExtraEntries(data) {
      if (!data || !(data.extraSelections instanceof Map)) return [];
      return Array.from(data.extraSelections.values()).filter((item) =>
        item && String(item.id || "") && Math.max(0, Math.trunc(Number(item.quantity || 0))) > 0);
    }

    function customOrderSubtotalCents(data) {
      return selectedExtraEntries(data).reduce((sum, item) =>
        sum + Math.max(0, Number(item.price_cents || 0)) * Math.max(0, Math.trunc(Number(item.quantity || 0))), 0);
    }

    function orderReviewImageUrl(value) {
      try {
        const url = new URL(String(value || "").trim(), window.location.href);
        return url.protocol === "http:" || url.protocol === "https:" ? url.href : "../img/logoantonia5.png";
      } catch (_) {
        return "../img/logoantonia5.png";
      }
    }

    function orderReviewEntries(data) {
      const entries = [];
      if (data && data.customOrder !== true && Array.isArray(data.items)) {
        data.items.forEach((item) => {
          const positionId = String(item.position_id || "");
          const selectedOptions = (Array.isArray(item.selected_options) ? item.selected_options : [])
            .filter((option) => option && option.product_id && Number(option.quantity || 0) > 0);
          if (selectedOptions.length) {
            selectedOptions.forEach((option) => {
              const productId = String(option.product_id);
              const quantity = Math.max(0, Math.min(1000, Math.trunc(Number(option.quantity || 0))));
              if (!quantity) return;
              const alternative = (item._alternatives || []).find((row) => String(row.product_id || "") === productId);
              const stockValue = option.stock_quantity ?? (alternative && alternative.stock_quantity);
              const knownStock = stockValue == null || !Number.isFinite(Number(stockValue))
                ? quantity
                : Math.max(0, Math.min(1000, Math.trunc(Number(stockValue))));
              entries.push({
                kind: "basket_option",
                positionId,
                productId,
                name: String(option.name || "Produto"),
                imageUrl: option.image_url || option.image || item.image_url || item.image,
                quantity,
                maxQuantity: Math.max(quantity, knownStock)
              });
            });
            return;
          }

          const quantity = Math.max(0, Math.min(1000, Math.trunc(Number(quantityOf(item) || 0))));
          if (!quantity) return;
          entries.push({
            kind: "basket",
            positionId,
            name: String(item.name || "Produto"),
            imageUrl: item.image_url || item.image,
            quantity,
            maxQuantity: 1000
          });
        });
      }
      const extraEntries = data && data.extraSelections instanceof Map
        ? Array.from(data.extraSelections.values())
        : [];
      extraEntries.forEach((item) => {
        const id = String(item && item.id || "");
        if (!item || !id) return;
        entries.push({
          kind: "extra",
          id,
          name: String(item.name || "Produto"),
          imageUrl: item.image_url || item.image,
          quantity: Math.max(0, Math.trunc(Number(item.quantity || 0))),
          maxQuantity: Math.max(0, Math.trunc(Number(item.stock_quantity || 0)))
        });
      });
      return entries;
    }
    function updateSidebarCheckoutCount() {
      const button = $("sidebar-checkout");
      const badge = $("sidebar-checkout-count");
      if (!button || !badge) return 0;

      const data = state.baskets.get(state.cartKey);
      let count = 0;
      const extras = new Map();

      if (data) {
        if (data.customOrder !== true && data.basket) count = 1;
        orderReviewEntries(data).forEach((entry) => {
          const quantity = Math.max(0, Math.trunc(Number(entry.quantity || 0)));
          if (entry.kind === "extra" && entry.id && quantity > 0) extras.set(String(entry.id), quantity);
        });
      }

      if (state.homeExtraSelections instanceof Map) {
        state.homeExtraSelections.forEach((item, id) => {
          const quantity = Math.max(0, Math.trunc(Number(item && item.quantity || 0)));
          if (quantity > 0) extras.set(String(id), quantity);
          else extras.delete(String(id));
        });
      }

      extras.forEach((quantity) => { count += quantity; });
      count = Math.max(0, Math.trunc(count));
      badge.textContent = String(count);
      badge.hidden = count === 0;
      button.setAttribute("aria-label", count
        ? "Abrir checkout, " + count + (count === 1 ? " item no pedido" : " itens no pedido")
        : "Abrir checkout");
      return count;
    }

    function localOrderTotalCents(data) {
      const extras = customOrderSubtotalCents(data);
      return data && data.customOrder === true
        ? extras
        : Math.max(0, Number(data && data.totalCents || 0)) + extras;
    }

    function orderReviewTotalCents(data, items) {
      const localTotal = localOrderTotalCents(data);
      if (revisedPrice && revisedPrice.cart === data && revisedPrice.localTotal === localTotal &&
          revisedPrice.items === JSON.stringify(items || itemsForOrder(data))) {
        return revisedPrice.total;
      }
      return localTotal;
    }

    function renderOrderReview(data) {
      const itemsHost = $("order-review-items");
      const entries = orderReviewEntries(data);
      const clearButton = $("clear-order-cart");
      clearButton.hidden = entries.length === 0;
      clearButton.disabled = entries.length === 0 || Boolean(data && (data.changing === true || state.submittingOrder));
      itemsHost.innerHTML = entries.map((item) => {
        const name = esc(item.name);
        const isBasketEntry = item.kind === "basket" || item.kind === "basket_option";
        const targetData = isBasketEntry
          ? ' data-position-id="' + esc(item.positionId) + '"' +
            (item.kind === "basket_option" ? ' data-product-id="' + esc(item.productId) + '"' : "")
          : ' data-extra-id="' + esc(item.id) + '"';
        const unavailable = data.changing === true ||
          (isBasketEntry && (!item.positionId || (item.kind === "basket_option" && !item.productId)));
        const minusDisabled = unavailable || item.quantity <= 0;
        const plusDisabled = unavailable || item.quantity >= item.maxQuantity;
        return '<li class="order-review-item">' +
          '<img class="order-review-item-photo" src="' + esc(orderReviewImageUrl(item.imageUrl)) + '" alt="" width="72" height="72" loading="lazy" decoding="async">' +
          '<div class="order-review-item-copy"><strong>' + name + '</strong></div>' +
          '<div class="order-review-quantity" role="group" aria-label="Quantidade de ' + name + '">' +
            '<button type="button" data-order-review-adjust data-kind="' + item.kind + '"' + targetData + ' data-delta="-1" aria-label="Diminuir quantidade de ' + name + '"' + (minusDisabled ? " disabled" : "") + '>−</button>' +
            '<output aria-live="polite">' + item.quantity + '</output>' +
            '<button type="button" data-order-review-adjust data-kind="' + item.kind + '"' + targetData + ' data-delta="1" aria-label="Aumentar quantidade de ' + name + '"' + (plusDisabled ? " disabled" : "") + '>+</button>' +
          '</div>' +
        '</li>';
      }).join("");
      itemsHost.setAttribute("aria-busy", data && data.changing === true ? "true" : "false");
      $("order-review-kind").textContent = !data
        ? ""
        : data.customOrder === true
          ? "Pedido personalizado: inclui somente os produtos escolhidos em “Monte sua Cesta”; não inclui uma cesta pronta."
          : String(data.basket && data.basket.name || data.summary && data.summary.name || "Cesta pronta") +
            (selectedExtraEntries(data).length ? " e produtos extras selecionados." : ".");
      $("order-review-empty").textContent = entries.length ? "" : "Seu carrinho está vazio. Escolha uma cesta ou adicione produtos para continuar.";
      $("order-review-empty").hidden = entries.length > 0;
      const total = data ? orderReviewTotalCents(data) : 0;
      $("order-review-total").textContent = money(total);

      const minimumMessage = $("order-review-minimum-message");
      if (data && (data.customOrder === true || total < minimumOrderCents)) {
        minimumMessage.textContent = total < minimumOrderCents
          ? "Pedido mínimo de " + money(minimumOrderCents) + ". Faltam " + money(minimumOrderCents - total) + "."
          : "Pedido mínimo atingido.";
        minimumMessage.hidden = false;
      } else {
        minimumMessage.textContent = "";
        minimumMessage.hidden = true;
      }
      updateConfirmOrderAvailability();
      updateSidebarCheckoutCount();

      itemsHost.querySelectorAll("img").forEach((image) => image.addEventListener("error", () => {
        image.src = "../img/logoantonia5.png";
      }, { once: true }));
    }

    function clearOrderCart() {
      const cartKey = state.cartKey;
      const data = state.baskets.get(cartKey);
      if (!cartKey || !data || data.changing === true || state.submittingOrder) return;

      const extraIds = data.extraSelections instanceof Map ? Array.from(data.extraSelections.keys()) : [];
      if (data.extraSelections instanceof Map) data.extraSelections.clear();
      if (data.customOrder === true) {
        state.baskets.delete(cartKey);
      } else {
        data.items = [];
        data.totalCents = 0;
        data.orderable = false;
        data.detailLoaded = false;
        data.detailPromise = null;
        data.error = false;
      }

      state.cartKey = "";
      if (state.activeKey === cartKey) state.activeKey = "";
      if (typeof onCustomOrderSubmitted === "function") onCustomOrderSubmitted();
      extraIds.forEach((id) => {
        if (typeof onHomeExtraQuantityChanged === "function") onHomeExtraQuantityChanged(String(id));
      });
      if (typeof onCartCleared === "function") onCartCleared();
      renderOrderReview(null);
      toast("Carrinho limpo.");
    }

    async function openOrderSheet(isCustomOrder) {
      const cartKey = state.cartKey;
      const data = state.baskets.get(cartKey);
      if (!cartKey || !data || (isCustomOrder && data.customOrder !== true)) return;
      if (data.changePromise) await data.changePromise;
      if (state.cartKey !== cartKey) return;
      setOrderSubmitMessage("", "");
      renderStockConflictItems([]);
      $("order-title").textContent = isCustomOrder ? "Pedido personalizado" : "Encomendar cesta";
      renderOrderReview(data);
      const orderContent = document.querySelector("#order-sheet .sheet-content");
      if (orderContent) orderContent.scrollTop = 0;
      showSheet("order-sheet");
      const closeButton = document.querySelector('#order-sheet [data-close="order"]');
      if (closeButton) closeButton.focus({ preventScroll: true });
      loadDeliveryOptions();
      if (state.catalogCode && !state.identityLookupStarted) {
        state.identityLookupStarted = true;
        $("lookup-message").textContent = "Identificando seu cadastro…";
        try {
          const identity = await request("resolve_identity_code", { params: { code: state.catalogCode } });
          const phone = phoneDigits(identity.phone_e164);
          if (!normalizeCheckoutPhone(phone).phone) throw new Error("invalid_identity_phone");
          $("customer-phone").value = phone.replace(/^55(?=\d{10,11}$)/, "");
          state.catalogCode = "";
          const currentUrl = new URL(window.location.href);
          currentUrl.searchParams.delete("catalog_code");
          window.history.replaceState({}, "", currentUrl.pathname + currentUrl.search + currentUrl.hash);
          await lookupCustomer();
        } catch (_) {
          $("lookup-message").textContent = "Não foi possível identificar pelo link. Digite seu telefone para continuar.";
        }
      } else {
      }
    }

    function hasHomeExtraSelection() {
      return state.homeExtraSelections instanceof Map && Array.from(state.homeExtraSelections.values()).some((item) =>
        item && String(item.id || "") && Math.max(0, Math.trunc(Number(item.quantity || 0))) > 0);
    }

    async function openSidebarCheckout() {
      if (state.cartRestoring && state.cartRestorePromise) await state.cartRestorePromise;
      let data = state.baskets.get(state.cartKey);
      if (data && typeof attachHomeSelections === "function") attachHomeSelections(data);
      if (data && data.customOrder === true) {
        if (selectedExtraEntries(data).length) return openOrderSheet(true);
        state.baskets.delete(state.cartKey);
        state.cartKey = "";
        data = null;
      }
      if (data) {
        if (data.orderable !== true) {
          toast("A cesta do carrinho ainda está carregando ou indisponível. Tente novamente em instantes.");
          return;
        }
        return openOrderSheet(false);
      }
      if (hasHomeExtraSelection()) return startCustomOrder();
      toast("Escolha uma cesta ou selecione produtos em “Monte sua Cesta” antes de continuar.");
    }

    async function addBasketToCart(sizeKey, data) {
      if (state.cartRestoring && state.cartRestorePromise) await state.cartRestorePromise;
      if (state.activeKey !== sizeKey || $("detail-sheet").hidden || !data ||
          data.detailLoaded !== true || data.orderable !== true) return false;

      const previousKey = String(state.cartKey || "");
      const previous = state.baskets.get(previousKey);
      if (previousKey && previousKey !== sizeKey && previous && previous.customOrder !== true) {
        const previousName = String(previous.basket && previous.basket.name || previous.summary && previous.summary.name || "outra cesta");
        const nextName = String(data.basket && data.basket.name || data.summary && data.summary.name || "esta cesta");
        if (!window.confirm("Seu carrinho já contém " + previousName + ". Deseja trocar por " + nextName + "? Os produtos extras serão mantidos.")) return false;
      }

      if (previousKey && previousKey !== sizeKey && previous && previous.extraSelections instanceof Map) {
        const managedHomeExtras = previous.homeExtraProductIds instanceof Set ? previous.homeExtraProductIds : new Set();
        if (!(data.extraSelections instanceof Map)) data.extraSelections = new Map();
        previous.extraSelections.forEach((item, id) => {
          const productId = String(id || item && item.id || "");
          if (!productId || (managedHomeExtras.has(productId) &&
              !(state.homeExtraSelections instanceof Map && state.homeExtraSelections.has(productId)))) return;
          if (!data.extraSelections.has(productId)) {
            data.extraSelections.set(productId, Object.assign({}, item, { id: productId }));
          }
        });
      }

      state.cartKey = sizeKey;
      if (typeof attachHomeSelections === "function") attachHomeSelections(data);
      if (previousKey === customOrderKey && previousKey !== sizeKey) state.baskets.delete(previousKey);
      updateSidebarCheckoutCount();
      return true;
    }

    function startCustomOrder() {
      const selections = state.homeExtraSelections instanceof Map ? Array.from(state.homeExtraSelections.values()) : [];
      const extraSelections = new Map();
      selections.forEach((item) => {
        const id = String(item && item.id || "");
        const quantity = Math.max(0, Math.trunc(Number(item && item.quantity || 0)));
        if (id && quantity > 0) extraSelections.set(id, Object.assign({}, item, { id, quantity }));
      });
      if (!extraSelections.size) {
        toast("Escolha pelo menos um produto para montar seu pedido.");
        return;
      }
      state.baskets.set(customOrderKey, {
        customOrder: true,
        summary: { name: "Pedido personalizado" },
        basket: null,
        items: [],
        totalCents: 0,
        orderable: true,
        extraSelections,
        homeExtraProductIds: new Set(Array.from(extraSelections.keys()))
      });
      state.cartKey = customOrderKey;
      updateSidebarCheckoutCount();
      return openOrderSheet(true);
    }

    function itemsForOrder(data) {
      const products = selectedExtraEntries(data).map((item) => ({
        type: "product", id: item.id, qty: Math.max(0, Math.trunc(Number(item.quantity || 0)))
      }));
      if (data.customOrder) return products;
      return [{
        type: "basket_mold",
        id: data.basket.id,
        qty: 1,
        composition_number: data.basket.composition_number || 1,
        components: data.items.map((item) => {
          const selected = (Array.isArray(item.selected_options) ? item.selected_options : [])
            .filter((option) => option && option.product_id && Number(option.quantity || 0) > 0)
            .map((option) => ({
              product_id: option.product_id,
              quantity: Math.max(0, Math.trunc(Number(option.quantity || 0)))
            }));
          const quantity = selected.reduce((total, option) => total + option.quantity, 0);
          return {
            position_id: item.position_id,
            product_id: selected[0]?.product_id || item.product_id,
            quantity: selected.length ? quantity : Math.max(0, Math.trunc(Number(quantityOf(item) || 0))),
            options: selected
          };
        })
      }, ...products];
    }

    async function lookupCustomer() {
      resetCustomerState("");
      const requestId = ++lookupSequence;
      const normalized = normalizeCheckoutPhone($("customer-phone").value);
      if (!normalized.phone) {
        $("lookup-message").textContent = "Informe um telefone brasileiro com DDD, ou apenas os 8 ou 9 dígitos locais.";
        return;
      }
      checkoutPhone = normalized.phone;
      $("lookup-button").disabled = true;
      $("lookup-button").textContent = "Buscando…";
      $("lookup-message").textContent = normalized.assumedLocalDdd
        ? "Sem DDD, usaremos o DDD 65. Consultando cadastro…"
        : "Consultando cadastro…";
      try {
        const result = await request("customer_lookup", { params: { phone: $("customer-phone").value } });
        if (requestId !== lookupSequence) return;
        const customer = result.customer;
        if (result.ambiguous) {
          $("lookup-message").textContent = "Mais de um cadastro usa este final de telefone. Informe o DDD e o número completo para continuar.";
          return;
        }
        if (!result.found || !customer) {
          showRegistrationForm(null, "new");
          $("lookup-message").textContent = normalized.assumedLocalDdd
            ? "Cadastro não encontrado. Usamos o DDD 65; informe o DDD correto antes de cadastrar, se necessário."
            : "Cadastro não encontrado. Preencha os dados abaixo.";
          return;
        }
        if (result.found === true) {
          checkoutPhone = normalized.phone;
          $("customer-document-verification").hidden = false;
          $("customer-document-last4").value = "";
          $("customer-document-verification-message").textContent = "";
          $("customer-registration").hidden = true;
          $("customer-card").hidden = true;
          $("lookup-message").textContent = "Cadastro localizado. Confirme o CPF/CNPJ para acessar seus endereços.";
          return;
        }
        if (!customerHasCheckoutAddress(customer)) {
          checkoutPhone = customer.phone || normalized.phone;
          showRegistrationForm(customer, "add_address");
          if (!Array.isArray(customer.addresses) || !customer.addresses.length) {
            $("customer-address-label").value = "Casa";
            $("registration-title").textContent = "Adicionar endereço";
            $("registration-help").textContent = "Seu cadastro foi localizado pelo telefone. Informe o endereço para receber este pedido.";
          }
          $("lookup-message").textContent = "Cadastro encontrado pelo telefone. Complete o endereço de entrega.";
          return;
        }
        setConfirmedCustomer(customer, customer.phone || normalized.phone);
        $("lookup-message").textContent = normalized.assumedLocalDdd
          ? "Cadastro localizado pelo telefone. Confira os endereços e escolha a entrega."
          : "Cadastro e endereços encontrados. Escolha o endereço, a data e o pagamento.";
      } catch (error) {
        if (requestId !== lookupSequence) return;
        $("lookup-message").textContent = error.message === "rate_limited"
          ? "Muitas buscas. Aguarde um pouco e tente novamente."
          : "Não foi possível consultar agora. Confira o telefone e tente novamente.";
      } finally {
        if (requestId === lookupSequence) {
          $("lookup-button").disabled = false;
          $("lookup-button").textContent = "Buscar";
        }
      }
    }

    async function verifyCustomerDocument() {
      const requestId = lookupSequence;
      const phone = checkoutPhone;
      const documentDigits = phoneDigits($("customer-document-last4").value);
      const message = $("customer-document-verification-message");
      if (!phone) {
        message.textContent = "Busque o cadastro pelo WhatsApp antes de confirmar o documento.";
        return;
      }
      if (![4, 11, 14].includes(documentDigits.length)) {
        message.textContent = "Informe os 4 últimos números ou o CPF/CNPJ completo.";
        return;
      }
      const button = $("verify-customer-document");
      button.disabled = true;
      button.textContent = "Confirmando…";
      message.textContent = "Validando o cadastro…";
      try {
        const body = documentDigits.length === 4
          ? { phone, document_last4: documentDigits }
          : { phone, document: documentDigits };
        const result = await request("customer_address_lookup", { method: "POST", body });
        if (requestId !== lookupSequence || phone !== checkoutPhone) return;
        const customer = result.customer;
        if (!result.found || !customer) throw new Error("customer_not_found");
        verifiedCustomerDocumentLast4 = documentDigits.slice(-4);
        $("customer-document-verification").hidden = true;
        message.textContent = "";
        if (!customerHasCheckoutAddress(customer)) {
          showRegistrationForm(customer, "add_address");
          $("lookup-message").textContent = "Cadastro confirmado. Complete o endereço para este pedido.";
          return;
        }
        setConfirmedCustomer(customer, customer.phone || phone);
        $("lookup-message").textContent = "Cadastro confirmado. Escolha o endereço, a data e o pagamento.";
      } catch (error) {
        if (requestId !== lookupSequence) return;
        const messages = {
          document_mismatch: "Os dados não conferem com o cadastro. Confira o CPF/CNPJ.",
          document_missing: "Informe um CPF/CNPJ válido para confirmar o cadastro.",
          customer_not_found: "Não foi possível localizar o cadastro com esses dados.",
          ambiguous_phone: "Mais de um cadastro usa este telefone. Informe o DDD e o número completo.",
          rate_limited: "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
          rate_limit_unavailable: "Não foi possível validar agora. Tente novamente em instantes.",
          document_confirmation_unavailable: "Não foi possível confirmar o documento agora. Tente novamente."
        };
        message.textContent = messages[String(error && error.message || "")] || "Não foi possível confirmar o cadastro. Confira os dados e tente novamente.";
      } finally {
        if (requestId === lookupSequence) {
          button.disabled = false;
          button.textContent = "Confirmar cadastro";
        }
      }
    }

    async function saveCustomerRegistration(event) {
      event.preventDefault();
      const form = $("customer-registration");
      if (!checkoutPhone || !form.reportValidity()) return;
      const phone = checkoutPhone;
      const submitButton = $("register-customer-button");
      const phoneInput = $("customer-phone");
      const lookupButton = $("lookup-button");
      submitButton.disabled = true;
      phoneInput.disabled = true;
      lookupButton.disabled = true;
      $("registration-message").dataset.tone = "pending";
      $("registration-message").textContent = registrationMode === "add_address"
        ? "Salvando endereço…"
        : "Salvando cadastro…";
      const address = {
        street: $("customer-street").value.trim(),
        number: $("customer-number").value.trim(),
        neighborhood: $("customer-neighborhood").value.trim(),
        city: $("customer-city").value,
        complement: $("customer-complement").value.trim(),
        postal_code: $("customer-postal-code").value.trim(),
        reference: $("customer-reference").value.trim()
      };
      try {
        let result;
        if (registrationMode === "add_address") {
          result = await request("customer_address_add", {
            method: "POST",
            body: {
              phone,
              document_last4: verifiedCustomerDocumentLast4,
              label: $("customer-address-label").value.trim(),
              ...address
            }
          });
          if (phone !== checkoutPhone) return;
          if (!customerHasCheckoutAddress(result.customer)) throw new Error("registration_incomplete");
          const selected = (result.customer.addresses || []).find((item) => String(item.id) === String(result.address_id));
          setConfirmedCustomer(result.customer, phone, selected);
          $("lookup-message").textContent = "Endereço salvo. Escolha a data e a forma de pagamento.";
        } else {
          result = await request("customer_register", {
            method: "POST",
            body: {
              phone,
              name: $("customer-name").value.trim(),
              document: $("customer-document-field").hidden ? "" : $("customer-document").value.trim(),
              label: $("customer-address-label").value.trim() || "Casa",
              ...address,
              marketing_opt_in: $("customer-marketing-opt-in").checked ? true : null,
              source: "checkout"
            }
          });
          if (phone !== checkoutPhone) return;
          if (!customerHasCheckoutAddress(result.customer)) throw new Error("registration_incomplete");
          setConfirmedCustomer(result.customer, phone);
          $("lookup-message").textContent = "Cadastro salvo. Escolha a data e a forma de pagamento.";
        }
      } catch (error) {
        const reason = String(error && error.message || "");
        const messages = {
          invalid_document: "CPF/CNPJ inválido. Confira os números.",
          document_already_in_use: "CPF/CNPJ já está em outro cadastro. Confira o telefone com DDD e toque em Buscar.",
          document_mismatch: "CPF/CNPJ não confere com este telefone. Confira os dados e o DDD.",
          identity_mismatch: "Nome diferente do cadastro. Confira o nome ou o telefone com DDD.",
          existing_customer_requires_verification: "Cadastro já existente. Busque pelo telefone para escolher ou adicionar um endereço.",
          ambiguous_phone: "Mais de um cadastro encontrado. Informe o telefone com DDD.",
          invalid_phone: "Telefone inválido. Informe o DDD junto ao número.",
          rate_limited: "Muitas tentativas. Aguarde alguns minutos.",
          rate_limit_unavailable: "Não foi possível validar agora. Tente novamente em instantes.",
          registration_unavailable: "Cadastro indisponível. Seus dados continuam no formulário; tente novamente.",
          address_save_unavailable: "Endereço indisponível para salvar agora. Tente novamente.",
          registration_incomplete: "Endereço não confirmado. Confira os campos e tente novamente.",
          unsupported_city: "Atendemos somente Cuiabá e Várzea Grande.",
          address_already_exists: "Esse endereço já está cadastrado. Atualize a lista ou escolha outro nome."
        };
        $("registration-message").dataset.tone = "error";
        $("registration-message").textContent = messages[reason] ||
          "Não foi possível salvar. Confira os dados e tente novamente.";
      } finally {
        phoneInput.disabled = false;
        lookupButton.disabled = false;
        lookupButton.textContent = "Buscar";
        submitButton.disabled = false;
        submitButton.textContent = registrationMode === "add_address"
          ? "Salvar endereço e usar"
          : "Salvar cadastro e continuar";
      }
    }
    function setOrderSubmitMessage(message, tone) {
      const messageNode = $("order-submit-message");
      if (!messageNode) return;
      messageNode.textContent = String(message || "");
      messageNode.dataset.tone = tone || "error";
      messageNode.hidden = !message;
    }

    function renderStockConflictItems(items) {
      const host = $("order-stock-conflicts");
      if (!host) return;
      stockConflictItems = Array.isArray(items) ? items.filter((item) => item && String(item.id || "")) : [];
      host.replaceChildren();
      if (!stockConflictItems.length) {
        host.hidden = true;
        return;
      }

      const list = document.createElement("ul");
      list.className = "order-stock-conflict-list";
      const data = state.baskets.get(state.cartKey);
      stockConflictItems.forEach((item) => {
        const id = String(item.id || "");
        const name = String(item.name || "Produto");
        const requested = Math.max(0, Math.trunc(Number(item.requested || 0)));
        const available = Math.max(0, Math.trunc(Number(item.available || 0)));
        const row = document.createElement("li");
        row.className = "order-stock-conflict";

        const copy = document.createElement("div");
        copy.className = "order-stock-conflict-copy";
        const title = document.createElement("strong");
        title.textContent = name;
        const detail = document.createElement("span");
        detail.textContent = available > 0
          ? "No pedido: " + requested + " · disponível agora: " + available
          : item.kind === "basket_mold_component"
            ? "Este produto da cesta ficou indisponível."
            : "Sem estoque disponível.";
        copy.append(title, detail);
        row.appendChild(copy);

        const canRemove = item.kind === "product" &&
          data && data.extraSelections instanceof Map && data.extraSelections.has(id);
        if (canRemove) {
          const remove = document.createElement("button");
          remove.type = "button";
          remove.className = "button button-outline order-stock-conflict-remove";
          remove.dataset.stockConflictRemove = id;
          remove.setAttribute("aria-label", "Remover " + name + " do pedido");
          remove.textContent = "Remover do pedido";
          row.appendChild(remove);
        } else if (item.kind === "basket_mold_component") {
          const note = document.createElement("span");
          note.className = "order-stock-conflict-note";
          note.textContent = "Atualize a cesta para conferir os itens disponíveis.";
          row.appendChild(note);
        }
        list.appendChild(row);
      });
      host.appendChild(list);
      if (stockConflictItems.some((item) => item.kind === "basket_mold_component") &&
          data && data.customOrder !== true && typeof refreshBasketQuote === "function") {
        const refresh = document.createElement("button");
        refresh.type = "button";
        refresh.className = "button button-outline order-stock-conflict-remove";
        refresh.dataset.stockConflictRefresh = "true";
        refresh.textContent = "Atualizar cesta";
        host.appendChild(refresh);
      }
      host.hidden = false;
    }

    async function refreshBasketStock() {
      const cartKey = state.cartKey;
      const data = state.baskets.get(cartKey);
      if (!data || data.customOrder === true || state.submittingOrder || data.changing === true ||
          typeof refreshBasketQuote !== "function") return false;
      const operation = refreshBasketQuote(cartKey);
      updateConfirmOrderAvailability();
      const refreshed = await operation;
      if (state.cartKey !== cartKey || state.baskets.get(cartKey) !== data) return false;
      if (!refreshed) {
        setOrderSubmitMessage("Não foi possível atualizar a cesta. Tente novamente; seu carrinho foi mantido.", "error");
        updateConfirmOrderAvailability();
        return false;
      }
      revisedPrice = null;
      renderStockConflictItems([]);
      renderOrderReview(data);
      setOrderSubmitMessage("Cesta atualizada. Confira os produtos e o total antes de confirmar novamente.", "warning");
      return true;
    }

    function removeStockConflictProduct(productId) {
      const id = String(productId || "");
      const cartKey = state.cartKey;
      const data = state.baskets.get(cartKey);
      const item = data && data.extraSelections instanceof Map ? data.extraSelections.get(id) : null;
      if (!data || !item || data.changing === true || state.submittingOrder) return;

      data.extraSelections.delete(id);
      const isHomeProduct = data.customOrder === true ||
        data.homeExtraProductIds instanceof Set && data.homeExtraProductIds.has(id) ||
        state.homeExtraSelections instanceof Map && state.homeExtraSelections.has(id);
      if (isHomeProduct && state.homeExtraSelections instanceof Map) {
        state.homeExtraSelections.delete(id);
        if (typeof onHomeExtraQuantityChanged === "function") onHomeExtraQuantityChanged(id);
      }

      const remaining = stockConflictItems.filter((conflict) => String(conflict.id || "") !== id);
      renderOrderReview(data);
      renderStockConflictItems(remaining);
      setOrderSubmitMessage(
        remaining.length
          ? "Remova os outros produtos indicados para continuar. O restante do pedido será mantido."
          : "Produto removido. O restante do pedido foi mantido; confira o total e confirme novamente.",
        remaining.length ? "error" : "warning"
      );
      toast("Produto removido do pedido.");
    }

    async function confirmOrder() {
      if (state.submittingOrder) return;
      const data = state.baskets.get(state.cartKey);
      const customer = state.customer;
      const payment = document.querySelector('input[name="payment"]:checked');
      const deliveryDate = $("delivery-date").value;
      const dateIsAvailable = state.deliveryOptions.some((option) => option.date === deliveryDate);
      if (!data || data.changing === true || data.changePromise ||
          !customerHasCheckoutAddress(customer) || !payment || !dateIsAvailable) return;
      const items = itemsForOrder(data);
      const expectedTotal = orderReviewTotalCents(data, items);
      const localTotal = localOrderTotalCents(data);
      if (expectedTotal < minimumOrderCents) {
        toast("O pedido precisa atingir o mínimo de " + money(minimumOrderCents) + ".");
        return;
      }
      const recipient = whatsappNumber(customer.phone || $("customer-phone").value);
      if (!recipient) {
        toast("O telefone cadastrado não está em um formato válido.");
        return;
      }
      const button = $("confirm-order");
      state.submittingOrder = true;
      updateConfirmOrderAvailability();
      button.textContent = "Registrando…";
      setOrderSubmitMessage("", "");
      renderStockConflictItems([]);
      try {
        const result = await request("submit_order", {
          method: "POST",
          body: {
            whatsapp_phone: customer.phone || $("customer-phone").value,
            delivery_date: deliveryDate,
            payment_method: payment.value,
            expected_total_cents: expectedTotal,
            customer_details: {
              name: customer.display_name || "",
              address_id: customer.address && customer.address.id || "",
              address: {
                id: customer.address && customer.address.id || "",
                label: customer.address && customer.address.label || "",
                street: customer.address && customer.address.street || "",
                number: customer.address && customer.address.number || "",
                district: customer.address && (customer.address.district || customer.address.neighborhood) || "",
                city: customer.address && customer.address.city || "",
                state: customer.address && customer.address.state || "",
                postal_code: customer.address && customer.address.postal_code || "",
                complement: customer.address && customer.address.complement || "",
                reference: customer.address && customer.address.reference || ""
              }
            },
            items
          }
        });
        closeSheet("order-sheet");
        const receipt = $("order-receipt");
        const publicOrderCode = String(result.order_number || "").trim().slice(0, 24);
        $("order-receipt-title").textContent = publicOrderCode ? "Pedido " + publicOrderCode : "Seu pedido foi recebido";
        const serverTotalCents = result && result.total_cents;
        const finalTotalCents = serverTotalCents !== null && serverTotalCents !== undefined && Number.isFinite(Number(serverTotalCents))
          ? Number(serverTotalCents)
          : expectedTotal;
        $("order-receipt-total").textContent = money(finalTotalCents);
        const deliveryOption = state.deliveryOptions.find((option) => option.date === deliveryDate);
        $("order-receipt-delivery").textContent = deliveryOption && deliveryOption.label || deliveryDate;
        $("order-receipt-payment").textContent = payment.value;

        const trackingLink = $("order-receipt-link");
        let safeTrackingUrl = "";
        try {
          const url = new URL(String(result.order_public_url || ""));
          if (url.protocol === "https:" &&
            ["donaantonia.com.br", "www.donaantonia.com.br"].includes(url.hostname) &&
            url.pathname === "/p/" &&
            Boolean(url.searchParams.get("k"))) safeTrackingUrl = url.href;
        } catch {}
        trackingLink.href = safeTrackingUrl;
        trackingLink.hidden = !safeTrackingUrl;
        $("order-receipt-followup").textContent = safeTrackingUrl
          ? "No acompanhamento, você verá os produtos e o status atualizado do pedido."
          : "O link de acompanhamento não ficou disponível. Se precisar, fale com a loja pelo WhatsApp.";
        receipt.hidden = false;
        window.requestAnimationFrame(() => {
          receipt.focus({ preventScroll: true });
          receipt.scrollIntoView({ behavior: "smooth", block: "start" });
        });
        const submittedCartKey = state.cartKey;
        revisedPrice = null;
        state.cartKey = "";
        if (state.activeKey === submittedCartKey) state.activeKey = "";
        if (data.extraSelections instanceof Map) data.extraSelections.clear();
        if (data.customOrder) {
          state.baskets.delete(submittedCartKey);
        } else {
          data.items = [];
          data.totalCents = 0;
          data.orderable = false;
          data.detailLoaded = false;
          data.detailPromise = null;
        }
        if (typeof onCustomOrderSubmitted === "function") onCustomOrderSubmitted();
        if (typeof onOrderSubmitted === "function") onOrderSubmitted();
        updateSidebarCheckoutCount();
        const orderLabel = publicOrderCode ? "Pedido " + publicOrderCode : "Pedido";
        toast(result.stock_adjustment
          ? orderLabel + " recebido com ajuste de estoque."
          : orderLabel + " recebido com sucesso.");
      } catch (error) {
        const reason = String(error && error.message || "");
        const responseData = error && error.data && typeof error.data === "object" ? error.data : {};
        const actualTotal = responseData.actual_total_cents;
        if (reason === "checkout_price_changed" && Number.isSafeInteger(actualTotal) && actualTotal >= 0 &&
            actualTotal !== expectedTotal) {
          revisedPrice = { cart: data, items: JSON.stringify(items), localTotal, total: actualTotal };
          renderOrderReview(data);
          const message = "O total mudou de " + money(expectedTotal) + " para " + money(actualTotal) +
            ". Nenhum pedido foi registrado. Confira o novo valor antes de confirmar novamente.";
          setOrderSubmitMessage(message, "warning");
          toast(message);
          return;
        }
        if (reason === "delivery_date_unavailable") await loadDeliveryOptions();
        const messages = {
          checkout_price_changed: "O total mudou. Atualize a página para revisar os preços. Seu carrinho foi mantido.",
          checkout_stock_changed: "O estoque mudou durante a confirmação. Atualize a página para conferir os itens. Seu carrinho foi mantido.",
          checkout_confirmation_required: "Atualize a página para revisar o total antes de confirmar. Seu carrinho foi mantido.",
          checkout_confirmation_invalid: "Atualize a página para revisar o total antes de confirmar.",
          invalid_item_id: "Um item não está mais disponível. Atualize a página para revisar o carrinho.",
          delivery_date_unavailable: "A data de entrega não está mais disponível. Escolha uma nova data para confirmar.",
          too_many_items: "O pedido tem mais de 80 produtos diferentes. Divida a compra ou fale com a loja pelo WhatsApp.",
          invalid_quantity: "Revise as quantidades dos produtos avulsos. O limite é 30 unidades por produto.",
          delivery_details_required: "Complete o endereço de entrega antes de concluir o pedido.",
          required_checkout_data: "A data de entrega é obrigatória. Reabra o checkout para carregar as datas disponíveis e tente novamente.",
          customer_name_required: "O cadastro precisa ter o nome do cliente.",
          all_items_unavailable: "Os produtos ficaram sem estoque. Atualize a cesta e tente novamente.",
          product_unavailable: "Um produto ficou indisponível. Atualize a página e tente novamente.",
          insufficient_stock: "O estoque de um produto mudou. Atualize a cesta e tente novamente.",
          basket_unavailable: "Esta cesta não está mais disponível. Atualize a página e escolha outra cesta.",
          basket_mold_unavailable: "Esta cesta não está mais disponível. Atualize a página e escolha outra cesta.",
          basket_mold_composition_invalid: "A composição da cesta mudou. Atualize a página para conferir os itens antes de confirmar.",
          basket_mold_component_invalid: "Os itens da cesta mudaram. Atualize a página para conferir a cesta antes de confirmar.",
          basket_mold_option_invalid: "Uma opção da cesta mudou. Atualize a página para conferir os itens antes de confirmar.",
          basket_mold_components_required: "Não foi possível carregar os itens da cesta. Atualize a página e tente novamente.",
          minimum_order: "O pedido mínimo é R$ 75,00. Acrescente produtos e tente novamente.",
          invalid_whatsapp_phone: "O telefone do cadastro não está em um formato válido.",
          invalid_payment: "A forma de pagamento não foi reconhecida. Selecione novamente e tente outra vez."
        };
        let reportedConflicts = Array.isArray(responseData.stock_conflict_items)
          ? responseData.stock_conflict_items
          : Array.isArray(responseData.adjusted_items)
            ? responseData.adjusted_items
            : [];
        if (reason === "checkout_stock_changed" && !reportedConflicts.length && data.customOrder !== true) {
          reportedConflicts = [{ id: "basket", name: "Produtos da cesta", kind: "basket_mold_component" }];
        }
        renderStockConflictItems(reportedConflicts);
        const conflictNames = stockConflictItems.map((item) => String(item.name || "Produto"));
        const canRemoveConflict = (item) => item.kind === "product" &&
          data.extraSelections instanceof Map && data.extraSelections.has(String(item.id || ""));
        const removableConflictCount = stockConflictItems.filter(canRemoveConflict).length;
        const hasBasketConflict = stockConflictItems.some((item) => item.kind === "basket_mold_component");
        const message = conflictNames.length === 1
          ? removableConflictCount
            ? "“" + conflictNames[0] + "” ficou indisponível. Remova-o abaixo para continuar; os outros itens serão mantidos."
            : "“" + conflictNames[0] + "” ficou indisponível na cesta. Atualize a cesta para conferir os produtos; seu pedido foi mantido."
          : conflictNames.length > 1
            ? removableConflictCount === stockConflictItems.length
              ? "Alguns produtos ficaram indisponíveis. Remova os itens indicados abaixo; os demais serão mantidos."
              : hasBasketConflict
                ? "Alguns itens ficaram indisponíveis. Remova os produtos extras indicados ou volte à cesta para trocar a opção indisponível."
                : "Alguns produtos ficaram indisponíveis. Confira os itens indicados; seu pedido foi mantido."
            : messages[reason] || (["product_unavailable", "insufficient_stock", "stock_conflict", "all_items_unavailable"].includes(reason)
              ? "O estoque de um produto mudou. Seu carrinho foi mantido; confira os itens e tente novamente."
              : "Não recebemos a confirmação. O pedido pode ter sido registrado; antes de tentar novamente, fale com a loja pelo WhatsApp para evitar um pedido duplicado.");
        setOrderSubmitMessage(message, conflictNames.length ? "error" : (messages[reason] ? "error" : "warning"));
        toast(message);
      } finally {
        state.submittingOrder = false;
        button.textContent = "Confirmar pedido";
        updateConfirmOrderAvailability();
      }
    }

    function init() {
      $("order-button").addEventListener("click", async () => {
        if (state.cartRestoring && state.cartRestorePromise) await state.cartRestorePromise;
        const sizeKey = state.activeKey;
        const basket = state.baskets.get(sizeKey);
        if (!basket || basket.customOrder === true || !basket.orderable || basket.detailLoaded !== true) return;
        const pendingChange = basket.changePromise;
        if (pendingChange) await pendingChange;
        if (state.activeKey !== sizeKey || $("detail-sheet").hidden || !basket.orderable) return;
        if (!await addBasketToCart(sizeKey, basket)) return;
        closeSheet("detail-sheet");
        await openOrderSheet(false);
      });
      $("home-extra-checkout").addEventListener("click", openSidebarCheckout);
      const sidebarCheckout = $("sidebar-checkout");
      if (sidebarCheckout) sidebarCheckout.addEventListener("click", openSidebarCheckout);
      $("clear-order-cart").addEventListener("click", clearOrderCart);
      const stockConflictsHost = $("order-stock-conflicts");
      if (stockConflictsHost) stockConflictsHost.addEventListener("click", (event) => {
        const refresh = event.target instanceof Element ? event.target.closest("[data-stock-conflict-refresh]") : null;
        if (refresh) {
          event.preventDefault();
          void refreshBasketStock();
          return;
        }
        const button = event.target instanceof Element ? event.target.closest("[data-stock-conflict-remove]") : null;
        if (!button) return;
        event.preventDefault();
        removeStockConflictProduct(button.dataset.stockConflictRemove);
      });
      $("order-review-items").addEventListener("click", async (event) => {
        const button = event.target instanceof Element ? event.target.closest("[data-order-review-adjust]") : null;
        if (!button) return;
        event.preventDefault();
        const cartKey = state.cartKey;
        const data = state.baskets.get(cartKey);
        const delta = Math.trunc(Number(button.dataset.delta || 0));
        if (!data || state.submittingOrder || (delta !== -1 && delta !== 1) || data.changing === true) return;

        if (button.dataset.kind === "basket" || button.dataset.kind === "basket_option") {
          if (!button.dataset.positionId) return;
          const itemsHost = $("order-review-items");
          itemsHost.setAttribute("aria-busy", "true");
          itemsHost.querySelectorAll("[data-order-review-adjust]").forEach((control) => { control.disabled = true; });
          let change;
          if (button.dataset.kind === "basket_option") {
            if (!button.dataset.productId || typeof changeBasketProductQuantity !== "function") return;
            change = changeBasketProductQuantity(button.dataset.positionId, button.dataset.productId, delta, cartKey);
          } else {
            if (typeof changeBasketItemQuantity !== "function") return;
            change = changeBasketItemQuantity(button.dataset.positionId, delta, cartKey);
          }
          updateConfirmOrderAvailability();
          await change;
        } else if (button.dataset.kind === "extra") {
          const item = data.extraSelections instanceof Map ? data.extraSelections.get(button.dataset.extraId) : null;
          if (!item) return;
          const id = String(item.id);
          const maxQuantity = Math.max(0, Math.trunc(Number(item.stock_quantity || 0)));
          const quantity = Math.max(0, Math.min(maxQuantity, Math.trunc(Number(item.quantity || 0)) + delta));
          const updated = Object.assign({}, item, { quantity });
          data.extraSelections.set(id, updated);
          const isHomeProduct = data.customOrder === true ||
            data.homeExtraProductIds instanceof Set && data.homeExtraProductIds.has(id) ||
            state.homeExtraSelections instanceof Map && state.homeExtraSelections.has(id);
          if (isHomeProduct && state.homeExtraSelections instanceof Map) {
            if (quantity === 0) state.homeExtraSelections.delete(id);
            else state.homeExtraSelections.set(id, updated);
            if (typeof onHomeExtraQuantityChanged === "function") onHomeExtraQuantityChanged(id);
          }
        }

        const current = state.baskets.get(cartKey);
        if (current && state.cartKey === cartKey) renderOrderReview(current);
      });
      $("lookup-button").addEventListener("click", lookupCustomer);
      $("verify-customer-document").addEventListener("click", verifyCustomerDocument);
      $("customer-document-last4").addEventListener("keydown", (event) => { if (event.key === "Enter") verifyCustomerDocument(); });
      $("customer-phone").addEventListener("input", () => {
        resetCustomerState($("customer-phone").value.trim()
          ? "O telefone mudou. Busque novamente."
          : "Informe seu WhatsApp para buscar o cadastro ou criar um novo.");
      });
      $("customer-phone").addEventListener("keydown", (event) => { if (event.key === "Enter") lookupCustomer(); });
      $("customer-registration").addEventListener("submit", saveCustomerRegistration);
      $("cancel-customer-address").addEventListener("click", () => {
        if (!state.customer) return;
        const previous = (state.customer.addresses || []).find((address) => String(address.id) === String(previousCheckoutAddressId));
        setConfirmedCustomer(state.customer, checkoutPhone, previous);
        $("lookup-message").textContent = "Endereço anterior mantido. Escolha onde deseja receber o pedido.";
      });

      $("customer-card").addEventListener("change", (event) => {
        const input = event.target;
        if (!input || input.name !== "checkout-delivery-address") return;
        const customer = state.customer;
        const chosen = (customer && customer.addresses || []).find((address) => String(address.id) === String(input.value));
        if (chosen) setConfirmedCustomer(customer, checkoutPhone, chosen);
      });
      $("customer-card").addEventListener("click", (event) => {
        if (!event.target.closest("#add-customer-address") || !state.customer) return;
        showRegistrationForm(state.customer, "add_address");
      });
      $("payment-options").addEventListener("change", updateConfirmOrderAvailability);
      $("delivery-date").addEventListener("change", updateConfirmOrderAvailability);
      $("confirm-order").addEventListener("click", confirmOrder);
      $("add-more-products").addEventListener("click", () => {
        // Keep the verified customer/payment while the shopper adds items.
        closeSheet("order-sheet", true);
        const products = $("home-extra-categories") || $("home-extra-product-search-results");
        if (products) products.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      document.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => closeSheet(button.dataset.close + "-sheet")));
      document.querySelectorAll(".sheet-backdrop").forEach((backdrop) => backdrop.addEventListener("click", (event) => {
        if (event.target === backdrop) closeSheet(backdrop.id);
      }));
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          if (!$("order-sheet").hidden) closeSheet("order-sheet");
          else if (!$("detail-sheet").hidden) closeSheet("detail-sheet");
        }
      });
      updateSidebarCheckoutCount();
    }

    return { init, loadDeliveryOptions, lookupCustomer, confirmOrder, refreshBasketStock, startCustomOrder, updateSidebarCheckoutCount };
  }

  window.DonaStorefrontCheckout = { create, migrateSavedCartSnapshot };
})();

