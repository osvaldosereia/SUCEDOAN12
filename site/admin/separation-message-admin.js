(() => {
  "use strict";

  const config = window.DONA_SITE_CONFIG || {};
  const supabase = String(config.supabaseUrl || "").replace(/\/$/, "");
  const key = config.publishableKey || "";
  const endpoint = supabase + "/functions/v1/site-order-separation-message-admin-v1";
  const $ = (id) => document.getElementById(id);
  const state = {
    kind: "prepared_ok",
    busy: false,
    metaReady: false,
    drafts: { prepared_ok: null, prepared_adjusted: null },
    toastTimer: 0
  };
  const variables = {
    prepared_ok: "{{1}} código do pedido · {{2}} total confirmado · {{3}} link da lista do pedido",
    prepared_adjusted: "{{1}} código do pedido · {{2}} itens em falta · {{3}} valor original · {{4}} abatimento · {{5}} novo total · {{6}} link da lista do pedido"
  };
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

  async function api(action, method, body, kind) {
    const url = new URL(endpoint);
    url.searchParams.set("action", action);
    url.searchParams.set("kind", kind || state.kind);
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
    const host = $("separation-message-channels");
    host.innerHTML = (channels || []).map((channel) => {
      const paused = channel.is_enabled !== true;
      const accountStatus = channel.account_ready ? "" : '<p class="message-rejection">Este número não está configurado como conta ativa no Supabase.</p>';
      const activeStatus = statusLabel(channel.active_status);
      const pendingStatus = channel.pending_status ? statusLabel(channel.pending_status) : "Sem modelo novo aguardando";
      const rejection = channel.pending_rejection_reason
        ? '<p class="message-rejection">Motivo informado pela Meta: ' + esc(channel.pending_rejection_reason) + "</p>"
        : "";
      const activateButton = channel.pending_can_activate === true
        ? '<button class="button button-primary" type="button" data-separation-activate="' + esc(channel.channel) + '">Ativar modelo aprovado</button>'
        : "";
      return '<article class="order-message-channel">' +
        '<header><div><h3>' + esc(channel.label) + '</h3><p class="message-switch-state ' + (paused ? "is-paused" : "is-live") + '">' +
        (paused ? "Envio pausado" : "Envio ativo") + "</p></div>" +
        '<button class="button button-outline" type="button" data-separation-toggle="' + esc(channel.channel) + '" data-enabled="' + String(!paused) + '">' +
        (paused ? "Retomar envio" : "Pausar envio") + "</button></header>" +
        '<dl class="order-message-status">' +
        "<div><dt>Modelo em uso</dt><dd>" + esc(channel.active_template_name) + "</dd><small>" + esc(activeStatus) + "</small></div>" +
        "<div><dt>Próxima versão</dt><dd>" + esc(channel.pending_template_name || "—") + "</dd><small>" + esc(pendingStatus) + "</small></div>" +
        "</dl>" + rejection + accountStatus + activateButton + "</article>";
    }).join("");
    host.querySelectorAll("[data-separation-toggle]").forEach((button) => {
      button.addEventListener("click", () => setEnabled(button.dataset.separationToggle, button.dataset.enabled !== "true"));
    });
    host.querySelectorAll("[data-separation-activate]").forEach((button) => {
      button.addEventListener("click", () => activate(button.dataset.separationActivate));
    });
  }

  function showData(data, resetDraft) {
    state.metaReady = data.meta_ready === true;
    if (resetDraft || typeof state.drafts[state.kind] !== "string") {
      state.drafts[state.kind] = data.draft_body || "";
    }
    if (document.activeElement !== $("separation-message-body") || resetDraft) {
      $("separation-message-body").value = state.drafts[state.kind];
    }
    $("separation-message-variables").textContent = "Variáveis deste modelo: " + variables[state.kind] + ".";
    $("separation-message-meta-status").textContent = data.meta_ready
      ? "Conexão com a Meta disponível."
      : "Conexão com a Meta não configurada no servidor.";
    $("separation-message-submit").disabled = !data.meta_ready;
    renderChannels(data.channels);
  }

  async function load() {
    if (state.busy) return;
    state.busy = true;
    $("separation-message-status").textContent = "Carregando configurações…";
    try {
      showData(await api("read", "GET"));
      $("separation-message-status").textContent = "";
    } catch (error) {
      $("separation-message-status").textContent = "Não foi possível carregar. " + error.message;
    } finally {
      state.busy = false;
    }
  }

  async function saveDraft() {
    if (state.busy) return;
    state.busy = true;
    const button = $("separation-message-save");
    button.disabled = true;
    $("separation-message-status").textContent = "Salvando rascunho…";
    try {
      const data = await api("save_draft", "POST", { draft_body: $("separation-message-body").value });
      showData(data, true);
      $("separation-message-status").textContent = "";
      toast("Rascunho salvo.");
    } catch (error) {
      $("separation-message-status").textContent = error.message;
    } finally {
      state.busy = false;
      button.disabled = false;
    }
  }

  async function submitTemplate() {
    if (state.busy) return;
    state.busy = true;
    const button = $("separation-message-submit");
    button.disabled = true;
    button.textContent = "Enviando para a Meta…";
    $("separation-message-status").textContent = "Salvando o texto e enviando este modelo para análise nos dois números.";
    try {
      const saved = await api("save_draft", "POST", { draft_body: $("separation-message-body").value });
      showData(saved, true);
      const result = await api("submit", "POST", {});
      showData(result.state || result);
      const failures = (result.results || []).filter((item) => item.error);
      const accepted = (result.results || []).filter((item) => item.name).length;
      $("separation-message-status").textContent = failures.length
        ? "Resultado por número: " + failures.map((item) => item.channel + " — " + item.error).join("; ")
        : accepted
          ? "Solicitação enviada ou já existente nos dois números. A Meta ainda precisa aprovar o modelo; atualize o status para acompanhar."
          : "Não foi possível enviar. Atualize o status e confira a configuração.";
    } catch (error) {
      $("separation-message-status").textContent = error.message;
    } finally {
      state.busy = false;
      button.textContent = "Enviar para aprovação na Meta";
      button.disabled = !state.metaReady;
    }
  }

  async function syncStatus() {
    if (state.busy) return;
    state.busy = true;
    $("separation-message-refresh").disabled = true;
    $("separation-message-status").textContent = "Consultando o status nos dois números…";
    try {
      const result = await api("sync", "POST", {});
      showData(result.state || result);
      const failed = (result.results || []).filter((item) => item.ok === false);
      $("separation-message-status").textContent = failed.length
        ? "A consulta terminou com erro em um número. Veja abaixo e tente novamente."
        : "Status atualizado com a Meta.";
    } catch (error) {
      $("separation-message-status").textContent = error.message;
    } finally {
      state.busy = false;
      $("separation-message-refresh").disabled = false;
    }
  }

  async function setEnabled(channel, enabled) {
    if (state.busy) return;
    state.busy = true;
    try {
      showData(await api("set_enabled", "POST", { channel, is_enabled: enabled }));
      toast(enabled ? "Envio retomado nesse número." : "Envio pausado nesse número.");
    } catch (error) {
      $("separation-message-status").textContent = error.message;
    } finally {
      state.busy = false;
    }
  }

  async function activate(channel) {
    if (state.busy) return;
    state.busy = true;
    try {
      showData(await api("activate", "POST", { channel }));
      toast("Modelo aprovado ativado para esse número.");
    } catch (error) {
      $("separation-message-status").textContent = error.message;
    } finally {
      state.busy = false;
    }
  }

  $("separation-message-body").addEventListener("input", () => {
    state.drafts[state.kind] = $("separation-message-body").value;
  });
  document.querySelectorAll("[data-separation-kind]").forEach((button) => {
    button.addEventListener("click", () => {
      if (state.busy || button.dataset.separationKind === state.kind) return;
      state.drafts[state.kind] = $("separation-message-body").value;
      state.kind = button.dataset.separationKind;
      document.querySelectorAll("[data-separation-kind]").forEach((tab) => {
        const active = tab === button;
        tab.classList.toggle("active", active);
        tab.setAttribute("aria-selected", String(active));
      });
      load();
    });
  });
  $("separation-message-save").addEventListener("click", saveDraft);
  $("separation-message-submit").addEventListener("click", submitTemplate);
  $("separation-message-refresh").addEventListener("click", syncStatus);

  window.DonaOrderSeparationMessageAdmin = { load };
})();
