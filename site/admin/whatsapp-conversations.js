(() => {
  "use strict";
  const config = window.DONA_SITE_CONFIG || {};
  const base = String(config.supabaseUrl || "").replace(/\/$/, "");
  const endpoint = base + "/functions/v1/site-admin-v1";
  const publishableKey = config.publishableKey || "";
  const $ = (id) => document.getElementById(id);
  const state = { cursor: null, total: 0, selectedId: "", before: null, busy: false, accountsLoaded: false };
  const dateLabel = (value) => {
    if (!value) return "Sem atividade";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Sem atividade" : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
  };

  async function request(action, values) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        apikey: publishableKey,
        "x-admin-code": window.DonaAdminAuth?.getCode?.() || "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(Object.assign({ action }, values || {})),
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) throw new Error(data.message || data.error || "Não foi possível consultar as conversas.");
    return data;
  }

  function setStatus(message) { $("whatsapp-conversations-status").textContent = message; }
  function addOption(select, value, label) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.append(option);
  }

  function renderAccounts(accounts) {
    if (state.accountsLoaded) return;
    const select = $("whatsapp-conversation-account");
    for (const account of accounts || []) {
      const number = account.number_last4 ? " · •••• " + account.number_last4 : "";
      addOption(select, account.id, account.name + number + (account.active ? "" : " (inativo)"));
    }
    state.accountsLoaded = true;
  }

  function renderQueue(items, append) {
    const host = $("whatsapp-conversation-items");
    if (!append) host.replaceChildren();
    for (const item of items || []) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "whatsapp-conversation-card";
      button.dataset.conversationId = item.id;
      button.setAttribute("aria-pressed", String(item.id === state.selectedId));
      const title = document.createElement("strong");
      title.textContent = item.phone_last4 ? "Contato · •••• " + item.phone_last4 : "Contato";
      const meta = document.createElement("span");
      meta.textContent = item.channel + " · " + (item.human_required ? "Atendimento humano" : item.mode || item.status || "Conversa");
      const date = document.createElement("small");
      date.textContent = dateLabel(item.last_activity_at);
      button.append(title, meta, date);
      button.addEventListener("click", () => loadConversation(item.id));
      host.append(button);
    }
  }

  function makeBubble(message) {
    const bubble = document.createElement("article");
    bubble.className = "whatsapp-message " + (message.direction === "outbound" ? "outbound" : "inbound");
    const body = document.createElement("p");
    const text = String(message.text_body || "").trim();
    const types = { image: "Imagem (prévia indisponível)", audio: "Áudio (prévia indisponível)", video: "Vídeo (prévia indisponível)", document: "Arquivo (prévia indisponível)", sticker: "Figurinha" };
    body.textContent = text || types[message.message_type] || "Conteúdo não disponível";
    const time = document.createElement("time");
    time.dateTime = message.message_at || "";
    time.textContent = dateLabel(message.message_at);
    const statusCode = String(message.status_current || "").trim().toLowerCase().slice(0, 40);
    if (message.direction === "outbound" && statusCode) {
      const labels = { accepted: "Aceita pela API", queued: "Na fila", pending: "Pendente", sent: "Enviada", delivered: "Entregue", read: "Lida", failed: "Falhou", rejected: "Rejeitada" };
      const status = document.createElement("small");
      status.className = "whatsapp-message-status";
      status.textContent = "Envio: " + (labels[statusCode] || statusCode.replace(/[_-]+/g, " "));
      bubble.append(body, time, status);
    } else bubble.append(body, time);
    return bubble;
  }

  function renderMessages(messages, prepend) {
    const host = $("whatsapp-conversation-messages");
    const oldHeight = host.scrollHeight;
    const oldTop = host.scrollTop;
    const fragment = document.createDocumentFragment();
    for (const message of messages || []) fragment.append(makeBubble(message));
    if (prepend) host.prepend(fragment);
    else {
      host.replaceChildren(fragment);
      host.scrollTop = host.scrollHeight;
    }
    if (prepend) host.scrollTop = oldTop + (host.scrollHeight - oldHeight);
    const empty = $("whatsapp-conversation-empty");
    const hasMessages = host.childElementCount > 0;
    if (!hasMessages) {
      empty.replaceChildren();
      const title = document.createElement("strong");
      title.textContent = "Sem mensagens nesta conversa";
      const hint = document.createElement("span");
      hint.textContent = "Não há mensagens para exibir.";
      empty.append(title, hint);
    }
    empty.hidden = hasMessages;
  }

  function renderHeader(conversation) {
    $("whatsapp-conversation-title").textContent = conversation.phone_last4 ? "Contato · •••• " + conversation.phone_last4 : "Contato";
    const stateLabel = conversation.human_required ? "Precisa de atendimento humano" : [conversation.mode, conversation.status, conversation.stage].filter(Boolean).join(" · ");
    const channel = conversation.channel + (conversation.channel_number ? " · •••• " + conversation.channel_number : "");
    $("whatsapp-conversation-subtitle").textContent = channel + " · " + (stateLabel || "Conversa");
    $("whatsapp-conversation-header").hidden = false;
    $("whatsapp-conversation-empty").hidden = true;
  }

  async function loadConversations({ append = false } = {}) {
    if (state.busy) return;
    if (!base || !publishableKey) return;
    const rawSearch = $("whatsapp-conversation-search").value.trim();
    const searchDigits = rawSearch.replace(/\D/g, "");
    if (rawSearch && searchDigits.length < 4) {
      setStatus("Digite pelo menos quatro dígitos do telefone.");
      return;
    }
    state.busy = true;
    let selectFirst = "";
    const host = $("whatsapp-conversation-items");
    if (!append) {
      state.cursor = null;
      state.total = 0;
      state.selectedId = "";
      state.before = null;
      $("whatsapp-conversation-header").hidden = true;
      $("whatsapp-conversation-messages").replaceChildren();
      $("whatsapp-conversation-empty").hidden = false;
      setStatus("Buscando conversas…");
    } else setStatus("Carregando mais conversas…");
    try {
      const data = await request("whatsapp_conversation_list", {
        cursor: append ? state.cursor : null,
        account_id: $("whatsapp-conversation-account").value || "",
        search: $("whatsapp-conversation-search").value || "",
        filter: $("whatsapp-conversation-filter").value || "all",
      });
      renderAccounts(data.accounts);
      renderQueue(data.items, append);
      state.cursor = data.next_cursor || null;
      if (!append) state.total = data.total || 0;
      $("whatsapp-conversation-more").hidden = !state.cursor;
      setStatus(state.total + " conversa(s) no filtro atual · mais recentes primeiro.");
      if (!append && data.items && data.items.length) selectFirst = data.items[0].id;
      else if (append && data.items && data.items.length && !state.selectedId) selectFirst = data.items[0].id;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Não foi possível carregar as conversas.");
      if (!append) {
        host.replaceChildren();
        const message = document.createElement("p");
        message.className = "whatsapp-overview-empty";
        message.textContent = error instanceof Error ? error.message : "Não foi possível carregar as conversas.";
        host.append(message);
      }
    } finally {
      state.busy = false;
    }
    if (selectFirst) await loadConversation(selectFirst);
  }

  async function loadConversation(id, { older = false } = {}) {
    if (!id || state.busy) return;
    state.busy = true;
    const targetBefore = older ? state.before : null;
    if (!older) {
      state.selectedId = id;
      $("whatsapp-conversation-header").hidden = true;
      $("whatsapp-conversation-empty").hidden = false;
      $("whatsapp-conversation-messages").replaceChildren();
      for (const button of document.querySelectorAll(".whatsapp-conversation-card")) {
        button.setAttribute("aria-pressed", String(button.dataset.conversationId === id));
      }
    }
    try {
      const data = await request("whatsapp_conversation_messages", { conversation_id: id, before_created_at: targetBefore?.created_at || "", before_id: targetBefore?.id || "" });
      if (state.selectedId !== id) return;
      renderHeader(data.conversation || {});
      renderMessages(data.messages || [], older);
      state.before = data.next_before || null;
      $("whatsapp-conversation-older").hidden = !state.before;
      setStatus("Histórico carregado em modo de consulta.");
    } catch (error) {
      if (!older) {
        $("whatsapp-conversation-empty").textContent = error instanceof Error ? error.message : "Não foi possível abrir esta conversa.";
        $("whatsapp-conversation-empty").hidden = false;
      } else setStatus(error instanceof Error ? error.message : "Não foi possível carregar mensagens anteriores.");
    } finally {
      state.busy = false;
    }
  }

  $("whatsapp-conversations-refresh")?.addEventListener("click", () => loadConversations());
  $("whatsapp-conversation-search-button")?.addEventListener("click", () => loadConversations());
  $("whatsapp-conversation-search")?.addEventListener("keydown", (event) => { if (event.key === "Enter") loadConversations(); });
  $("whatsapp-conversation-account")?.addEventListener("change", () => loadConversations());
  $("whatsapp-conversation-filter")?.addEventListener("change", () => loadConversations());
  $("whatsapp-conversation-more")?.addEventListener("click", () => loadConversations({ append: true }));
  $("whatsapp-conversation-older")?.addEventListener("click", () => state.selectedId && loadConversation(state.selectedId, { older: true }));
  window.DonaWhatsAppConversations = { load: () => loadConversations() };
})();
