(() => {
  "use strict";
  const config = window.DONA_SITE_CONFIG || {};
  const supabase = String(config.supabaseUrl || "").replace(/\/$/, "");
  const publishableKey = config.publishableKey || "";
  const storefront = String(config.storefrontFunction || "storefront-v2");
  const accessCode = "Eomc2020";
  const accessKey = "dona_admin_access_v1";
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
  let toastTimer = 0;

  async function storefrontRequest(action, params) {
    const url = new URL(`${supabase}/functions/v1/${storefront}`);
    url.searchParams.set("action", action);
    Object.entries(params || {}).forEach(([name, value]) => url.searchParams.set(name, String(value ?? "")));
    const response = await fetch(url.toString(), { headers: { apikey: publishableKey }, cache: "no-store" });
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

  function showAdmin() {
    $("login-view").hidden = true;
    $("admin-view").hidden = false;
  }

  function showLogin(message) {
    $("admin-view").hidden = true;
    $("login-view").hidden = false;
    $("login-message").textContent = message || "";
  }

  function enterAdmin() {
    showAdmin();
    $("admin-status").textContent = "Acesso autorizado por código temporário.";
  }

  function login(event) {
    event.preventDefault();
    const button = $("login-button");
    button.disabled = true;
    button.textContent = "Verificando…";
    $("login-message").textContent = "";
    if ($("login-code").value.trim() === accessCode) {
      sessionStorage.setItem(accessKey, "1");
      $("login-code").value = "";
      enterAdmin();
    } else {
      $("login-message").textContent = "Código inválido. Confira e tente novamente.";
    }
    button.disabled = false;
    button.textContent = "Acessar admin";
  }

  function logout() {
    sessionStorage.removeItem(accessKey);
    showLogin("Você saiu da administração.");
  }

  function setView(name) {
    document.querySelectorAll(".nav-tab").forEach((button) => button.classList.toggle("active", button.dataset.view === name));
    document.querySelectorAll("[data-panel]").forEach((panel) => {
      const active = panel.dataset.panel === name;
      panel.hidden = !active;
      panel.classList.toggle("active", active);
    });
    $("page-title").textContent = ({ customers: "Clientes", baskets: "Cestas", products: "Produtos", orders: "Pedidos", overview: "Visão geral" })[name] || "Visão geral";
    if (name === "baskets") window.DonaCatalogAdmin?.loadBaskets();
    if (name === "products") window.DonaCatalogAdmin?.loadProducts();
    if (name === "orders") window.DonaOrdersAdmin?.loadOrders();
  }

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
      const data = await storefrontRequest("customer_lookup", { phone });
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

  $("login-form").addEventListener("submit", login);
  $("logout-button").addEventListener("click", logout);
  $("customer-search").addEventListener("submit", searchCustomer);
  document.querySelectorAll(".nav-tab").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
  document.querySelectorAll("[data-go]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.go)));

  if (sessionStorage.getItem(accessKey) === "1") enterAdmin();
})();
