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
    if (name === "baskets") window.DonaCatalogAdmin?.loadBaskets();
    if (name === "products") window.DonaCatalogAdmin?.loadProducts();
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
      name: customer.display_name || "", phone: customer.phone || "",
      document: customer.document_last4 ? `•••.•••.•••-${customer.document_last4}` : "—",
      street: address.street || "", number: address.number || "", complement: address.complement || "",
      neighborhood: address.neighborhood || "", city: address.city || "", state: address.state || "",
      postal_code: address.postal_code || "", reference: address.reference || "",
    };
    Object.entries(values).forEach(([name, value]) => { form.elements[name].value = value; });
    form.hidden = false;
  }

  async function searchCustomer(event) {
    event.preventDefault();
    const phone = digits($("customer-phone").value);
    const button = $("customer-search-button");
    const result = $("customer-result");
    $("customer-editor").hidden = true;
    if (phone.length < 10 || phone.length > 13) {
      result.className = "customer-result empty-result";
      result.textContent = "Digite um telefone com DDD.";
      return;
    }
    button.disabled = true;
    button.textContent = "Buscando…";
    result.className = "customer-result";
    result.textContent = "Consultando cadastro…";
    try {
      const data = await adminRequest("customer_lookup", { phone });
      if (!data.found || !data.customer) {
        result.className = "customer-result empty-result";
        result.textContent = "Nenhum cliente encontrado para esse telefone.";
        return;
      }
      const customer = data.customer;
      const address = formatAddress(customer.address);
      result.innerHTML = `<strong>${esc(customer.display_name || "Cliente")}</strong><span>${esc(customer.phone || $("customer-phone").value)}</span><br>${address.length ? address.map(esc).join("<br>") : "Sem endereço ativo cadastrado."}`;
      fillCustomer(customer);
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
    try {
      await adminRequest("customer_save", {
        customer_id: value("customer_id"),
        customer_updated_at: value("customer_updated_at"),
        address_id: value("address_id"),
        address_updated_at: value("address_updated_at"),
        name: value("name"),
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
      const refreshed = await adminRequest("customer_lookup", { phone: digits(value("phone")) });
      if (refreshed.found && refreshed.customer) fillCustomer(refreshed.customer);
      status.textContent = "Cadastro atualizado.";
      $("customer-result").textContent = "Cadastro atualizado com sucesso.";
      toast("Cadastro do cliente atualizado.");
    } catch (error) {
      status.textContent = error.message === "customer_changed"
        ? "Este cadastro mudou em outra sessão. Busque o cliente novamente antes de salvar."
        : "Não foi possível salvar. Confira os dados e tente novamente.";
    } finally {
      button.disabled = false;
      button.textContent = "Salvar alterações";
    }
  }

  $("customer-search").addEventListener("submit", searchCustomer);
  $("customer-editor").addEventListener("submit", saveCustomer);
  document.querySelectorAll(".nav-tab").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
  document.querySelectorAll("[data-go]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.go)));

})();
