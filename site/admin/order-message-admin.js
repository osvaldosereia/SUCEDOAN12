(() => {
  "use strict";

  const config = window.DONA_SITE_CONFIG || {};
  const supabase = String(config.supabaseUrl || "").replace(/\/$/, "");
  const key = config.publishableKey || "";
  const endpoint = supabase + "/functions/v1/site-order-message-admin-v1";
  const $ = (id) => document.getElementById(id);
  const state = { loaded: false, busy: false, metaReady: false };

  const esc = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[ch]);
  const statusLabel = (value) => ({
    APPROVED: "Aprovado pela Meta",
    PENDING: "Aguardando aprovação da Meta",
    PENDING_REVIEW: "Aguardando aprovação da Meta",
    REJECTED: "Reprovado pela Meta",
    PAUSED: "Pausado pela Meta",
    UNKNOWN: "Status ainda não sincronizado"
  })[String(value || "UNKNOWN").toUpperCase()] || String(value || "Status desconhecido");

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
    host.innerHTML = (channels || []).map((channel) => {
      const paused = channel.is_enabled !== true;
      const canActivate = channel.pending_can_activate === true;
      const accountStatus = channel.account_ready ? "" : '<p class="message-rejection">Este número não está configurado como conta ativa no Supabase.</p>';
      const activeStatus = statusLabel(channel.active_status);
      const pendingStatus = channel.pending_status ? statusLabel(channel.pending_status) : "Sem modelo novo aguardando";
      const rejection = channel.pending_rejection_reason
        ? '<p class="message-rejection">Motivo informado pela Meta: ' + esc(channel.pending_rejection_reason) + "</p>"
        : "";
      const activateButton = canActivate
        ? '<button class="button button-primary" type="button" data-message-activate="' + esc(channel.channel) + '">Ativar modelo aprovado</button>'
        : "";
      return '<article class="order-message-channel">' +
        '<header><div><h3>' + esc(channel.label) + '</h3><p class="message-switch-state ' + (paused ? "is-paused" : "is-live") + '">' +
        (paused ? "Envio pausado" : "Envio ativo") + "</p></div>" +
        '<button class="button button-outline" type="button" data-message-toggle="' + esc(channel.channel) + '" data-enabled="' + String(!paused) + '">' +
        (paused ? "Retomar envio" : "Pausar envio") + "</button></header>" +
        '<dl class="order-message-status">' +
        "<div><dt>Modelo em uso</dt><dd>" + esc(channel.active_template_name) + "</dd><small>" + esc(activeStatus) + "</small></div>" +
        "<div><dt>Próxima versão</dt><dd>" + esc(channel.pending_template_name || "—") + "</dd><small>" + esc(pendingStatus) + "</small></div>" +
        "</dl>" + rejection + accountStatus + activateButton + "</article>";
    }).join("");
    host.querySelectorAll("[data-message-toggle]").forEach((button) => {
      button.addEventListener("click", () => setEnabled(button.dataset.messageToggle, button.dataset.enabled !== "true"));
    });
    host.querySelectorAll("[data-message-activate]").forEach((button) => {
      button.addEventListener("click", () => activate(button.dataset.messageActivate));
    });
  }

  function showData(data) {
    state.metaReady = data.meta_ready === true;
    if (data.draft_body && document.activeElement !== $("order-message-body")) {
      $("order-message-body").value = data.draft_body;
    }
    $("order-message-meta-status").textContent = data.meta_ready
      ? "Conexão com a Meta disponível."
      : "Conexão com a Meta não configurada no servidor.";
    $("order-message-submit").disabled = !data.meta_ready;
    renderChannels(data.channels);
    state.loaded = true;
  }

  async function load() {
    if (state.busy) return;
    state.busy = true;
    $("order-message-status").textContent = "Carregando configurações…";
    try {
      showData(await api("read", "GET"));
      $("order-message-status").textContent = "";
    } catch (error) {
      $("order-message-status").textContent = "Não foi possível carregar. " + error.message;
    } finally {
      state.busy = false;
    }
  }

  async function saveDraft() {
    if (state.busy) return;
    state.busy = true;
    const button = $("order-message-save");
    button.disabled = true;
    $("order-message-status").textContent = "Salvando rascunho…";
    try {
      const data = await api("save_draft", "POST", { draft_body: $("order-message-body").value });
      showData(data);
      $("order-message-status").textContent = "";
      toast("Rascunho salvo.");
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
      const result = await api("submit", "POST", {});
      showData(result.state);
      const results = result.results || [];
      const failures = results.filter((item) => item.error);
      const accepted = results.filter((item) => item.name).length;
      $("order-message-status").textContent = failures.length
        ? "Resultado por canal: " + failures.map((item) => item.channel + " — " + item.error).join("; ")
        : accepted
          ? "Solicitação enviada ou já existente. A Meta ainda precisa aprovar os modelos; atualize o status para acompanhar."
          : "Não foi possível enviar. Atualize o status e confira a configuração.";
    } catch (error) {
      $("order-message-status").textContent = error.message;
    } finally {
      state.busy = false;
      button.textContent = "Enviar para aprovação na Meta";
      button.disabled = !state.metaReady;
    }
  }

  async function syncStatus() {
    if (state.busy) return;
    state.busy = true;
    $("order-message-refresh").disabled = true;
    $("order-message-status").textContent = "Consultando os dois canais na Meta…";
    try {
      const result = await api("sync", "POST", {});
      showData(result.state);
      const failed = (result.results || []).filter((item) => item.ok === false);
      $("order-message-status").textContent = failed.length
        ? "A consulta terminou com erro em um canal. Veja abaixo e tente novamente."
        : "Status atualizado com a Meta.";
    } catch (error) {
      $("order-message-status").textContent = error.message;
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

  $("order-message-save").addEventListener("click", saveDraft);
  $("order-message-submit").addEventListener("click", submitTemplate);
  $("order-message-refresh").addEventListener("click", syncStatus);

  window.DonaOrderMessageAdmin = { load };
})();
