(() => {
  "use strict";

  const config = window.DONA_SITE_CONFIG || {};
  const supabaseUrl = String(config.supabaseUrl || "").replace(/\/$/, "");
  const publishableKey = config.publishableKey || "";
  const adminCode = () => window.DonaAdminAuth?.getCode?.() || "";
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
  const cents = (value) => Math.round(Number(value || 0));
  const money = (value) => (cents(value) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const state = {
    productCache: new Map(), productsOffset: 0, productsTotal: 0,
    productsQuery: "", productsStatus: "active", productsSegment: "all", toastTimer: 0,
  };

  async function request(action, options = {}) {
    const url = new URL(`${supabaseUrl}/functions/v1/site-admin-v1`);
    if (options.method !== "POST") {
      url.searchParams.set("action", action);
      Object.entries(options.params || {}).forEach(([key, value]) => url.searchParams.set(key, String(value ?? "")));
    }
    const headers = { apikey: publishableKey, "x-admin-code": adminCode() };
    const init = { method: options.method || "GET", headers, cache: "no-store" };
    if (options.method === "POST") {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify({ action, ...(options.body || {}) });
    }
    const response = await fetch(url.toString(), init);
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) throw new Error(data.message || data.error || "Não foi possível concluir a operação.");
    return data;
  }

  function toast(message) {
    const node = $("admin-toast");
    if (!node) return;
    node.textContent = message;
    node.classList.add("show");
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => node.classList.remove("show"), 3200);
  }

  function effectivePrice(product) {
    const value = product.is_offer && product.offer_price != null ? product.offer_price : product.price;
    return Math.round(Number(value || 0) * 100);
  }

  function syncProductSearchForm(form) {
    return Object.fromEntries(new FormData(form).entries());
  }

  const MOST_SOLD_TAG = "mais-vendidos";
  function isMostSoldTag(value) {
    return String(value || "").normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLocaleLowerCase("pt-BR")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") === MOST_SOLD_TAG;
  }
  function isMostSoldProduct(product) {
    const tags = Array.isArray(product?.tags) ? product.tags : [];
    return product?.storefront_featured === true || tags.some(isMostSoldTag);
  }

  function renderProducts(products, append) {
    const host = $("products-result");
    const rows = products.map((product) => `<article class="admin-product-card">
      ${product.image_url ? `<img src="${esc(product.image_url)}" alt="" width="64" height="64" loading="lazy" decoding="async">` : '<span class="product-image-placeholder">DA</span>'}
      <div class="admin-product-info"><strong>${esc(product.name)}</strong><span>${esc([product.brand, product.sku && `SKU ${product.sku}`].filter(Boolean).join(" · "))}</span><b>${money(effectivePrice(product))}${product.is_offer ? " · oferta" : ""}</b></div>
      <div class="admin-product-actions"><label class="product-active-toggle"><input type="checkbox" data-toggle-product="${esc(product.id)}" aria-label="Ativar ${esc(product.name)} no catálogo" ${product.is_active === true ? "checked" : ""}><span class="product-switch" aria-hidden="true"></span><span>${product.is_active === true ? "Ativo" : "Inativo"}</span></label><label class="product-active-toggle product-most-sold-toggle"><input type="checkbox" data-toggle-most-sold="${esc(product.id)}" aria-label="Exibir ${esc(product.name)} em Mais Vendidos" ${isMostSoldProduct(product) ? "checked" : ""}><span class="product-switch" aria-hidden="true"></span><span>Mais Vendidos</span></label><button class="button button-outline" type="button" data-edit-product="${esc(product.id)}">Editar</button></div>
    </article>`).join("");
    if (!append) host.innerHTML = rows || '<p class="admin-muted">Nenhum produto encontrado.</p>';
    else host.insertAdjacentHTML("beforeend", rows);
    $("products-more").hidden = state.productsOffset >= state.productsTotal;
  }

  async function loadProducts(reset = true) {
    if (reset) state.productsOffset = 0;
    const host = $("products-result");
    if (reset) host.innerHTML = '<p class="admin-muted">Carregando produtos…</p>';
    try {
      const data = await request("products", { params: { q: state.productsQuery, status: state.productsStatus, segment: state.productsSegment, offset: state.productsOffset, limit: 24 } });
      state.productsTotal = Number(data.total || 0);
      (data.products || []).forEach((product) => state.productCache.set(String(product.id), product));
      if (reset) state.productsOffset = 0;
      renderProducts(data.products || [], !reset);
      state.productsOffset += (data.products || []).length;
      $("products-more").hidden = state.productsOffset >= state.productsTotal;
    } catch (error) {
      host.innerHTML = `<p class="admin-muted">${esc(error.message || "Não foi possível carregar produtos.")}</p>`;
    }
  }

  async function setProductActive(event) {
    const input = event.target;
    if (!input.matches("[data-toggle-product]")) return;
    const productId = String(input.dataset.toggleProduct);
    const isActive = input.checked;
    const card = input.closest(".admin-product-card");
    input.disabled = true;
    try {
      const result = await request("product_set_active", { method: "POST", body: { id: productId, is_active: isActive } });
      if (result?.product?.is_active !== isActive) {
        throw new Error("O servidor não confirmou a alteração do produto. Tente novamente.");
      }
      const confirmedActive = result.product.is_active;
      const cached = state.productCache.get(productId) || {};
      state.productCache.set(productId, Object.assign({}, cached, result.product, { is_active: confirmedActive }));
      input.checked = confirmedActive;
      const statusLabel = input.closest(".product-active-toggle")?.querySelector("span:last-child");
      if (statusLabel) statusLabel.textContent = confirmedActive ? "Ativo" : "Inativo";
      toast(confirmedActive ? "Produto ativado no catálogo." : "Produto desativado no catálogo.");

      const leavesCurrentFilter =
        (state.productsStatus === "active" && !isActive) ||
        (state.productsStatus === "inactive" && isActive);
      if (leavesCurrentFilter && card) {
        card.remove();
        state.productsTotal = Math.max(0, state.productsTotal - 1);
        state.productsOffset = Math.max(0, state.productsOffset - 1);
        $("products-more").hidden = state.productsOffset >= state.productsTotal;
        if (!$("products-result").querySelector(".admin-product-card")) {
          $("products-result").innerHTML = '<p class="admin-muted">Nenhum produto encontrado.</p>';
        }
      }
    } catch (error) {
      input.checked = !isActive;
      toast(error.message || "Não foi possível alterar o produto.");
    } finally {
      input.disabled = false;
    }
  }

  async function setProductMostSold(event) {
    const input = event.target;
    if (!input.matches("[data-toggle-most-sold]")) return;
    const productId = String(input.dataset.toggleMostSold);
    const isMostSold = input.checked;
    input.disabled = true;
    try {
      const result = await request("product_set_most_sold", {
        method: "POST",
        body: { id: productId, is_most_sold: isMostSold }
      });
      if (result?.product?.storefront_featured !== isMostSold) {
        throw new Error("O servidor não confirmou a alteração de Mais Vendidos. Tente novamente.");
      }
      const cached = state.productCache.get(productId) || {};
      state.productCache.set(productId, Object.assign({}, cached, result.product));
      input.checked = result.product.storefront_featured;
      toast(isMostSold ? "Produto incluído em Mais Vendidos." : "Produto removido de Mais Vendidos.");
    } catch (error) {
      input.checked = !isMostSold;
      toast(error.message || "Não foi possível alterar Mais Vendidos.");
    } finally {
      input.disabled = false;
    }
  }

  function openProduct(product = null) {
    const form = $("product-form");
    form.reset();
    $("product-id").value = product?.id || "";
    $("product-dialog-title").textContent = product ? "Editar produto" : "Novo produto";
    $("product-save-message").textContent = "";
    const textFields = ["name", "brand", "sku", "gtin", "ncm", "packaging", "unit", "supplier", "category", "subcategory", "subsubcategory", "storefront_category", "sales_category", "validity_date", "gondola", "shelf", "sort_order", "image_url", "description_short", "description_long", "customer_category", "customer_subcategory", "customer_subsubcategory"];
    textFields.forEach((name) => { form.elements[name].value = product?.[name] ?? (name === "sort_order" ? 0 : ""); });
    ["price", "offer_price", "cost", "stock", "min_stock"].forEach((name) => { form.elements[name].value = product?.[name] ?? ""; });
    const productTags = Array.isArray(product?.tags) ? product.tags : String(product?.tags || "").split(",");
    form.elements.tags.value = productTags.filter((tag) => !isMostSoldTag(tag)).join(", ");
    ["is_active", "is_offer", "is_whatsapp_active", "is_upsell"].forEach((name) => { form.elements[name].checked = product ? product[name] === true : ["is_active", "is_whatsapp_active"].includes(name); });
    form.elements.storefront_featured.checked = product ? isMostSoldProduct(product) : false;
    $("product-dialog").showModal();
  }

  async function saveProduct(event) {
    event.preventDefault();
    const button = $("save-product");
    const data = syncProductSearchForm(event.currentTarget);
    data.id = $("product-id").value || null;
    ["is_active", "is_offer", "is_whatsapp_active", "is_upsell", "storefront_featured"].forEach((name) => { data[name] = event.currentTarget.elements[name].checked; });
    const productTags = String(data.tags || "").split(",").map((tag) => tag.trim()).filter(Boolean);
    data.storefront_featured = data.storefront_featured === true || productTags.some(isMostSoldTag);
    data.tags = productTags.filter((tag) => !isMostSoldTag(tag));
    if (data.storefront_featured) data.tags.push(MOST_SOLD_TAG);
    button.disabled = true;
    button.textContent = "Salvando…";
    $("product-save-message").textContent = "";
    try {
      const result = await request("product_save", { method: "POST", body: data });
      const product = Object.assign({}, result.product, { effective_price_cents: effectivePrice(result.product) });
      state.productCache.set(String(product.id), product);
      $("product-dialog").close();
      const basketUpdate = window.DonaBasketAdmin?.productSaved?.(product);
      if (basketUpdate && typeof basketUpdate.then === "function") await basketUpdate;
      toast("Produto salvo.");
      await loadProducts(true);
    } catch (error) {
      $("product-save-message").textContent = error.message || "Não foi possível salvar o produto.";
    } finally {
      button.disabled = false;
      button.textContent = "Salvar produto";
    }
  }

  function bind() {
    $("product-form").addEventListener("submit", saveProduct);
    $("products-result").addEventListener("change", setProductActive);
    $("products-result").addEventListener("change", setProductMostSold);
    $("products-result").addEventListener("click", (event) => {
      const button = event.target.closest("[data-edit-product]");
      if (button) openProduct(state.productCache.get(String(button.dataset.editProduct)));
    });
    $("product-search").addEventListener("submit", (event) => {
      event.preventDefault();
      state.productsQuery = $("product-query").value.trim();
      state.productsStatus = $("product-status").value;
      state.productsSegment = $("product-segment").value;
      loadProducts(true);
    });
    $("product-status").addEventListener("change", () => $("product-search").requestSubmit());
    $("product-segment").addEventListener("change", () => $("product-search").requestSubmit());
    document.addEventListener("click", (event) => {
      const target = event.target.closest("button");
      if (!target) return;
      if (target.id === "new-product") openProduct();
      if (target.id === "products-more") loadProducts(false);
      if (target.dataset.dialogClose === "product-dialog") $("product-dialog").close();
    });
  }

  bind();
  window.DonaCatalogAdmin = { loadProducts };
  window.DonaAdminProductBridge = {
    request,
    esc,
    money,
    effectivePrice,
    productCache: state.productCache,
    openProduct,
    toast,
  };
})();
