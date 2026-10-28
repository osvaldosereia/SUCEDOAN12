(() => {
  "use strict";

  function create({ state, $, esc, phoneDigits, money, toast, request, whatsappNumber, quantityOf, closeSheet, showSheet }) {
    function addressLines(address) {
      if (!address) return [];
      const first = [address.street, address.number, address.complement].filter(Boolean).join(", ");
      const second = [address.neighborhood, address.city, address.state].filter(Boolean).join(" · ");
      const third = address.postal_code ? "CEP " + address.postal_code : "";
      const fourth = address.reference ? "Referência: " + address.reference : "";
      return [first, second, third, fourth].filter(Boolean);
    }
  
    function updateConfirmOrderAvailability() {
      const select = $("delivery-date");
      const payment = document.querySelector('input[name="payment"]:checked');
      const selectedDateIsAvailable = select && !select.disabled && state.deliveryOptions.some((option) => option.date === select.value);
      $("confirm-order").disabled = state.submittingOrder || !state.customer || !payment || !selectedDateIsAvailable;
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
  
    async function lookupCustomer() {
      const phone = phoneDigits($("customer-phone").value);
      state.customer = null;
      $("customer-card").hidden = true;
      $("payment-options").disabled = true;
      $("confirm-order").disabled = true;
      if (phone.length < 10 || phone.length > 13) {
        $("lookup-message").textContent = "Digite um telefone com DDD.";
        return;
      }
      $("lookup-button").disabled = true;
      $("lookup-button").textContent = "Buscando…";
      $("lookup-message").textContent = "Consultando cadastro…";
      try {
        const result = await request("customer_lookup", { params: { phone } });
        if (!result.found || !result.customer) {
          $("lookup-message").textContent = "Não encontramos esse telefone. Peça à loja para cadastrar seu endereço.";
          return;
        }
        state.customer = result.customer;
        const customer = result.customer;
        const lines = addressLines(customer.address);
        $("customer-card").innerHTML = "<strong>" + esc(customer.display_name || "Cliente") + "</strong>" +
          '<span class="muted-line">' + esc(customer.phone || $("customer-phone").value) + "</span><br>" +
          (lines.length ? lines.map(esc).join("<br>") : "Endereço cadastrado sem detalhes.");
        $("customer-card").hidden = false;
        $("payment-options").disabled = false;
        $("lookup-message").textContent = "Cadastro encontrado. Escolha a data de entrega e a forma de pagamento.";
        updateConfirmOrderAvailability();
      } catch (error) {
        $("lookup-message").textContent = error.message === "rate_limited" ? "Muitas buscas. Aguarde um pouco e tente novamente." : "Não foi possível consultar agora. Tente novamente.";
      } finally {
        $("lookup-button").disabled = false;
        $("lookup-button").textContent = "Buscar";
      }
    }
  
    async function confirmOrder() {
      const data = state.baskets.get(state.activeKey);
      const customer = state.customer;
      const payment = document.querySelector('input[name="payment"]:checked');
      const deliveryDate = $("delivery-date").value;
      const dateIsAvailable = state.deliveryOptions.some((option) => option.date === deliveryDate);
      if (!data || !customer || !payment || !dateIsAvailable) return;
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
            items: [{
              type: "basket_mold",
              id: data.basket.id,
              qty: 1,
              composition_number: data.basket.composition_number || 1,
              components: data.items.map((item) => ({
                position_id: item.position_id,
                product_id: item.product_id,
                quantity: quantityOf(item)
              }))
            }, ...Array.from(data.extraSelections.values()).filter((item) => Number(item.quantity || 0) > 0).map((item) => ({
              type: "product", id: item.id, qty: Number(item.quantity)
            }))]
          }
        });
        closeSheet("order-sheet");
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
        showSheet("order-sheet");
        loadDeliveryOptions();
        $("customer-phone").focus({ preventScroll: true });
      });
      $("lookup-button").addEventListener("click", lookupCustomer);
      $("customer-phone").addEventListener("keydown", (event) => { if (event.key === "Enter") lookupCustomer(); });
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

    return { init, loadDeliveryOptions, lookupCustomer, confirmOrder };
  }

  window.DonaStorefrontCheckout = { create };
})();
