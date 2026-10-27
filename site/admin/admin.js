(() => {
  "use strict";
  const config = window.DONA_SITE_CONFIG || {};
  const supabase = String(config.supabaseUrl || "").replace(/\/$/, "");
  const publishableKey = config.publishableKey || "";
  const storefront = String(config.storefrontFunction || "storefront-v2");
  const basketAdmin = String(config.basketAdminFunction || "admin-basket-molds-v1");
  const sessionKey = "dona_admin_session_v1";
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
  const plain = (value) => String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  const money = (cents) => (Number(cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  let session = null;
  let toastTimer = 0;

  function saveSession(value) {
    session = value;
    if (value) sessionStorage.setItem(sessionKey, JSON.stringify(value));
    else sessionStorage.removeItem(sessionKey);
  }

  function readSession() {
    try { return JSON.parse(sessionStorage.getItem(sessionKey) || "null"); } catch (_) { return null; }
  }

  function toast(message) {
    const node = $("admin-toast");
    node.textContent = message;
    node.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove("show"), 3200);
  }

  async function authPost(path, body, token) {
    const headers = { apikey: publishableKey, "Content-Type": "application/json" };
    if (token) headers.Authorization = "Bearer " + token;
    const response = await fetch(supabase + path, { method: "POST", headers, body: JSON.stringify(body || {}) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.msg || data.message || data.error_description || data.error || "Falha na autenticação.");
    return data;
  }

  async function refreshSession() {
    if (!session || !session.refresh_token) throw new Error("Sessão expirada. Entre novamente.");
    const updated = await authPost("/auth/v1/token?grant_type=refresh_token", { refresh_token: session.refresh_token });
    saveSession(updated);
    return updated;
  }

  async function functionRequest(name, action, body, retry) {
    if (!session || !session.access_token) throw new Error("Entre novamente para continuar.");
    const headers = { apikey: publishableKey, Authorization: "Bearer " + session.access_token, "Content-Type": "application/json" };
    const response = await fetch(supabase + "/functions/v1/" + name, {
      method: "POST", headers, body: JSON.stringify(Object.assign({ action }, body || {})), cache: "no-store"
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 && retry !== false) {
      await refreshSession();
      return functionRequest(name, action, body, false);
    }
    if (!response.ok || data.ok === false) throw new Error(data.detail || data.error || "Erro " + response.status);
    return data;
  }

  async function storefrontRequest(action, params) {
    const url = new URL(supabase + "/functions/v1/" + storefront);
    url.searchParams.set("action", action);
    Object.keys(params || {}).forEach((name) => url.searchParams.set(name, String(params[name] == null ? "" : params[name])));
    const response = await fetch(url.toString(), {
      headers: { apikey: publishableKey, Authorization: "Bearer " + publishableKey },
      cache: "no-store"
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) throw new Error(data.error || "Não foi possível consultar.");
    return data;
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

  async function validateAdmin() {
    await functionRequest(basketAdmin, "list", {}, true);
    showAdmin();
    $("admin-status").textContent = "Acesso autorizado. Conectado como " + (session.user && session.user.email || "administrador") + ".";
    await loadBaskets();
  }

  async function login(event) {
    event.preventDefault();
    const button = $("login-button");
    button.disabled = true;
    button.textContent = "Entrando…";
    $("login-message").textContent = "";
    try {
      const auth = await authPost("/auth/v1/token?grant_type=password", {
        email: $("login-email").value.trim(),
        password: $("login-password").value
      });
      saveSession(auth);
      await validateAdmin();
    } catch (error) {
      saveSession(null);
      $("login-message").textContent = error.message === "Failed to fetch"
        ? "Não foi possível conectar. Verifique sua internet e tente de novo."
        : "Acesso não autorizado. Confira sua conta de administrador.";
    } finally {
      button.disabled = false;
      button.textContent = "Entrar";
    }
  }

  async function logout() {
    const current = session;
    saveSession(null);
    if (current && current.access_token) {
      try { await authPost("/auth/v1/logout", {}, current.access_token); } catch (_) {}
    }
    showLogin("Você saiu da administração.");
  }

  function setView(name) {
    document.querySelectorAll(".nav-tab").forEach((button) => button.classList.toggle("active", button.dataset.view === name));
    document.querySelectorAll("[data-panel]").forEach((panel) => {
      const active = panel.dataset.panel === name;
      panel.hidden = !active;
      panel.classList.toggle("active", active);
    });
    $("page-title").textContent = name === "customers" ? "Clientes" : name === "baskets" ? "Cestas" : "Visão geral";
    if (name === "baskets") loadBaskets();
  }

  function digits(value) { return String(value || "").replace(/\D/g, ""); }
  function formatAddress(address) {
    if (!address) return [];
    return [
      [address.street, address.number, address.complement].filter(Boolean).join(", "),
      [address.neighborhood, address.city, address.state].filter(Boolean).join(" · "),
      address.postal_code ? "CEP " + address.postal_code : "",
      address.reference ? "Referência: " + address.reference : ""
    ].filter(Boolean);
  }

  function fillEditor(customer) {
    const address = customer.address || {};
    const form = $("customer-editor");
    const values = {
      name: customer.display_name || "",
      phone: customer.phone || "",
      document: customer.document_last4 ? "•••.•••.•••-" + customer.document_last4 : "—",
      street: address.street || "",
      number: address.number || "",
      complement: address.complement || "",
      neighborhood: address.neighborhood || "",
      city: address.city || "",
      state: address.state || "",
      postal_code: address.postal_code || "",
      reference: address.reference || ""
    };
    Object.keys(values).forEach((name) => { form.elements[name].value = values[name]; });
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
      result.innerHTML = "<strong>" + esc(customer.display_name || "Cliente") + "</strong><span>" +
        esc(customer.phone || $("customer-phone").value) + "</span><br>" +
        (address.length ? address.map(esc).join("<br>") : "Sem endereço ativo cadastrado.");
      fillEditor(customer);
    } catch (error) {
      result.className = "customer-result empty-result";
      result.textContent = "Não foi possível consultar o cadastro. Tente novamente.";
    } finally {
      button.disabled = false;
      button.textContent = "Buscar";
    }
  }

  async function loadBaskets() {
    const host = $("admin-baskets");
    host.innerHTML = '<p class="admin-muted">Carregando…</p>';
    try {
      const shell = await storefrontRequest("home_size_cards", {});
      const rows = await Promise.all((shell.baskets || []).map(async (card) => {
        const key = card.size_key || String(card.name || "").toLowerCase();
        try {
          const data = await storefrontRequest("basket_by_size", { size_key: key, lightweight: "1" });
          return { card, basket: data.basket, items: data.items || [] };
        } catch (_) {
          return { card, basket: null, items: [] };
        }
      }));
      host.innerHTML = rows.map((row) => {
        const card = row.card;
        const basket = row.basket;
        const count = row.items.reduce((sum, item) => sum + Number(item.quantity || item.base_quantity || 0), 0);
        const image = card.image_url || "../../img/cestas/cesta-" + (card.size_key || "mini") + ".jpg";
        return '<article class="admin-basket-row"><img src="' + esc(image) + '" alt="" width="58" height="58" loading="lazy">' +
          '<div><strong>' + esc(card.name || "Cesta") + '</strong><small>' + (basket ? esc(row.items.length) + " tipos de produto · " + esc(count) + " itens" : "Conteúdo indisponível") + '</small></div>' +
          '<b>' + (basket ? esc(money(basket.display_price_cents)) : "—") + "</b></article>";
      }).join("") || '<p class="admin-muted">Nenhuma cesta encontrada.</p>';
    } catch (error) {
      host.innerHTML = '<p class="admin-muted">Não foi possível carregar as cestas agora.</p>';
    }
  }

  $("login-form").addEventListener("submit", login);
  $("logout-button").addEventListener("click", logout);
  $("customer-search").addEventListener("submit", searchCustomer);
  $("reload-baskets").addEventListener("click", loadBaskets);
  document.querySelectorAll(".nav-tab").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
  document.querySelectorAll("[data-go]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.go)));

  session = readSession();
  if (session && session.access_token) {
    validateAdmin().catch(() => { saveSession(null); showLogin("Sua sessão expirou. Entre novamente."); });
  }
})();

