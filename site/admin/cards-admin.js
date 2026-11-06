(() => {
  "use strict";

  const config = window.DONA_SITE_CONFIG || {};
  const supabaseUrl = String(config.supabaseUrl || "").replace(/\/$/, "");
  const publishableKey = String(config.publishableKey || "");
  const endpoint = supabaseUrl ? supabaseUrl + "/functions/v1/site-card-admin-v1" : "";
  const root = document.getElementById("cards-admin-root");
  const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
  const $ = (selector, scope = root) => scope?.querySelector(selector);

  let cards = [];
  let loading = false;
  let saving = false;
  let loadError = "";
  let notice = "";
  let noticeKind = "success";
  let pendingUseId = "";
  let savingUseId = "";
  const openHistory = new Set();
  const visiblePasswords = new Map();
  const useAttemptKeys = new Map();

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[character]);
  }

  function money(value) {
    const amount = Number(value);
    return currency.format(Number.isFinite(amount) ? amount : 0);
  }

  function formatDate(value) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? "Data indisponível" : dateTime.format(parsed);
  }

  function parseAmount(value) {
    const text = String(value ?? "").trim().replace(",", ".");
    if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
    const amount = Number(text);
    return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : null;
  }

  async function request(action, values = {}) {
    const adminCode = window.DonaAdminAuth?.getCode?.();
    if (!endpoint || !publishableKey) throw new Error("A configuração do painel está incompleta.");
    if (!adminCode) throw new Error("Sua sessão do admin expirou. Entre novamente.");

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        apikey: publishableKey,
        "Content-Type": "application/json",
        "x-admin-code": adminCode,
      },
      body: JSON.stringify({ action, ...values }),
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      const messages = {
        admin_code_invalid: "A sessão expirou. Entre novamente no admin.",
        admin_auth_not_configured: "O código de acesso não está configurado no servidor.",
        insufficient_balance: "O valor informado é maior que o saldo disponível.",
        card_not_found: "Este cartão não foi encontrado. Atualize a lista.",
        invalid_card: "Os dados do cartão são inválidos.",
        invalid_amount: "Informe um valor válido, com até duas casas decimais.",
        invalid_idempotency_key: "Não foi possível confirmar o uso. Tente novamente.",
      };
      throw new Error(messages[data.error] || data.message || "Não foi possível concluir a operação.");
    }
    return data;
  }

  function cardMarkup(card) {
    const id = escapeHtml(card.id);
    const balance = Number(card.current_balance || 0);
    const uses = Array.isArray(card.uses) ? card.uses : [];
    const password = visiblePasswords.get(card.id);
    const expanded = openHistory.has(card.id);
    const useFormOpen = pendingUseId === card.id;
    const isSavingUse = savingUseId === card.id;

    const useHistory = uses.length
      ? `<ul class="cards-history-list">${uses.map((use) => `
          <li><span>${escapeHtml(formatDate(use.used_at))}</span><strong>${escapeHtml(money(use.amount))}</strong></li>
        `).join("")}</ul>`
      : `<p class="cards-history-empty">Nenhum uso registrado ainda.</p>`;

    return `
      <article class="cards-ledger-card" data-card-id="${id}">
        <div class="cards-ledger-card-heading">
          <div class="cards-identity">
            <span class="cards-brand">${escapeHtml(card.brand)}</span>
            <h3>${escapeHtml(card.name)}</h3>
          </div>
          <div class="cards-balance">
            <span>Saldo disponível</span>
            <strong>${escapeHtml(money(balance))}</strong>
          </div>
        </div>
        <div class="cards-ledger-details">
          <div><span>Valor inicial</span><strong>${escapeHtml(money(card.initial_value))}</strong></div>
          <div class="cards-password">
            <span>Senha</span>
            <strong class="cards-password-value">${password ? escapeHtml(password) : "••••••••"}</strong>
            <button class="cards-password-toggle" type="button" data-card-action="toggle-password" aria-label="${password ? "Ocultar senha" : "Mostrar senha"}">
              ${password ? "Ocultar" : "Mostrar"}
            </button>
          </div>
        </div>
        ${useFormOpen ? `
          <div class="cards-use-entry">
            <div class="cards-use-current"><span>Total disponível antes do uso</span><strong>${escapeHtml(money(balance))}</strong></div>
            <label class="cards-field">
              <span>Valor usado</span>
              <span class="cards-money-input"><span>R$</span><input data-use-amount type="number" min="0.01" max="${Math.max(0, balance).toFixed(2)}" step="0.01" inputmode="decimal" placeholder="0,00" aria-label="Valor usado neste cartão" ${isSavingUse ? "disabled" : ""}></span>
            </label>
            <div class="cards-actions">
              <button class="button button-primary" type="button" data-card-action="confirm-use" ${isSavingUse ? "disabled" : ""}>${isSavingUse ? "Salvando…" : "Confirmar uso"}</button>
              <button class="button button-outline" type="button" data-card-action="cancel-use" ${isSavingUse ? "disabled" : ""}>Cancelar</button>
            </div>
          </div>
        ` : `
          <div class="cards-actions">
            <button class="button button-primary" type="button" data-card-action="begin-use" ${balance <= 0 ? "disabled" : ""}>Registrar uso</button>
            <button class="button button-outline" type="button" data-card-action="toggle-history" aria-expanded="${expanded}">${expanded ? "Ocultar histórico" : `Histórico (${uses.length})`}</button>
          </div>
        `}
        ${expanded && !useFormOpen ? `<div class="cards-history"><h4>Histórico de uso</h4>${useHistory}</div>` : ""}
      </article>`;
  }

  function render() {
    if (!root) return;
    const total = cards.reduce((sum, card) => sum + (Number(card.current_balance) || 0), 0);
    const message = notice
      ? `<p class="cards-notice ${noticeKind === "error" ? "is-error" : "is-success"}" role="status">${escapeHtml(notice)}</p>`
      : "";
    const list = loading
      ? `<p class="cards-empty">Carregando cartões…</p>`
      : loadError
        ? `<p class="cards-empty is-error">${escapeHtml(loadError)}</p>`
        : cards.length
          ? `<div class="cards-ledger-list">${cards.map(cardMarkup).join("")}</div>`
          : `<div class="cards-empty"><strong>Nenhum cartão cadastrado</strong><span>Cadastre o primeiro cartão pelo formulário ao lado.</span></div>`;

    root.innerHTML = `
      ${message}
      <section class="cards-summary" aria-label="Saldo total dos cartões">
        <div><span>Saldo total disponível</span><strong>${escapeHtml(money(total))}</strong></div>
        <p>${cards.length} ${cards.length === 1 ? "cartão cadastrado" : "cartões cadastrados"}</p>
      </section>
      <div class="cards-workspace">
        <section class="cards-form-panel" aria-labelledby="cards-form-title">
          <div class="cards-panel-heading"><span class="cards-panel-icon" aria-hidden="true">＋</span><div><h3 id="cards-form-title">Novo cartão</h3><p>Informe os dados para começar.</p></div></div>
          <form id="cards-create-form" autocomplete="off">
            <label class="cards-field"><span>Nome</span><input name="name" type="text" maxlength="120" autocomplete="off" placeholder="Ex.: Cartão de compras" required ${saving ? "disabled" : ""}></label>
            <label class="cards-field"><span>Bandeira</span><input name="brand" type="text" maxlength="60" list="cards-brand-options" placeholder="Ex.: Visa" required ${saving ? "disabled" : ""}><datalist id="cards-brand-options"><option value="Visa"></option><option value="Mastercard"></option><option value="Elo"></option><option value="Alelo"></option><option value="VR"></option><option value="Pluxee"></option><option value="Ticket"></option><option value="Outro"></option></datalist></label>
            <label class="cards-field"><span>Valor inicial</span><span class="cards-money-input"><span>R$</span><input name="value" type="number" min="0.01" max="9999999999.99" step="0.01" inputmode="decimal" placeholder="0,00" required ${saving ? "disabled" : ""}></span></label>
            <label class="cards-field"><span>Senha</span><input name="password" type="password" maxlength="120" autocomplete="new-password" placeholder="Digite a senha do cartão" required ${saving ? "disabled" : ""}></label>
            <button class="button button-primary cards-submit" type="submit" ${saving ? "disabled" : ""}>${saving ? "Salvando…" : "Cadastrar cartão"}</button>
          </form>
          <p class="cards-form-note">A senha fica oculta na lista e só é carregada quando você escolhe “Mostrar”.</p>
        </section>
        <section class="cards-list-panel" aria-labelledby="cards-list-title">
          <div class="cards-panel-heading cards-list-heading"><div><h3 id="cards-list-title">Cartões cadastrados</h3><p>O saldo é atualizado a cada uso confirmado.</p></div><button class="button button-outline" type="button" data-card-action="refresh" ${loading ? "disabled" : ""}>Atualizar</button></div>
          ${list}
        </section>
      </div>`;
  }

  async function load() {
    if (loading) return;
    loading = true;
    loadError = "";
    render();
    try {
      const result = await request("list");
      cards = Array.isArray(result.cards) ? result.cards : [];
    } catch (error) {
      loadError = error instanceof Error ? error.message : "Não foi possível carregar os cartões.";
    } finally {
      loading = false;
      render();
    }
  }

  async function createCard(form) {
    if (saving) return;
    const values = new FormData(form);
    const name = String(values.get("name") || "").trim();
    const brand = String(values.get("brand") || "").trim();
    const initialValue = parseAmount(values.get("value"));
    const password = String(values.get("password") || "").trim();

    if (!name || !brand || initialValue === null || !password) {
      notice = "Preencha os quatro campos e informe um valor maior que zero.";
      noticeKind = "error";
      render();
      return;
    }

    saving = true;
    notice = "";
    render();
    try {
      await request("create", { name, brand, value: initialValue, password });
      notice = "Cartão cadastrado.";
      noticeKind = "success";
      loadError = "";
      const result = await request("list");
      cards = Array.isArray(result.cards) ? result.cards : [];
    } catch (error) {
      notice = error instanceof Error ? error.message : "Não foi possível cadastrar o cartão.";
      noticeKind = "error";
    } finally {
      saving = false;
      render();
    }
  }

  async function confirmUse(cardId, cardElement) {
    if (savingUseId) return;
    const input = $("[data-use-amount]", cardElement);
    const amount = parseAmount(input?.value);
    const card = cards.find((item) => item.id === cardId);
    if (!card || amount === null) {
      notice = "Informe um valor válido para registrar o uso.";
      noticeKind = "error";
      render();
      return;
    }
    if (amount > Number(card.current_balance)) {
      notice = "O valor informado é maior que o saldo disponível.";
      noticeKind = "error";
      render();
      return;
    }

    const idempotencyKey = useAttemptKeys.get(cardId) || crypto.randomUUID();
    useAttemptKeys.set(cardId, idempotencyKey);
    savingUseId = cardId;
    notice = "";
    render();
    try {
      await request("register_use", { card_id: cardId, amount, idempotency_key: idempotencyKey });
      useAttemptKeys.delete(cardId);
      pendingUseId = "";
      notice = "Uso registrado no histórico.";
      noticeKind = "success";
      const result = await request("list");
      cards = Array.isArray(result.cards) ? result.cards : [];
    } catch (error) {
      notice = error instanceof Error ? error.message : "Não foi possível registrar o uso.";
      noticeKind = "error";
    } finally {
      savingUseId = "";
      render();
    }
  }

  root?.addEventListener("submit", (event) => {
    if (event.target?.id !== "cards-create-form") return;
    event.preventDefault();
    createCard(event.target);
  });

  root?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-card-action]");
    if (!button || !root.contains(button)) return;
    const action = button.dataset.cardAction;
    const cardElement = button.closest("[data-card-id]");
    const cardId = cardElement?.dataset.cardId || "";

    if (action === "refresh") {
      notice = "";
      load();
      return;
    }
    if (action === "begin-use") {
      pendingUseId = cardId;
      notice = "";
      render();
      root.querySelector('[data-card-id="' + CSS.escape(cardId) + '"] [data-use-amount]')?.focus();
      return;
    }
    if (action === "cancel-use") {
      pendingUseId = "";
      notice = "";
      render();
      return;
    }
    if (action === "confirm-use") {
      await confirmUse(cardId, cardElement);
      return;
    }
    if (action === "toggle-history") {
      if (openHistory.has(cardId)) openHistory.delete(cardId);
      else openHistory.add(cardId);
      render();
      return;
    }
    if (action === "toggle-password") {
      if (visiblePasswords.has(cardId)) {
        visiblePasswords.delete(cardId);
        render();
        return;
      }
      button.disabled = true;
      button.textContent = "Carregando…";
      try {
        const result = await request("reveal_password", { card_id: cardId });
        visiblePasswords.set(cardId, String(result.password || ""));
        notice = "";
      } catch (error) {
        notice = error instanceof Error ? error.message : "Não foi possível mostrar a senha.";
        noticeKind = "error";
      } finally {
        render();
      }
    }
  });

  window.DonaCardsAdmin = { load };
  render();
})();