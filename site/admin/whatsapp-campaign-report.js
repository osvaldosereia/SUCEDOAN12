(() => {
  "use strict";

  const config = window.DONA_SITE_CONFIG || {};
  const supabaseUrl = String(config.supabaseUrl || "").replace(/\/$/, "");
  const publishableKey = config.publishableKey || "";
  const esc = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[ch]);
  const count = (value) => Math.max(0, Math.trunc(Number(value) || 0)).toLocaleString("pt-BR");

  function percent(value) {
    const parsed = Number(value);
    return (Number.isFinite(parsed) ? parsed : 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%";
  }

  function dateLabel(value) {
    if (!value) return "Data não informada";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Data não informada" : date.toLocaleString("pt-BR");
  }

  function errorMessage(code) {
    const messages = {
      admin_auth_not_configured: "O código do admin ainda não está configurado no servidor.",
      admin_auth_required: "A sessão do admin expirou. Acesse o admin novamente.",
      admin_code_invalid: "Não foi possível validar sua sessão. Acesse o admin novamente.",
      campaign_not_found: "Esta campanha não foi encontrada.",
      invalid_campaign_id: "A identificação da campanha está inválida.",
      internal_error: "Não foi possível carregar o relatório agora.",
    };
    return messages[String(code || "")] || "Não foi possível carregar o relatório agora.";
  }

  async function fetchReport(campaignId) {
    if (!supabaseUrl || !publishableKey) throw new Error("A configuração do admin está incompleta.");
    const adminCode = window.DonaAdminAuth?.getCode?.() || "";
    if (!adminCode) throw new Error("A sessão do admin expirou. Acesse o admin novamente.");

    const url = new URL(supabaseUrl + "/functions/v1/admin-marketing-campaign-report-v1");
    url.searchParams.set("campaign_id", campaignId);
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: { apikey: publishableKey, "x-admin-code": adminCode },
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) throw new Error(errorMessage(data.error));
    return data;
  }

  function renderReport(panel, data) {
    const campaign = data.campaign || {};
    const summary = data.summary || {};
    const total = Math.max(0, Math.trunc(Number(summary.total) || 0));
    const details = [
      campaign.template_name ? "Modelo: " + campaign.template_name : "",
      campaign.started_at ? "Início: " + dateLabel(campaign.started_at) : "",
    ].filter(Boolean).join(" · ");

    if (!total) {
      panel.innerHTML = '<section class="wa-campaign-report" aria-label="Resultado da campanha">'
        + '<div><h4>Resultado de ' + esc(campaign.name || "campanha") + '</h4>'
        + '<p class="wa-campaign-report-subtitle">' + esc(details || "Envio ainda não iniciado") + '</p></div>'
        + '<p class="wa-campaign-report-empty">Ainda não há envios registrados para esta campanha.</p>'
        + '</section>';
      panel.dataset.loaded = "true";
      return;
    }

    const responseDetail = summary.response_measurement_available === true
      ? percent(summary.response_rate) + " das enviadas · até " + count(summary.response_window_hours || 48) + " h"
      : "Sem horário de envio suficiente para estimar";
    const metrics = [
      ["Destinatários", summary.total, "inclui pendentes e falhas"],
      ["Enviadas", summary.sent, "Aceitas pela Meta: " + count(summary.accepted)],
      ["Entregues", summary.delivered, percent(summary.delivery_rate) + " das enviadas"],
      ["Lidas", summary.read, percent(summary.read_rate) + " das entregues"],
      ["Falhas", summary.failed, "não entregues"],
      ["Clientes que responderam", summary.responses, responseDetail],
    ];
    const cards = metrics.map((item) =>
      '<article class="wa-campaign-report-metric"><span>' + esc(item[0]) + '</span><strong>' + count(item[1]) + '</strong>'
      + (item[2] ? '<small>' + esc(item[2]) + '</small>' : "")
      + '</article>'
    ).join("");
    const deliveryState = "Pendentes: " + count(summary.pending)
      + " · Incertos: " + count(summary.uncertain)
      + " · Ignorados: " + count(summary.skipped);

    panel.innerHTML = '<section class="wa-campaign-report" aria-label="Resultado da campanha">'
      + '<div class="wa-campaign-report-heading"><div><h4>Resultado de ' + esc(campaign.name || "campanha") + '</h4>'
      + '<p class="wa-campaign-report-subtitle">' + esc(details || "Campanha de marketing") + '</p></div>'
      + '<small>Atualizado ' + esc(dateLabel(data.generated_at)) + '</small></div>'
      + '<div class="wa-campaign-report-grid">' + cards + '</div>'
      + '<p class="wa-campaign-report-pending">' + esc(deliveryState) + '</p>'
      + '<p class="wa-campaign-report-note">Entrega e leitura vêm dos status recebidos da Meta. Respostas são estimadas: contam clientes que enviaram mensagem em até 48 horas após o envio; podem incluir outro assunto.</p>'
      + '</section>';
    panel.dataset.loaded = "true";
  }

  function renderError(panel, message) {
    panel.innerHTML = '<p class="wa-campaign-report-error" role="alert">' + esc(message) + '</p>';
    delete panel.dataset.loaded;
  }

  const campaigns = document.getElementById("whatsapp-campaigns-content");
  if (!campaigns) return;

  campaigns.addEventListener("click", async (event) => {
    const target = event.target instanceof Element ? event.target.closest("[data-campaign-report]") : null;
    if (!target || target.disabled) return;
    const campaignId = String(target.dataset.campaignReport || "");
    const row = target.closest(".whatsapp-campaign-row");
    const panel = row?.querySelector("[data-campaign-report-result]");
    if (!campaignId || !panel) return;

    if (target.getAttribute("aria-expanded") === "true") {
      panel.hidden = true;
      target.setAttribute("aria-expanded", "false");
      target.textContent = "Ver resultado";
      return;
    }

    panel.hidden = false;
    target.setAttribute("aria-expanded", "true");
    if (panel.dataset.loaded === "true") {
      target.textContent = "Ocultar resultado";
      return;
    }

    target.disabled = true;
    target.textContent = "Carregando…";
    panel.innerHTML = '<p class="wa-campaign-report-loading" role="status">Carregando resultado da campanha…</p>';
    try {
      renderReport(panel, await fetchReport(campaignId));
      target.textContent = "Ocultar resultado";
    } catch (error) {
      renderError(panel, error instanceof Error ? error.message : "Não foi possível carregar o relatório agora.");
      target.textContent = "Ocultar resultado";
    } finally {
      if (target.isConnected) target.disabled = false;
    }
  });
})();