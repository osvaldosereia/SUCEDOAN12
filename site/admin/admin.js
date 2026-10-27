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
  const plain = (value) => String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  const money = (cents) => (Number(cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  let toastTimer = 0;

  function toast(message) {
    const node = $("admin-toast");
    node.textContent = message;
    node.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove("show"), 3200);
  }

  async function storefrontRequest(action, params, options) {
    const opts = options || {};
    const url = new URL(supabase + "/functions/v1/" + storefront);
    url.searchParams.set("action", action);
    Object.keys(params || {}).forEach((name) => url.searchParams.set(name, String(params[name] == null ? "" : params[name])));
    const headers = { apikey: publishableKey, Authorization: "Bearer " + publishableKey };
    const init = { method: opts.method || "GET", headers, cache: "no-store" };
    if (opts.body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(opts.body);
    }
    const response = await fetch(url.toString(), init);
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

  async function enterAdmin() {
    showAdmin();
    $("admin-status").textContent = "Acesso autorizado por código temporário.";
    await loadBaskets();
  }

  async function login(event) {
    event.preventDefault();
    const button = $("login-button");
    button.disabled = true;
    button.textContent = "Verificando…";
    $("login-message").textContent = "";
    if ($("login-code").value.trim() === accessCode) {
      sessionStorage.setItem(accessKey, "1");
      $("login-code").value = "";
      await enterAdmin();
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

  async function mapLimit(items, limit, task) {
    const results = new Array(items.length);
    let next = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await task(items[index], index);
      }
    });
    await Promise.all(workers);
    return results;
  }

  async function optionsForPosition(basket, item) {
    const alternatives = [];
    let offset = 0;
    let registeredAvailable = 0;
    do {
      const page = await storefrontRequest("basket_mold_options", {
        basket_id: basket.id,
        composition_number: basket.composition_number || 1,
        position_id: item.position_id,
        selected_product_id: item.product_id || "",
        quantity: item.quantity || item.base_quantity || 0,
        offset
      });
      alternatives.push(...(page.alternatives || []));
      registeredAvailable = Number(page.alternative_count || alternatives.length);
      if (page.next_offset == null || Number(page.next_offset) <= offset) break;
      offset = Number(page.next_offset);
    } while (offset < 100);
    return { alternatives, availableCount: registeredAvailable };
  }

  async function loadComposition(details, row) {
    if (!row.basket || details.dataset.loaded === "1" || details.dataset.loading === "1") return;
    const host = details.querySelector(".admin-composition");
    details.dataset.loading = "1";
    host.innerHTML = '<p class="admin-muted">Carregando produtos e opções…</p>';
    try {
      const results = await mapLimit(row.items, 5, async (item) => {
        try { return await optionsForPosition(row.basket, item); }
        catch (_) { return { alternatives: [], availableCount: 0, failed: true }; }
      });
      host.innerHTML = '<p class="admin-composition-note">Composição e alternativas lidas do cadastro atual do Supabase. Os preços individuais não são exibidos.</p>' +
        '<div class="admin-position-list">' + row.items.map((item, index) => {
          const result = results[index] || { alternatives: [], availableCount: 0 };
          const alternatives = result.alternatives || [];
          const configured = Number(item.alternative_count || 0);
          const available = Number(result.availableCount || alternatives.length);
          const quantity = item.quantity || item.base_quantity || 0;
          const productLabel = [quantity, item.packaging].filter(Boolean).join(" ");
          let optionContent;
          if (alternatives.length) {
            const stockLabel = available + " disponível" + (available === 1 ? "" : "is") + " em estoque";
            optionContent = '<small class="admin-option-count">' + esc(configured) + ' cadastrada' + (configured === 1 ? "" : "s") + ' · ' + esc(stockLabel) + '</small>' +
              '<ul class="admin-options">' + alternatives.map((option) => '<li>' + esc(option.name || "Produto") + (option.packaging ? ' <span>· ' + esc(option.packaging) + '</span>' : "") + '</li>').join("") + '</ul>';
          } else {
            optionContent = '<small class="admin-option-count">' + (result.failed
              ? "Opções cadastradas; estoque indisponível para consulta agora."
              : esc(configured) + ' opção' + (configured === 1 ? "" : "ões") + ' cadastrada' + (configured === 1 ? "" : "s") + ' · sem opção em estoque agora.') + '</small>';
          }
          return '<article class="admin-position"><div class="admin-position-main"><strong>' + esc(item.name || "Produto") + '</strong><small>' + esc(productLabel) + '</small></div><div class="admin-position-options">' + optionContent + '</div></article>';
        }).join("") + '</div>';
      details.dataset.loaded = "1";
    } catch (_) {
      host.innerHTML = '<p class="admin-muted">Não foi possível carregar as opções agora. Feche e abra esta cesta para tentar novamente.</p>';
    } finally {
      details.dataset.loading = "0";
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
        const optionCount = row.items.reduce((sum, item) => sum + Number(item.alternative_count || 0), 0);
        const key = card.size_key || "mini";
        const image = "../assets/cestas/cesta-" + key + ".jpg";
        return '<details class="admin-basket-card" data-size-key="' + esc(key) + '"><summary>' +
          '<img src="' + esc(image) + '" alt="" width="64" height="64" loading="lazy" decoding="async">' +
          '<span class="admin-basket-summary"><strong>' + esc(card.name || "Cesta") + '</strong><small>' + (basket
            ? esc(row.items.length) + " produtos · " + esc(count) + " unidades · " + esc(optionCount) + " opções cadastradas"
            : "Conteúdo indisponível") + '</small></span>' +
          '<b>' + (basket ? esc(money(basket.display_price_cents)) : "—") + '</b></summary>' +
          '<div class="admin-composition">' + (basket
            ? '<p class="admin-muted">Abra para consultar a composição e as alternativas cadastradas.</p>'
            : '<p class="admin-muted">Não foi possível consultar esta cesta.</p>') + '</div></details>';
      }).join("") || '<p class="admin-muted">Nenhuma cesta encontrada.</p>';
      host.querySelectorAll(".admin-basket-card").forEach((details, index) => {
        details.addEventListener("toggle", () => { if (details.open) loadComposition(details, rows[index]); });
      });
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

  if (sessionStorage.getItem(accessKey) === "1") enterAdmin();
})();
