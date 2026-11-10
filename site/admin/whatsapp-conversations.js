(() => {
  "use strict";
  const config = window.DONA_SITE_CONFIG || {};
  const base = String(config.supabaseUrl || "").replace(/\/$/, "");
  const endpoint = base + "/functions/v1/site-admin-v1";
  const publishableKey = config.publishableKey || "";
  const $ = (id) => document.getElementById(id);
  const state = { cursor: null, total: 0, conversations: [], firstPageIds: new Set(), selectedId: "", selectedConversation: null, before: null, listLoading: false, listRequestId: 0, conversationLoading: false, conversationRequestId: 0, olderLoading: false, quickFilter: "all", favoriteIds: new Set(), favoritesAvailable: false, ordersAvailable: false, favoriteBusyIds: new Set(), orderBusyIds: new Set(), labelBusyConversations: new Set(), labelSaveBusy: false, labelDeleteBusyIds: new Set(), labels: [], labelsLoaded: false, labelsLoading: false, anaModeBusyIds: new Set(), sendingTextIds: new Set(), sendingMediaIds: new Set(), pendingTextByConversation: new Map(), pendingMediaKey: "", pendingMediaFingerprint: "", uncertainSends: new Map(), statusCheckingIds: new Set(), drafts: new Map(), statusRefreshing: false };
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
      signal: AbortSignal.timeout(30000),
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
    const checkButton = $("whatsapp-conversation-check-send");
    if (!input || !button) return;
    const text = input.value.trim();
    const file = fileInput?.files?.[0] || null;
    const locked = state.uncertainSends.has(state.selectedId);
    const sending = state.sendingTextIds.has(state.selectedId) || state.sendingMediaIds.has(state.selectedId);
    input.maxLength = file ? 1024 : 4000;
    input.disabled = !state.selectedId;
    button.disabled = state.conversationLoading || sending || !state.selectedId || !text || text.length > 4000 || Boolean(file) || locked;
    if (fileInput) fileInput.disabled = sending || !state.selectedId || locked;
    if (mediaButton) mediaButton.disabled = state.conversationLoading || sending || !state.selectedId || !file || text.length > 1024 || locked;
    if (removeButton) removeButton.hidden = !file || sending;
    if (checkButton) {
      checkButton.hidden = !locked;
      checkButton.disabled = state.statusCheckingIds.has(state.selectedId);
    }
    if (fileLabel) fileLabel.textContent = file
      ? file.name + " · " + (file.size >= 1024 * 1024 ? (file.size / (1024 * 1024)).toFixed(1) + " MB" : Math.max(1, Math.round(file.size / 1024)) + " KB")
      : "Nenhum arquivo selecionado";
    if (count) count.textContent = input.value.length + " / " + (file ? 1024 : 4000);
    if (locked && !state.statusCheckingIds.has(state.selectedId)) setComposerStatus("Envio com resultado incerto. Verifique o status antes de reenviar.", "error");
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
    if (!conversationId || !text || state.sendingTextIds.has(conversationId) || state.sendingMediaIds.has(conversationId) || $("whatsapp-conversation-file")?.files?.length || state.uncertainSends.has(conversationId)) return;
    if (text.length > 4000) {
      setComposerStatus("A mensagem excede o limite de 4.000 caracteres.", "error");
      return;
    }
    let pending = state.pendingTextByConversation.get(conversationId);
    if (!pending || pending.text !== text) {
      pending = { key: makeTextIdempotencyKey(), text };
      state.pendingTextByConversation.set(conversationId, pending);
    }
    const idempotencyKey = pending.key;
    state.sendingTextIds.add(conversationId);
    setComposerStatus("Enviando pelo canal oficial…", "neutral");
    syncComposer();
    try {
      const result = await request("whatsapp_conversation_send_text", {
        conversation_id: conversationId,
        text,
        idempotency_key: idempotencyKey,
      });
      if (state.pendingTextByConversation.get(conversationId)?.key === idempotencyKey) state.pendingTextByConversation.delete(conversationId);
      if (state.drafts.get(conversationId)?.trim() === text) state.drafts.set(conversationId, "");
      if (state.selectedId === conversationId) {
        if (input.value.trim() === text) input.value = "";
        state.drafts.set(conversationId, input.value);
        setComposerStatus(result.duplicate ? "Mensagem já registrada anteriormente." : "Mensagem aceita pelo provedor; o histórico mostrará a confirmação.", "success");
        setStatus("Mensagem aceita no canal oficial. Atualizando o histórico…");
      }
      state.sendingTextIds.delete(conversationId);
      syncComposer();
      if (state.selectedId === conversationId) await loadConversation(conversationId);
    } catch (error) {
      const uncertain = error?.data?.uncertain === true
        || error?.code === "meta_send_uncertain"
        || error?.code === "duplicate_not_dispatchable"
        || (!error?.status)
        || (error?.status >= 500 && error?.data?.uncertain !== false);
      if (uncertain) state.uncertainSends.set(conversationId, { key: idempotencyKey, type: "text", text });
      else if (state.pendingTextByConversation.get(conversationId)?.key === idempotencyKey) state.pendingTextByConversation.delete(conversationId);
      if (state.selectedId === conversationId) setComposerStatus(sendErrorLabel(error), "error");
      state.sendingTextIds.delete(conversationId);
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
    if (!conversationId || !file || state.sendingTextIds.has(conversationId) || state.sendingMediaIds.has(conversationId) || state.uncertainSends.has(conversationId)) return;
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
    state.sendingMediaIds.add(conversationId);
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
        signal: AbortSignal.timeout(30000),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) {
        const error = new Error(data.message || data.error || "Não foi possível enviar o anexo.");
        error.code = data.error || "";
        error.status = response.status;
        error.data = data;
        throw error;
      }

      if (state.pendingMediaKey === idempotencyKey) {
        state.pendingMediaKey = "";
        state.pendingMediaFingerprint = "";
      }
      if (state.drafts.get(conversationId)?.trim() === caption) state.drafts.set(conversationId, "");
      if (state.selectedId === conversationId) {
        if (fileInput.files?.[0] === file) fileInput.value = "";
        if (captionInput.value.trim() === caption) captionInput.value = "";
        state.drafts.set(conversationId, captionInput.value);
        const confirmation = data.duplicate
          ? "Anexo já registrado anteriormente."
          : data.media_cached === false
            ? "Anexo aceito; o arquivo não ficou disponível no cache privado do histórico."
            : "Anexo aceito pelo provedor; o histórico mostrará a confirmação.";
        setComposerStatus(confirmation, "success");
        setStatus("Anexo aceito no canal oficial. Atualizando o histórico…");
      }
      state.sendingMediaIds.delete(conversationId);
      syncComposer();
      if (state.selectedId === conversationId) await loadConversation(conversationId);
    } catch (error) {
      const uncertain = error?.data?.uncertain === true
        || error?.code === "meta_send_uncertain"
        || error?.code === "duplicate_not_dispatchable"
        || (!error?.status)
        || (error?.status >= 500 && error?.data?.uncertain !== false);
      if (uncertain) state.uncertainSends.set(conversationId, { key: idempotencyKey, type: "media", text: caption, fingerprint });
      else if (state.pendingMediaKey === idempotencyKey) {
        state.pendingMediaKey = "";
        state.pendingMediaFingerprint = "";
      }
      if (state.selectedId === conversationId) setComposerStatus(sendErrorLabel(error), "error");
      state.sendingMediaIds.delete(conversationId);
      syncComposer();
    }
  }

  function conversationMetaText(item) {
    const orderOriginLabel = item.order_origin === "site"
      ? "Pedido do site"
      : item.order_origin === "whatsapp"
        ? "Pedido pelo WhatsApp"
        : item.order_origin === "manual" ? "Pedido marcado manualmente" : "";
    const crmLabel = orderOriginLabel || (item.is_interested ? "Sinal de interesse" : "");
    return (item.whatsapp_profile_name && !item.customer_name ? "Nome exibido pelo WhatsApp · " : "") + (item.channel || "WhatsApp")
      + (item.channel_number ? " · Canal " + item.channel_number : "")
      + " · " + (String(item.mode || "").toLowerCase() === "paused" ? "ANA desligada" : item.human_required ? "Atendimento humano" : String(item.mode || "").toLowerCase() === "ai" ? "ANA ativa" : item.mode || item.status || "Conversa")
      + (crmLabel ? " · " + crmLabel : "");
  }

  function labelColor(value) {
    const color = String(value || "").trim();
    return /^#[0-9a-f]{6}$/i.test(color) ? color : "#7e3029";
  }

  function renderLabelFilter() {
    const select = $("whatsapp-conversation-label-filter");
    if (!select) return;
    const previous = select.value;
    const allOption = document.createElement("option");
    allOption.value = "";
    allOption.textContent = "Todas as etiquetas";
    select.replaceChildren(allOption);
    for (const label of state.labels) {
      const option = document.createElement("option");
      option.value = label.id;
      option.textContent = label.name;
      select.append(option);
    }
    select.value = state.labels.some((label) => label.id === previous) ? previous : "";
  }

  function renderLabelManagerList() {
    const host = $("whatsapp-label-manager-list");
    if (!host) return;
    host.replaceChildren();
    if (!state.labels.length) {
      const empty = document.createElement("p");
      empty.className = "admin-muted";
      empty.textContent = state.labelsLoading ? "Carregando etiquetas…" : "Nenhuma etiqueta ativa.";
      host.append(empty);
      return;
    }
    for (const label of state.labels) {
      const row = document.createElement("article");
      row.className = "whatsapp-label-manager-row";
      const main = document.createElement("div");
      main.className = "whatsapp-label-manager-main";
      const swatch = document.createElement("span");
      swatch.className = "whatsapp-label-swatch";
      swatch.style.setProperty("--whatsapp-label-color", labelColor(label.color));
      const name = document.createElement("strong");
      name.textContent = label.name;
      main.append(swatch, name);
      if (label.system_managed) {
        const badge = document.createElement("small");
        badge.className = "whatsapp-label-system-badge";
        badge.textContent = "Automática · nome protegido";
        main.append(badge);
      }
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "button button-outline";
      edit.textContent = "Editar";
      edit.addEventListener("click", () => editWhatsAppLabel(label.id));
      const actions = document.createElement("div");
      actions.className = "whatsapp-label-manager-actions";
      actions.append(edit);
      if (label.system_managed) {
        const badge = main.querySelector(".whatsapp-label-system-badge");
        if (badge) badge.textContent = "Automática · protegida";
      } else {
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "button button-outline whatsapp-label-delete";
        remove.textContent = state.labelDeleteBusyIds.has(label.id) ? "Excluindo…" : "Excluir";
        remove.disabled = state.labelDeleteBusyIds.has(label.id);
        remove.setAttribute("aria-label", "Excluir etiqueta " + label.name);
        remove.addEventListener("click", () => { void deleteWhatsAppLabel(label.id); });
        actions.append(remove);
      }
      row.append(main, actions);
      host.append(row);
    }
  }

  function renderConversationLabelEditor() {
    const details = $("whatsapp-conversation-label-editor");
    const host = $("whatsapp-conversation-label-options");
    const summary = $("whatsapp-conversation-label-summary");
    const status = $("whatsapp-conversation-label-status");
    if (!details || !host || !summary) return;
    const conversationId = state.selectedId;
    details.hidden = !conversationId;
    if (!conversationId) {
      host.replaceChildren();
      return;
    }
    const conversation = state.selectedConversation || {};
    const manualIds = new Set((conversation.manual_label_ids || []).map(String));
    const automaticIds = new Set((conversation.auto_label_ids || []).map(String));
    const selectedCount = new Set([...manualIds, ...automaticIds]).size;
    summary.textContent = "Etiquetas da conversa · " + selectedCount;
    host.replaceChildren();
    if (state.labelsLoading && !state.labelsLoaded) {
      status.textContent = "Carregando etiquetas…";
      return;
    }
    if (!state.labels.length) {
      status.textContent = "Nenhuma etiqueta criada. Use “Gerenciar etiquetas” para criar a primeira.";
      return;
    }
    for (const label of state.labels) {
      const choice = document.createElement("label");
      choice.className = "whatsapp-label-choice";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.dataset.whatsappLabelId = label.id;
      checkbox.checked = manualIds.has(label.id) || automaticIds.has(label.id);
      checkbox.disabled = label.system_managed === true || automaticIds.has(label.id) || state.labelBusyConversations.has(conversationId) || state.conversationLoading;
      checkbox.title = label.system_managed === true
        ? "Etiqueta controlada automaticamente pelo sistema"
        : "Aplicar ou remover esta etiqueta";
      const swatch = document.createElement("span");
      swatch.className = "whatsapp-label-swatch";
      swatch.style.setProperty("--whatsapp-label-color", labelColor(label.color));
      const name = document.createElement("span");
      name.textContent = label.name;
      choice.append(checkbox, swatch, name);
      if (label.system_managed === true) {
        const automatic = document.createElement("small");
        automatic.textContent = "Automática";
        choice.append(automatic);
      }
      host.append(choice);
    }
    status.textContent = selectedCount
      ? selectedCount + " etiqueta(s) nesta conversa. As automáticas são controladas pelo sistema."
      : "Marque uma ou mais etiquetas para esta conversa.";
  }

  function appendConversationLabelBadges(host, item) {
    const labels = Array.isArray(item.labels) ? item.labels : [];
    if (!labels.length) return;
    const badges = document.createElement("span");
    badges.className = "whatsapp-conversation-label-badges";
    for (const attached of labels.slice(0, 4)) {
      const current = state.labels.find((label) => label.id === attached.id) || attached;
      const badge = document.createElement("small");
      badge.className = "whatsapp-conversation-label-badge";
      badge.style.setProperty("--whatsapp-label-color", labelColor(current.color));
      badge.textContent = current.name || "Etiqueta";
      badges.append(badge);
    }
    if (labels.length > 4) {
      const extra = document.createElement("small");
      extra.className = "whatsapp-conversation-label-extra";
      extra.textContent = "+" + (labels.length - 4);
      badges.append(extra);
    }
    host.append(badges);
  }

  async function loadLabelCatalog({ force = false } = {}) {
    if (state.labelsLoading || (state.labelsLoaded && !force)) return;
    state.labelsLoading = true;
    try {
      const data = await request("whatsapp_labels_list");
      state.labels = Array.isArray(data.labels) ? data.labels : [];
      state.labelsLoaded = true;
      renderLabelFilter();
      renderLabelManagerList();
      renderConversationLabelEditor();
      const list = $("whatsapp-conversation-items");
      if (list && state.conversations.length) {
        const scrollTop = list.scrollTop;
        renderQueue(state.conversations, false);
        list.scrollTop = scrollTop;
      }
      const managerStatus = $("whatsapp-label-manager-status");
      if (managerStatus) managerStatus.textContent = state.labels.length + " etiqueta(s) compartilhadas entre os canais 0975 e 1018.";
    } catch (error) {
      state.labelsLoaded = false;
      const message = error instanceof Error ? error.message : "Não foi possível carregar as etiquetas.";
      const managerStatus = $("whatsapp-label-manager-status");
      if (managerStatus) managerStatus.textContent = message;
      const conversationStatus = $("whatsapp-conversation-label-status");
      if (conversationStatus && state.selectedId) conversationStatus.textContent = message;
    } finally {
      state.labelsLoading = false;
      renderLabelManagerList();
    }
  }

  function resetLabelForm() {
    const id = $("whatsapp-label-id");
    const name = $("whatsapp-label-name");
    const color = $("whatsapp-label-color");
    const submit = $("whatsapp-label-save");
    const cancel = $("whatsapp-label-cancel");
    const help = $("whatsapp-label-name-help");
    if (id) id.value = "";
    if (name) {
      name.value = "";
      name.disabled = false;
    }
    if (color) color.value = "#7e3029";
    if (submit) {
      submit.disabled = false;
      submit.textContent = "Criar etiqueta";
    }
    if (cancel) cancel.hidden = true;
    if (help) help.hidden = true;
  }

  function editWhatsAppLabel(id) {
    const label = state.labels.find((item) => item.id === id);
    if (!label) return;
    $("whatsapp-label-id").value = label.id;
    $("whatsapp-label-name").value = label.name;
    $("whatsapp-label-name").disabled = label.system_managed === true;
    $("whatsapp-label-color").value = labelColor(label.color);
    $("whatsapp-label-save").textContent = "Salvar alterações";
    $("whatsapp-label-save").disabled = false;
    $("whatsapp-label-cancel").hidden = false;
    $("whatsapp-label-name-help").hidden = !label.system_managed;
    $("whatsapp-label-manager-status").textContent = label.system_managed
      ? "Esta etiqueta é usada por uma automação. Você pode mudar a cor, mas o nome fica protegido."
      : "Edite o nome ou a cor e salve.";
    $("whatsapp-label-name").focus();
  }


  async function deleteWhatsAppLabel(id) {
    const label = state.labels.find((item) => item.id === id);
    if (!label || label.system_managed || state.labelDeleteBusyIds.has(id)) return;
    const confirmed = window.confirm(
      "Excluir a etiqueta “" + label.name + "”? Ela deixará de aparecer nos filtros e conversas. O histórico das associações será preservado."
    );
    if (!confirmed) return;

    state.labelDeleteBusyIds.add(id);
    renderLabelManagerList();
    const status = $("whatsapp-label-manager-status");
    status.textContent = "Excluindo etiqueta…";
    try {
      await request("whatsapp_label_deactivate", { id });
      state.labels = state.labels.filter((item) => item.id !== id);
      const filter = $("whatsapp-conversation-label-filter");
      if (filter?.value === id) filter.value = "";
      const editingId = $("whatsapp-label-id").value.trim();
      if (editingId === id) resetLabelForm();
      if (state.selectedConversation) {
        state.selectedConversation = {
          ...state.selectedConversation,
          manual_label_ids: (state.selectedConversation.manual_label_ids || []).filter((labelId) => labelId !== id),
          labels: (state.selectedConversation.labels || []).filter((item) => item.id !== id),
        };
      }
      for (const conversation of state.conversations) {
        conversation.manual_label_ids = (conversation.manual_label_ids || []).filter((labelId) => labelId !== id);
        conversation.labels = (conversation.labels || []).filter((item) => item.id !== id);
      }
      renderLabelFilter();
      renderLabelManagerList();
      renderConversationLabelEditor();
      const list = $("whatsapp-conversation-items");
      if (list) {
        const scrollTop = list.scrollTop;
        renderQueue(state.conversations, false);
        list.scrollTop = scrollTop;
      }
      await loadConversations();
      status.textContent = "Etiqueta excluída. O histórico das associações foi preservado.";
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : "Não foi possível excluir a etiqueta.";
    } finally {
      state.labelDeleteBusyIds.delete(id);
      renderLabelManagerList();
    }
  }

  async function saveWhatsAppLabel(event) {
    event.preventDefault();
    if (state.labelSaveBusy) return;
    const id = $("whatsapp-label-id").value.trim();
    const name = $("whatsapp-label-name").value.trim();
    const color = $("whatsapp-label-color").value;
    if (!name && !id) {
      $("whatsapp-label-manager-status").textContent = "Digite um nome para a etiqueta.";
      $("whatsapp-label-name").focus();
      return;
    }
    const submit = $("whatsapp-label-save");
    state.labelSaveBusy = true;
    submit.disabled = true;
    submit.textContent = id ? "Salvando…" : "Criando…";
    try {
      const result = await request("whatsapp_label_save", { id, name, color });
      const saved = result.label;
      if (!saved?.id) throw new Error("O servidor não retornou a etiqueta salva.");
      const position = state.labels.findIndex((label) => label.id === saved.id);
      if (position >= 0) state.labels[position] = saved;
      else state.labels.push(saved);
      state.labels.sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0) || a.name.localeCompare(b.name, "pt-BR"));
      state.labelsLoaded = true;
      renderLabelFilter();
      renderLabelManagerList();
      renderConversationLabelEditor();
      const list = $("whatsapp-conversation-items");
      if (list) {
        const scrollTop = list.scrollTop;
        renderQueue(state.conversations, false);
        list.scrollTop = scrollTop;
      }
      resetLabelForm();
      $("whatsapp-label-manager-status").textContent = id ? "Etiqueta atualizada." : "Etiqueta criada e disponível nos canais 0975 e 1018.";
    } catch (error) {
      $("whatsapp-label-manager-status").textContent = error instanceof Error ? error.message : "Não foi possível salvar a etiqueta.";
    } finally {
      state.labelSaveBusy = false;
      submit.disabled = false;
      submit.textContent = $("whatsapp-label-id").value ? "Salvar alterações" : "Criar etiqueta";
    }
  }

  async function openLabelManager() {
    const dialog = $("whatsapp-label-manager-dialog");
    if (!dialog) return;
    await loadLabelCatalog({ force: true });
    renderLabelManagerList();
    if (!dialog.open) dialog.showModal();
  }

  async function saveConversationLabelsFromCheckbox(checkbox) {
    const conversationId = state.selectedId;
    const labelId = checkbox.dataset.whatsappLabelId || "";
    if (!conversationId || !labelId || state.labelBusyConversations.has(conversationId)) return;
    const conversation = state.selectedConversation || {};
    const automaticIds = new Set((conversation.auto_label_ids || []).map(String));
    if (automaticIds.has(labelId)) return;
    const previousManualIds = Array.from(conversation.manual_label_ids || []).map(String);
    const manualIds = new Set(previousManualIds);
    if (checkbox.checked) manualIds.add(labelId);
    else manualIds.delete(labelId);
    state.labelBusyConversations.add(conversationId);
    state.selectedConversation = { ...conversation, manual_label_ids: Array.from(manualIds) };
    const status = $("whatsapp-conversation-label-status");
    let statusMessage = "";
    renderConversationLabelEditor();
    status.textContent = "Salvando etiquetas…";
    try {
      const data = await request("whatsapp_conversation_labels_set", {
        conversation_id: conversationId,
        label_ids: Array.from(manualIds),
      });
      const listed = state.conversations.find((item) => item.id === conversationId);
      if (listed) Object.assign(listed, data);
      if (state.selectedId === conversationId) {
        state.selectedConversation = { ...(state.selectedConversation || {}), ...data };
        statusMessage = "Etiquetas salvas nesta conversa.";
      }
      if ($("whatsapp-conversation-label-filter").value) {
        await loadConversations();
      } else if (listed) {
        const list = $("whatsapp-conversation-items");
        const scrollTop = list.scrollTop;
        renderQueue(state.conversations, false);
        list.scrollTop = scrollTop;
      }
    } catch (error) {
      if (state.selectedId === conversationId) {
        state.selectedConversation = {
          ...(state.selectedConversation || {}),
          manual_label_ids: previousManualIds,
        };
        statusMessage = error instanceof Error ? error.message : "Não foi possível salvar as etiquetas.";
      }
    } finally {
      state.labelBusyConversations.delete(conversationId);
      if (state.selectedId === conversationId) {
        renderConversationLabelEditor();
        if (statusMessage) status.textContent = statusMessage;
      }
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
      const displayName = item.customer_name || item.whatsapp_profile_name || "";
      title.textContent = displayName
        ? displayName + (!item.customer_name && item.whatsapp_profile_name ? " · WhatsApp" : "") + (item.phone_last4 ? " · •••• " + item.phone_last4 : "")
        : item.phone_last4 ? "Contato · •••• " + item.phone_last4 : "Contato";
      const meta = document.createElement("span");
      meta.textContent = conversationMetaText(item);
      const date = document.createElement("small");
      date.textContent = dateLabel(item.last_activity_at);
      button.append(title, meta, date);
      appendConversationLabelBadges(button, item);
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
      conversation.order_origin = conversation.is_in_orders
        ? conversation.automatic_order_origin || "manual"
        : "";
      if (conversation.is_in_orders) conversation.is_interested = false;
      const isInOrders = conversation.is_in_orders;
      const meta = button.closest(".whatsapp-conversation-item")?.querySelector(".whatsapp-conversation-card span");
      if (meta) meta.textContent = conversationMetaText(conversation);
      button.textContent = isInOrders ? "−" : "+";
      button.title = isInOrders ? "Remover da aba Pedidos" : "Adicionar à aba Pedidos";
      button.setAttribute("aria-label", button.title);
      button.setAttribute("aria-pressed", String(isInOrders));
      if ((!isInOrders && state.quickFilter === "orders") || (isInOrders && state.quickFilter === "interested")) {
        button.closest(".whatsapp-conversation-item")?.remove();
        state.conversations = state.conversations.filter((item) => item.id !== conversationId);
        state.firstPageIds.delete(conversationId);
        state.total = Math.max(0, state.total - 1);
        setStatus(state.quickFilter === "interested"
          ? state.total + " conversa(s) com sinal de interesse nas últimas 48 horas."
          : state.total + " conversa(s) na aba Pedidos das últimas 28 horas.");
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

  async function toggleSelectedConversationAna() {
    const conversationId = state.selectedId;
    const conversation = state.selectedConversation;
    if (!conversationId || !conversation || state.anaModeBusyIds.has(conversationId)) return;
    const enabled = String(conversation.mode || "").toLowerCase() === "paused";
    if (!enabled && !window.confirm("Desligar a ANA permanentemente nesta conversa? Ela continuará desligada até você reativá-la manualmente.")) return;

    state.anaModeBusyIds.add(conversationId);
    const toggle = $("whatsapp-conversation-ana-toggle");
    if (toggle) toggle.disabled = true;
    try {
      const data = await request("whatsapp_conversation_ana_mode", { conversation_id: conversationId, enabled });
      if (state.selectedId === conversationId) {
        state.selectedConversation = { ...conversation, ...data, id: conversationId };
      }
      const listed = state.conversations.find((item) => item.id === conversationId);
      if (listed) Object.assign(listed, data);
      const host = $("whatsapp-conversation-items");
      const scrollTop = host.scrollTop;
      renderQueue(state.conversations, false);
      host.scrollTop = scrollTop;
      if (state.selectedId === conversationId) renderHeader(data);
      setStatus(enabled
        ? "ANA reativada manualmente nesta conversa."
        : "ANA desligada permanentemente nesta conversa; a reativação será manual.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Não foi possível alterar a ANA desta conversa.");
    } finally {
      state.anaModeBusyIds.delete(conversationId);
      if (state.selectedId === conversationId) renderHeader(state.selectedConversation || {});
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
        title.textContent = code === "media_not_cached" || code === "media_not_available" ? "Mídia indisponível" : "Tentar novamente";
        hint.textContent = code === "media_not_available" && error instanceof Error
          ? error.message
          : code === "media_not_cached"
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
    const customerName = conversation.customer_name || selected.customer_name || conversation.whatsapp_profile_name || selected.whatsapp_profile_name || "";
    const channelName = conversation.channel || selected.channel || "WhatsApp";
    const channelNumber = conversation.channel_number || selected.channel_number || "";
    const profileNameOnly = !conversation.customer_name && !selected.customer_name && Boolean(conversation.whatsapp_profile_name || selected.whatsapp_profile_name);
    $("whatsapp-conversation-title").textContent = (customerName || "Contato") + (profileNameOnly ? " · WhatsApp" : "") + (phoneLast4 ? " · •••• " + phoneLast4 : "");
    const mode = String(conversation.mode || selected.mode || "").toLowerCase();
    const anaPaused = mode === "paused";
    const stateLabel = anaPaused
      ? "ANA desligada nesta conversa"
      : conversation.human_required ? "Precisa de atendimento humano" : [conversation.mode, conversation.status, conversation.stage].filter(Boolean).join(" · ");
    const channel = channelName + (channelNumber ? " · Canal " + channelNumber : "");
    $("whatsapp-conversation-subtitle").textContent = channel + " · " + (stateLabel || "Conversa");
    const anaToggle = $("whatsapp-conversation-ana-toggle");
    if (anaToggle) {
      anaToggle.hidden = false;
      anaToggle.disabled = state.anaModeBusyIds.has(String(conversation.id || selected.id || state.selectedId));
      anaToggle.textContent = anaPaused ? "Reativar ANA" : "Desligar ANA";
      anaToggle.title = anaPaused ? "Reativar a ANA manualmente nesta conversa" : "Desligar a ANA permanentemente nesta conversa";
      anaToggle.setAttribute("aria-label", anaToggle.title);
      anaToggle.setAttribute("aria-pressed", String(anaPaused));
    }
    $("whatsapp-conversation-header").hidden = false;
    $("whatsapp-conversation-empty").hidden = true;
    renderConversationLabelEditor();
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
        label_id: $("whatsapp-conversation-label-filter")?.value || "",
      });
      if (requestId !== state.listRequestId) return;
      state.favoritesAvailable = data.favorites_available === true;
      state.ordersAvailable = data.orders_available === true;
      const incoming = Array.isArray(data.items) ? data.items : [];
      if (silent) {
        const incomingIds = new Set(incoming.map((item) => String(item.id)));
        const scrollTop = host.scrollTop;
        if (["orders", "interested"].includes(state.quickFilter) && Array.isArray(data.filter_ids)) {
          const filterIds = new Set(data.filter_ids.map((id) => String(id)));
          const olderPages = state.conversations.filter((item) =>
            filterIds.has(String(item.id)) && !incomingIds.has(String(item.id)),
          );
          state.conversations = [...incoming, ...olderPages];
          state.firstPageIds = incomingIds;
          state.cursor = data.next_cursor || null;
        } else {
          state.conversations = [
            ...incoming,
            ...state.conversations.filter((item) => !incomingIds.has(String(item.id))),
          ];
          state.cursor = state.cursor || data.next_cursor || null;
        }
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
        state.firstPageIds = new Set(incoming.map((item) => String(item.id)));
        state.cursor = data.next_cursor || null;
        state.total = data.total || 0;
        renderQueue(incoming, false);
      }
      $("whatsapp-conversation-more").hidden = !state.cursor;
      if (!silent) {
        const label = state.quickFilter === "orders"
          ? state.total + " conversa(s) com pedido nas últimas 28 horas."
          : state.quickFilter === "interested"
            ? state.total + " conversa(s) com sinal de interesse nas últimas 48 horas."
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

  function updateOlderMessagesButton({ visible = true, loading = false, failed = false } = {}) {
    const button = $("whatsapp-conversation-older");
    if (!button) return;
    const hasOlder = Boolean(state.before);
    button.hidden = !visible;
    button.disabled = !visible || loading || !hasOlder;
    button.textContent = loading
      ? "Carregando mensagens anteriores…"
      : failed && hasOlder
        ? "Tentar carregar mensagens anteriores"
        : hasOlder
          ? "Carregar mensagens anteriores"
          : "Não há mensagens anteriores";
    button.title = hasOlder
      ? "Carregar mensagens mais antigas desta conversa"
      : "Esta conversa não tem mensagens mais antigas para carregar";
  }

  async function loadConversation(id, { older = false } = {}) {
    if (!id || (older && (state.olderLoading || state.conversationLoading))) return;
    const requestId = older ? state.conversationRequestId : ++state.conversationRequestId;
    const targetBefore = older ? state.before : null;
    let olderFailed = false;
    if (!older) {
      if (state.selectedId) state.drafts.set(state.selectedId, $("whatsapp-conversation-draft").value);
      state.selectedId = id;
      state.selectedConversation = state.conversations.find((item) => item.id === id) || null;
      state.conversationLoading = true;
      state.before = null;
      updateOlderMessagesButton({ visible: false });
      $("whatsapp-conversation-header").hidden = true;
      $("whatsapp-conversation-label-editor").hidden = true;
      $("whatsapp-conversation-compose").hidden = false;
      $("whatsapp-conversation-draft").value = state.drafts.get(id) || "";
      clearSelectedMedia();
      $("whatsapp-conversation-empty").hidden = false;
      $("whatsapp-conversation-empty").innerHTML = "<strong>Carregando conversa…</strong><span>As mensagens serão abertas quando você selecionar uma conversa.</span>";
      $("whatsapp-conversation-messages").replaceChildren();
      for (const button of document.querySelectorAll(".whatsapp-conversation-card")) {
        button.setAttribute("aria-pressed", String(button.dataset.conversationId === id));
      }
      syncComposer();
    } else {
      state.olderLoading = true;
      updateOlderMessagesButton({ visible: true, loading: true });
    }
    try {
      const data = await request("whatsapp_conversation_messages", {
        conversation_id: id,
        before_created_at: targetBefore?.created_at || "",
        before_id: targetBefore?.id || "",
      });
      if (state.selectedId !== id || requestId !== state.conversationRequestId) return;
      state.selectedConversation = { ...(state.selectedConversation || {}), ...(data.conversation || {}) };
      renderHeader(data.conversation || {});
      renderMessages(data.messages || [], older);
      if (!older) {
        $("whatsapp-conversation-compose").hidden = false;
        setComposerStatus("Envio sujeito à janela de 24 horas e à homologação do canal.", "neutral");
      }
      state.before = data.next_before || null;
      updateOlderMessagesButton({ visible: true });
      setStatus("Histórico carregado.");
    } catch (error) {
      if (state.selectedId !== id || requestId !== state.conversationRequestId) return;
      if (!older) {
        $("whatsapp-conversation-empty").textContent = error instanceof Error ? error.message : "Não foi possível abrir esta conversa.";
        $("whatsapp-conversation-empty").hidden = false;
      } else {
        olderFailed = true;
        setStatus(error instanceof Error ? error.message : "Não foi possível carregar mensagens anteriores.");
      }
    } finally {
      if (older) {
        state.olderLoading = false;
        if (state.selectedId === id && requestId === state.conversationRequestId) {
          updateOlderMessagesButton({ visible: true, failed: olderFailed });
        }
      } else if (requestId === state.conversationRequestId) {
        state.conversationLoading = false;
        syncComposer();
      }
    }
  }
  async function checkPendingSend() {
    const conversationId = state.selectedId;
    const pending = state.uncertainSends.get(conversationId);
    if (!conversationId || !pending || state.statusCheckingIds.has(conversationId)) return;
    state.statusCheckingIds.add(conversationId);
    syncComposer();
    setComposerStatus("Conferindo o status do envio…", "neutral");
    try {
      const result = await request("whatsapp_conversation_send_status", {
        conversation_id: conversationId,
        idempotency_key: pending.key,
      });
      const status = String(result.status || "unknown").toLowerCase();
      if (status === "sent" || status === "delivered" || status === "read") {
        const matchingMedia = state.pendingMediaFingerprint === pending.fingerprint;
        state.uncertainSends.delete(conversationId);
        if (state.pendingTextByConversation.get(conversationId)?.key === pending.key) state.pendingTextByConversation.delete(conversationId);
        if (state.pendingMediaKey === pending.key) {
          state.pendingMediaKey = "";
          state.pendingMediaFingerprint = "";
        }
        if (state.drafts.get(conversationId)?.trim() === pending.text) state.drafts.set(conversationId, "");
        if (state.selectedId === conversationId) {
          const draft = $("whatsapp-conversation-draft");
          if (draft.value.trim() === pending.text) draft.value = "";
          if (pending.type === "media" && matchingMedia) clearSelectedMedia();
          state.drafts.set(conversationId, draft.value);
          setComposerStatus("Envio confirmado. O histórico será atualizado.", "success");
          setStatus("Envio confirmado. Atualizando o histórico…");
          syncComposer();
          await loadConversation(conversationId);
        }
      } else if (status === "failed" || status === "rejected") {
        state.uncertainSends.delete(conversationId);
        if (state.pendingTextByConversation.get(conversationId)?.key === pending.key) state.pendingTextByConversation.delete(conversationId);
        if (state.pendingMediaKey === pending.key) {
          state.pendingMediaKey = "";
          state.pendingMediaFingerprint = "";
        }
        if (state.selectedId === conversationId) setComposerStatus("O envio falhou e não foi confirmado. Revise e tente novamente.", "error");
      } else if (state.selectedId === conversationId) {
        setComposerStatus(status === "not_found"
          ? "Ainda não foi possível localizar o envio. Mantenha esta conversa aberta e confira novamente."
          : "O envio continua em processamento. Confira novamente em instantes.", "error");
      }
    } catch (error) {
      if (state.selectedId === conversationId) setComposerStatus(error instanceof Error ? error.message : "Não foi possível verificar o envio.", "error");
    } finally {
      state.statusCheckingIds.delete(conversationId);
      syncComposer();
    }
  }

  $("whatsapp-conversation-compose")?.addEventListener("submit", sendConversationText);
  $("whatsapp-conversation-send-media")?.addEventListener("click", sendConversationMedia);
  $("whatsapp-conversation-check-send")?.addEventListener("click", checkPendingSend);
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
    if (state.selectedId) state.drafts.set(state.selectedId, $("whatsapp-conversation-draft").value);
    const pending = state.pendingTextByConversation.get(state.selectedId);
    if (pending && pending.text !== text && !state.sendingTextIds.has(state.selectedId) && !state.uncertainSends.has(state.selectedId)) {
      state.pendingTextByConversation.delete(state.selectedId);
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
  $("whatsapp-conversation-label-filter")?.addEventListener("change", () => loadConversations());
  $("whatsapp-label-manage")?.addEventListener("click", () => { void openLabelManager(); });
  $("whatsapp-label-manager-close")?.addEventListener("click", () => $("whatsapp-label-manager-dialog").close());
  $("whatsapp-label-manager-dialog")?.addEventListener("click", (event) => {
    if (event.target === $("whatsapp-label-manager-dialog")) $("whatsapp-label-manager-dialog").close();
  });
  $("whatsapp-label-form")?.addEventListener("submit", saveWhatsAppLabel);
  $("whatsapp-label-cancel")?.addEventListener("click", () => {
    resetLabelForm();
    $("whatsapp-label-manager-status").textContent = "Edição cancelada.";
  });
  $("whatsapp-label-manager-dialog")?.addEventListener("close", resetLabelForm);
  $("whatsapp-conversation-label-options")?.addEventListener("change", (event) => {
    const checkbox = event.target.closest("input[data-whatsapp-label-id]");
    if (checkbox) void saveConversationLabelsFromCheckbox(checkbox);
  });
  $("whatsapp-conversation-more")?.addEventListener("click", () => loadConversations({ append: true }));
  $("whatsapp-conversation-older")?.addEventListener("click", () => state.selectedId && loadConversation(state.selectedId, { older: true }));
  $("whatsapp-conversation-ana-toggle")?.addEventListener("click", () => void toggleSelectedConversationAna());
  document.querySelectorAll("[data-conversation-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.quickFilter = button.dataset.conversationView || "all";
      document.querySelectorAll("[data-conversation-view]").forEach((tab) => {
        tab.setAttribute("aria-pressed", String(tab === button));
      });
      void loadConversations();
    });
  });
  const refreshCrmQueue = () => {
    const app = $("admin-app");
    const conversationsPanel = $("whatsapp-section-conversations");
    if (document.visibilityState !== "visible"
      || !app
      || app.hidden
      || !conversationsPanel
      || conversationsPanel.hidden
      || !conversationsPanel.getClientRects().length
      || !["orders", "interested"].includes(state.quickFilter)
      || state.listLoading
      || state.conversationLoading) return;
    void loadConversations({ silent: true });
  };
  window.setInterval(refreshCrmQueue, 5 * 60 * 1000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refreshCrmQueue();
  });
  let conversationDetailPlaceholder = null;
  let conversationDetailNode = null;

  function restoreConversationDetail() {
    const placeholder = conversationDetailPlaceholder;
    if (placeholder?.parentNode && conversationDetailNode) {
      placeholder.parentNode.insertBefore(conversationDetailNode, placeholder);
      placeholder.remove();
    }
    conversationDetailPlaceholder = null;
    conversationDetailNode = null;
  }

  function setConversationSheetEmpty(title, detailText) {
    $("whatsapp-conversation-header").hidden = true;
    $("whatsapp-conversation-label-editor").hidden = true;
    $("whatsapp-conversation-compose").hidden = true;
    updateOlderMessagesButton({ visible: false });
    $("whatsapp-conversation-messages").replaceChildren();
    const empty = $("whatsapp-conversation-empty");
    empty.replaceChildren();
    const heading = document.createElement("strong");
    heading.textContent = title;
    const detail = document.createElement("span");
    detail.textContent = detailText;
    empty.append(heading, detail);
    empty.hidden = false;
  }

  async function openOrderConversation({
    conversationId = "",
    phone = "",
    orderNumber = "",
    customerName = "",
  } = {}) {
    const dialog = $("order-conversation-sheet");
    const slot = $("order-conversation-sheet-slot");
    const detail = document.querySelector(".whatsapp-conversation-detail");
    if (!dialog || !slot || !detail) return false;
    if (detail.parentElement !== slot && !conversationDetailPlaceholder) {
      conversationDetailPlaceholder = document.createComment("whatsapp conversation detail position");
      detail.parentNode?.insertBefore(conversationDetailPlaceholder, detail);
      conversationDetailNode = detail;
    }
    slot.append(detail);
    const subtitle = [orderNumber, customerName].filter(Boolean).join(" · ");
    $("order-conversation-sheet-subtitle").textContent = subtitle;
    if (!dialog.open) dialog.showModal();

    state.quickFilter = "all";
    $("whatsapp-conversation-filter").value = "all";
    $("whatsapp-conversation-label-filter").value = "";
    void loadLabelCatalog();
    document.querySelectorAll("[data-conversation-view]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.conversationView === "all"));
    });

    const id = String(conversationId || "").trim();
    if (id) {
      $("whatsapp-conversation-search").value = "";
      await loadConversation(id);
      return true;
    }

    const digits = String(phone || "").replace(/\D/g, "");
    if (digits.length < 4) {
      setConversationSheetEmpty("Conversa não disponível", "Este pedido não tem uma conversa ou número de telefone vinculado.");
      return false;
    }
    if (state.selectedId) state.drafts.set(state.selectedId, $("whatsapp-conversation-draft").value);
    state.selectedId = "";
    state.selectedConversation = null;
    $("whatsapp-conversation-search").value = digits;
    $("whatsapp-conversation-compose").hidden = true;
    $("whatsapp-conversation-header").hidden = true;
    $("whatsapp-conversation-messages").replaceChildren();
    const empty = $("whatsapp-conversation-empty");
    empty.hidden = false;
    empty.innerHTML = "<strong>Localizando conversa…</strong><span>Buscando este número na sessão de mensagens.</span>";
    await loadConversations();
    const match = state.conversations[0];
    if (match?.id) {
      await loadConversation(match.id);
      return true;
    }
    setConversationSheetEmpty("Conversa não encontrada", "Não há uma conversa deste número na sessão Mensagens.");
    return false;
  }

  async function openConversation(id, options = {}) {
    return await openOrderConversation({ conversationId: id, ...options });
  }

  const orderConversationSheet = $("order-conversation-sheet");
  orderConversationSheet?.querySelector("[data-order-conversation-close]")?.addEventListener("click", () => orderConversationSheet.close());
  orderConversationSheet?.addEventListener("click", (event) => {
    if (event.target === orderConversationSheet) orderConversationSheet.close();
  });
  orderConversationSheet?.addEventListener("close", restoreConversationDetail);

  window.DonaWhatsAppConversations = {
    load: async () => {
      await loadLabelCatalog();
      return await loadConversations();
    },
    openConversation,
    openOrderConversation,
  };
})();
