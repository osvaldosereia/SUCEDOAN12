(() => {
  "use strict";

  const root = document.getElementById("daily-offers-admin-root");
  if (!root) return;
  let loading = false;
  let loaded = false;
  let busy = false;
  let imageBusy = false;
  let imagePollTimer = 0;
  let imagePollAttempts = 0;
  let expectedImageProductCount = 0;
  let imageState = { status: "pending", product_count: 0, image_count: 0, unpictured_count: 0, images: [], needs_regeneration: false };

  const bridge = () => window.DonaAdminProductBridge;
  const esc = (value) => bridge()?.esc?.(value) || String(value == null ? "" : value).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);
  const money = (value) => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const number = (value, digits = 0) => Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: digits });

  async function request(operation, payload = {}) {
    const api = bridge();
    if (!api?.request) throw new Error("A sessão do admin ainda não está pronta.");
    return api.request("daily_offers", { method: "POST", body: { operation, ...payload } });
  }

  async function requestImages(action) {
    const config = window.DONA_SITE_CONFIG || {};
    const supabaseUrl = String(config.supabaseUrl || "").replace(/\/$/, "");
    const adminCode = typeof window.DonaAdminAuth?.getCode === "function" ? window.DonaAdminAuth.getCode() : "";
    if (!supabaseUrl || !config.publishableKey || !adminCode) throw new Error("Entre novamente no admin para consultar as imagens.");
    const response = await fetch(supabaseUrl + "/functions/v1/daily-offer-status-images-v1", {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "apikey": config.publishableKey,
        "x-admin-code": adminCode
      },
      body: JSON.stringify({ action })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      throw new Error(data.message || (data.error === "unauthorized" ? "Sessão do admin expirada. Entre novamente." : "Não foi possível consultar as imagens de hoje."));
    }
    return data;
  }

  function imageStatusMarkup() {
    const state = imageState || {};
    const status = String(state.status || "pending");
    const stale = status === "ready" && expectedImageProductCount > 0 && Number(state.product_count || 0) !== expectedImageProductCount;
    let message = "As imagens de hoje ainda não foram geradas.";
    if (status === "generating") message = "Gerando as imagens de hoje…";
    else if (stale) message = "As ofertas mudaram para " + number(expectedImageProductCount) + " produtos; atualizando " + number(Math.floor(expectedImageProductCount / 6)) + " imagens.";
    else if (status === "ready") {
      message = number(state.product_count) + " produtos organizados em " + number(state.image_count) + " imagens individuais.";
      if (Number(state.unpictured_count || 0) > 0) message += " " + number(state.unpictured_count) + " oferta(s) sem imagem completa ficaram fora das montagens.";
      if (state.needs_regeneration) message += " Gere novamente para baixar cada imagem em JPEG com até 100 KB.";
      if (state.generated_at) message += " Atualizadas em " + new Date(state.generated_at).toLocaleString("pt-BR", { timeZone: "America/Cuiaba", dateStyle: "short", timeStyle: "short" }) + ".";
    } else if (status === "empty") message = "Não há ofertas automáticas ativas para montar hoje.";
    else if (status === "failed") message = state.error_message || "Não foi possível montar as imagens de hoje.";
    else if (status === "unavailable") message = state.error_message || "Não foi possível consultar o estado das imagens.";
    const images = status === "ready" && !stale && !state.needs_regeneration && Array.isArray(state.images)
      ? '<div class="daily-offer-images-downloads">' + state.images.map((image) =>
        '<a class="button button-primary daily-offer-image-download" href="' + esc(image.download_url) + '" download="' + esc(image.file_name) + '">Baixar imagem ' + number(image.number) + ' · ' + number(image.size_kb, 1) + ' KB</a>'
      ).join("") + '</div>'
      : "";
    const generateLabel = imageBusy ? "Gerando…" : (state.needs_regeneration || stale ? "Gerar imagens atualizadas" : "Gerar imagens agora");
    return '<section class="daily-offer-images" aria-labelledby="daily-offer-images-title">'
      + '<div class="daily-offer-images-copy"><h4 id="daily-offer-images-title">Imagens para o Status do WhatsApp</h4>'
      + '<p>Montagens verticais com seis produtos, preços de/por, logo, entrega grátis a partir de R$ 75 e WhatsApp 65 99815-0975. Com 48 ofertas, são 8 imagens individuais. JPEG até 100 KB por imagem.</p>'
      + '<p class="daily-offer-images-status" role="status" aria-live="polite">' + esc(message) + '</p></div>'
      + '<div class="daily-offer-images-actions">' + images
      + '<button class="button button-outline" type="button" data-daily-offer-images-refresh' + (imageBusy ? " disabled" : "") + '>Atualizar estado</button>'
      + '<button class="button button-outline" type="button" data-daily-offer-images-generate' + (imageBusy ? " disabled" : "") + '>' + generateLabel + '</button></div>'
      + '</section>';
  }

  function renderImagePanel() {
    const host = root.querySelector("#daily-offer-images-root");
    if (host) host.innerHTML = imageStatusMarkup();
  }

  async function refreshImageStatus(autoRegenerateStale = true) {
    if (imageBusy) return;
    try {
      imageState = await requestImages("status");
      imagePollAttempts = 0;
    } catch (error) {
      imageState = { status: "unavailable", error_message: error.message || "Não foi possível consultar as imagens." };
    }
    const stale = imageState.status === "ready" && expectedImageProductCount > 0 && Number(imageState.product_count || 0) !== expectedImageProductCount;
    if (stale) imageState = Object.assign({}, imageState, { needs_regeneration: true });
    renderImagePanel();
    if (imagePollTimer) window.clearTimeout(imagePollTimer);
    if (stale && autoRegenerateStale) { await generateImages(); return; }
    if (imageState.status === "generating" && imagePollAttempts < 40) {
      imagePollAttempts += 1;
      imagePollTimer = window.setTimeout(refreshImageStatus, 3000);
    }
  }

  async function generateImages() {
    if (imageBusy) return;
    imageBusy = true;
    imageState = Object.assign({}, imageState, { status: "generating", error_message: "" });
    renderImagePanel();
    try {
      imageState = await requestImages("generate");
    } catch (error) {
      imageState = { status: "failed", error_message: error.message || "Não foi possível gerar as imagens." };
    } finally {
      imageBusy = false;
      renderImagePanel();
      if (imageState.status === "generating") refreshImageStatus();
    }
  }

  function offerMarkup(offer) {
    const discount = Number(offer.discount_percent || (Number(offer.price) > 0 ? (1 - Number(offer.offer_price) / Number(offer.price)) * 100 : 0));
    const photo = offer.image_url ? '<img src="' + esc(offer.image_url) + '" alt="" loading="lazy">' : '<span class="product-image-placeholder">DA</span>';
    return '<article class="daily-offer-row">' + photo
      + '<div class="daily-offer-info"><strong title="' + esc(offer.name) + '">' + esc(offer.name) + '</strong>'
      + '<span>' + money(offer.price) + ' → <b>' + money(offer.offer_price) + '</b> · ' + number(discount) + '% off · estoque ' + number(offer.sellable_stock, 2) + '</span></div>'
      + '<button class="button button-outline danger-button" type="button" data-daily-offer-remove="' + esc(offer.id) + '">Tirar</button></article>';
  }

  function render(data) {
    const config = data.config || {};
    const offers = Array.isArray(data.offers) ? data.offers : [];
    expectedImageProductCount = offers.length;
    const active = config.enabled === true;
    const target = Number(config.daily_product_count || 48);
    const today = String(config.today || "");
    const rotatedToday = String(config.last_rotation_date || "") === today;
    const lastRun = config.last_rotation_at
      ? new Date(config.last_rotation_at).toLocaleString("pt-BR", { timeZone: "America/Cuiaba", dateStyle: "short", timeStyle: "short" })
      : "";
    const runText = !active
      ? 'A rotação está pausada. Ofertas manuais e por validade continuam aparecendo.'
      : rotatedToday
        ? 'Ofertas geradas hoje: <strong>' + offers.length + ' de ' + target + '</strong>.'
        : 'A seleção de hoje ainda será gerada na próxima virada ou pelo botão abaixo.';
    root.innerHTML = '<section class="daily-offers-admin">'
      + '<header class="daily-offers-heading"><div><h3>Ofertas do dia</h3><p>Rotacione produtos automaticamente todos os dias às 00h, no horário de Cuiabá.</p></div>'
      + '<span class="daily-offers-pill ' + (active ? 'is-active' : '') + '">' + (active ? 'Rotação ativa' : 'Rotação pausada') + '</span></header>'
      + '<form id="daily-offers-form" class="daily-offers-form">'
      + '<label class="daily-offers-toggle"><input name="enabled" type="checkbox"' + (active ? ' checked' : '') + '> Ativar rotação diária</label>'
      + '<label>Produtos por dia<input name="daily_product_count" type="number" min="1" max="100" value="' + target + '" required></label>'
      + '<label>Desconto mínimo (%)<input name="min_discount_percent" type="number" min="5" max="15" value="' + Number(config.min_discount_percent || 5) + '" required></label>'
      + '<label>Desconto máximo (%)<input name="max_discount_percent" type="number" min="5" max="15" value="' + Number(config.max_discount_percent || 15) + '" required></label>'
      + '<label>Margem bruta mínima (%)<input name="min_gross_margin_percent" type="number" min="0" max="50" step="0.5" value="' + Number(config.min_gross_margin_percent ?? 5) + '" required></label>'
      + '</form>'
      + '<p class="daily-offers-help">A seleção usa estoque vendável, preço e custo cadastrados. Produtos sem custo, sem estoque ou que não preservem a margem mínima ficam de fora. Ofertas manuais e ofertas por validade são mantidas separadas.</p>'
      + '<div class="daily-offers-actions"><button id="daily-offers-save" class="button button-outline" type="button">Salvar regra</button>'
      + '<button id="daily-offers-generate" class="button button-primary" type="button"' + (!active ? ' disabled' : '') + '>Gerar novamente hoje</button></div>'
      + '<div class="daily-offers-summary">' + runText + (rotatedToday && lastRun ? '<span>Última execução: ' + esc(lastRun) + '</span>' : '') + '</div>'
      + '<div id="daily-offer-images-root"></div>'
      + '<div class="daily-offers-list">' + (offers.length ? offers.map(offerMarkup).join("") : '<p class="daily-offers-empty">Nenhuma oferta automática ativa agora. As ofertas manuais continuam aparecendo normalmente.</p>') + '</div>'
      + '</section>';
    root.querySelector("#daily-offers-save").disabled = busy;
    root.querySelector("#daily-offers-generate").disabled = busy || !active;
    root.querySelectorAll("[data-daily-offer-remove]").forEach((button) => { button.disabled = busy; });
    renderImagePanel();
  }

  async function load(force = false, autoRegenerateStale = true) {
    if (loading || (loaded && !force)) return;
    loading = true;
    root.innerHTML = '<p class="admin-muted">Carregando ofertas do dia…</p>';
    try {
      render(await request("get"));
      loaded = true;
    } catch (error) {
      root.innerHTML = '<section class="daily-offers-admin"><h3>Ofertas do dia</h3><p class="daily-offers-error">' + esc(error.message || "Não foi possível carregar as ofertas.") + '</p><button class="button button-outline" type="button" data-daily-offer-retry>Tentar novamente</button><div id="daily-offer-images-root"></div></section>';
      renderImagePanel();
    } finally {
      loading = false;
    }
    await refreshImageStatus(autoRegenerateStale);
  }

  async function mutate(operation, payload) {
    if (busy) return;
    busy = true;
    root.querySelectorAll("button").forEach((button) => { button.disabled = true; });
    try {
      await request(operation, payload);
      loaded = false;
      await load(true, false);
      if (["remove", "save", "generate"].includes(operation)) await generateImages();
      bridge()?.toast?.(operation === "remove" ? "Oferta retirada de hoje." : operation === "save" ? "Regra das ofertas salva." : "Ofertas de hoje atualizadas.");
    } catch (error) {
      bridge()?.toast?.(error.message || "Não foi possível atualizar as ofertas.");
      await load(true);
    } finally {
      busy = false;
      root.querySelectorAll("button").forEach((button) => { button.disabled = false; });
      const generate = root.querySelector("#daily-offers-generate");
      if (generate) generate.disabled = root.querySelector("#daily-offers-form")?.elements.enabled?.checked !== true;
    }
  }

  root.addEventListener("click", async (event) => {
    if (event.target.closest("[data-daily-offer-images-refresh]")) { await refreshImageStatus(); return; }
    if (event.target.closest("[data-daily-offer-images-generate]")) { await generateImages(); return; }
    const retry = event.target.closest("[data-daily-offer-retry]");
    if (retry) { loaded = false; await load(true); return; }
    const remove = event.target.closest("[data-daily-offer-remove]");
    if (remove) {
      await mutate("remove", { product_id: remove.dataset.dailyOfferRemove });
      return;
    }
    if (event.target.closest("#daily-offers-save")) {
      const form = root.querySelector("#daily-offers-form");
      if (!form) return;
      const data = new FormData(form);
      const min = Number(data.get("min_discount_percent"));
      const max = Number(data.get("max_discount_percent"));
      if (min > max) { bridge()?.toast?.("O desconto mínimo não pode superar o máximo."); return; }
      await mutate("save", {
        enabled: form.elements.enabled.checked,
        daily_product_count: Number(data.get("daily_product_count")),
        min_discount_percent: min,
        max_discount_percent: max,
        min_gross_margin_percent: Number(data.get("min_gross_margin_percent")),
      });
      return;
    }
    if (event.target.closest("#daily-offers-generate")) {
      if (window.confirm("Gerar outra seleção agora? Os produtos da oferta diária de hoje serão substituídos.")) {
        await mutate("generate", {});
      }
    }
  });

  function activateProductTab(name, shouldLoadOffers = true, focusTab = false) {
    const selected = name === "offers" ? "offers" : "products";
    const tabs = [...document.querySelectorAll("[data-product-tab]")];
    tabs.forEach((tab) => {
      const active = tab.dataset.productTab === selected;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    document.querySelectorAll("[data-product-tab-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.productTabPanel !== selected;
    });
    if (focusTab) tabs.find((tab) => tab.dataset.productTab === selected)?.focus();
    if (selected === "offers" && shouldLoadOffers) window.setTimeout(() => load(true), 0);
  }

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const tab = target?.closest("[data-product-tab]");
    if (tab) {
      activateProductTab(tab.dataset.productTab);
      return;
    }
    if (target?.closest('[data-view="products"], [data-go="products"]')) {
      activateProductTab("products", false);
    }
  });

  document.addEventListener("keydown", (event) => {
    const current = event.target instanceof Element ? event.target.closest("[data-product-tab]") : null;
    if (!current || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const tabs = [...document.querySelectorAll("[data-product-tab]")];
    const index = tabs.indexOf(current);
    const nextIndex = event.key === "Home" ? 0
      : event.key === "End" ? tabs.length - 1
      : (index + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length;
    activateProductTab(tabs[nextIndex]?.dataset.productTab, true, true);
  });
})();