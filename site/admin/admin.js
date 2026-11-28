(() => {
  "use strict";
  const config = window.DONA_SITE_CONFIG || {};
  const supabase = String(config.supabaseUrl || "").replace(/\/$/, "");
  const publishableKey = config.publishableKey || "";
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
  let toastTimer = 0;
  let customerAddressRows = [];
  let currentCustomerId = "";
  let storefrontMaintenanceEnabled = false;
  let storefrontMaintenanceLoaded = false;
  let storefrontMaintenanceBusy = false;
  let storefrontMaintenanceNote = "";

  async function adminRequest(action, params) {
    const response = await fetch(`${supabase}/functions/v1/site-admin-v1`, {
      method: "POST",
      headers: {
        apikey: publishableKey,
        "x-admin-code": window.DonaAdminAuth?.getCode?.() || "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...(params || {}), action }),
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) throw new Error(data.error || "Não foi possível consultar.");
    return data;
  }

  async function storefrontMaintenanceRequest(action, params) {
    if (!supabase || !publishableKey) throw new Error("A configuração do Admin está incompleta.");
    const response = await fetch(supabase + "/functions/v1/site-maintenance-v1", {
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
    if (!response.ok || data.ok === false) throw new Error(data.error || "Não foi possível atualizar a disponibilidade da loja.");
    return data;
  }

  function renderStorefrontMaintenanceControl() {
    const root = $("storefront-maintenance-control");
    const status = $("storefront-maintenance-status");
    const button = $("storefront-maintenance-toggle");
    const note = $("storefront-maintenance-note");
    if (!root || !status || !button || !note) return;

    root.dataset.enabled = String(storefrontMaintenanceEnabled);
    root.dataset.loaded = String(storefrontMaintenanceLoaded);
    root.dataset.busy = String(storefrontMaintenanceBusy);
    status.classList.toggle("is-active", storefrontMaintenanceLoaded && storefrontMaintenanceEnabled);
    status.classList.toggle("is-unavailable", !storefrontMaintenanceLoaded);
    status.textContent = storefrontMaintenanceBusy && !storefrontMaintenanceLoaded
      ? "Consultando…"
      : !storefrontMaintenanceLoaded
      ? "Status indisponível"
      : storefrontMaintenanceEnabled
      ? "Em manutenção"
      : "Loja aberta";
    button.disabled = storefrontMaintenanceBusy;
    button.textContent = storefrontMaintenanceBusy
      ? storefrontMaintenanceLoaded ? "Salvando…" : "Consultando…"
      : !storefrontMaintenanceLoaded
      ? "Tentar novamente"
      : storefrontMaintenanceEnabled
      ? "Reabrir o site"
      : "Ativar manutenção";
    button.setAttribute("aria-pressed", String(storefrontMaintenanceEnabled));
    note.textContent = storefrontMaintenanceNote || (storefrontMaintenanceEnabled
      ? "A loja pública está fechada para clientes. O Admin permanece disponível."
      : "A loja está disponível aos clientes.");
  }

  async function loadStorefrontMaintenanceState() {
    if (storefrontMaintenanceBusy) return;
    storefrontMaintenanceBusy = true;
    storefrontMaintenanceNote = "Consultando a disponibilidade da loja…";
    renderStorefrontMaintenanceControl();
    try {
      const data = await storefrontMaintenanceRequest("status");
      if (typeof data.enabled !== "boolean") throw new Error("Resposta de status inválida.");
      storefrontMaintenanceEnabled = data.enabled;
      storefrontMaintenanceLoaded = true;
      storefrontMaintenanceNote = "";
    } catch (_) {
      storefrontMaintenanceLoaded = false;
      storefrontMaintenanceNote = "Não foi possível consultar o estado. Verifique a conexão e tente novamente.";
    } finally {
      storefrontMaintenanceBusy = false;
      renderStorefrontMaintenanceControl();
    }
  }

  async function toggleStorefrontMaintenance() {
    if (!storefrontMaintenanceLoaded) return loadStorefrontMaintenanceState();
    if (storefrontMaintenanceBusy) return;
    const enabled = !storefrontMaintenanceEnabled;
    if (enabled && !window.confirm("Ativar o modo de manutenção? Os clientes não poderão acessar o catálogo nem fazer pedidos até você reabrir o site pelo Admin.")) return;

    storefrontMaintenanceBusy = true;
    storefrontMaintenanceNote = "Salvando a disponibilidade da loja…";
    renderStorefrontMaintenanceControl();
    try {
      const data = await storefrontMaintenanceRequest("set", { enabled });
      if (typeof data.enabled !== "boolean") throw new Error("Resposta de atualização inválida.");
      storefrontMaintenanceEnabled = data.enabled;
      storefrontMaintenanceLoaded = true;
      storefrontMaintenanceNote = "";
      toast(data.enabled ? "Modo de manutenção ativado." : "A loja voltou a ficar disponível.");
    } catch (_) {
      storefrontMaintenanceLoaded = false;
      storefrontMaintenanceNote = "Não foi possível salvar. Tente consultar o estado e repetir a ação.";
      toast("Não foi possível atualizar a disponibilidade da loja.");
    } finally {
      storefrontMaintenanceBusy = false;
      renderStorefrontMaintenanceControl();
    }
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
      const endpoint = new URL(supabase + "/functions/v1/site-admin-v1");
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
    $("page-title").textContent = ({ customers: "Clientes", baskets: "Cestas", products: "Produtos", "extra-sections": "Seções extras", "builder-categories": "Categorias do Monte sua Cesta", orders: "Pedidos", delivery: "Entregas", "quick-balance": "Balanço rápido", cards: "Cartão", whatsapp: "WhatsApp", instagram: "Instagram", overview: "Visão geral" })[name] || "Visão geral";
    if (name === "baskets") window.DonaBasketAdmin?.loadBaskets();
    if (name === "extra-sections") window.DonaExtraSectionsAdmin?.load();
    if (name === "builder-categories") window.DonaBuilderCategoriesAdmin?.load();
    if (name === "products") window.DonaCatalogAdmin?.loadProducts();
    if (name === "orders") window.DonaOrdersAdmin?.loadOrders();
    if (name === "delivery") window.DonaDeliveryAdmin?.load();
    if (name === "quick-balance") window.DonaQuickBalanceAdmin?.open();
    if (name === "cards") window.DonaCardsAdmin?.load();
    if (name === "whatsapp") loadWhatsAppSection();
    if (name === "instagram") window.DonaInstagramAdmin?.load();
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

  let whatsappTemplatesAutoLoaded = false;

  function loadTemplateCatalogAfterOverview(overviewPromise) {
    if (whatsappTemplatesAutoLoaded) return;
    whatsappTemplatesAutoLoaded = true;
    const root = $("whatsapp-templates-content");
    const clickLoadButton = () => {
      const button = root?.querySelector("[data-template-load]");
      if (!button || button.disabled) return false;
      button.click();
      return true;
    };
    Promise.resolve(overviewPromise).then(() => {
      if (clickLoadButton() || !root) return;
      const observer = new MutationObserver(() => {
        if (clickLoadButton()) observer.disconnect();
      });
      observer.observe(root, { childList: true, subtree: true });
      window.setTimeout(() => {
        observer.disconnect();
        if (!root.querySelector("[data-template-load]")) whatsappTemplatesAutoLoaded = false;
      }, 15000);
    }).catch(() => {
      whatsappTemplatesAutoLoaded = false;
    });
  }

  function loadWhatsAppSection() {
    const selected = document.querySelector("[data-whatsapp-section][aria-selected=\"true\"]")?.dataset.whatsappSection || "overview";
    if (selected === "conversations") {
      if (window.DonaWhatsAppConversations?.load) window.DonaWhatsAppConversations.load();
      else if ($("whatsapp-conversations-status")) $("whatsapp-conversations-status").textContent = "O módulo de conversas não carregou. Atualize a página.";
      return;
    }
    if (selected === "messages") {
      const inner = document.querySelector("[data-whatsapp-tab][aria-selected=\"true\"]")?.dataset.whatsappTab || "confirmation";
      const module = inner === "separation" ? window.DonaOrderSeparationMessageAdmin : window.DonaOrderMessageAdmin;
      if (module?.load) module.load();
      else if ($("order-message-status")) $("order-message-status").textContent = "O módulo de mensagens não carregou. Atualize a página.";
      return;
    }

    const whatsappAdmin = window.DonaWhatsAppAdmin;
    if (!whatsappAdmin) {
      const status = $((selected === "overview" ? "whatsapp-overview" : "whatsapp-" + selected) + "-status");
      if (status) status.textContent = "O módulo do WhatsApp não carregou. Atualize esta página.";
      return;
    }
    if (selected === "ana") {
      if (typeof whatsappAdmin.loadAnaStatus === "function") whatsappAdmin.loadAnaStatus();
      else if ($("whatsapp-ana-status")) $("whatsapp-ana-status").textContent = "A tela da ANA não carregou. Atualize a página.";
      return;
    }
    if (typeof whatsappAdmin.loadOverview !== "function") {
      const status = $((selected === "overview" ? "whatsapp-overview" : "whatsapp-" + selected) + "-status");
      if (status) status.textContent = "O carregamento do WhatsApp não está disponível. Atualize a página.";
      return;
    }

    const overviewPromise = whatsappAdmin.loadOverview();
    if (selected === "templates") loadTemplateCatalogAfterOverview(overviewPromise);
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
    const form = $("customer-editor");
    const values = {
      customer_id: customer.id || "",
      customer_updated_at: customer.updated_at || "",
      name: customer.display_name || "",
      phone: displayPhone(customer.phone),
      document: customer.document || "",
    };
    Object.entries(values).forEach(([name, value]) => { form.elements[name].value = value; });
    form.hidden = false;
    $("customer-addresses-panel").hidden = false;
    $("customer-address-form").elements.customer_id.value = customer.id || "";
    $("customer-save-status").textContent = "";
    $("save-customer").textContent = "Salvar alterações";
    $("delete-customer").hidden = false;
    resetCustomerAddressForm(customer.id || "");
  }

  function startNewCustomer() {
    if ($("save-customer").disabled) return;
    const form = $("customer-editor");
    currentCustomerId = "";
    customerAddressRows = [];
    form.reset();
    form.elements.customer_id.value = "";
    form.elements.customer_updated_at.value = "";
    form.hidden = false;
    $("customer-addresses-panel").hidden = true;
    $("delete-customer").hidden = true;
    $("save-customer").textContent = "Criar cadastro";
    $("customer-save-status").textContent = "Nome e telefone são obrigatórios. CPF/CNPJ é opcional.";
    $("customer-result").className = "customer-result";
    $("customer-result").textContent = "Novo cliente: salve o cadastro para liberar a inclusão de endereços.";
    resetCustomerAddressForm("");
    form.elements.name.focus();
  }

  function customerResultHtml(customer) {
    return "<strong>" + esc(customer.display_name || "Cliente") + "</strong>" +
      "<span>" + esc(displayPhone(customer.phone)) + "</span><br>Cadastro encontrado. Carregando endereços…";
  }

  function customerAddressText(address) {
    return formatAddress(address).map(esc).join("<br>") || "Endereço sem detalhes.";
  }

  function renderCustomerAddresses(addresses) {
    const host = $("customer-address-list");
    const activeCount = addresses.filter((address) => address.is_active === true).length;
    $("customer-address-count").textContent = activeCount + (activeCount === 1 ? " endereço ativo" : " endereços ativos");
    if (!addresses.length) {
      host.innerHTML = '<div class="customer-address-empty">Nenhum endereço cadastrado. Use o formulário abaixo para adicionar o primeiro.</div>';
      return;
    }
    host.innerHTML = addresses.map((address) => {
      const active = address.is_active === true;
      const badges = [
        address.is_default && active ? '<span class="customer-address-badge">Principal</span>' : "",
        !active ? '<span class="customer-address-badge is-inactive">Inativo</span>' : ""
      ].filter(Boolean).join("");
      const actions = active ? '<div class="customer-address-row-actions">' +
        '<button type="button" class="button button-outline" data-customer-address-action="edit" data-address-id="' + esc(address.id) + '">Editar</button>' +
        (address.is_default ? "" : '<button type="button" class="button button-outline" data-customer-address-action="set_default" data-address-id="' + esc(address.id) + '">Tornar principal</button>') +
        '<button type="button" class="button button-outline customer-address-remove" data-customer-address-action="deactivate" data-address-id="' + esc(address.id) + '">Remover</button>' +
        '</div>' : "";
      return '<article class="customer-address-row' + (active ? "" : " is-inactive") + '">' +
        '<div class="customer-address-row-copy"><div class="customer-address-row-heading"><strong>' + esc(address.label || "Endereço") + "</strong>" + badges +
        '</div><p>' + customerAddressText(address) + "</p></div>" + actions + "</article>";
    }).join("");
  }

  function resetCustomerAddressForm(customerId) {
    const form = $("customer-address-form");
    form.reset();
    form.elements["customer_id"].value = customerId || currentCustomerId || "";
    form.elements["address_id"].value = "";
    form.elements["address_updated_at"].value = "";
    form.elements["state"].value = "MT";
    $("customer-address-form-title").textContent = "Novo endereço";
    $("customer-address-save").textContent = "Adicionar endereço";
    $("customer-address-cancel").hidden = true;
    $("customer-address-status").textContent = "";
  }

  function fillCustomerAddress(address) {
    const form = $("customer-address-form");
    const values = {
      customer_id: currentCustomerId, address_id: address.id, address_updated_at: address.updated_at || "",
      label: address.label || "", street: address.street || "", number: address.number || "",
      complement: address.complement || "", neighborhood: address.neighborhood || "",
      city: address.city || "", state: address.state || "MT", postal_code: address.postal_code || "",
      reference: address.reference || "",
    };
    Object.entries(values).forEach(([name, value]) => { form.elements[name].value = value; });
    $("customer-address-form-title").textContent = "Editar endereço";
    $("customer-address-save").textContent = "Salvar endereço";
    $("customer-address-cancel").hidden = false;
    $("customer-address-status").textContent = "";
    form.elements["label"].focus();
  }

  async function loadCustomerAddresses(customerId) {
    const id = String(customerId || "");
    currentCustomerId = id;
    customerAddressRows = [];
    $("customer-address-list").innerHTML = '<p class="admin-muted">Carregando endereços…</p>';
    $("customer-address-count").textContent = "";
    $("customer-address-form").elements.customer_id.value = id;
    try {
      const data = await adminRequest("customer_addresses_list", { customer_id: id });
      if (currentCustomerId !== id) return;
      customerAddressRows = Array.isArray(data.addresses) ? data.addresses : [];
      renderCustomerAddresses(customerAddressRows);
    } catch (_) {
      if (currentCustomerId !== id) return;
      $("customer-address-list").innerHTML = '<div class="customer-address-empty">Não foi possível carregar os endereços. Tente novamente.</div>';
    }
  }

  async function saveCustomerAddress(event) {
    event.preventDefault();
    const form = $("customer-address-form");
    const button = $("customer-address-save");
    const status = $("customer-address-status");
    if (button.disabled || !form.reportValidity()) return;
    if (!currentCustomerId) {
      status.textContent = "Salve ou localize o cadastro do cliente antes de adicionar um endereço.";
      return;
    }
    const value = (name) => form.elements[name].value.trim();
    const addressId = value("address_id");
    const action = addressId ? "update" : "create";
    button.disabled = true;
    button.textContent = "Salvando…";
    status.textContent = "Salvando endereço…";
    try {
      const saved = await adminRequest("customer_address_manage", {
        address_action: action, customer_id: currentCustomerId, address_id: addressId || null,
        expected_updated_at: value("address_updated_at") || null,
        label: value("label"),
        address: {
          street: value("street"), number: value("number"), complement: value("complement"),
          neighborhood: value("neighborhood"), city: value("city"), state: value("state"),
          postal_code: value("postal_code"), reference: value("reference")
        }
      });
      await loadCustomerAddresses(currentCustomerId);
      resetCustomerAddressForm(currentCustomerId);
      const duplicate = action === "create" && saved.created === false;
      status.textContent = duplicate ? "Este endereço já estava cadastrado." : "Endereço salvo.";
      toast(duplicate ? "Este endereço já estava cadastrado." :
        action === "create" ? "Endereço adicionado ao cadastro." : "Endereço atualizado.");
    } catch (error) {
      const messages = {
        address_changed: "Este endereço mudou em outra sessão. Atualize a lista e tente novamente.",
        customer_address_not_found: "Este endereço não está mais ativo. Atualize a lista.",
        unsupported_city: "Atendemos somente Cuiabá e Várzea Grande.",
        invalid_customer_address: "Confira rua, número, bairro, cidade e estado.",
        invalid_customer_id: "Salve ou busque um cliente antes de adicionar o endereço.",
        customer_not_found: "O cadastro do cliente não foi localizado. Busque novamente.",
        invalid_address_snapshot: "Atualize o endereço antes de salvar novamente."
      };
      status.textContent = messages[error.message] || "Não foi possível salvar o endereço. Confira os campos e tente novamente.";
    } finally {
      button.disabled = false;
      button.textContent = form.elements["address_id"].value ? "Salvar endereço" : "Adicionar endereço";
    }
  }

  async function runCustomerAddressAction(action, addressId) {
    const address = customerAddressRows.find((item) => String(item.id) === String(addressId));
    if (!address || !currentCustomerId) return;
    if (action === "edit") { fillCustomerAddress(address); return; }
    if (action === "deactivate" && !window.confirm("Remover o endereço “" + (address.label || "Endereço") + "”? Os pedidos anteriores continuam com o endereço usado.")) return;
    try {
      await adminRequest("customer_address_manage", { address_action: action, customer_id: currentCustomerId, address_id: address.id });
      await loadCustomerAddresses(currentCustomerId);
      if (String($("customer-address-form").elements.address_id.value) === String(address.id)) resetCustomerAddressForm(currentCustomerId);
      toast(action === "set_default" ? "Endereço principal atualizado." : "Endereço removido.");
    } catch (_) {
      $("customer-address-status").textContent = "Não foi possível atualizar este endereço. Atualize a lista e tente novamente.";
    }
  }

  $("customer-new-button").addEventListener("click", startNewCustomer);
  $("customer-search-type").addEventListener("change", syncCustomerSearchInput);
  $("customer-search-type").dispatchEvent(new Event("change"));
  $("customer-address-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-customer-address-action]");
    if (button) runCustomerAddressAction(button.dataset.customerAddressAction, button.dataset.addressId);
  });
  $("customer-address-form").addEventListener("submit", saveCustomerAddress);
  $("customer-address-cancel").addEventListener("click", () => resetCustomerAddressForm(currentCustomerId));

  async function openCustomer(customerId) {
    const result = $("customer-result");
    $("customer-editor").hidden = true;
    $("customer-addresses-panel").hidden = true;
    result.textContent = "Abrindo cadastro…";
    try {
      const data = await adminRequest("customer_lookup", { customer_id: customerId });
      if (!data.found || !data.customer) throw new Error("not_found");
      result.innerHTML = customerResultHtml(data.customer);
      fillCustomer(data.customer);
      await loadCustomerAddresses(data.customer.id);
    } catch (_) {
      result.textContent = "Não foi possível abrir o cadastro. Busque novamente.";
    }
  }

  function syncCustomerSearchInput() {
    const type = $("customer-search-type").value;
    const input = $("customer-phone");
    input.inputMode = type === "name" ? "text" : type === "document" ? "numeric" : "tel";
    input.autocomplete = type === "name" ? "name" : "off";
    input.placeholder = type === "name" ? "Nome do cliente" :
      type === "document" ? "CPF/CNPJ (opcional no cadastro)" : "Telefone com DDD";
    input.value = "";
  }

  async function searchCustomer(event) {
    event.preventDefault();
    const raw = $("customer-phone").value.trim();
    const by = $("customer-search-type").value;
    const query = by === "name" ? raw : digits(raw);
    const button = $("customer-search-button");
    const result = $("customer-result");
    $("customer-editor").hidden = true;
    $("customer-addresses-panel").hidden = true;
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
      await loadCustomerAddresses(data.customer.id);
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
    if (button.disabled || !form.reportValidity()) return;

    const value = (name) => form.elements[name].value.trim();
    const customerId = value("customer_id");
    const creating = !customerId;
    const customerDocument = digits(value("document"));
    const newPhone = normalizeAdminPhone(value("phone"));
    if (!value("name") || value("name").length < 2) {
      status.textContent = "Informe o nome do cliente.";
      return;
    }
    if (!newPhone) {
      status.textContent = "Informe um telefone válido, com ou sem DDD (padrão 65).";
      return;
    }
    if (value("document") && ![11, 14].includes(customerDocument.length)) {
      status.textContent = "CPF/CNPJ é opcional. Se preenchido, informe 11 ou 14 dígitos.";
      return;
    }

    button.disabled = true;
    button.textContent = creating ? "Criando…" : "Salvando…";
    status.textContent = creating ? "Criando cadastro do cliente…" : "Salvando alterações…";
    try {
      if (creating) {
        const created = await adminRequest("customer_create", {
          name: value("name"),
          document: customerDocument,
          phone: newPhone,
        });
        const createdId = String(created.customer_id || "");
        if (!createdId) throw new Error("customer_create_failed");
        form.elements["customer_id"].value = createdId;
        const refreshed = await adminRequest("customer_lookup", { customer_id: createdId });
        if (!refreshed.found || !refreshed.customer) throw new Error("customer_lookup_after_create_failed");
        fillCustomer(refreshed.customer);
        await loadCustomerAddresses(refreshed.customer.id);
        status.textContent = "Cadastro criado. Agora você pode adicionar um endereço.";
        $("customer-result").textContent = "Cliente cadastrado. Inclua um ou mais endereços abaixo.";
        toast("Cadastro do cliente criado.");
      } else {
        await adminRequest("customer_save", {
          customer_id: customerId,
          customer_updated_at: value("customer_updated_at"),
          name: value("name"),
          document: customerDocument,
          phone: newPhone,
        });
        const refreshed = await adminRequest("customer_lookup", { customer_id: customerId });
        if (!refreshed.found || !refreshed.customer) throw new Error("customer_not_found");
        fillCustomer(refreshed.customer);
        await loadCustomerAddresses(refreshed.customer.id);
        status.textContent = "Cadastro atualizado.";
        $("customer-result").textContent = "Cadastro atualizado com sucesso.";
        toast("Cadastro do cliente atualizado.");
      }
    } catch (error) {
      const messages = {
        customer_changed: "Este cadastro mudou em outra sessão. Busque o cliente novamente antes de salvar.",
        invalid_customer_snapshot: "Atualize o cadastro antes de salvar. Busque o cliente novamente.",
        customer_name_required: "Informe o nome do cliente.",
        invalid_document: "CPF/CNPJ inválido. Confira os dígitos.",
        document_already_in_use: "CPF/CNPJ já cadastrado em outro cliente.",
        cpf_already_in_use: "CPF/CNPJ já cadastrado em outro cliente.",
        phone_already_in_use: creating ? "Já existe um cadastro com esse telefone. Busque o cliente para editar ou adicionar endereço." : "Telefone já cadastrado em outro cliente.",
        phone_or_document_already_in_use: "Telefone ou CPF/CNPJ já cadastrado em outro cliente.",
        duplicate_customer_identity: "Já existe um cadastro com esse telefone ou CPF/CNPJ. Busque o cliente para editar.",
        invalid_phone: "Telefone inválido.",
        customer_lookup_after_create_failed: "O cadastro foi criado, mas não carregou na tela. Busque pelo telefone para continuar.",
        customer_not_found: "Cadastro não encontrado. Busque pelo telefone e tente novamente.",
      };
      status.textContent = messages[error.message] || "Não foi possível salvar. Confira os dados e tente novamente.";
    } finally {
      button.disabled = false;
      button.textContent = form.elements["customer_id"].value ? "Salvar alterações" : "Criar cadastro";
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
      $("customer-addresses-panel").hidden = true;
      currentCustomerId = "";
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
    $("customer-addresses-panel").hidden = true;
    $("customer-result").textContent = mode === "name" ? "Digite o nome." :
      mode === "document" ? "Digite o CPF ou CNPJ." : "Digite o telefone com ou sem DDD.";
  });
  $("customer-search").addEventListener("submit", searchCustomer);
  $("customer-editor").addEventListener("submit", saveCustomer);
  document.querySelectorAll(".nav-tab").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
  document.querySelectorAll("[data-go]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.go)));
  const requestedView = new URLSearchParams(window.location.search).get("view");
  if (requestedView === "delivery") setView("delivery");
  window.DonaAdminSetView = setView;
  const blingReauthorizeButton = $("bling-reauthorize");
  if (blingReauthorizeButton) blingReauthorizeButton.addEventListener("click", reauthorizeBling);
  const storefrontMaintenanceToggle = $("storefront-maintenance-toggle");
  if (storefrontMaintenanceToggle) {
    storefrontMaintenanceToggle.addEventListener("click", () => {
      if (storefrontMaintenanceLoaded) void toggleStorefrontMaintenance();
      else void loadStorefrontMaintenanceState();
    });
  }
  const adminAppForMaintenance = $("admin-app");
  if (adminAppForMaintenance) {
    const maintenanceLoginObserver = new MutationObserver(() => {
      if (!adminAppForMaintenance.hidden) {
        void loadStorefrontMaintenanceState();
        maintenanceLoginObserver.disconnect();
      }
    });
    if (adminAppForMaintenance.hidden) maintenanceLoginObserver.observe(adminAppForMaintenance, { attributes: true, attributeFilter: ["hidden"] });
    else void loadStorefrontMaintenanceState();
  }
  handleBlingOauthReturn();

})();
