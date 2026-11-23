(() => {
  "use strict";

  const config = window.DONA_SITE_CONFIG || {};
  const supabaseUrl = String(config.supabaseUrl || "").replace(/\/$/, "");
  const publishableKey = String(config.publishableKey || "");
  const endpoint = supabaseUrl ? supabaseUrl + "/functions/v1/site-card-admin-v1" : "";
  const root = document.getElementById("cards-admin-root");
  const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Cuiaba" });
  const dateOnly = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "UTC" });
  const $ = (selector, scope = root) => scope?.querySelector(selector);

  let cards = [];
  let archivedCards = [];
  let formDraft = { name: "", brand: "", value: "", creditAddedOn: todayInCuiaba(), password: "" };
  let loading = false;
  let saving = false;
  let savingCardId = "";
  let savingTransactionId = "";
  let loadError = "";
  let notice = "";
  let noticeKind = "success";
  let pendingTransaction = null;
  let editingCardId = "";
  let archivedExpanded = false;
  let createAttemptKey = "";
  const openHistory = new Set();
  const editDrafts = new Map();
  const transactionDrafts = new Map();
  const visiblePasswords = new Map();
  const transactionAttemptKeys = new Map();

  function todayInCuiaba() {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Cuiaba", year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return values.year + "-" + values.month + "-" + values.day;
  }

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

  function formatDateOnly(value) {
    const text = String(value || "");
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(text + "T00:00:00Z") : new Date(text);
    return Number.isNaN(parsed.getTime()) ? "Data indisponível" : dateOnly.format(parsed);
  }

  function parseAmount(value) {
    const text = String(value ?? "").trim().replace(",", ".");
    if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
    const amount = Number(text);
    return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : null;
  }

  function rpcErrorMessage(error) {
    const detail = String(error?.message || "");
    if (detail.includes("initial_value_has_history")) return "O valor inicial não pode ser alterado depois de movimentações. Registre uma entrada ou saída para ajustar o saldo.";
    return "";
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
        card_not_found: "Este cartão não foi encontrado ou já foi excluído. Atualize a lista.",
        invalid_card: "Confira os dados do cartão.",
        invalid_amount: "Informe um valor válido, com até duas casas decimais.",
        invalid_idempotency_key: "Não foi possível confirmar a operação. Atualize e tente novamente.",
        invalid_location: "Selecione Assaí, Fort ou Atacadão para registrar uma saída.",
        initial_value_has_history: "O valor inicial não pode ser alterado depois de movimentações. Registre uma entrada ou saída para ajustar o saldo.",
        balance_limit_exceeded: "O saldo ultrapassaria o limite suportado.",
        idempotency_key_conflict: "A operação anterior já foi processada com outros dados. Atualize os cartões antes de tentar novamente.",
      };
      throw new Error(messages[data.error] || data.message || rpcErrorMessage(data) || "Não foi possível concluir a operação.");
    }
    return data;
  }

  function historyMarkup(card) {
    const movements = Array.isArray(card.uses) ? card.uses : [];
    if (!movements.length) return '<p class="cards-history-empty">Nenhuma movimentação registrada.</p>';
    return `<ul class="cards-history-list">${movements.map((movement) => {
      const isEntry = (movement.transaction_type || "exit") === "entry";
      const origin = movement.transaction_origin === "initial";
      const title = isEntry ? (origin ? "Crédito inicial" : "Entrada de crédito") : "Saída";
      const location = movement.location ? " · " + movement.location : "";
      const sign = isEntry ? "+" : "−";
      return `
        <li>
          <span class="cards-history-description">
            <strong class="${isEntry ? "is-entry" : "is-exit"}">${title}${escapeHtml(location)}</strong>
            <small>${escapeHtml(formatDate(movement.used_at))}</small>
          </span>
          <strong class="cards-history-amount ${isEntry ? "is-entry" : "is-exit"}">${sign} ${escapeHtml(money(movement.amount))}</strong>
        </li>`;
    }).join("")}</ul>`;
  }

  function cardMarkup(card, archived = false) {
    const id = escapeHtml(card.id);
    const balance = Number(card.current_balance || 0);
    const uses = Array.isArray(card.uses) ? card.uses : [];
    const password = visiblePasswords.get(card.id);
    const expanded = openHistory.has(card.id);
    const transactionOpen = !archived && pendingTransaction?.cardId === card.id;
    const transactionType = transactionOpen ? pendingTransaction.type : "";
    const transactionKey = card.id + ":" + transactionType;
    const transactionDraft = transactionDrafts.get(transactionKey) || { amount: "", location: "" };
    const isSavingTransaction = savingTransactionId === card.id;
    const editOpen = !archived && editingCardId === card.id;
    const editDraft = editDrafts.get(card.id) || {
      name: card.name || "",
      brand: card.brand || "",
      value: String(card.initial_value ?? ""),
      creditAddedOn: card.credit_added_on || todayInCuiaba(),
      password: "",
    };
    const hasManualMovements = uses.some((movement) => movement.transaction_origin !== "initial");
    const cardDisabled = savingCardId === card.id;

    const editMarkup = editOpen ? `
      <form class="cards-edit-form" data-edit-form data-edit-card="${id}" autocomplete="off">
        <div class="cards-edit-grid">
          <label class="cards-field"><span>Nome</span><input name="name" type="text" maxlength="120" value="${escapeHtml(editDraft.name)}" required ${cardDisabled ? "disabled" : ""}></label>
          <label class="cards-field"><span>Bandeira</span><input name="brand" type="text" maxlength="60" value="${escapeHtml(editDraft.brand)}" required ${cardDisabled ? "disabled" : ""}></label>
          <label class="cards-field"><span>Valor inicial</span><span class="cards-money-input"><span>R$</span><input name="value" type="number" min="0.01" max="9999999999.99" step="0.01" inputmode="decimal" value="${escapeHtml(editDraft.value)}" required ${hasManualMovements ? "readonly" : ""} ${cardDisabled ? "disabled" : ""}></span>${hasManualMovements ? '<small>Use uma entrada ou saída para ajustar o saldo.</small>' : ""}</label>
          <label class="cards-field"><span>Data de inclusão do crédito</span><input name="credit_added_on" type="date" value="${escapeHtml(editDraft.creditAddedOn)}" required ${cardDisabled ? "disabled" : ""}></label>
          <label class="cards-field cards-edit-password"><span>Nova senha (opcional)</span><input name="password" type="password" maxlength="120" autocomplete="new-password" value="${escapeHtml(editDraft.password)}" placeholder="Em branco mantém a senha atual" ${cardDisabled ? "disabled" : ""}></label>
        </div>
        <div class="cards-actions">
          <button class="button button-primary" type="submit" ${cardDisabled ? "disabled" : ""}>${cardDisabled ? "Salvando…" : "Salvar alterações"}</button>
          <button class="button button-outline" type="button" data-card-action="cancel-edit" ${cardDisabled ? "disabled" : ""}>Cancelar</button>
        </div>
      </form>` : "";

    const transactionMarkup = transactionOpen ? `
      <div class="cards-use-entry">
        <div class="cards-use-current">
          <span>${transactionType === "entry" ? "Saldo atual" : "Saldo disponível para saída"}</span>
          <strong>${escapeHtml(money(balance))}</strong>
        </div>
        <label class="cards-field">
          <span>Valor da ${transactionType === "entry" ? "entrada" : "saída"}</span>
          <span class="cards-money-input"><span>R$</span><input data-transaction-amount type="number" min="0.01" max="${transactionType === "exit" ? Math.max(0, balance).toFixed(2) : "9999999999.99"}" step="0.01" inputmode="decimal" value="${escapeHtml(transactionDraft.amount)}" placeholder="0,00" aria-label="Valor da movimentação" ${isSavingTransaction ? "disabled" : ""}></span>
        </label>
        ${transactionType === "exit" ? `
          <label class="cards-field"><span>Local de uso</span>
            <select data-transaction-location required ${isSavingTransaction ? "disabled" : ""}>
              <option value="">Selecione o local</option>
              <option value="Assaí" ${transactionDraft.location === "Assaí" ? "selected" : ""}>Assaí</option>
              <option value="Fort" ${transactionDraft.location === "Fort" ? "selected" : ""}>Fort</option>
              <option value="Atacadão" ${transactionDraft.location === "Atacadão" ? "selected" : ""}>Atacadão</option>
            </select>
          </label>` : ""}
        <div class="cards-actions">
          <button class="button button-primary" type="button" data-card-action="confirm-transaction" ${isSavingTransaction ? "disabled" : ""}>${isSavingTransaction ? "Salvando…" : transactionType === "entry" ? "Confirmar entrada" : "Confirmar saída"}</button>
          <button class="button button-outline" type="button" data-card-action="cancel-transaction" ${isSavingTransaction ? "disabled" : ""}>Cancelar</button>
        </div>
      </div>` : "";

    const actions = archived ? "" : `
      <div class="cards-actions">
        <button class="button button-primary" type="button" data-card-action="begin-transaction" data-transaction-type="entry" ${cardDisabled ? "disabled" : ""}>Lançar entrada</button>
        <button class="button button-outline" type="button" data-card-action="begin-transaction" data-transaction-type="exit" ${balance <= 0 || cardDisabled ? "disabled" : ""}>Lançar saída</button>
        <button class="button button-outline" type="button" data-card-action="begin-edit" ${cardDisabled ? "disabled" : ""}>Editar</button>
        <button class="button button-danger-outline" type="button" data-card-action="delete-card" ${cardDisabled ? "disabled" : ""}>Excluir</button>
        <button class="button button-outline" type="button" data-card-action="toggle-history" aria-expanded="${expanded}">${expanded ? "Ocultar histórico" : `Histórico (${uses.length})`}</button>
      </div>`;

    return `
      <article class="cards-ledger-card ${archived ? "is-archived" : ""}" data-card-id="${id}" ${archived ? 'data-archived="true"' : ""}>
        <div class="cards-ledger-card-heading">
          <div class="cards-identity">
            <span class="cards-brand">${escapeHtml(card.brand)}${archived ? " · Excluído" : ""}</span>
            <h3>${escapeHtml(card.name)}</h3>
          </div>
          <div class="cards-balance">
            <span>${archived ? "Saldo no momento da exclusão" : "Saldo disponível"}</span>
            <strong>${escapeHtml(money(balance))}</strong>
          </div>
        </div>
        <div class="cards-ledger-details">
          <div><span>Crédito inicial</span><strong>${escapeHtml(money(card.initial_value))}</strong></div>
          <div><span>Crédito incluído em</span><strong>${escapeHtml(formatDateOnly(card.credit_added_on))}</strong></div>
          ${!archived ? `
            <div class="cards-password">
              <span>Senha</span>
              <strong class="cards-password-value">${password ? escapeHtml(password) : "••••••••"}</strong>
              <button class="cards-password-toggle" type="button" data-card-action="toggle-password" aria-label="${password ? "Ocultar senha" : "Mostrar senha"}">${password ? "Ocultar" : "Mostrar"}</button>
            </div>` : ""}
        </div>
        ${editMarkup}
        ${transactionMarkup}
        ${actions}
        ${expanded ? `<div class="cards-history"><h4>Histórico de entradas e saídas</h4>${historyMarkup(card)}</div>` : ""}
      </article>`;
  }

  function render() {
    if (!root) return;
    const total = cards.reduce((sum, card) => sum + (Number(card.current_balance) || 0), 0);
    const message = notice
      ? `<p class="cards-notice ${noticeKind === "error" ? "is-error" : "is-success"}" role="status">${escapeHtml(notice)}</p>`
      : "";
    const list = loading
      ? '<p class="cards-empty">Carregando cartões…</p>'
      : loadError
        ? `<p class="cards-empty is-error">${escapeHtml(loadError)}</p>`
        : cards.length
          ? `<div class="cards-ledger-list">${cards.map((card) => cardMarkup(card)).join("")}</div>`
          : '<div class="cards-empty"><strong>Nenhum cartão cadastrado</strong><span>Cadastre o primeiro cartão pelo formulário ao lado.</span></div>';
    const archive = archivedCards.length
      ? `<section class="cards-archive-panel">
          <button class="cards-archive-toggle" type="button" data-card-action="toggle-archive" aria-expanded="${archivedExpanded}">
            <span>Cartões excluídos</span><strong>${archivedCards.length}</strong><span aria-hidden="true">${archivedExpanded ? "−" : "+"}</span>
          </button>
          ${archivedExpanded ? `<div class="cards-ledger-list">${archivedCards.map((card) => cardMarkup(card, true)).join("")}</div>` : ""}
        </section>`
      : "";

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
            <label class="cards-field"><span>Nome</span><input name="name" type="text" maxlength="120" autocomplete="off" value="${escapeHtml(formDraft.name)}" placeholder="Ex.: Cartão de compras" required ${saving ? "disabled" : ""}></label>
            <label class="cards-field"><span>Bandeira</span><input name="brand" type="text" maxlength="60" list="cards-brand-options" value="${escapeHtml(formDraft.brand)}" placeholder="Ex.: Visa" required ${saving ? "disabled" : ""}><datalist id="cards-brand-options"><option value="Visa"></option><option value="Mastercard"></option><option value="Elo"></option><option value="Alelo"></option><option value="VR"></option><option value="Pluxee"></option><option value="Ticket"></option><option value="Outro"></option></datalist></label>
            <label class="cards-field"><span>Valor inicial do crédito</span><span class="cards-money-input"><span>R$</span><input name="value" type="number" min="0.01" max="9999999999.99" step="0.01" inputmode="decimal" value="${escapeHtml(formDraft.value)}" placeholder="0,00" required ${saving ? "disabled" : ""}></span></label>
            <label class="cards-field"><span>Data de inclusão do crédito</span><input name="credit_added_on" type="date" value="${escapeHtml(formDraft.creditAddedOn)}" required ${saving ? "disabled" : ""}></label>
            <label class="cards-field"><span>Senha</span><input name="password" type="password" maxlength="120" autocomplete="new-password" value="${escapeHtml(formDraft.password)}" placeholder="Digite a senha do cartão" required ${saving ? "disabled" : ""}></label>
            <button class="button button-primary cards-submit" type="submit" ${saving ? "disabled" : ""}>${saving ? "Salvando…" : "Cadastrar cartão"}</button>
          </form>
          <p class="cards-form-note">O crédito inicial também aparece no histórico. Data e horário das movimentações são registrados automaticamente.</p>
        </section>
        <section class="cards-list-panel" aria-labelledby="cards-list-title">
          <div class="cards-panel-heading cards-list-heading"><div><h3 id="cards-list-title">Cartões cadastrados</h3><p>Registre entradas e saídas; o saldo atualiza na hora.</p></div><button class="button button-outline" type="button" data-card-action="refresh" ${loading ? "disabled" : ""}>Atualizar</button></div>
          ${list}
          ${archive}
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
      archivedCards = Array.isArray(result.archived_cards) ? result.archived_cards : [];
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
    const rawValue = String(values.get("value") || "").trim();
    const initialValue = parseAmount(rawValue);
    const creditAddedOn = String(values.get("credit_added_on") || "");
    const password = String(values.get("password") || "").trim();
    formDraft = { name, brand, value: rawValue, creditAddedOn, password };

    if (!name || !brand || initialValue === null || !password || !/^\d{4}-\d{2}-\d{2}$/.test(creditAddedOn)) {
      notice = "Preencha todos os campos, informe uma data válida e um crédito maior que zero.";
      noticeKind = "error";
      render();
      return;
    }

    if (!createAttemptKey) createAttemptKey = crypto.randomUUID();
    saving = true;
    notice = "";
    render();
    try {
      await request("create", {
        name,
        brand,
        value: initialValue,
        credit_added_on: creditAddedOn,
        password,
        idempotency_key: createAttemptKey,
      });
      createAttemptKey = "";
      formDraft = { name: "", brand: "", value: "", creditAddedOn: todayInCuiaba(), password: "" };
      notice = "Cartão cadastrado e crédito inicial lançado no histórico.";
      noticeKind = "success";
      await load();
    } catch (error) {
      notice = error instanceof Error ? error.message : "Não foi possível cadastrar o cartão.";
      noticeKind = "error";
    } finally {
      saving = false;
      render();
    }
  }

  function beginEdit(cardId) {
    const card = cards.find((item) => item.id === cardId);
    if (!card) return;
    editingCardId = cardId;
    editDrafts.set(cardId, {
      name: card.name || "",
      brand: card.brand || "",
      value: String(card.initial_value ?? ""),
      creditAddedOn: card.credit_added_on || todayInCuiaba(),
      password: "",
    });
    pendingTransaction = null;
    notice = "";
    render();
  }

  async function saveEdit(form, cardId) {
    if (savingCardId) return;
    const values = new FormData(form);
    const name = String(values.get("name") || "").trim();
    const brand = String(values.get("brand") || "").trim();
    const rawValue = String(values.get("value") || "").trim();
    const value = parseAmount(rawValue);
    const creditAddedOn = String(values.get("credit_added_on") || "");
    const password = String(values.get("password") || "").trim();
    const draft = { name, brand, value: rawValue, creditAddedOn, password };
    editDrafts.set(cardId, draft);

    if (!name || !brand || value === null || !/^\d{4}-\d{2}-\d{2}$/.test(creditAddedOn)) {
      notice = "Confira o nome, a bandeira, a data e o valor inicial.";
      noticeKind = "error";
      render();
      return;
    }

    savingCardId = cardId;
    notice = "";
    render();
    try {
      await request("update", { card_id: cardId, name, brand, value, credit_added_on: creditAddedOn, password });
      editingCardId = "";
      editDrafts.delete(cardId);
      visiblePasswords.delete(cardId);
      notice = "Cartão atualizado.";
      noticeKind = "success";
      await load();
    } catch (error) {
      notice = error instanceof Error ? error.message : "Não foi possível salvar o cartão.";
      noticeKind = "error";
    } finally {
      savingCardId = "";
      render();
    }
  }

  async function confirmTransaction(cardId, cardElement) {
    if (savingTransactionId) return;
    const card = cards.find((item) => item.id === cardId);
    const type = pendingTransaction?.cardId === cardId ? pendingTransaction.type : "";
    if (!card || !["entry", "exit"].includes(type)) return;

    const amount = parseAmount($("[data-transaction-amount]", cardElement)?.value);
    const location = type === "exit" ? String($("[data-transaction-location]", cardElement)?.value || "") : "";
    const draftKey = cardId + ":" + type;
    transactionDrafts.set(draftKey, { amount: String($("[data-transaction-amount]", cardElement)?.value || ""), location });

    if (amount === null) {
      notice = "Informe um valor válido, com até duas casas decimais.";
      noticeKind = "error";
      render();
      return;
    }
    if (type === "exit" && !["Assaí", "Fort", "Atacadão"].includes(location)) {
      notice = "Selecione Assaí, Fort ou Atacadão para registrar a saída.";
      noticeKind = "error";
      render();
      return;
    }
    if (type === "exit" && amount > Number(card.current_balance)) {
      notice = "O valor informado é maior que o saldo disponível.";
      noticeKind = "error";
      render();
      return;
    }

    const attemptKey = transactionAttemptKeys.get(draftKey) || crypto.randomUUID();
    transactionAttemptKeys.set(draftKey, attemptKey);
    savingTransactionId = cardId;
    notice = "";
    render();
    try {
      await request("register_transaction", {
        card_id: cardId,
        transaction_type: type,
        amount,
        location: type === "exit" ? location : null,
        idempotency_key: attemptKey,
      });
      transactionAttemptKeys.delete(draftKey);
      transactionDrafts.delete(draftKey);
      pendingTransaction = null;
      notice = type === "entry" ? "Entrada registrada no histórico." : "Saída registrada no histórico.";
      noticeKind = "success";
      await load();
    } catch (error) {
      notice = error instanceof Error ? error.message : "Não foi possível registrar a movimentação.";
      noticeKind = "error";
    } finally {
      savingTransactionId = "";
      render();
    }
  }

  async function deleteCard(cardId) {
    if (savingCardId) return;
    const card = cards.find((item) => item.id === cardId);
    if (!card) return;
    if (!window.confirm(`Excluir o cartão “${card.name}” da lista ativa? O histórico será preservado em Cartões excluídos.`)) return;

    savingCardId = cardId;
    notice = "";
    render();
    try {
      await request("delete", { card_id: cardId });
      visiblePasswords.delete(cardId);
      editDrafts.delete(cardId);
      if (editingCardId === cardId) editingCardId = "";
      if (pendingTransaction?.cardId === cardId) pendingTransaction = null;
      notice = "Cartão removido da lista ativa. O histórico foi preservado.";
      noticeKind = "success";
      archivedExpanded = true;
      await load();
    } catch (error) {
      notice = error instanceof Error ? error.message : "Não foi possível excluir o cartão.";
      noticeKind = "error";
    } finally {
      savingCardId = "";
      render();
    }
  }

  root?.addEventListener("input", (event) => {
    const createForm = event.target.closest("#cards-create-form");
    if (createForm) {
      const values = new FormData(createForm);
      formDraft = {
        name: String(values.get("name") || ""),
        brand: String(values.get("brand") || ""),
        value: String(values.get("value") || ""),
        creditAddedOn: String(values.get("credit_added_on") || ""),
        password: String(values.get("password") || ""),
      };
      return;
    }

    const editForm = event.target.closest("[data-edit-form]");
    if (editForm) {
      const id = editForm.dataset.editCard;
      const values = new FormData(editForm);
      editDrafts.set(id, {
        name: String(values.get("name") || ""),
        brand: String(values.get("brand") || ""),
        value: String(values.get("value") || ""),
        creditAddedOn: String(values.get("credit_added_on") || ""),
        password: String(values.get("password") || ""),
      });
      return;
    }

    const transactionCard = event.target.closest("[data-card-id]");
    if (transactionCard && event.target.matches("[data-transaction-amount]")) {
      const cardId = transactionCard.dataset.cardId;
      const type = pendingTransaction?.cardId === cardId ? pendingTransaction.type : "";
      if (!type) return;
      const key = cardId + ":" + type;
      const oldDraft = transactionDrafts.get(key) || {};
      transactionDrafts.set(key, { ...oldDraft, amount: event.target.value });
    }
  });

  root?.addEventListener("change", (event) => {
    const transactionCard = event.target.closest("[data-card-id]");
    if (transactionCard && event.target.matches("[data-transaction-location]")) {
      const cardId = transactionCard.dataset.cardId;
      const type = pendingTransaction?.cardId === cardId ? pendingTransaction.type : "";
      if (!type) return;
      const key = cardId + ":" + type;
      const oldDraft = transactionDrafts.get(key) || {};
      transactionDrafts.set(key, { ...oldDraft, location: event.target.value });
    }
    const createForm = event.target.closest("#cards-create-form");
    if (createForm) {
      const values = new FormData(createForm);
      formDraft = {
        name: String(values.get("name") || ""),
        brand: String(values.get("brand") || ""),
        value: String(values.get("value") || ""),
        creditAddedOn: String(values.get("credit_added_on") || ""),
        password: String(values.get("password") || ""),
      };
    }
  });

  root?.addEventListener("submit", async (event) => {
    if (event.target?.id === "cards-create-form") {
      event.preventDefault();
      await createCard(event.target);
      return;
    }
    if (event.target?.matches("[data-edit-form]")) {
      event.preventDefault();
      await saveEdit(event.target, event.target.dataset.editCard);
    }
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
    if (action === "toggle-archive") {
      archivedExpanded = !archivedExpanded;
      render();
      return;
    }
    if (action === "begin-edit") {
      beginEdit(cardId);
      return;
    }
    if (action === "cancel-edit") {
      editingCardId = "";
      editDrafts.delete(cardId);
      notice = "";
      render();
      return;
    }
    if (action === "delete-card") {
      await deleteCard(cardId);
      return;
    }
    if (action === "begin-transaction") {
      const type = button.dataset.transactionType;
      if (!["entry", "exit"].includes(type)) return;
      pendingTransaction = { cardId, type };
      editingCardId = "";
      notice = "";
      render();
      root.querySelector('[data-card-id="' + CSS.escape(cardId) + '"] [data-transaction-amount]')?.focus();
      return;
    }
    if (action === "cancel-transaction") {
      if (pendingTransaction?.cardId === cardId) {
        const key = cardId + ":" + pendingTransaction.type;
        transactionDrafts.delete(key);
        transactionAttemptKeys.delete(key);
        pendingTransaction = null;
      }
      notice = "";
      render();
      return;
    }
    if (action === "confirm-transaction") {
      await confirmTransaction(cardId, cardElement);
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
