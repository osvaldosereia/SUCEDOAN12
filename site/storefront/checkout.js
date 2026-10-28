(() => {
  "use strict";

  function create({ state, $, esc, phoneDigits, money, toast, request, whatsappNumber, quantityOf, closeSheet, showSheet, onCustomOrderSubmitted }) {
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
      $("customer-card").hidden = true;
      $("customer-card").textContent = "";
      $("customer-registration").hidden = true;
      $("customer-registration").reset();
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

    function showRegistrationForm(customer) {
      const address = customer && customer.address || {};
      $("customer-registration").reset();
      $("customer-name").value = customer && customer.display_name || "";
      $("customer-street").value = address.street || "";
      $("customer-number").value = address.number || "";
      $("customer-neighborhood").value = address.neighborhood || address.district || "";
      $("customer-city").value = address.city || "";
      $("customer-complement").value = address.complement || "";
      $("customer-postal-code").value = address.postal_code || "";
      $("customer-reference").value = address.reference || "";

      const hasDocument = Boolean(customer && customer.document_present === true);
      $("customer-document-field").hidden = hasDocument;
      $("customer-document").required = !hasDocument;
      $("customer-document").value = "";
      $("customer-document-note").hidden = !hasDocument;
      $("customer-document-note").textContent = hasDocument
        ? "CPF/CNPJ já cadastrado" + (customer.document_last4 ? " (final " + customer.document_last4 + ")." : ".")
        : "";

      $("registration-title").textContent = customer
        ? "Complete seu endereço de entrega"
        : "Cadastre seus dados para continuar";
      $("registration-message").textContent = customer
        ? "Encontramos seu cadastro, mas faltam dados para a entrega. Complete os campos abaixo."
        : "Não encontramos cadastro para esse telefone. Preencha seus dados para registrar o pedido.";
      $("customer-registration").hidden = false;
    }

    function setConfirmedCustomer(customer, phone) {
      state.customer = customer;
      checkoutPhone = phone;
      const lines = addressLines(customer.address);
      $("customer-card").innerHTML = "<strong>" + esc(customer.display_name || "Cliente") + "</strong>" +
        '<span class="muted-line">' + esc(customer.phone || phone) + "</span><br>" +
        (lines.length ? lines.map(esc).join("<br>") : "Endereço cadastrado sem detalhes.");
      $("customer-card").hidden = false;
      $("customer-registration").hidden = true;
      $("payment-options").disabled = false;
      updateConfirmOrderAvailability();
    }

    function updateConfirmOrderAvailability() {
      const select = $("delivery-date");
      const payment = document.querySelector('input[name="payment"]:checked');
      const data = state.baskets.get(state.activeKey);
      const orderItemsAvailable = data && (data.customOrder
        ? selectedExtraEntries(data).length > 0
        : data.orderable === true);
      const minimumSatisfied = !data || !data.customOrder || customOrderSubtotalCents(data) >= minimumOrderCents;
      const selectedDateIsAvailable = select && !select.disabled && state.deliveryOptions.some((option) => option.date === select.value);
      $("confirm-order").disabled = state.submittingOrder || !orderItemsAvailable ||
        !minimumSatisfied || !customerHasCheckoutAddress(state.customer) || !payment || !selectedDateIsAvailable;
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

    function renderCustomOrderSummary(data) {
      const summary = $("custom-order-summary");
      summary.hidden = !data || data.customOrder !== true;
      if (summary.hidden) return;
      const entries = selectedExtraEntries(data);
      $("custom-order-items").innerHTML = entries.map((item) => {
        const quantity = Math.max(0, Math.trunc(Number(item.quantity || 0)));
        const lineTotal = Math.max(0, Number(item.price_cents || 0)) * quantity;
        return '<li class="custom-order-item"><div><strong>' + esc(item.name || "Produto") +
          '</strong><span>Quantidade: ' + quantity + '</span></div><b>' + esc(money(lineTotal)) + '</b></li>';
      }).join("");
      const subtotal = customOrderSubtotalCents(data);
      $("custom-order-total").textContent = money(subtotal);
      $("custom-order-minimum-message").textContent = subtotal < minimumOrderCents
        ? "Pedido mínimo de " + money(minimumOrderCents) + ". Acrescente " + money(minimumOrderCents - subtotal) + " em produtos para continuar."
        : "Pedido mínimo atingido.";
    }

    async function openOrderSheet(isCustomOrder) {
      const data = state.baskets.get(state.activeKey);
      if (isCustomOrder && (!data || data.customOrder !== true)) return;
      $("order-title").textContent = isCustomOrder ? "Pedido personalizado" : "Encomendar cesta";
      $("custom-order-summary").hidden = !isCustomOrder;
      if (isCustomOrder) renderCustomOrderSummary(data);
      showSheet("order-sheet");
      loadDeliveryOptions();
      if (state.catalogCode && !state.identityLookupStarted) {
        state.identityLookupStarted = true;
        $("lookup-message").textContent = "Identificando seu cadastro…";
        try {
          const identity = await request("resolve_identity_code", { params: { code: state.catalogCode } });
          const phone = phoneDigits(identity.phone_e164);
          if (!normalizeCheckoutPhone(phone).phone) throw new Error("invalid_identity_phone");
          $("customer-phone").value = phone;
          state.catalogCode = "";
          const currentUrl = new URL(window.location.href);
          currentUrl.searchParams.delete("catalog_code");
          window.history.replaceState({}, "", currentUrl.pathname + currentUrl.search + currentUrl.hash);
          await lookupCustomer();
        } catch (_) {
          $("lookup-message").textContent = "Não foi possível identificar pelo link. Digite seu telefone para continuar.";
          $("customer-phone").focus({ preventScroll: true });
        }
      } else {
        $("customer-phone").focus({ preventScroll: true });
      }
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
        extraSelections
      });
      state.activeKey = customOrderKey;
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
        components: data.items.map((item) => ({
          position_id: item.position_id,
          product_id: item.product_id,
          quantity: quantityOf(item)
        }))
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
        const result = await request("customer_lookup", { params: { phone: normalized.phone } });
        if (requestId !== lookupSequence) return;
        const customer = result.customer;
        if (!result.found || !customer) {
          showRegistrationForm(null);
          $("lookup-message").textContent = normalized.assumedLocalDdd
            ? "Não encontramos cadastro. Usamos o DDD 65 para este número; se seu DDD for outro, informe o telefone completo. Faça seu cadastro abaixo."
            : "Não encontramos cadastro para esse telefone. Faça seu cadastro abaixo.";
          return;
        }
        if (!customerHasCheckoutAddress(customer)) {
          showRegistrationForm(customer);
          $("lookup-message").textContent = "Cadastro encontrado, mas precisamos completar os dados de entrega.";
          return;
        }
        setConfirmedCustomer(customer, normalized.phone);
        $("lookup-message").textContent = normalized.assumedLocalDdd
          ? "Cadastro encontrado. Usamos o DDD 65 porque o número foi informado sem DDD."
          : "Cadastro e endereço encontrados. Escolha a data de entrega e a forma de pagamento.";
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
      $("registration-message").textContent = "Salvando seu cadastro…";
      try {
        const result = await request("customer_register", {
          method: "POST",
          body: {
            phone,
            name: $("customer-name").value.trim(),
            document: $("customer-document-field").hidden ? "" : $("customer-document").value.trim(),
            street: $("customer-street").value.trim(),
            number: $("customer-number").value.trim(),
            neighborhood: $("customer-neighborhood").value.trim(),
            city: $("customer-city").value,
            complement: $("customer-complement").value.trim(),
            postal_code: $("customer-postal-code").value.trim(),
            reference: $("customer-reference").value.trim(),
            source: "checkout"
          }
        });
        if (phone !== checkoutPhone) return;
        if (!customerHasCheckoutAddress(result.customer)) {
          throw new Error("registration_incomplete");
        }
        setConfirmedCustomer(result.customer, phone);
        $("lookup-message").textContent = "Cadastro salvo. Escolha a data de entrega e a forma de pagamento.";
      } catch (error) {
        const reason = String(error && error.message || "");
        const messages = {
          invalid_document: "CPF/CNPJ inválido. Confira os números e tente novamente.",
          document_already_in_use: "Este CPF/CNPJ já está ligado a outro cadastro. Confira o telefone completo com DDD.",
          document_mismatch: "O CPF/CNPJ pertence a outro cadastro. Confira o telefone completo com DDD e os dados informados.",
          identity_mismatch: "O nome não corresponde ao cadastro deste telefone. Confira o nome ou informe o telefone completo com DDD.",
          ambiguous_phone: "Há mais de um cadastro possível. Informe o telefone completo com DDD e confirme o CPF/CNPJ.",
          invalid_phone: "Telefone inválido. Informe o DDD junto ao número e tente novamente.",
          rate_limited: "Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.",
          rate_limit_unavailable: "Não foi possível validar seu cadastro agora. Tente novamente em instantes.",
          registration_unavailable: "O cadastro está temporariamente indisponível. Seus dados continuam no formulário; tente novamente.",
          registration_incomplete: "Não conseguimos confirmar o endereço salvo. Confira os campos e tente salvar novamente."
        };
        $("registration-message").textContent = messages[reason] ||
          "Não foi possível salvar o cadastro. Confira os dados e, se necessário, informe o telefone completo com DDD.";
      } finally {
        phoneInput.disabled = false;
        lookupButton.disabled = false;
        lookupButton.textContent = "Buscar";
        submitButton.disabled = false;
      }
    }
    async function confirmOrder() {
      const data = state.baskets.get(state.activeKey);
      const customer = state.customer;
      const payment = document.querySelector('input[name="payment"]:checked');
      const deliveryDate = $("delivery-date").value;
      const dateIsAvailable = state.deliveryOptions.some((option) => option.date === deliveryDate);
      if (!data || !customerHasCheckoutAddress(customer) || !payment || !dateIsAvailable) return;
      if (data.customOrder && customOrderSubtotalCents(data) < minimumOrderCents) {
        toast("O pedido personalizado precisa atingir o mínimo de " + money(minimumOrderCents) + ".");
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
      try {
        const result = await request("submit_order", {
          method: "POST",
          body: {
            whatsapp_phone: customer.phone || $("customer-phone").value,
            delivery_date: deliveryDate,
            payment_method: payment.value,
            customer_details: {
              name: customer.display_name || "",
              address: {
                street: customer.address && customer.address.street || "",
                number: customer.address && customer.address.number || "",
                district: customer.address && (customer.address.district || customer.address.neighborhood) || "",
                city: customer.address && customer.address.city || "",
                state: customer.address && customer.address.state || "",
                postal_code: customer.address && customer.address.postal_code || "",
                complement: customer.address && customer.address.complement || ""
              }
            },
            items: itemsForOrder(data)
          }
        });
        closeSheet("order-sheet");
        if (data.customOrder && typeof onCustomOrderSubmitted === "function") onCustomOrderSubmitted();
        toast(result.stock_adjustment
          ? "Pedido " + (result.order_number || "") + " registrado no Admin com ajuste de estoque."
          : "Pedido " + (result.order_number || "") + " registrado no Admin.");
      } catch (error) {
        const reason = String(error && error.message || "");
        const messages = {
          delivery_details_required: "Complete o endereço de entrega antes de concluir o pedido.",
          required_checkout_data: "A data de entrega é obrigatória. Reabra o checkout para carregar as datas disponíveis e tente novamente.",
          customer_name_required: "O cadastro precisa ter o nome do cliente.",
          all_items_unavailable: "Os produtos ficaram sem estoque. Atualize a cesta e tente novamente.",
          minimum_order: "O pedido mínimo é R$ 75,00. Acrescente produtos e tente novamente.",
          invalid_whatsapp_phone: "O telefone do cadastro não está em um formato válido.",
          invalid_payment: "A forma de pagamento não foi reconhecida. Selecione novamente e tente outra vez."
        };
        toast(messages[reason] || "Não foi possível registrar o pedido. Confira os dados e tente novamente.");
      } finally {
        state.submittingOrder = false;
        button.textContent = "Confirmar pedido";
        updateConfirmOrderAvailability();
      }
    }

    function init() {
      $("order-button").addEventListener("click", async () => {
        const sizeKey = state.activeKey;
        const basket = state.baskets.get(sizeKey);
        if (!basket || !basket.orderable) return;
        const pendingChange = basket.changePromise;
        if (pendingChange) await pendingChange;
        if (state.activeKey !== sizeKey || $("detail-sheet").hidden || !basket.orderable) return;
        closeSheet("detail-sheet");
        await openOrderSheet(false);
      });
      $("home-extra-checkout").addEventListener("click", startCustomOrder);
      $("lookup-button").addEventListener("click", lookupCustomer);
      $("customer-phone").addEventListener("input", () => {
        resetCustomerState($("customer-phone").value.trim()
          ? "O telefone mudou. Busque novamente para confirmar o cadastro."
          : "Informe seu WhatsApp para buscar o cadastro ou criar um novo.");
      });
      $("customer-phone").addEventListener("keydown", (event) => { if (event.key === "Enter") lookupCustomer(); });
      $("customer-registration").addEventListener("submit", saveCustomerRegistration);
      $("payment-options").addEventListener("change", updateConfirmOrderAvailability);
      $("delivery-date").addEventListener("change", updateConfirmOrderAvailability);
      $("confirm-order").addEventListener("click", confirmOrder);
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
    }

    return { init, loadDeliveryOptions, lookupCustomer, confirmOrder, startCustomOrder };
  }

  window.DonaStorefrontCheckout = { create };
})();
