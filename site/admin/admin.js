(() => {
  "use strict";
  const config = window.DONA_SITE_CONFIG || {};
  const supabase = String(config.supabaseUrl || "").replace(/\/$/, "");
  const publishableKey = config.publishableKey || "";
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
  let toastTimer = 0;

  async function adminRequest(action, params) {
    const response = await fetch(`${supabase}/functions/v1/site-admin-v1`, {
      method: "POST",
      headers: {
        apikey: publishableKey,
        "x-admin-code": window.DonaAdminAuth?.getCode?.() || "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action, ...(params || {}) }),
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) throw new Error(data.error || "Não foi possível consultar.");
    return data;
  }

  function toast(message) {
    const node = $("admin-toast");
    node.textContent = message;
    node.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove("show"), 3200);
  }

  let pendingBlingOauthResult = null;

  function blingOauthResultMessage(result) {
    const detail = String(result?.detail || "");
    if (result?.status === "success") {
      return detail === "status_catalog_pending"
        ? "Bling reautorizado. O token foi atualizado, mas falta confirmar uma permissão de situações."
        : "Bling reautorizado e conectado ao Admin.";
    }
    const errors = {
      authorization_denied: "A autorização do Bling foi cancelada.",
      missing_code_or_state: "O Bling não retornou os dados da autorização. Tente novamente.",
      oauth_not_started: "A solicitação de autorização expirou. Inicie novamente pelo botão.",
      oauth_expired: "A autorização expirou. Inicie novamente pelo botão.",
      oauth_state_mismatch: "A autorização não corresponde a esta solicitação. Inicie novamente pelo botão.",
      credentials_missing: "As credenciais do aplicativo Bling estão incompletas.",
      token_exchange_failed: "O Bling não confirmou a autorização. Tente novamente.",
      callback_failed: "Não foi possível concluir a autorização do Bling. Tente novamente.",
    };
    return errors[detail] || "Não foi possível concluir a autorização do Bling. Tente novamente.";
  }

  function showPendingBlingOauthResult() {
    const app = $("admin-app");
    if (app.hidden || !pendingBlingOauthResult) return false;
    toast(blingOauthResultMessage(pendingBlingOauthResult));
    pendingBlingOauthResult = null;
    try { window.sessionStorage.removeItem("dona-admin-bling-oauth-result"); } catch (_) {}
    return true;
  }

  function handleBlingOauthReturn() {
    const url = new URL(window.location.href);
    const status = url.searchParams.get("bling_oauth");
    if (status) {
      pendingBlingOauthResult = { status, detail: url.searchParams.get("detail") || "" };
      try {
        window.sessionStorage.setItem("dona-admin-bling-oauth-result", JSON.stringify(pendingBlingOauthResult));
      } catch (_) {}
      url.searchParams.delete("bling_oauth");
      url.searchParams.delete("detail");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    } else {
      try {
        pendingBlingOauthResult = JSON.parse(window.sessionStorage.getItem("dona-admin-bling-oauth-result") || "null");
      } catch (_) {}
    }
    if (!pendingBlingOauthResult || showPendingBlingOauthResult()) return;
    const app = $("admin-app");
    const observer = new MutationObserver(() => {
      if (showPendingBlingOauthResult()) observer.disconnect();
    });
    observer.observe(app, { attributes: true, attributeFilter: ["hidden"] });
  }

  async function reauthorizeBling() {
    const button = $("bling-reauthorize");
    if (button.disabled) return;
    const confirmed = window.confirm(
      "O Bling será aberto para aprovar novamente a integração. Se estiver corrigindo o erro 403, primeiro salve no aplicativo Bling a permissão para gravar pedidos. Ao concluir, você voltará a este Admin. Continuar?"
    );
    if (!confirmed) return;
    button.disabled = true;
    button.textContent = "Conectando…";
    try {
      if (!supabase || !publishableKey) throw new Error("A configuração do Admin está incompleta.");
      const endpoint = new URL(supabase + "/functions/v1/admin-products-live-v1");
      endpoint.searchParams.set("action", "bling_oauth_begin");
      endpoint.searchParams.set("return_to", "site_admin");
      const response = await fetch(endpoint.toString(), {
        method: "POST",
        headers: {
          apikey: publishableKey,
          "x-admin-code": window.DonaAdminAuth?.getCode?.() || "",
          "Content-Type": "application/json",
        },
        body: "{}",
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (data.error === "owner_required") throw new Error("Somente o proprietário pode reautorizar o Bling.");
      if (data.error === "bling_client_id_missing") throw new Error("O aplicativo Bling está sem identificador. Confira a configuração da integração.");
      if (!response.ok || data.ok === false || !data.authorization_url) {
        throw new Error("Não foi possível iniciar a reautorização do Bling. Confira a conexão e tente novamente.");
      }
      window.location.assign(data.authorization_url);
    } catch (error) {
      button.disabled = false;
      button.textContent = "Reautorizar Bling";
      toast(error instanceof Error ? error.message : "Não foi possível iniciar a reautorização do Bling.");
    }
  }

  function setView(name) {
    document.querySelectorAll(".nav-tab").forEach((button) => {
      const active = button.dataset.view === name;
      button.classList.toggle("active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    document.querySelectorAll("[data-panel]").forEach((panel) => {
      const active = panel.dataset.panel === name;
      panel.hidden = !active;
      panel.classList.toggle("active", active);
    });
    $("page-title").textContent = ({ customers: "Clientes", baskets: "Cestas", products: "Produtos", orders: "Pedidos", "quick-balance": "Balanço rápido", whatsapp: "WhatsApp", overview: "Visão geral" })[name] || "Visão geral";
    if (name === "baskets") window.DonaBasketAdmin?.loadBaskets();
    if (name === "products") {
      window.DonaCatalogAdmin?.loadProducts();
      window.DonaProductTaxonomyAdmin?.load(true);
    }
    if (name === "orders") window.DonaOrdersAdmin?.loadOrders();
    if (name === "quick-balance") window.DonaQuickBalanceAdmin?.open();
    if (name === "whatsapp") loadWhatsAppSection();
  }

  document.querySelectorAll("[data-whatsapp-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      const name = button.dataset.whatsappTab;
      document.querySelectorAll("[data-whatsapp-tab]").forEach((tab) => {
        const active = tab === button;
        tab.classList.toggle("active", active);
        tab.setAttribute("aria-selected", String(active));
      });
      document.querySelectorAll("[data-whatsapp-panel]").forEach((panel) => {
        const active = panel.dataset.whatsappPanel === name;
        panel.hidden = !active;
        panel.classList.toggle("active", active);
      });
      if (name === "separation") window.DonaOrderSeparationMessageAdmin?.load();
      else window.DonaOrderMessageAdmin?.load();
    });
  });

  function loadWhatsAppSection() {
    const selected = document.querySelector("[data-whatsapp-section][aria-selected=\"true\"]")?.dataset.whatsappSection || "overview";
    if (selected === "conversations") window.DonaWhatsAppConversations?.load();
    else if (selected === "messages") {
      const inner = document.querySelector("[data-whatsapp-tab][aria-selected=\"true\"]")?.dataset.whatsappTab || "confirmation";
      if (inner === "separation") window.DonaOrderSeparationMessageAdmin?.load();
      else window.DonaOrderMessageAdmin?.load();
    } else if (selected === "ana") window.DonaWhatsAppAdmin?.loadAnaStatus();
    else window.DonaWhatsAppAdmin?.loadOverview();
  }

  document.querySelectorAll("[data-whatsapp-section]").forEach((button) => {
    button.addEventListener("click", () => {
      const name = button.dataset.whatsappSection;
      document.querySelectorAll("[data-whatsapp-section]").forEach((tab) => {
        const active = tab === button;
        tab.classList.toggle("active", active);
        tab.setAttribute("aria-selected", String(active));
      });
      document.querySelectorAll("[data-whatsapp-section-panel]").forEach((panel) => {
        const active = panel.dataset.whatsappSectionPanel === name;
        panel.hidden = !active;
        panel.classList.toggle("active", active);
      });
      loadWhatsAppSection();
    });
  });

  function digits(value) { return String(value || "").replace(/\D/g, ""); }
  function displayPhone(value) { return String(value || "").replace(/^\+55(?=\d{10,11}$)/, ""); }
  function normalizeAdminPhone(value) {
    let number = digits(value);
    if (number.startsWith("55") && [12, 13].includes(number.length)) number = number.slice(2);
    if ([8, 9].includes(number.length)) number = "65" + number;
    if (number.length === 10 && /[6-9]/.test(number.charAt(2))) number = number.slice(0, 2) + "9" + number.slice(2);
    return [10, 11].includes(number.length) ? number : "";
  }
  function formatAddress(address) {
    if (!address) return [];
    return [
      [address.street, address.number, address.complement].filter(Boolean).join(", "),
      [address.neighborhood, address.city, address.state].filter(Boolean).join(" · "),
      address.postal_code ? `CEP ${address.postal_code}` : "",
      address.reference ? `Referência: ${address.reference}` : "",
    ].filter(Boolean);
  }

  function fillCustomer(customer) {
    const address = customer.address || {};
    const form = $("customer-editor");
    const values = {
      customer_id: customer.id || "",
      customer_updated_at: customer.updated_at || "",
      address_id: address.id || "",
      address_updated_at: address.updated_at || "",
      name: customer.display_name || "", phone: displayPhone(customer.phone),
      document: customer.document || "",
      street: address.street || "", number: address.number || "", complement: address.complement || "",
      neighborhood: address.neighborhood || "", city: address.city || "", state: address.state || "",
      postal_code: address.postal_code || "", reference: address.reference || "",
    };
    Object.entries(values).forEach(([name, value]) => { form.elements[name].value = value; });
    form.hidden = false;
    $("customer-save-status").textContent = "";
  }

  function customerResultHtml(customer) {
    const address = formatAddress(customer.address);
    return `<strong>${esc(customer.display_name || "Cliente")}</strong><span>${esc(displayPhone(customer.phone))}</span><br>${address.length ? address.map(esc).join("<br>") : "Sem endereço ativo cadastrado."}`;
  }

  async function openCustomer(customerId) {
    const result = $("customer-result");
    $("customer-editor").hidden = true;
    result.textContent = "Abrindo cadastro…";
    try {
      const data = await adminRequest("customer_lookup", { customer_id: customerId });
      if (!data.found || !data.customer) throw new Error("not_found");
      result.innerHTML = customerResultHtml(data.customer);
      fillCustomer(data.customer);
    } catch (_) {
      result.textContent = "Não foi possível abrir o cadastro. Busque novamente.";
    }
  }

  async function searchCustomer(event) {
    event.preventDefault();
    const raw = $("customer-phone").value.trim();
    const by = $("customer-search-type").value;
    const query = by === "name" ? raw : digits(raw);
    const button = $("customer-search-button");
    const result = $("customer-result");
    $("customer-editor").hidden = true;
    if (by === "name" ? query.length < 2 :
        by === "document" ? ![11, 14].includes(query.length) :
        (query.length < 8 || query.length > 13)) {
      result.className = "customer-result empty-result";
      result.textContent = by === "name" ? "Digite pelo menos 2 letras do nome." :
        by === "document" ? "Digite um CPF ou CNPJ válido em quantidade de dígitos." :
        "Digite o telefone, com ou sem DDD.";
      return;
    }
    button.disabled = true;
    button.textContent = "Buscando…";
    result.className = "customer-result";
    result.textContent = "Consultando cadastro…";
    try {
      if (by === "name") {
        const response = await adminRequest("customer_search_name", { name: query });
        const matches = response.customers || [];
        if (!matches.length) { result.textContent = "Nenhum cliente encontrado."; return; }
        result.replaceChildren();
        const list = document.createElement("div");
        list.className = "customer-name-results";
        for (const customer of matches) {
          const item = document.createElement("button");
          item.type = "button";
          item.className = "button button-outline customer-name-item";
          item.textContent = [customer.display_name, displayPhone(customer.phone),
            customer.document_last4 ? "CPF/CNPJ final " + customer.document_last4 : ""].filter(Boolean).join(" · ");
          item.addEventListener("click", () => openCustomer(customer.id));
          list.appendChild(item);
        }
        result.appendChild(list);
        return;
      }
      const data = await adminRequest("customer_lookup", by === "document" ? { document: query } : { phone: query });
      if (!data.found || !data.customer) {
        result.className = "customer-result empty-result";
        result.textContent = "Nenhum cliente encontrado.";
        return;
      }
      result.innerHTML = customerResultHtml(data.customer);
      fillCustomer(data.customer);
    } catch (_) {
      result.className = "customer-result empty-result";
      result.textContent = "Não foi possível consultar o cadastro. Tente novamente.";
    } finally {
      button.disabled = false;
      button.textContent = "Buscar";
    }
  }

  async function saveCustomer(event) {
    event.preventDefault();
    const form = $("customer-editor");
    const button = $("save-customer");
    const status = $("customer-save-status");
    if (button.disabled) return;

    button.disabled = true;
    button.textContent = "Salvando…";
    status.textContent = "Salvando as alterações com segurança…";
    const value = (name) => form.elements[name].value.trim();
    const customerDocument = digits(value("document"));
    const newPhone = normalizeAdminPhone(value("phone"));
    if (!newPhone) {
      status.textContent = "Informe um telefone válido, com ou sem DDD (padrão 65).";
      button.disabled = false;
      button.textContent = "Salvar alterações";
      return;
    }
    if (value("document") && ![11, 14].includes(customerDocument.length)) {
      status.textContent = "Informe um CPF com 11 dígitos ou CNPJ com 14 dígitos.";
      button.disabled = false;
      button.textContent = "Salvar alterações";
      return;
    }
    try {
      await adminRequest("customer_save", {
        customer_id: value("customer_id"),
        customer_updated_at: value("customer_updated_at"),
        address_id: value("address_id"),
        address_updated_at: value("address_updated_at"),
        name: value("name"),
        document: customerDocument,
        phone: newPhone,
        address: {
          street: value("street"),
          number: value("number"),
          complement: value("complement"),
          neighborhood: value("neighborhood"),
          city: value("city"),
          state: value("state"),
          postal_code: value("postal_code"),
          reference: value("reference"),
        },
      });
      const refreshed = await adminRequest("customer_lookup", { customer_id: value("customer_id") });
      if (refreshed.found && refreshed.customer) fillCustomer(refreshed.customer);
      status.textContent = "Cadastro atualizado.";
      $("customer-result").textContent = "Cadastro atualizado com sucesso.";
      toast("Cadastro do cliente atualizado.");
    } catch (error) {
      status.textContent = error.message === "customer_changed"
        ? "Este cadastro mudou em outra sessão. Busque o cliente novamente antes de salvar."
        : error.message === "invalid_document" ? "CPF/CNPJ inválido. Confira os dígitos."
        : error.message === "document_already_in_use" ? "CPF/CNPJ já cadastrado em outro cliente."
        : error.message === "phone_already_in_use" || error.message === "phone_or_document_already_in_use" ? "Telefone ou CPF/CNPJ já cadastrado em outro cliente."
        : error.message === "invalid_phone" ? "Telefone inválido."
        : "Não foi possível salvar. Confira os dados e tente novamente.";
    } finally {
      button.disabled = false;
      button.textContent = "Salvar alterações";
    }
  }

  async function deleteCustomer() {
    const form = $("customer-editor");
    const button = $("delete-customer");
    const saveButton = $("save-customer");
    const status = $("customer-save-status");
    if (form.hidden || button.disabled || saveButton.disabled) return;
    const customerId = form.elements["customer_id"].value;
    const snapshot = form.elements["customer_updated_at"].value;
    if (!customerId || !snapshot) return;
    const name = form.elements["name"].value.trim() || "este cliente";
    if (!window.confirm(
      "Excluir o cadastro de " + name + "?\n\n" +
      "Ele deixará de aparecer nas buscas e os dados de contato serão desvinculados. " +
      "Pedidos e histórico comercial serão preservados.\n\nConfirmar exclusão?"
    )) return;

    button.disabled = true;
    saveButton.disabled = true;
    button.textContent = "Excluindo…";
    status.textContent = "Excluindo cadastro…";
    try {
      await adminRequest("customer_delete", {
        customer_id: customerId,
        customer_updated_at: snapshot,
      });
      form.reset();
      form.hidden = true;
      $("customer-result").className = "customer-result empty-result";
      $("customer-result").textContent = "Cadastro excluído. Pesquise outro cliente para continuar.";
      $("customer-phone").value = "";
      toast("Cadastro excluído.");
    } catch (error) {
      status.textContent = error?.message === "customer_changed"
        ? "O cadastro foi alterado em outra sessão. Busque novamente antes de excluir."
        : error?.message === "customer_not_found"
        ? "Este cadastro já foi excluído ou não existe mais."
        : "Não foi possível excluir o cadastro. Tente novamente.";
    } finally {
      button.disabled = false;
      saveButton.disabled = false;
      button.textContent = "Excluir cadastro";
    }
  }

  $("delete-customer").addEventListener("click", deleteCustomer);
  $("customer-search-type").addEventListener("change", (event) => {
    const mode = event.target.value;
    const input = $("customer-phone");
    input.value = "";
    input.placeholder = mode === "name" ? "Digite o nome do cliente" :
      mode === "document" ? "Digite o CPF ou CNPJ" : "Telefone com ou sem DDD";
    input.inputMode = mode === "name" ? "text" : "numeric";
    input.maxLength = mode === "name" ? 120 : 18;
    $("customer-editor").hidden = true;
    $("customer-result").textContent = mode === "name" ? "Digite o nome." :
      mode === "document" ? "Digite o CPF ou CNPJ." : "Digite o telefone com ou sem DDD.";
  });
  $("customer-search").addEventListener("submit", searchCustomer);
  $("customer-editor").addEventListener("submit", saveCustomer);
  document.querySelectorAll(".nav-tab").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
  document.querySelectorAll("[data-go]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.go)));
  const blingReauthorizeButton = $("bling-reauthorize");
  if (blingReauthorizeButton) blingReauthorizeButton.addEventListener("click", reauthorizeBling);
  handleBlingOauthReturn();

})();
