(() => {
  "use strict";

  const config = window.DONA_SITE_CONFIG || {};
  const supabase = String(config.supabaseUrl || "").replace(/\/$/, "");
  const key = config.publishableKey || "";
  const endpoint = supabase + "/functions/v1/site-order-message-admin-v1";
  const $ = (id) => document.getElementById(id);
  const state = { loaded: false, busy: false, metaReady: false, dirty: false, channels: [], metaResults: {}, submissionResults: {} };

  const esc = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[ch]);
  const statusLabel = (value) => ({
    APPROVED: "Aprovado pela Meta", PENDING: "Em análise pela Meta", PENDING_REVIEW: "Em análise pela Meta",
    REJECTED: "Reprovado pela Meta", PAUSED: "Pausado na Meta", DISABLED: "Desativado na Meta",
    DELETED: "Removido na Meta", IN_APPEAL: "Em recurso na Meta", FLAGGED: "Sinalizado pela Meta",
    UNKNOWN: "Status ainda não sincronizado"
  })[String(value || "UNKNOWN").toUpperCase()] || String(value || "Status desconhecido");

  function formatMetaTime(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Cuiaba" }).format(date);
  }

  function updateDraftEditorState() {
    const node = $("order-message-draft-state");
    if (!node) return;
    node.textContent = state.dirty
      ? "Há alterações no editor que ainda não foram salvas como rascunho."
      : "O texto do editor é o rascunho salvo. Os cartões abaixo mostram se cada versão foi enviada, aprovada e está em uso.";
  }
  async function api(action, method, body) {
    const url = new URL(endpoint);
    url.searchParams.set("action", action);
    const headers = { apikey: key };
    const init = { method: method || "GET", headers, cache: "no-store" };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    const response = await fetch(url.toString(), init);
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) throw new Error(data.error || "Não foi possível atualizar.");
    return data;
  }

  function toast(message) {
    const node = $("admin-toast");
    node.textContent = message;
    node.classList.add("show");
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => node.classList.remove("show"), 3500);
  }

  function renderChannels(channels) {
    const host = $("order-message-channels");
    state.channels = channels || [];
    host.innerHTML = state.channels.map((channel) => {
      const paused = channel.is_enabled !== true;
      const canActivate = channel.pending_can_activate === true;
      const activeStatus = statusLabel(channel.active_status);
      const hasPending = Boolean(channel.pending_template_name);
      const pendingStatus = hasPending
        ? channel.pending_status ? statusLabel(channel.pending_status) : "Modelo registrado, mas ausente na última consulta à Meta"
        : channel.draft_matches_active ? "Nenhuma versão nova enviada" : "Rascunho salvo · ainda não enviado à Meta";
      const reason = channel.pending_rejection_reason || channel.active_rejection_reason;
      const rejection = reason ? '<p class="message-rejection">Motivo informado pela Meta: ' + esc(reason) + "</p>" : "";
      const draftNote = hasPending
        ? channel.draft_matches_pending
          ? "O rascunho salvo corresponde à versão enviada à Meta."
          : "O rascunho foi alterado depois do envio. A Meta ainda avalia a versão indicada acima."
        : channel.draft_matches_active
          ? "O texto salvo é igual ao modelo em uso."
          : "Este texto está salvo como rascunho e ainda não foi enviado à Meta.";
      const metaResult = state.metaResults[channel.channel] || null;
      const lastCheck = formatMetaTime(channel.meta_checked_at);
      const directCheck = metaResult
        ? metaResult.ok === false
          ? "A consulta direta à Meta falhou" + (formatMetaTime(metaResult.checked_at) ? " às " + formatMetaTime(metaResult.checked_at) : "") + ": " + esc(metaResult.error || "erro desconhecido") + (lastCheck ? ". Último status salvo da Meta: " + lastCheck + "." : ".")
          : "Status consultado diretamente na Meta" + (formatMetaTime(metaResult.checked_at) ? " às " + formatMetaTime(metaResult.checked_at) : "") + "."
        : lastCheck
          ? "Último retorno recebido da Meta: " + lastCheck + ". Clique em “Consultar status na Meta” para atualizar."
          : "Ainda não há retorno salvo da Meta para este número.";
      const submitted = state.submissionResults[channel.channel] || null;
      const submissionNote = submitted
        ? submitted.error
          ? '<p class="message-rejection">Envio para a Meta: falhou (' + esc(submitted.error) + ").</p>"
          : '<p class="message-meta-check">Resposta ao envio: ' + esc(submitted.name || "modelo") + " · " + esc(statusLabel(submitted.status)) + (submitted.sync_pending ? " · aguardando confirmação no catálogo da Meta" : "") + ".</p>"
        : "";
      const activateButton = canActivate
        ? '<button class="button button-primary" type="button" data-message-activate="' + esc(channel.channel) + '">Usar versão aprovada nos próximos envios</button>'
        : "";
      return '<article class="order-message-channel">' +
        '<header><div><h3>' + esc(channel.label) + '</h3><p class="message-switch-state ' + (paused ? "is-paused" : "is-live") + '">' +
        (paused ? "Envio pausado" : "Envio ativo") + "</p></div>" +
        '<button class="button button-outline" type="button" data-message-toggle="' + esc(channel.channel) + '" data-enabled="' + String(!paused) + '">' +
        (paused ? "Retomar envio" : "Pausar envio") + "</button></header>" +
        '<dl class="order-message-status">' +
        "<div><dt>Versão em uso nos pedidos</dt><dd>" + esc(channel.active_template_name || "—") + "</dd><small>Em uso agora · " + esc(activeStatus) + "</small></div>" +
        "<div><dt>Versão enviada à Meta</dt><dd>" + esc(channel.pending_template_name || "—") + "</dd><small>" + esc(pendingStatus) + "</small></div>" +
        "</dl>" +
        '<p class="message-draft-state">' + esc(draftNote) + "</p>" +
        '<p class="message-meta-check">' + directCheck + "</p>" + submissionNote + rejection +
        activateButton + (channel.account_ready ? "" : '<p class="message-rejection">Este número não está configurado como conta ativa no Supabase.</p>') +
        "</article>";
    }).join("");
    host.querySelectorAll("[data-message-toggle]").forEach((button) => {
      button.addEventListener("click", () => setEnabled(button.dataset.messageToggle, button.dataset.enabled !== "true"));
    });
    host.querySelectorAll("[data-message-activate]").forEach((button) => {
      button.addEventListener("click", () => activate(button.dataset.messageActivate));
    });
    updateDraftEditorState();
  }

  function showData(data) {
    state.metaReady = data.meta_ready === true;
    if (data.draft_body && !state.dirty) $("order-message-body").value = data.draft_body;
    $("order-message-meta-status").textContent = data.meta_ready
      ? "Conexão com a Meta disponível."
      : "Conexão com a Meta não configurada no servidor.";
    $("order-message-submit").disabled = !data.meta_ready;
    renderChannels(data.channels);
    updateDraftEditorState();
    state.loaded = true;
  }

  async function load() {
    if (state.busy) return;
    state.busy = true;
    $("order-message-status").textContent = "Carregando configurações…";
    let shouldSync = false;
    try {
      const data = await api("read", "GET");
      showData(data);
      $("order-message-status").textContent = "";
      const stamps = (data.channels || []).map((item) => Date.parse(item.meta_checked_at || "")).filter(Number.isFinite);
      const newest = stamps.length ? Math.max(...stamps) : 0;
      shouldSync = state.metaReady && (!newest || Date.now() - newest > 5 * 60 * 1000);
    } catch (error) {
      $("order-message-status").textContent = "Não foi possível carregar. " + error.message;
    } finally {
      state.busy = false;
    }
    if (shouldSync) syncStatus({ silent: true });
  }
  async function saveDraft() {
    if (state.busy) return;
    state.busy = true;
    const button = $("order-message-save");
    button.disabled = true;
    $("order-message-status").textContent = "Salvando rascunho…";
    try {
      const data = await api("save_draft", "POST", { draft_body: $("order-message-body").value });
      state.dirty = false;
      showData(data);
      $("order-message-status").textContent = "Rascunho salvo. Ele ainda não foi enviado à Meta.";
      toast("Rascunho salvo; ainda não enviado à Meta.");
    } catch (error) {
      $("order-message-status").textContent = error.message;
    } finally {
      state.busy = false;
      button.disabled = false;
    }
  }

  async function submitTemplate() {
    if (state.busy) return;
    state.busy = true;
    const button = $("order-message-submit");
    button.disabled = true;
    button.textContent = "Enviando para a Meta…";
    $("order-message-status").textContent = "Salvando o texto e enviando os modelos dos dois canais para análise.";
    try {
      await api("save_draft", "POST", { draft_body: $("order-message-body").value });
      state.dirty = false;
      const result = await api("submit", "POST", {});
      const results = result.results || [];
      state.submissionResults = Object.fromEntries(results.map((item) => [item.channel, item]));
      showData(result.state);
      const failures = results.filter((item) => item.error);
      const summary = results.map((item) => item.error
        ? item.channel + ": envio recusado (" + item.error + ")"
        : item.channel + ": " + (item.name || "modelo") + " · resposta da Meta " + statusLabel(item.status) + (item.sync_pending ? " · ainda sem confirmação no catálogo" : "")
      );
      $("order-message-status").textContent = failures.length
        ? "Resultado por número: " + summary.join("; ")
        : "Resposta do envio por número: " + summary.join("; ");
    } catch (error) {
      $("order-message-status").textContent = error.message;
    } finally {
      state.busy = false;
      button.textContent = "Enviar para aprovação na Meta";
      button.disabled = !state.metaReady;
    }
  }

  async function syncStatus(options) {
    if (state.busy) return;
    const silent = options && options.silent === true;
    state.busy = true;
    $("order-message-refresh").disabled = true;
    if (!silent) $("order-message-status").textContent = "Consultando o status diretamente nos dois números da Meta…";
    try {
      const result = await api("sync", "POST", {});
      state.metaResults = Object.fromEntries((result.results || []).map((item) => [item.channel, item]));
      showData(result.state);
      const failed = (result.results || []).filter((item) => item.ok === false);
      $("order-message-status").textContent = failed.length
        ? "A consulta direta terminou com falha em: " + failed.map((item) => item.channel + " (" + item.error + ")").join("; ") + ". O último status salvo aparece em cada cartão."
        : "Consulta direta concluída na Meta às " + (formatMetaTime(result.checked_at) || "agora") + ".";
    } catch (error) {
      $("order-message-status").textContent = "Não foi possível consultar a Meta: " + error.message;
    } finally {
      state.busy = false;
      $("order-message-refresh").disabled = false;
    }
  }
  async function setEnabled(channel, enabled) {
    if (state.busy) return;
    state.busy = true;
    try {
      showData(await api("set_enabled", "POST", { channel, is_enabled: enabled }));
      toast(enabled ? "Envio retomado nesse canal." : "Envio pausado nesse canal.");
    } catch (error) {
      $("order-message-status").textContent = error.message;
    } finally {
      state.busy = false;
    }
  }

  async function activate(channel) {
    if (state.busy) return;
    state.busy = true;
    try {
      showData(await api("activate", "POST", { channel }));
      toast("Modelo aprovado ativado para esse canal.");
    } catch (error) {
      $("order-message-status").textContent = error.message;
    } finally {
      state.busy = false;
    }
  }

  $("order-message-body").addEventListener("input", () => { state.dirty = true; updateDraftEditorState(); });
  $("order-message-save").addEventListener("click", saveDraft);
  $("order-message-submit").addEventListener("click", submitTemplate);
  $("order-message-refresh").addEventListener("click", syncStatus);

  window.DonaOrderMessageAdmin = { load };
})();
