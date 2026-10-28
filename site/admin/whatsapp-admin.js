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
      approved: "Aprovado", approved_by_meta: "Aprovado", active: "Ativa", completed: "Concluída",
      failed: "Falhou", pending: "Pendente", submitted: "Enviada para análise", in_review: "Em análise",
      paused: "Pausada", scheduled: "Agendada", draft: "Rascunho", running: "Em andamento",
      sent: "Processada", skipped: "Ignorada", handoff: "Atendimento humano",
      allow: "Permitido", block: "Bloqueado", reply: "Resposta automática",
    };
    const raw = String(value || "").trim();
    return labels[raw.toLowerCase()] || raw.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) || "—";
  }

  function dateLabel(value) {
    if (!value) return "Sem data";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Sem data" : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
  }

  function flag(label, enabled) {
    return `<span class="whatsapp-flag ${enabled ? "on" : "off"}">${esc(label)} · ${enabled ? "ligado" : "desligado"}</span>`;
  }

  function render(data) {
    const channels = Array.isArray(data.channels) ? data.channels : [];
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
      </article>`).join("") : '<p class="whatsapp-overview-empty">Nenhum canal cadastrado.</p>';
    const campaignMarkup = campaigns.length ? campaigns.map((item) => `
      <div class="whatsapp-activity-item"><div><strong>${esc(item.name)}</strong><p class="admin-muted">${esc(item.channel || "Canal não informado")} · ${esc(human(item.status))}</p></div><time>${esc(dateLabel(item.scheduled_for || item.created_at))}</time></div>`).join("") : '<p class="whatsapp-overview-empty">Nenhuma campanha cadastrada.</p>';
    const anaMarkup = ana.length ? ana.map((item) => `
      <div class="whatsapp-activity-item"><div><strong>${esc(human(item.decision || item.status))}</strong><p class="admin-muted">${esc(item.channel || "Canal não informado")} · ${esc(human(item.status))}</p></div><time>${esc(dateLabel(item.created_at))}</time></div>`).join("") : '<p class="whatsapp-overview-empty">Sem decisões recentes da ANA.</p>';
    $("whatsapp-overview").innerHTML = `
      <div class="whatsapp-overview-grid">
        <article class="whatsapp-overview-card"><h3>Modelos</h3><strong class="whatsapp-metric">${esc(data.templates?.approved || 0)} / ${esc(data.templates?.total || 0)}</strong><p class="admin-muted">aprovados pela Meta</p></article>
        <article class="whatsapp-overview-card"><h3>Campanhas</h3><strong class="whatsapp-metric">${esc(data.campaigns?.total || 0)}</strong><p class="admin-muted">cadastradas</p></article>
        <article class="whatsapp-overview-card"><h3>Canais</h3><strong class="whatsapp-metric">${esc(channels.length)}</strong><p class="admin-muted">configurados</p></article>
      </div>
      <section class="whatsapp-overview-card"><h3>Canais e recursos habilitados</h3><div class="whatsapp-channel-list">${channelMarkup}</div></section>
      <div class="whatsapp-overview-grid">
        <section class="whatsapp-overview-card"><h3>Campanhas recentes</h3><div class="whatsapp-activity-list">${campaignMarkup}</div></section>
        <section class="whatsapp-overview-card"><h3>ANA · decisões recentes</h3><div class="whatsapp-activity-list">${anaMarkup}</div></section>
      </div>`;
    $("whatsapp-overview-status").textContent = `Resumo atualizado em ${dateLabel(data.generated_at)}. Os indicadores de envio representam configurações do canal.`;
  }

  async function loadOverview(force) {
    if (loading || (loaded && !force)) return;
    const status = $("whatsapp-overview-status");
    if (!status || !supabase || !publishableKey) return;
    loading = true;
    status.textContent = "Consultando canais e configurações…";
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
      if (!response.ok || data.ok === false) throw new Error(data.message || "Não foi possível carregar o resumo.");
      render(data);
      loaded = true;
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : "Não foi possível carregar o resumo.";
    } finally {
      loading = false;
    }
  }

  document.getElementById("whatsapp-overview-refresh")?.addEventListener("click", () => loadOverview(true));
  window.DonaWhatsAppAdmin = { loadOverview };
})();
