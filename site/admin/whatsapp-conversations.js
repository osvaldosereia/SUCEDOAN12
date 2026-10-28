(() => {
  "use strict";
  const config = window.DONA_SITE_CONFIG || {};
  const base = String(config.supabaseUrl || "").replace(/\/$/, "");
  const endpoint = base + "/functions/v1/site-admin-v1";
  const publishableKey = config.publishableKey || "";
  const $ = (id) => document.getElementById(id);
  const state = { cursor: null, total: 0, selectedId: "", before: null, busy: false, accountsLoaded: false, favoriteIds: new Set(), favoritesAvailable: false, favoriteBusyIds: new Set(), textSending: false, pendingTextKey: "", pendingTextValue: "", pendingTextConversationId: "", uncertainConversationIds: new Set() };
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
    if (!response.ok || data.ok === false) {
      const error = new Error(data.message || data.error || "Não foi possível consultar as conversas.");
      error.code = data.error || "";
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  }

  function setStatus(message) { $("whatsapp-conversations-status").textContent = message; }

  function setComposerStatus(message, tone) {
    const status = $("whatsapp-conversation-compose-status");
    if (!status) return;
    status.textContent = message;
    status.dataset.tone = tone || "neutral";
  }

  function syncComposer() {
    const input = $("whatsapp-conversation-draft");
    const button = $("whatsapp-conversation-send");
    const count = $("whatsapp-conversation-compose-count");
    if (!input || !button) return;
    const text = input.value.trim();
    const locked = state.uncertainConversationIds.has(state.selectedId);
    input.disabled = state.busy || state.textSending || !state.selectedId || locked;
    button.disabled = state.busy || state.textSending || !state.selectedId || !text || text.length > 4000 || locked;
    if (count) count.textContent = input.value.length + " / 4000";
    if (locked) setComposerStatus("Envio com resultado incerto. Confira o histórico antes de enviar outra mensagem.", "error");
  }

  function makeTextIdempotencyKey() {
    const id = window.crypto && typeof window.crypto.randomUUID === "function"
      ? window.crypto.randomUUID()
      : Date.now() + ":" + Math.random().toString(36).slice(2, 14);
    return "admin-text:" + id;
  }

  function sendErrorLabel(error) {
    const code = error && error.code || "";
    if (code === "service_window_closed") return "Janela de atendimento de 24 horas encerrada.";
    if (code === "human_send_not_homologated") return "Este canal ainda não está homologado para atendimento humano.";
    if (code === "meta_transport_not_configured") return "O envio Meta não está configurado neste ambiente.";
    if (code === "meta_canary_destination_blocked") return "Este contato não está liberado pelo controle de envio do canal.";
    if (code === "rate_limited") return "Limite de mensagens atingido. Aguarde antes de tentar novamente.";
    if (code === "meta_send_uncertain" || code === "duplicate_not_dispatchable") return "Resultado do envio incerto. Confira o histórico antes de reenviar.";
    return error instanceof Error ? error.message : "Não foi possível enviar a mensagem.";
  }

  async function sendConversationText(event) {
    event.preventDefault();
    const conversationId = state.selectedId;
    const input = $("whatsapp-conversation-draft");
    const text = input ? input.value.trim() : "";
    if (!conversationId || !text || state.textSending || state.uncertainConversationIds.has(conversationId)) return;
    if (text.length > 4000) {
      setComposerStatus("A mensagem excede o limite de 4.000 caracteres.", "error");
      return;
    }
    if (!state.pendingTextKey || state.pendingTextValue !== text || state.pendingTextConversationId !== conversationId) {
      state.pendingTextKey = makeTextIdempotencyKey();
      state.pendingTextValue = text;
      state.pendingTextConversationId = conversationId;
    }
    const idempotencyKey = state.pendingTextKey;
    state.textSending = true;
    setComposerStatus("Enviando pelo canal oficial…", "neutral");
    syncComposer();
    try {
      const result = await request("whatsapp_conversation_send_text", {
        conversation_id: conversationId,
        text,
        idempotency_key: idempotencyKey,
      });
      if (state.pendingTextKey === idempotencyKey) {
        state.pendingTextKey = "";
        state.pendingTextValue = "";
        state.pendingTextConversationId = "";
      }
      if (state.selectedId === conversationId) {
        input.value = "";
        setComposerStatus(result.duplicate ? "Mensagem já registrada anteriormente." : "Mensagem aceita pelo provedor; o histórico mostrará a confirmação.", "success");
        setStatus("Mensagem aceita no canal oficial. Atualizando o histórico…");
      }
      state.textSending = false;
      syncComposer();
      if (state.selectedId === conversationId) await loadConversation(conversationId);
    } catch (error) {
      const uncertain = error?.data?.uncertain === true
        || error?.code === "meta_send_uncertain"
        || error?.code === "duplicate_not_dispatchable"
        || (!error?.status)
        || (error?.status >= 500 && error?.data?.uncertain !== false);
      if (uncertain) state.uncertainConversationIds.add(conversationId);
      else if (state.pendingTextKey === idempotencyKey) {
        state.pendingTextKey = "";
        state.pendingTextValue = "";
        state.pendingTextConversationId = "";
      }
      if (state.selectedId === conversationId) setComposerStatus(sendErrorLabel(error), "error");
      state.textSending = false;
      syncComposer();
    }
  }
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
      const favorite = item.is_favorite === true;
      if (favorite) state.favoriteIds.add(item.id);
      else state.favoriteIds.delete(item.id);

      const entry = document.createElement("article");
      entry.className = "whatsapp-conversation-item";
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

      const favoriteButton = document.createElement("button");
      favoriteButton.type = "button";
      favoriteButton.className = "whatsapp-conversation-favorite";
      favoriteButton.dataset.conversationId = item.id;
      favoriteButton.setAttribute("aria-pressed", String(favorite));
      favoriteButton.setAttribute("aria-label", favorite ? "Remover dos favoritos" : "Favoritar conversa");
      favoriteButton.title = favorite ? "Remover dos favoritos" : "Favoritar conversa";
      favoriteButton.textContent = favorite ? "★" : "☆";
      favoriteButton.disabled = !state.favoritesAvailable;
      favoriteButton.addEventListener("click", (event) => {
        event.stopPropagation();
        toggleConversationFavorite(item.id, favoriteButton);
      });
      entry.append(button, favoriteButton);
      host.append(entry);
    }
  }

  async function toggleConversationFavorite(conversationId, button) {
    if (!state.favoritesAvailable || state.favoriteBusyIds.has(conversationId)) return;
    const wasFavorite = state.favoriteIds.has(conversationId);
    state.favoriteBusyIds.add(conversationId);
    button.disabled = true;
    try {
      await request("whatsapp_conversation_favorite", {
        mode: wasFavorite ? "remove" : "add",
        conversation_id: conversationId,
      });
      const isFavorite = !wasFavorite;
      if (isFavorite) state.favoriteIds.add(conversationId);
      else state.favoriteIds.delete(conversationId);
      button.setAttribute("aria-pressed", String(isFavorite));
      button.setAttribute("aria-label", isFavorite ? "Remover dos favoritos" : "Favoritar conversa");
      button.title = isFavorite ? "Remover dos favoritos" : "Favoritar conversa";
      button.textContent = isFavorite ? "★" : "☆";
      if (!isFavorite && $("whatsapp-conversation-filter").value === "favorites") {
        button.closest(".whatsapp-conversation-item")?.remove();
        state.total = Math.max(0, state.total - 1);
        setStatus(state.total + " conversa(s) favorita(s) no filtro atual.");
      } else {
        setStatus(isFavorite ? "Conversa adicionada aos favoritos." : "Conversa removida dos favoritos.");
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Não foi possível salvar o favorito.");
    } finally {
      state.favoriteBusyIds.delete(conversationId);
      if (button.isConnected) button.disabled = !state.favoritesAvailable;
    }
  }

  function mediaPlaceholder(message) {
    const labels = {
      image: ["▧", "Abrir imagem"],
      audio: ["▶", "Ouvir áudio"],
      video: ["▶", "Assistir vídeo"],
      document: ["↓", "Baixar documento"],
    };
    const [icon, label] = labels[message.message_type] || ["↓", "Abrir arquivo"];
    const host = document.createElement("div");
    host.className = "whatsapp-media-content";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "whatsapp-media-load";
    const symbol = document.createElement("span");
    symbol.className = "whatsapp-media-icon";
    symbol.textContent = icon;
    const copy = document.createElement("span");
    copy.className = "whatsapp-media-copy";
    const title = document.createElement("strong");
    title.textContent = label;
    const hint = document.createElement("small");
    hint.textContent = "Arquivo privado · link temporário";
    copy.append(title, hint);
    button.append(symbol, copy);
    button.addEventListener("click", async () => {
      const conversationId = state.selectedId;
      if (!conversationId) return;
      button.disabled = true;
      title.textContent = "Carregando…";
      try {
        const data = await request("whatsapp_conversation_media", {
          conversation_id: conversationId,
          message_id: message.id,
        });
        const signedUrl = new URL(data.url);
        if (signedUrl.protocol !== "https:" || signedUrl.origin !== new URL(base).origin) {
          throw new Error("invalid_media_url");
        }
        if (host.isConnected && state.selectedId === conversationId) {
          renderResolvedMedia(host, message, Object.assign({}, data, { url: signedUrl.href }));
        }
      } catch (error) {
        if (!host.isConnected) return;
        button.disabled = false;
        const code = error instanceof Error ? (error.code || error.message) : "";
        title.textContent = code === "media_not_cached" ? "Mídia indisponível" : "Tentar novamente";
        hint.textContent = code === "media_not_cached"
          ? "O arquivo ainda não está no cache privado."
          : "Não foi possível carregar. Tente novamente.";
      }
    });
    host.append(button);
    if (message.text_body && message.message_type !== "audio") {
      const caption = document.createElement("p");
      caption.className = "whatsapp-media-caption";
      caption.textContent = message.text_body;
      host.append(caption);
    }
    return host;
  }

  function renderResolvedMedia(host, message, data) {
    host.replaceChildren();
    if (message.message_type === "image") {
      const image = document.createElement("img");
      image.className = "whatsapp-media-image";
      image.src = data.url;
      image.alt = message.text_body || "Imagem recebida";
      image.loading = "lazy";
      host.append(image);
    } else if (message.message_type === "audio") {
      const audio = document.createElement("audio");
      audio.className = "whatsapp-media-audio";
      audio.controls = true;
      audio.preload = "metadata";
      audio.src = data.url;
      host.append(audio);
    } else if (message.message_type === "video") {
      const video = document.createElement("video");
      video.className = "whatsapp-media-video";
      video.controls = true;
      video.preload = "metadata";
      video.playsInline = true;
      video.src = data.url;
      host.append(video);
    } else {
      const link = document.createElement("a");
      link.className = "whatsapp-media-file";
      link.href = data.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "Baixar " + String(data.filename || "arquivo").slice(0, 180);
      host.append(link);
    }
    if (message.text_body && message.message_type !== "audio") {
      const caption = document.createElement("p");
      caption.className = "whatsapp-media-caption";
      caption.textContent = message.text_body;
      host.append(caption);
    }
  }

  function locationCard(location, fallbackText) {
    const card = document.createElement("div");
    card.className = "whatsapp-location-card";
    const title = document.createElement("strong");
    title.textContent = location?.name || "Localização recebida";
    card.append(title);
    const address = String(location?.address || fallbackText || "").trim();
    if (address) {
      const detail = document.createElement("span");
      detail.textContent = address;
      card.append(detail);
    }
    const latitude = Number(location?.latitude);
    const longitude = Number(location?.longitude);
    if (Number.isFinite(latitude) && Number.isFinite(longitude)
      && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180) {
      const link = document.createElement("a");
      link.className = "whatsapp-location-link";
      link.href = "https://maps.google.com/?q=" + encodeURIComponent(latitude + "," + longitude);
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "Abrir no mapa";
      card.append(link);
    } else if (!address) {
      const hint = document.createElement("span");
      hint.textContent = "Coordenadas indisponíveis.";
      card.append(hint);
    }
    return card;
  }

  function makeBubble(message) {
    const bubble = document.createElement("article");
    bubble.className = "whatsapp-message " + (message.direction === "outbound" ? "outbound" : "inbound");
    const messageType = String(message.message_type || "").toLowerCase();
    const text = String(message.text_body || "").trim();
    const mediaTypes = ["image", "audio", "video", "document"];
    if (mediaTypes.includes(messageType)) bubble.append(mediaPlaceholder(message));
    else if (messageType === "location") bubble.append(locationCard(message.location, text));
    else {
      const body = document.createElement("p");
      const types = { sticker: "Figurinha", interactive: "Mensagem interativa", button: "Botão", reaction: "Reação" };
      body.textContent = text || types[messageType] || "Conteúdo não disponível";
      bubble.append(body);
    }
    const time = document.createElement("time");
    time.dateTime = message.message_at || "";
    time.textContent = dateLabel(message.message_at);
    const statusCode = String(message.status_current || "").trim().toLowerCase().slice(0, 40);
    if (message.direction === "outbound" && statusCode) {
      const labels = { accepted: "Aceita pela API", queued: "Na fila", pending: "Pendente", sent: "Enviada", delivered: "Entregue", read: "Lida", failed: "Falhou", rejected: "Rejeitada" };
      const status = document.createElement("small");
      status.className = "whatsapp-message-status";
      status.textContent = "Envio: " + (labels[statusCode] || statusCode.replace(/[_-]+/g, " "));
      bubble.append(time, status);
    } else bubble.append(time);
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
      state.favoriteIds.clear();
      state.favoritesAvailable = false;
      $("whatsapp-conversation-header").hidden = true;
      $("whatsapp-conversation-compose").hidden = true;
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
      state.favoritesAvailable = data.favorites_available === true;
      renderQueue(data.items, append);
      state.cursor = data.next_cursor || null;
      if (!append) state.total = data.total || 0;
      $("whatsapp-conversation-more").hidden = !state.cursor;
      setStatus(state.total + " conversa(s) no filtro atual · mais recentes primeiro."
        + (state.favoritesAvailable ? "" : " Favoritos indisponíveis neste ambiente."));
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
      $("whatsapp-conversation-compose").hidden = true;
      $("whatsapp-conversation-draft").value = "";
      state.pendingTextKey = "";
      state.pendingTextValue = "";
      state.pendingTextConversationId = "";
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
      if (!older) {
        $("whatsapp-conversation-compose").hidden = false;
        setComposerStatus("Envio sujeito à janela de 24 horas e à homologação do canal.", "neutral");
      }
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
      syncComposer();
    }
  }

  $("whatsapp-conversation-compose")?.addEventListener("submit", sendConversationText);
  $("whatsapp-conversation-draft")?.addEventListener("input", () => {
    const text = $("whatsapp-conversation-draft").value.trim();
    if (state.pendingTextValue !== text || state.pendingTextConversationId !== state.selectedId) {
      state.pendingTextKey = "";
      state.pendingTextValue = text;
      state.pendingTextConversationId = state.selectedId;
    }
    syncComposer();
  });
  $("whatsapp-conversations-refresh")?.addEventListener("click", () => loadConversations());
  $("whatsapp-conversation-search-button")?.addEventListener("click", () => loadConversations());
  $("whatsapp-conversation-search")?.addEventListener("keydown", (event) => { if (event.key === "Enter") loadConversations(); });
  $("whatsapp-conversation-account")?.addEventListener("change", () => loadConversations());
  $("whatsapp-conversation-filter")?.addEventListener("change", () => loadConversations());
  $("whatsapp-conversation-more")?.addEventListener("click", () => loadConversations({ append: true }));
  $("whatsapp-conversation-older")?.addEventListener("click", () => state.selectedId && loadConversation(state.selectedId, { older: true }));
  window.DonaWhatsAppConversations = { load: () => loadConversations() };
})();
