(() => {
  "use strict";

  const root = document.getElementById("daily-offers-admin-root");
  if (!root) return;
  let loading = false;
  let loaded = false;
  let busy = false;

  const bridge = () => window.DonaAdminProductBridge;
  const esc = (value) => bridge()?.esc?.(value) || String(value == null ? "" : value).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);
  const money = (value) => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const number = (value, digits = 0) => Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: digits });

  async function request(operation, payload = {}) {
    const api = bridge();
    if (!api?.request) throw new Error("A sessão do admin ainda não está pronta.");
    return api.request("daily_offers", { method: "POST", body: { operation, ...payload } });
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
    const active = config.enabled === true;
    const target = Number(config.daily_product_count || 30);
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
      + '<div class="daily-offers-list">' + (offers.length ? offers.map(offerMarkup).join("") : '<p class="daily-offers-empty">Nenhuma oferta automática ativa agora. As ofertas manuais continuam aparecendo normalmente.</p>') + '</div>'
      + '</section>';
    root.querySelector("#daily-offers-save").disabled = busy;
    root.querySelector("#daily-offers-generate").disabled = busy || !active;
    root.querySelectorAll("[data-daily-offer-remove]").forEach((button) => { button.disabled = busy; });
  }

  async function load(force = false) {
    if (loading || (loaded && !force)) return;
    loading = true;
    root.innerHTML = '<p class="admin-muted">Carregando ofertas do dia…</p>';
    try {
      render(await request("get"));
      loaded = true;
    } catch (error) {
      root.innerHTML = '<section class="daily-offers-admin"><h3>Ofertas do dia</h3><p class="daily-offers-error">' + esc(error.message || "Não foi possível carregar as ofertas.") + '</p><button class="button button-outline" type="button" data-daily-offer-retry>Tentar novamente</button></section>';
    } finally {
      loading = false;
    }
  }

  async function mutate(operation, payload) {
    if (busy) return;
    busy = true;
    root.querySelectorAll("button").forEach((button) => { button.disabled = true; });
    try {
      await request(operation, payload);
      loaded = false;
      await load(true);
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

  document.addEventListener("click", (event) => {
    if (event.target.closest('[data-view="products"], [data-go="products"]')) {
      window.setTimeout(() => load(true), 0);
    }
  });
})();