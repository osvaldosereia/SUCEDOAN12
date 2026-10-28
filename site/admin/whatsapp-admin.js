(() => {
  "use strict";
  const config = window.DONA_SITE_CONFIG || {};
  const supabase = String(config.supabaseUrl || "").replace(/\/$/, "");
  const publishableKey = config.publishableKey || "";
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
  let loaded = false;
  let loading = false;

  function human(value) {
    const labels = {
      approved: "Aprovado", approved_by_meta: "Aprovado", meta_approved: "Aprovado",
      active: "Ativa", completed: "Concluída", failed: "Falhou", rejected: "Rejeitado",
      cancelled: "Cancelada", canceled: "Cancelada", pending: "Pendente", submitted: "Enviada para análise",
      in_review: "Em análise", paused: "Pausada", scheduled: "Agendada", draft: "Rascunho",
      running: "Em andamento", processing: "Em processamento", sent: "Processada", skipped: "Ignorada",
      history: "Histórica", draft_saved: "Rascunho salvo", admin_save_draft: "Rascunho salvo",
      admin_publish: "Versão ativada", admin_rollback: "Versão restaurada", admin_set_channel: "Canal atualizado",
      handoff: "Atendimento humano", allow: "Permitido", block: "Bloqueado", reply: "Resposta automática",
      marketing: "Marketing", utility: "Utilidade", authentication: "Autenticação",
    };
    const raw = String(value || "").trim();
    return labels[raw.toLowerCase()] || raw.toLowerCase().replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) || "—";
  }

  function dateLabel(value) {
    if (!value) return "Sem data";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Sem data" : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
  }

  function statusClass(value) {
    const code = String(value || "").toLowerCase();
    if (["approved", "approved_by_meta", "meta_approved"].includes(code)) return "approved";
    if (["active", "completed"].includes(code)) return code;
    if (["failed", "rejected", "cancelled", "canceled"].includes(code)) return code === "failed" ? "failed" : "rejected";
    return "";
  }

  function flag(label, enabled) {
    return '<span class="whatsapp-flag ' + (enabled ? "on" : "off") + '">' + esc(label) + " · " + (enabled ? "ligado" : "desligado") + "</span>";
  }

  function recordRow(title, subtitle, status, when, extra) {
    return '<article class="whatsapp-record-row"><div class="whatsapp-record-main"><h3>' + esc(title || "Registro") + '</h3><p>' + esc(subtitle || "Sem detalhes") + '</p></div><div class="whatsapp-record-side"><span class="whatsapp-record-status ' + statusClass(status) + '">' + esc(human(status)) + '</span>' + (extra ? '<small>' + esc(extra) + '</small>' : "") + '<time>' + esc(dateLabel(when)) + '</time></div></article>';
  }

  function emptyList(message) {
    return '<p class="whatsapp-overview-empty">' + esc(message) + "</p>";
  }

  function campaignSnapshotLabel(item) {
    const snapshot = item.snapshot;
    if (!snapshot) return "Sem snapshot congelado";
    const revision = snapshot.is_current_revision
      ? "Snapshot vigente"
      : "Snapshot da revisão " + (snapshot.campaign_revision || "anterior") + " · campanha na revisão " + (item.revision || "atual");
    const template = [snapshot.template_name, snapshot.template_language, human(snapshot.template_category)].filter(Boolean).join(" · ");
    return [
      revision,
      (snapshot.eligible_count || 0) + " elegíveis de " + (snapshot.found_count || 0) + " encontrados",
      (snapshot.excluded_count || 0) + " excluídos",
      template ? "Modelo: " + template : "",
      "Congelado em " + dateLabel(snapshot.created_at),
    ].filter(Boolean).join(" · ");
  }

  function render(data) {
    const channels = Array.isArray(data.channels) ? data.channels : [];
    const templateItems = Array.isArray(data.templates?.items) ? data.templates.items : [];
    const campaigns = Array.isArray(data.campaigns?.recent) ? data.campaigns.recent : [];
    const ana = Array.isArray(data.ana?.recent) ? data.ana.recent : [];
    const channelMarkup = channels.length ? channels.map((channel) => `
      <article class="whatsapp-channel">
        <div class="whatsapp-channel-head">
          <div><h3>${esc(channel.name)}</h3><p class="admin-muted">${channel.phone_last4 ? `Número terminado em •••• ${esc(channel.phone_last4)}` : "Número não informado"} · Entrada: ${esc(human(channel.inbound_provider))} · Saída: ${esc(human(channel.outbound_provider))}</p></div>
          <small class="admin-muted">Atualizado: ${esc(dateLabel(channel.updated_at))}</small>
        </div>
        <div class="whatsapp-channel-flags">
          ${flag("Captura", channel.capture_enabled)}
          ${flag("Envio habilitado", channel.send_enabled)}
          ${flag("ANA", channel.ana_enabled)}
          ${flag("Campanhas", channel.campaigns_enabled)}
          ${flag("Envio humano", channel.human_send_enabled)}
        </div>
      </article>`).join("") : emptyList("Nenhum canal cadastrado.");
    const campaignSummary = campaigns.slice(0, 6).map((item) => recordRow(item.name, (item.channel || "Canal não informado") + " · " + human(item.status), item.status, item.scheduled_for || item.created_at, item.scheduled_for ? "Agendada" : "Cadastro"));
    const anaSummary = ana.slice(0, 6).map((item) => recordRow(human(item.decision || item.status), (item.channel || "Canal não informado") + " · " + human(item.status), item.status, item.created_at));
    const templatesMarkup = templateItems.length ? templateItems.map((item) => recordRow(
      item.name,
      [item.channel, human(item.category), item.language].filter(Boolean).join(" · "),
      item.status,
      item.last_synced_at || item.updated_at,
      [item.quality_rating ? "Qualidade: " + human(item.quality_rating) : "Sem avaliação de qualidade", item.rejection_reason ? "Motivo da reprovação: " + item.rejection_reason : ""].filter(Boolean).join(" · "),
    )).join("") : emptyList("Nenhum modelo cadastrado.");
    const campaignsMarkup = campaigns.length ? campaigns.map((item) => recordRow(
      item.name,
      (item.channel || "Canal não informado") + (item.scheduled_for ? " · Agendada para " + dateLabel(item.scheduled_for) : ""),
      item.status,
      item.scheduled_for || item.started_at || item.created_at,
      campaignSnapshotLabel(item),
    )).join("") : emptyList("Nenhuma campanha cadastrada.");
    const anaMarkup = ana.length ? ana.map((item) => recordRow(
      human(item.decision || item.status),
      (item.channel || "Canal não informado") + " · " + human(item.status),
      item.status,
      item.created_at,
      "Decisão registrada",
    )).join("") : emptyList("Sem decisões recentes da ANA.");

    $("whatsapp-overview").innerHTML = `
      <div class="whatsapp-overview-grid">
        <article class="whatsapp-overview-card"><h3>Modelos</h3><strong class="whatsapp-metric">${esc(data.templates?.approved || 0)} / ${esc(data.templates?.total || 0)}</strong><p class="admin-muted">aprovados pela Meta</p></article>
        <article class="whatsapp-overview-card"><h3>Campanhas</h3><strong class="whatsapp-metric">${esc(data.campaigns?.total || 0)}</strong><p class="admin-muted">cadastradas</p></article>
        <article class="whatsapp-overview-card"><h3>Canais</h3><strong class="whatsapp-metric">${esc(channels.length)}</strong><p class="admin-muted">configurados</p></article>
      </div>
      <section class="whatsapp-overview-card"><h3>Canais e recursos habilitados</h3><div class="whatsapp-channel-list">${channelMarkup}</div></section>
      <div class="whatsapp-overview-grid">
        <section class="whatsapp-overview-card"><h3>Campanhas recentes</h3><div class="whatsapp-activity-list">${campaignSummary.length ? campaignSummary.join("") : emptyList("Nenhuma campanha cadastrada.")}</div></section>
        <section class="whatsapp-overview-card"><h3>ANA · decisões recentes</h3><div class="whatsapp-activity-list">${anaSummary.length ? anaSummary.join("") : emptyList("Sem decisões recentes da ANA.")}</div></section>
      </div>`;

    const anaEnabled = channels.filter((channel) => channel.ana_enabled).length;
    $("whatsapp-ana-content").innerHTML = `
      <div class="whatsapp-record-summary">
        <article class="whatsapp-overview-card"><h3>Canais com ANA</h3><strong class="whatsapp-metric">${esc(anaEnabled)} / ${esc(channels.length)}</strong><p class="admin-muted">configuração do canal</p></article>
        <article class="whatsapp-overview-card"><h3>Registros</h3><strong class="whatsapp-metric">${esc(data.ana?.total || 0)}</strong><p class="admin-muted">fora de simulação</p></article>
        <article class="whatsapp-overview-card"><h3>Recentes</h3><strong class="whatsapp-metric">${esc(ana.length)}</strong><p class="admin-muted">decisões carregadas</p></article>
      </div>
      <section class="whatsapp-overview-card"><h3>ANA por canal</h3><div class="whatsapp-channel-list">${channels.length ? channels.map((channel) => '<article class="whatsapp-channel"><div class="whatsapp-channel-head"><div><h3>' + esc(channel.name) + '</h3><p class="admin-muted">Entrada: ' + esc(human(channel.inbound_provider)) + ' · Saída: ' + esc(human(channel.outbound_provider)) + '</p></div></div><div class="whatsapp-channel-flags">' + flag("ANA", channel.ana_enabled) + flag("Captura", channel.capture_enabled) + '</div></article>').join("") : emptyList("Nenhum canal cadastrado.")}</div></section>
      <section class="whatsapp-overview-card"><h3>Decisões recentes</h3><div class="whatsapp-record-list">${anaMarkup || emptyList("Sem decisões recentes da ANA.")}</div></section>`;

    $("whatsapp-templates-content").innerHTML = `
      <div class="whatsapp-record-summary">
        <article class="whatsapp-overview-card"><h3>Aprovados pela Meta</h3><strong class="whatsapp-metric">${esc(data.templates?.approved || 0)}</strong><p class="admin-muted">disponíveis no catálogo</p></article>
        <article class="whatsapp-overview-card"><h3>Total cadastrado</h3><strong class="whatsapp-metric">${esc(data.templates?.total || 0)}</strong><p class="admin-muted">modelos encontrados</p></article>
        <article class="whatsapp-overview-card"><h3>Lista carregada</h3><strong class="whatsapp-metric">${esc(templateItems.length)}</strong><p class="admin-muted">mais recentes</p></article>
      </div>
      <section class="whatsapp-overview-card"><h3>Catálogo de modelos</h3><div class="whatsapp-record-list">${templatesMarkup}</div></section>`;

    $("whatsapp-campaigns-content").innerHTML = `
      <div class="whatsapp-record-summary">
        <article class="whatsapp-overview-card"><h3>Campanhas cadastradas</h3><strong class="whatsapp-metric">${esc(data.campaigns?.total || 0)}</strong><p class="admin-muted">registros no Supabase</p></article>
        <article class="whatsapp-overview-card"><h3>Lista carregada</h3><strong class="whatsapp-metric">${esc(campaigns.length)}</strong><p class="admin-muted">mais recentes</p></article>
        <article class="whatsapp-overview-card"><h3>Agendadas</h3><strong class="whatsapp-metric">${esc(campaigns.filter((item) => item.scheduled_for && !["completed", "failed", "cancelled"].includes(String(item.status || "").toLowerCase())).length)}</strong><p class="admin-muted">na lista recente</p></article>
      </div>
      <section class="whatsapp-overview-card"><h3>Campanhas recentes</h3><div class="whatsapp-record-list">${campaignsMarkup}</div></section>`;

    const refreshed = "Dados atualizados em " + dateLabel(data.generated_at) + ". Flags de envio representam configurações do canal; esta consulta não envia mensagens.";
    for (const node of document.querySelectorAll("[data-whatsapp-overview-status]")) node.textContent = refreshed;
  }

  async function loadOverview(force) {
    if (loading || (loaded && !force)) return;
    const status = $("whatsapp-overview-status");
    if (!status || !supabase || !publishableKey) return;
    loading = true;
    for (const node of document.querySelectorAll("[data-whatsapp-overview-status]")) node.textContent = "Consultando dados do WhatsApp…";
    try {
      const response = await fetch(`${supabase}/functions/v1/site-admin-v1`, {
        method: "POST",
        headers: {
          apikey: publishableKey,
          "x-admin-code": window.DonaAdminAuth?.getCode?.() || "",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "whatsapp_overview" }),
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) throw new Error(data.message || data.error || "Não foi possível carregar os dados do WhatsApp.");
      render(data);
      loaded = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível carregar os dados do WhatsApp.";
      for (const node of document.querySelectorAll("[data-whatsapp-overview-status]")) node.textContent = message;
    } finally {
      loading = false;
    }
  }

  function renderAnaAdmin(data) {
    const active = data.active || null;
    const draft = data.draft || null;
    const versions = Array.isArray(data.versions) ? data.versions : [];
    const tests = Array.isArray(data.test_runs) ? data.test_runs : [];
    const events = Array.isArray(data.events) ? data.events : [];
    const latestTest = tests[0] || null;
    const versionRows = versions.length ? versions.map((item) => recordRow(
      "Versão " + (item.version || "—"),
      item.is_active ? "Versão ativa" : "Versão anterior",
      item.is_active ? "active" : "history",
      item.created_at,
    )).join("") : emptyList("Nenhuma versão ativa ou anterior.");
    const eventRows = events.length ? events.map((item) => recordRow(
      human(item.action),
      [item.channel_key, item.draft_revision ? "Rascunho " + item.draft_revision : "", item.version_id ? "Versão registrada" : ""].filter(Boolean).join(" · "),
      item.action,
      item.created_at,
    )).join("") : emptyList("Nenhuma alteração registrada.");
    $("whatsapp-ana-version-content").innerHTML = `
      <div class="whatsapp-record-summary">
        <article class="whatsapp-overview-card"><h3>Versão ativa</h3><strong class="whatsapp-metric">${active?.version ? "v" + esc(active.version) : "—"}</strong><p class="admin-muted">${active ? "Ativada em " + esc(dateLabel(active.created_at)) : "Nenhuma versão ativa"}</p></article>
        <article class="whatsapp-overview-card"><h3>Rascunho</h3><strong class="whatsapp-metric">${draft?.revision ? "r" + esc(draft.revision) : "—"}</strong><p class="admin-muted">${draft ? "Atualizado em " + esc(dateLabel(draft.updated_at)) : "Nenhum rascunho encontrado"}</p></article>
        <article class="whatsapp-overview-card"><h3>Último teste</h3><strong class="whatsapp-metric">${latestTest ? esc(latestTest.passed_count) + " / " + esc((latestTest.passed_count || 0) + (latestTest.failed_count || 0)) : "—"}</strong><p class="admin-muted">${latestTest ? esc(latestTest.failed_count || 0) + " falha(s) · " + esc(dateLabel(latestTest.created_at)) : "Nenhum teste registrado"}</p></article>
      </div>
      <div class="whatsapp-overview-grid">
        <section class="whatsapp-overview-card"><h3>Histórico de versões</h3><div class="whatsapp-record-list">${versionRows}</div></section>
        <section class="whatsapp-overview-card"><h3>Atividade recente</h3><div class="whatsapp-record-list">${eventRows}</div></section>
      </div>`;
    $("whatsapp-ana-status").textContent = "Versões e atividade consultadas em modo somente leitura.";
  }

  let anaLoaded = false;
  let anaLoading = false;
  async function loadAnaStatus(force) {
    if (anaLoading || (anaLoaded && !force)) return;
    if (force) await loadOverview(true);
    else await loadOverview();
    anaLoading = true;
    const status = $("whatsapp-ana-status");
    if (status) status.textContent = "Consultando rascunho, versão ativa e histórico…";
    try {
      const response = await fetch(`${supabase}/functions/v1/site-admin-v1`, {
        method: "POST",
        headers: {
          apikey: publishableKey,
          "x-admin-code": window.DonaAdminAuth?.getCode?.() || "",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "whatsapp_ana_admin_status" }),
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) throw new Error(data.message || data.error || "Não foi possível consultar o status da ANA.");
      renderAnaAdmin(data);
      anaLoaded = true;
    } catch (error) {
      if (status) status.textContent = error instanceof Error ? error.message : "Não foi possível consultar o status da ANA.";
    } finally {
      anaLoading = false;
    }
  }

  document.querySelectorAll("[data-whatsapp-overview-refresh]").forEach((button) => button.addEventListener("click", () => loadOverview(true)));
  $("whatsapp-ana-refresh")?.addEventListener("click", () => loadAnaStatus(true));
  window.DonaWhatsAppAdmin = { loadOverview, loadAnaStatus };
})();
