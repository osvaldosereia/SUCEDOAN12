(() => {
  "use strict";
  const config = window.DONA_SITE_CONFIG || {};
  const base = String(config.supabaseUrl || "").replace(/\/$/, "");
  const endpoint = base + "/functions/v1/site-admin-v1";
  const publishableKey = config.publishableKey || "";
  const $ = (id) => document.getElementById(id);
  const state = { cursor: null, total: 0, conversations: [], selectedId: "", selectedConversation: null, before: null, listLoading: false, listRequestId: 0, conversationLoading: false, conversationRequestId: 0, olderLoading: false, quickFilter: "all", favoriteIds: new Set(), favoritesAvailable: false, ordersAvailable: false, favoriteBusyIds: new Set(), orderBusyIds: new Set(), textSending: false, mediaSending: false, pendingTextKey: "", pendingTextValue: "", pendingTextConversationId: "", pendingMediaKey: "", pendingMediaFingerprint: "", uncertainConversationIds: new Set(), statusRefreshing: false };
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
    const fileInput = $("whatsapp-conversation-file");
    const mediaButton = $("whatsapp-conversation-send-media");
    const removeButton = $("whatsapp-conversation-remove-file");
    const fileLabel = $("whatsapp-conversation-file-name");
    const count = $("whatsapp-conversation-compose-count");
    if (!input || !button) return;
    const text = input.value.trim();
    const file = fileInput?.files?.[0] || null;
    const locked = state.uncertainConversationIds.has(state.selectedId);
    const sending = state.textSending || state.mediaSending;
    input.maxLength = file ? 1024 : 4000;
    input.disabled = state.conversationLoading || sending || !state.selectedId || locked;
    button.disabled = state.conversationLoading || sending || !state.selectedId || !text || text.length > 4000 || Boolean(file) || locked;
    if (fileInput) fileInput.disabled = state.conversationLoading || sending || !state.selectedId || locked;
    if (mediaButton) mediaButton.disabled = state.conversationLoading || sending || !state.selectedId || !file || text.length > 1024 || locked;
    if (removeButton) removeButton.hidden = !file || sending;
    if (fileLabel) fileLabel.textContent = file
      ? file.name + " · " + (file.size >= 1024 * 1024 ? (file.size / (1024 * 1024)).toFixed(1) + " MB" : Math.max(1, Math.round(file.size / 1024)) + " KB")
      : "Nenhum arquivo selecionado";
    if (count) count.textContent = input.value.length + " / " + (file ? 1024 : 4000);
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
    if (code === "media_file_too_large") return "O arquivo excede o limite permitido para este formato.";
    if (code === "meta_media_type_not_allowed") return "Este formato de arquivo não é aceito pelo WhatsApp.";
    if (code.startsWith("meta_media_") || code === "meta_media_content_invalid") return "O arquivo não passou pela validação de formato.";
    if (code === "media_caption_too_long") return "A legenda excede 1.024 caracteres.";
    return error instanceof Error ? error.message : "Não foi possível enviar a mensagem.";
  }

  async function sendConversationText(event) {
    event.preventDefault();
    const conversationId = state.selectedId;
    const input = $("whatsapp-conversation-draft");
    const text = input ? input.value.trim() : "";
    if (!conversationId || !text || state.textSending || state.mediaSending || $("whatsapp-conversation-file")?.files?.length || state.uncertainConversationIds.has(conversationId)) return;
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
  function makeMediaIdempotencyKey() {
    const id = window.crypto && typeof window.crypto.randomUUID === "function"
      ? window.crypto.randomUUID()
      : Date.now() + ":" + Math.random().toString(36).slice(2, 14);
    return "admin-media:" + id;
  }

  function clearSelectedMedia() {
    const fileInput = $("whatsapp-conversation-file");
    if (fileInput) fileInput.value = "";
    state.pendingMediaKey = "";
    state.pendingMediaFingerprint = "";
    syncComposer();
  }

  async function sendConversationMedia() {
    const conversationId = state.selectedId;
    const fileInput = $("whatsapp-conversation-file");
    const file = fileInput?.files?.[0] || null;
    const captionInput = $("whatsapp-conversation-draft");
    const caption = captionInput ? captionInput.value.trim() : "";
    if (!conversationId || !file || state.textSending || state.mediaSending || state.uncertainConversationIds.has(conversationId)) return;
    if (caption.length > 1024) {
      setComposerStatus("A legenda excede o limite de 1.024 caracteres.", "error");
      return;
    }

    const fingerprint = [conversationId, file.name, file.size, file.lastModified, caption].join("|");
    if (!state.pendingMediaKey || state.pendingMediaFingerprint !== fingerprint) {
      state.pendingMediaKey = makeMediaIdempotencyKey();
      state.pendingMediaFingerprint = fingerprint;
    }
    const idempotencyKey = state.pendingMediaKey;
    state.mediaSending = true;
    setComposerStatus("Enviando anexo pelo canal oficial…", "neutral");
    syncComposer();
    try {
      const form = new FormData();
      form.set("conversation_id", conversationId);
      form.set("idempotency_key", idempotencyKey);
      form.set("caption", caption);
      form.set("file", file, file.name);
      const response = await fetch(endpoint + "?action=whatsapp_conversation_send_media", {
        method: "POST",
        headers: {
          apikey: publishableKey,
          "x-admin-code": window.DonaAdminAuth?.getCode?.() || "",
        },
        body: form,
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) {
        const error = new Error(data.message || data.error || "Não foi possível enviar o anexo.");
        error.code = data.error || "";
        error.status = response.status;
        error.data = data;
        throw error;
      }

      state.pendingMediaKey = "";
      state.pendingMediaFingerprint = "";
      if (state.selectedId === conversationId) {
        fileInput.value = "";
        captionInput.value = "";
        const confirmation = data.duplicate
          ? "Anexo já registrado anteriormente."
          : data.media_cached === false
            ? "Anexo aceito; o arquivo não ficou disponível no cache privado do histórico."
            : "Anexo aceito pelo provedor; o histórico mostrará a confirmação.";
        setComposerStatus(confirmation, "success");
        setStatus("Anexo aceito no canal oficial. Atualizando o histórico…");
      }
      state.mediaSending = false;
      syncComposer();
      if (state.selectedId === conversationId) await loadConversation(conversationId);
    } catch (error) {
      const uncertain = error?.data?.uncertain === true
        || error?.code === "meta_send_uncertain"
        || error?.code === "duplicate_not_dispatchable"
        || (!error?.status)
        || (error?.status >= 500 && error?.data?.uncertain !== false);
      if (uncertain) state.uncertainConversationIds.add(conversationId);
      else if (state.pendingMediaKey === idempotencyKey) {
        state.pendingMediaKey = "";
        state.pendingMediaFingerprint = "";
      }
      if (state.selectedId === conversationId) setComposerStatus(sendErrorLabel(error), "error");
      state.mediaSending = false;
      syncComposer();
    }
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
      title.textContent = item.customer_name
        ? item.customer_name + (item.phone_last4 ? " · •••• " + item.phone_last4 : "")
        : item.phone_last4 ? "Contato · •••• " + item.phone_last4 : "Contato";
      const meta = document.createElement("span");
      meta.textContent = (item.channel || "WhatsApp")
        + (item.channel_number ? " · Canal " + item.channel_number : "")
        + " · " + (item.human_required ? "Atendimento humano" : item.mode || item.status || "Conversa");
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

      const orderButton = document.createElement("button");
      const inOrders = item.is_in_orders === true;
      orderButton.type = "button";
      orderButton.className = "whatsapp-conversation-order-toggle";
      orderButton.dataset.conversationId = item.id;
      orderButton.textContent = inOrders ? "−" : "+";
      orderButton.title = inOrders ? "Remover da aba Pedidos" : "Adicionar à aba Pedidos";
      orderButton.setAttribute("aria-label", orderButton.title);
      orderButton.setAttribute("aria-pressed", String(inOrders));
      orderButton.disabled = !state.ordersAvailable || state.orderBusyIds.has(item.id);
      orderButton.addEventListener("click", (event) => {
        event.stopPropagation();
        toggleConversationOrder(item.id, orderButton);
      });
      entry.append(button, favoriteButton, orderButton);
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
      const conversation = state.conversations.find((item) => item.id === conversationId);
      if (conversation) conversation.is_favorite = isFavorite;
      button.setAttribute("aria-pressed", String(isFavorite));
      button.setAttribute("aria-label", isFavorite ? "Remover dos favoritos" : "Favoritar conversa");
      button.title = isFavorite ? "Remover dos favoritos" : "Favoritar conversa";
      button.textContent = isFavorite ? "★" : "☆";
      if (!isFavorite && state.quickFilter === "favorites") {
        button.closest(".whatsapp-conversation-item")?.remove();
        state.conversations = state.conversations.filter((item) => item.id !== conversationId);
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

  async function toggleConversationOrder(conversationId, button) {
    if (!state.ordersAvailable || state.orderBusyIds.has(conversationId)) return;
    const conversation = state.conversations.find((item) => item.id === conversationId);
    if (!conversation) return;
    const wasInOrders = conversation.is_in_orders === true;
    const mode = wasInOrders ? "exclude" : "include";
    state.orderBusyIds.add(conversationId);
    button.disabled = true;
    try {
      await request("whatsapp_conversation_order_override", { mode, conversation_id: conversationId });
      conversation.order_override = mode;
      conversation.is_in_orders = !wasInOrders;
      const isInOrders = conversation.is_in_orders;
      button.textContent = isInOrders ? "−" : "+";
      button.title = isInOrders ? "Remover da aba Pedidos" : "Adicionar à aba Pedidos";
      button.setAttribute("aria-label", button.title);
      button.setAttribute("aria-pressed", String(isInOrders));
      if (!isInOrders && state.quickFilter === "orders") {
        button.closest(".whatsapp-conversation-item")?.remove();
        state.conversations = state.conversations.filter((item) => item.id !== conversationId);
        state.total = Math.max(0, state.total - 1);
        setStatus(state.total + " conversa(s) na aba Pedidos das últimas 28 horas.");
      } else {
        setStatus(isInOrders ? "Conversa adicionada à aba Pedidos." : "Conversa removida da aba Pedidos.");
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Não foi possível salvar esta marcação.");
    } finally {
      state.orderBusyIds.delete(conversationId);
      if (button.isConnected) button.disabled = !state.ordersAvailable;
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
    hint.textContent = message.media_filename
      ? String(message.media_filename).slice(0, 180) + " · link temporário"
      : "Arquivo privado · link temporário";
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
    bubble.dataset.messageId = String(message.id || "");
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

  function refreshRenderedMessageStatuses(messages) {
    const host = $("whatsapp-conversation-messages");
    const latest = new Map();
    for (const message of messages || []) {
      const id = String(message.id || "");
      if (id) latest.set(id, String(message.status_current || "").trim().toLowerCase().slice(0, 40));
    }
    const labels = { accepted: "Aceita pela API", queued: "Na fila", pending: "Pendente", sent: "Enviada", delivered: "Entregue", read: "Lida", failed: "Falhou", rejected: "Rejeitada" };
    for (const bubble of host.querySelectorAll(".whatsapp-message.outbound[data-message-id]")) {
      const id = bubble.dataset.messageId;
      if (!latest.has(id)) continue;
      const code = latest.get(id);
      let status = bubble.querySelector(".whatsapp-message-status");
      if (!code) {
        status?.remove();
        continue;
      }
      if (!status) {
        status = document.createElement("small");
        status.className = "whatsapp-message-status";
        bubble.append(status);
      }
      status.textContent = "Envio: " + (labels[code] || code.replace(/[_-]+/g, " "));
    }
  }

  async function refreshSelectedMessageStatuses() {
    const conversationId = state.selectedId;
    const host = $("whatsapp-conversation-messages");
    if (!conversationId || !host || state.statusRefreshing || state.conversationLoading) return false;
    const messageIds = Array.from(new Set(
      Array.from(host.querySelectorAll(".whatsapp-message.outbound[data-message-id]"))
        .map((bubble) => String(bubble.dataset.messageId || ""))
        .filter(Boolean)
    ));
    state.statusRefreshing = true;
    try {
      for (let offset = 0; offset < messageIds.length; offset += 100) {
        const data = await request("whatsapp_conversation_message_statuses", {
          conversation_id: conversationId,
          message_ids: messageIds.slice(offset, offset + 100),
        });
        if (state.selectedId !== conversationId) return false;
        refreshRenderedMessageStatuses(data.statuses || []);
      }
      return true;
    } catch {
      return false;
    } finally {
      state.statusRefreshing = false;
    }
  }

  async function refreshConversationView() {
    await loadConversations({ silent: true });
    const statusUpdated = await refreshSelectedMessageStatuses();
    if (statusUpdated) setStatus("Lista e status das mensagens atualizados.");
  }

  function renderHeader(conversation) {
    const selected = state.selectedConversation || {};
    const phoneLast4 = conversation.phone_last4 || selected.phone_last4 || "";
    const customerName = conversation.customer_name || selected.customer_name || "";
    const channelName = conversation.channel || selected.channel || "WhatsApp";
    const channelNumber = conversation.channel_number || selected.channel_number || "";
    $("whatsapp-conversation-title").textContent = (customerName || "Contato") + (phoneLast4 ? " · •••• " + phoneLast4 : "");
    const stateLabel = conversation.human_required ? "Precisa de atendimento humano" : [conversation.mode, conversation.status, conversation.stage].filter(Boolean).join(" · ");
    const channel = channelName + (channelNumber ? " · Canal " + channelNumber : "");
    $("whatsapp-conversation-subtitle").textContent = channel + " · " + (stateLabel || "Conversa");
    $("whatsapp-conversation-header").hidden = false;
    $("whatsapp-conversation-empty").hidden = true;
  }

  async function loadConversations({ append = false, silent = false } = {}) {
    if (append && state.listLoading) return;
    if (!base || !publishableKey) return;
    const rawSearch = $("whatsapp-conversation-search").value.trim();
    const searchDigits = rawSearch.replace(/\D/g, "");
    if (rawSearch && searchDigits.length < 4) {
      if (!silent) setStatus("Digite pelo menos quatro dígitos do telefone.");
      return;
    }
    const requestId = ++state.listRequestId;
    state.listLoading = true;
    const host = $("whatsapp-conversation-items");
    if (!append && !silent) {
      state.cursor = null;
      state.total = 0;
      state.conversations = [];
      state.favoriteIds.clear();
      state.favoritesAvailable = false;
      state.ordersAvailable = false;
      setStatus("Buscando conversas…");
    } else if (append) setStatus("Carregando mais conversas…");
    try {
      const data = await request("whatsapp_conversation_list", {
        cursor: append ? state.cursor : null,
        quick_filter: state.quickFilter,
        search: $("whatsapp-conversation-search").value || "",
        filter: $("whatsapp-conversation-filter").value || "all",
      });
      if (requestId !== state.listRequestId) return;
      state.favoritesAvailable = data.favorites_available === true;
      state.ordersAvailable = data.orders_available === true;
      const incoming = Array.isArray(data.items) ? data.items : [];
      if (silent) {
        const incomingIds = new Set(incoming.map((item) => String(item.id)));
        const scrollTop = host.scrollTop;
        state.conversations = [
          ...incoming,
          ...state.conversations.filter((item) => !incomingIds.has(String(item.id))),
        ];
        state.cursor = state.cursor || data.next_cursor || null;
        state.total = data.total || 0;
        renderQueue(state.conversations, false);
        host.scrollTop = scrollTop;
      } else if (append) {
        const existingIds = new Set(state.conversations.map((item) => String(item.id)));
        const additions = incoming.filter((item) => !existingIds.has(String(item.id)));
        state.conversations.push(...additions);
        state.cursor = data.next_cursor || null;
        state.total = data.total || state.total;
        renderQueue(additions, true);
      } else {
        state.conversations = incoming;
        state.cursor = data.next_cursor || null;
        state.total = data.total || 0;
        renderQueue(incoming, false);
      }
      $("whatsapp-conversation-more").hidden = !state.cursor;
      if (!silent) {
        const label = state.quickFilter === "orders"
          ? state.total + " conversa(s) com pedido nas últimas 28 horas."
          : state.total + " conversa(s) no filtro atual · mais recentes primeiro.";
        setStatus(label + (state.ordersAvailable ? "" : " Marcações manuais de pedidos indisponíveis neste ambiente."));
      }
    } catch (error) {
      if (requestId !== state.listRequestId) return;
      if (!silent) setStatus(error instanceof Error ? error.message : "Não foi possível carregar as conversas.");
      if (!append && !silent) {
        host.replaceChildren();
        const message = document.createElement("p");
        message.className = "whatsapp-overview-empty";
        message.textContent = error instanceof Error ? error.message : "Não foi possível carregar as conversas.";
        host.append(message);
      }
    } finally {
      if (requestId === state.listRequestId) state.listLoading = false;
    }
  }

  async function loadConversation(id, { older = false } = {}) {
    if (!id || (older && (state.olderLoading || state.conversationLoading))) return;
    const requestId = older ? state.conversationRequestId : ++state.conversationRequestId;
    const targetBefore = older ? state.before : null;
    if (!older) {
      state.selectedId = id;
      state.selectedConversation = state.conversations.find((item) => item.id === id) || null;
      state.conversationLoading = true;
      $("whatsapp-conversation-header").hidden = true;
      $("whatsapp-conversation-compose").hidden = true;
      $("whatsapp-conversation-draft").value = "";
      clearSelectedMedia();
      state.pendingTextKey = "";
      state.pendingTextValue = "";
      state.pendingTextConversationId = "";
      $("whatsapp-conversation-empty").hidden = false;
      $("whatsapp-conversation-empty").innerHTML = "<strong>Carregando conversa…</strong><span>As mensagens serão abertas quando você selecionar uma conversa.</span>";
      $("whatsapp-conversation-messages").replaceChildren();
      for (const button of document.querySelectorAll(".whatsapp-conversation-card")) {
        button.setAttribute("aria-pressed", String(button.dataset.conversationId === id));
      }
      syncComposer();
    } else {
      state.olderLoading = true;
      $("whatsapp-conversation-older").disabled = true;
    }
    try {
      const data = await request("whatsapp_conversation_messages", {
        conversation_id: id,
        before_created_at: targetBefore?.created_at || "",
        before_id: targetBefore?.id || "",
      });
      if (state.selectedId !== id || requestId !== state.conversationRequestId) return;
      renderHeader(data.conversation || {});
      renderMessages(data.messages || [], older);
      if (!older) {
        $("whatsapp-conversation-compose").hidden = false;
        setComposerStatus("Envio sujeito à janela de 24 horas e à homologação do canal.", "neutral");
      }
      state.before = data.next_before || null;
      $("whatsapp-conversation-older").hidden = !state.before;
      setStatus("Histórico carregado.");
    } catch (error) {
      if (state.selectedId !== id || requestId !== state.conversationRequestId) return;
      if (!older) {
        $("whatsapp-conversation-empty").textContent = error instanceof Error ? error.message : "Não foi possível abrir esta conversa.";
        $("whatsapp-conversation-empty").hidden = false;
      } else setStatus(error instanceof Error ? error.message : "Não foi possível carregar mensagens anteriores.");
    } finally {
      if (older) {
        state.olderLoading = false;
        $("whatsapp-conversation-older").disabled = false;
      } else if (requestId === state.conversationRequestId) {
        state.conversationLoading = false;
        syncComposer();
      }
    }
  }

  $("whatsapp-conversation-compose")?.addEventListener("submit", sendConversationText);
  $("whatsapp-conversation-send-media")?.addEventListener("click", sendConversationMedia);
  $("whatsapp-conversation-file")?.addEventListener("change", () => {
    state.pendingMediaKey = "";
    state.pendingMediaFingerprint = "";
    syncComposer();
    const file = $("whatsapp-conversation-file")?.files?.[0];
    if (file && (/^audio\//i.test(file.type) || /\.(aac|amr|mp3|m4a|ogg)$/i.test(file.name))) setComposerStatus("O WhatsApp envia áudio sem legenda.", "neutral");
    else if (file) setComposerStatus("A legenda será enviada junto com o anexo.", "neutral");
  });
  $("whatsapp-conversation-remove-file")?.addEventListener("click", clearSelectedMedia);
  $("whatsapp-conversation-draft")?.addEventListener("input", () => {
    const text = $("whatsapp-conversation-draft").value.trim();
    if (state.pendingTextValue !== text || state.pendingTextConversationId !== state.selectedId) {
      state.pendingTextKey = "";
      state.pendingTextValue = text;
      state.pendingTextConversationId = state.selectedId;
    }
    if ($("whatsapp-conversation-file")?.files?.length && text.length > 1024) {
      setComposerStatus("A legenda pode ter até 1.024 caracteres.", "error");
    }
    syncComposer();
  });
  $("whatsapp-conversations-refresh")?.addEventListener("click", () => { void refreshConversationView(); });
  $("whatsapp-conversation-search-button")?.addEventListener("click", () => loadConversations());
  $("whatsapp-conversation-search")?.addEventListener("keydown", (event) => { if (event.key === "Enter") loadConversations(); });
  $("whatsapp-conversation-filter")?.addEventListener("change", () => loadConversations());
  $("whatsapp-conversation-more")?.addEventListener("click", () => loadConversations({ append: true }));
  $("whatsapp-conversation-older")?.addEventListener("click", () => state.selectedId && loadConversation(state.selectedId, { older: true }));
  document.querySelectorAll("[data-conversation-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.quickFilter = button.dataset.conversationView || "all";
      document.querySelectorAll("[data-conversation-view]").forEach((tab) => {
        tab.setAttribute("aria-selected", String(tab === button));
      });
      void loadConversations();
    });
  });
  window.DonaWhatsAppConversations = { load: () => loadConversations() };
})();
