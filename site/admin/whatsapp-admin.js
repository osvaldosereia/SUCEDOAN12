(() => {
  "use strict";
  const config = window.DONA_SITE_CONFIG || {};
  const supabase = String(config.supabaseUrl || "").replace(/\/$/, "");
  const publishableKey = config.publishableKey || "";
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
  let loaded = false;
  let loading = false;
  let lastOverview = null;
  let latestAnaDryRunDetails = null;
  let campaignVariablePreviewRequest = 0;

  function anaDeliveryStatusLabel(value) {
    const raw = String(value || "").trim().toLowerCase();
    const labels = {
      accepted: "Aceita pela API",
      sent: "Enviada pela Meta",
      delivered: "Entregue",
      read: "Lida",
      failed: "Falhou",
      rejected: "Rejeitada",
      pending: "Pendente",
      queued: "Na fila",
    };
    return labels[raw] || human(value);
  }

  function human(value) {
    const labels = {
      approved: "Aprovado", approved_by_meta: "Aprovado", meta_approved: "Aprovado",
      active: "Ativa", completed: "Concluída", failed: "Falhou", rejected: "Rejeitado",
      cancelled: "Cancelada", canceled: "Cancelada", pending: "Pendente", submitted: "Enviada para análise",
      in_review: "Em análise", paused: "Pausada", scheduled: "Agendada", draft: "Rascunho",
      running: "Em andamento", processing: "Em processamento", sent: "Processada", skipped: "Ignorada",
      history: "Histórica", draft_saved: "Rascunho salvo", admin_save_draft: "Rascunho salvo",
      admin_publish: "Versão ativada", admin_rollback: "Versão restaurada", admin_set_channel: "Canal atualizado",
      handoff: "Atendimento humano", suggest: "Resposta sugerida", no_reply: "Sem resposta",
      human_review_required: "Revisão humana necessária", dynamic_data_requires_confirmation: "Dado dinâmico exige confirmação",
      first_greeting_of_day: "Primeiro cumprimento do dia", admin_trigger_fixed_reply: "Gatilho configurado",
      admin_trigger_handoff: "Gatilho de encaminhamento", human_takeover_during_generation: "Atendimento humano assumiu",
      allow: "Permitido", block: "Bloqueado", reply: "Resposta automática",
      marketing: "Marketing", utility: "Utilidade", authentication: "Autenticação",
    };
    const raw = String(value || "").trim();
    return labels[raw.toLowerCase()] || raw.toLowerCase().replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) || "—";
  }

  function anaReasonLabel(value) {
    const raw = String(value || "").trim();
    if (!raw) return "Motivo não registrado";
    const labels = {
      first_greeting_of_day: "Primeiro cumprimento do dia",
      admin_trigger_fixed_reply: "Gatilho configurado na ANA",
      human_review_required: "Encaminhada para revisão humana",
      dynamic_data_requires_confirmation: "Dado dinâmico precisa de confirmação",
      human_takeover_during_generation: "Atendimento humano assumiu a conversa",
      admin_trigger_handoff: "Gatilho configurado para atendimento humano",
      timeouterror: "Tempo limite de geração excedido",
      openai_http_error: "Falha na geração da resposta",
      meta_accepted_persist_failed: "Confirmação da Meta pendente de persistência",
    };
    const known = labels[raw.toLowerCase()];
    if (known) return known;
    return raw
      .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[e-mail]")
      .replace(/\b(?:\+?\d[\d\s().-]{7,}\d)\b/g, "[telefone]")
      .slice(0, 220);
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
    if (!snapshot) return item.snapshot_lookup_limited
      ? "Não localizado entre os 2.000 snapshots recentes"
      : "Sem snapshot congelado";
    const revision = snapshot.is_current_revision
      ? "Snapshot vigente"
      : "Snapshot da revisão " + (snapshot.campaign_revision || "anterior") + " · campanha na revisão " + (item.revision || "atual");
    const template = [snapshot.template_name, snapshot.template_language, human(snapshot.template_category)].filter(Boolean).join(" · ");
    const currentEvidenceCount = snapshot.currently_verified_consent_count == null ? Number.NaN : Number(snapshot.currently_verified_consent_count);
    const evidenceStatus = Number.isFinite(currentEvidenceCount)
      ? currentEvidenceCount + " opt-ins com evidência individual verificada agora"
      : "Evidência individual atual indisponível";
    return [
      revision,
      (snapshot.eligible_count || 0) + " elegíveis de " + (snapshot.found_count || 0) + " encontrados",
      (snapshot.excluded_count || 0) + " excluídos",
      evidenceStatus,
      template ? "Modelo: " + template : "",
      "Congelado em " + dateLabel(snapshot.created_at),
    ].filter(Boolean).join(" · ");
  }

  function campaignExclusionMarkup(item) {
    const snapshot = item.snapshot;
    if (!snapshot) return "";
    const details = snapshot.exclusion_counts;
    if (!details?.available) {
      return '<small class="whatsapp-campaign-exclusion-muted">Detalhamento por motivo indisponível nesta versão do banco.</small>';
    }
    const count = (value) => String(Math.max(0, Math.trunc(Number(value) || 0)));
    const reasons = [
      ["Opt-out", details.opted_out_count],
      ["Sem evidência individual", details.consent_evidence_unverified_count],
      ["Sem consentimento", details.no_consent_count],
      ["Cadastro inativo", details.inactive_customer_count],
      ["Telefone inválido", details.invalid_phone_count],
      ["Telefone duplicado", details.duplicate_phone_count],
    ];
    const hasReasons = reasons.some(([, value]) => Number(value) > 0);
    if (!hasReasons) {
      return Number(snapshot.excluded_count) > 0
        ? '<small class="whatsapp-campaign-exclusion-muted">Snapshot registra exclusões sem motivo detalhado.</small>'
        : '<small class="whatsapp-campaign-exclusion-muted">Nenhuma exclusão neste snapshot.</small>';
    }
    const chips = reasons.map(([label, value]) => {
      const suppressed = ["Opt-out", "Sem evidência individual"].includes(label) && Number(value) > 0;
      return '<span class="whatsapp-campaign-exclusion-chip' + (suppressed ? " is-suppressed" : "") + '">' + esc(label) + ": " + count(value) + "</span>";
    }).join("");
    return '<div class="whatsapp-campaign-exclusions" aria-label="Motivos de exclusão">' + chips + '</div><small class="whatsapp-campaign-exclusion-muted">Os motivos podem se sobrepor.</small>';
  }

  function campaignDeliveryMarkup(item) {
    const delivery = item.delivery;
    if (!delivery?.available) {
      return '<div class="whatsapp-campaign-statuses"><span class="whatsapp-campaign-status-chip unavailable">Status Meta indisponível</span></div>';
    }
    const count = (value) => String(Math.max(0, Math.trunc(Number(value) || 0)));
    const badges = [
      ["api", "API aceitou " + count(delivery.accepted_count)],
      ["sent", "Meta enviou " + count(delivery.sent_count)],
      ["delivered", "Entregue " + count(delivery.delivered_count)],
      ["read", "Lido " + count(delivery.read_count)],
      ["failed", "Falha " + count(delivery.failed_count)],
    ].map(([kind, label]) => '<span class="whatsapp-campaign-status-chip ' + kind + '">' + esc(label) + "</span>").join("");
    const pending = "Pendentes: " + count(delivery.pending_count)
      + " · Incertos: " + count(delivery.uncertain_count)
      + " · Ignorados: " + count(delivery.skipped_count);
    return '<div class="whatsapp-campaign-statuses" aria-label="Resultados de envio">' + badges + '</div><small class="whatsapp-campaign-delivery-extra">' + esc(pending) + "</small>";
  }


  function campaignLocalDateTimeValue(timestamp) {
    const date = new Date(timestamp);
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 16);
  }

  function campaignActionButton(item, action, label, style = "button-outline") {
    const key = action === "manual_batch" ? ' data-campaign-idempotency-key="' + esc(campaignDraftIdempotencyKey()) + '"' : "";
    return '<button class="button ' + style + '" type="button" data-campaign-action="' + esc(action) + '" data-campaign-id="' + esc(item.id) + '" data-campaign-revision="' + esc(Math.max(0, Math.trunc(Number(item.revision) || 0))) + '"' + key + '>' + esc(label) + "</button>";
  }

  function campaignActionsMarkup(item) {
    const status = String(item.status || "").toLowerCase();
    const revision = Math.max(0, Math.trunc(Number(item.revision) || 0));
    const currentSnapshot = item.snapshot?.is_current_revision === true;
    const actions = [];
    if (["draft", "ready_for_review"].includes(status) && !currentSnapshot) {
      actions.push(campaignActionButton(item, "snapshot", item.snapshot ? "Atualizar snapshot" : "Congelar audiência"));
    }
    if (status === "draft" && currentSnapshot) actions.push(campaignActionButton(item, "review", "Enviar para revisão", "button-primary"));
    if (status === "ready_for_review" && currentSnapshot) {
      actions.push(campaignActionButton(item, "approve", "Aprovar audiência", "button-primary"));
      actions.push(campaignActionButton(item, "draft", "Voltar ao rascunho"));
    }
    const canExecute = item.campaigns_enabled === true && item.send_enabled === true && String(item.execution_mode || "off") !== "off";
    const currentEvidenceCount = Number(item.snapshot?.currently_verified_consent_count);
    const hasCurrentEvidence = Number.isFinite(currentEvidenceCount) && currentEvidenceCount > 0;
    if (status === "approved" && currentSnapshot && canExecute && hasCurrentEvidence) {
      actions.push(campaignActionButton(item, "manual_batch", "Enviar lote de até 10"));
      const min = campaignLocalDateTimeValue(Date.now() + 5 * 60 * 1000);
      actions.push(
        '<label class="whatsapp-campaign-schedule"><span>Agendar a partir de</span><input type="datetime-local" data-campaign-schedule-time data-campaign-id="' + esc(item.id) + '" data-campaign-revision="' + esc(revision) + '" min="' + esc(min) + '"></label>'
        + campaignActionButton(item, "schedule", "Agendar campanha", "button-primary")
      );
    } else if (status === "approved" && currentSnapshot && canExecute) {
      actions.push('<p class="whatsapp-campaign-send-blocked" role="note">Envio bloqueado: o snapshot vigente não tem consentimentos individuais verificados.</p>');
    }
    if (status === "paused" && item.manual_batch_mode === true && canExecute && hasCurrentEvidence) {
      actions.push(campaignActionButton(item, "manual_batch", "Enviar próximo lote (até 10)", "button-primary"));
    } else if (status === "paused" && item.manual_batch_mode === true && canExecute) {
      actions.push('<p class="whatsapp-campaign-send-blocked" role="note">Próximo lote bloqueado: o snapshot vigente não tem consentimentos individuais verificados.</p>');
    }
    if (["scheduled", "running"].includes(status)) actions.push(campaignActionButton(item, "pause", "Pausar"));
    if (["draft", "ready_for_review", "approved", "scheduled", "running", "paused"].includes(status)) {
      actions.push(campaignActionButton(item, "cancel", "Cancelar campanha"));
    }
    if (!actions.length) return "";
    return '<div class="whatsapp-campaign-actions"><div class="whatsapp-campaign-action-buttons">' + actions.join("") + '</div><p class="admin-muted whatsapp-campaign-action-status" data-campaign-action-status role="status" aria-live="polite"></p></div>';
  }

  async function runCampaignAction(button) {
    if (!button || button.disabled || button.dataset.running === "true") return;
    const action = String(button.dataset.campaignAction || "");
    const campaignId = String(button.dataset.campaignId || "");
    const revision = Number(button.dataset.campaignRevision);
    const row = button.closest(".whatsapp-campaign-row");
    const status = row?.querySelector("[data-campaign-action-status]");
    if (!campaignId || !Number.isInteger(revision) || revision < 0 || !row) return;

    let requestAction = "";
    const payload = { campaign_id: campaignId, revision };
    let confirmation = "";
    if (action === "snapshot") {
      requestAction = "whatsapp_campaign_snapshot";
      payload.idempotency_key = campaignDraftIdempotencyKey();
      confirmation = "Isso congela os filtros atuais e grava a lista e as referências dos destinatários no banco de campanhas. Não envia mensagens. Continue somente depois de revisar a prévia e a evidência de consentimento.";
    } else if (action === "review") {
      requestAction = "whatsapp_campaign_transition";
      payload.to_status = "ready_for_review";
      confirmation = "Enviar esta revisão e o snapshot congelado para revisão? Isso não agenda nem envia mensagens.";
    } else if (action === "approve") {
      requestAction = "whatsapp_campaign_transition";
      payload.to_status = "approved";
      const campaign = (lastOverview?.campaigns?.recent || []).find((item) => item.id === campaignId) || {};
      const eligible = Math.max(0, Math.trunc(Number(campaign.snapshot?.eligible_count) || 0)).toLocaleString("pt-BR");
      const excluded = Math.max(0, Math.trunc(Number(campaign.snapshot?.excluded_count) || 0)).toLocaleString("pt-BR");
      confirmation = "Aprovar " + (campaign.name || "esta audiência") + " (" + eligible + " elegíveis; " + excluded + " excluídos) para que possa ser agendada depois? A aprovação não agenda nem envia. O snapshot só considera opt-ins com evidência individual verificável; declarações administrativas ficam excluídas. Revise a origem e as contagens antes de aprovar.";
    } else if (action === "draft") {
      requestAction = "whatsapp_campaign_transition";
      payload.to_status = "draft";
      confirmation = "Retornar esta campanha ao rascunho? O snapshot atual ficará associado à revisão salva.";
    } else if (action === "schedule") {
      requestAction = "whatsapp_campaign_schedule";
      const input = row.querySelector("[data-campaign-schedule-time]");
      const scheduledAt = Date.parse(String(input?.value || ""));
      if (!Number.isFinite(scheduledAt) || scheduledAt < Date.now() + 5 * 60 * 1000) {
        if (status) status.textContent = "Escolha um horário com pelo menos cinco minutos de antecedência.";
        return;
      }
      payload.scheduled_for = new Date(scheduledAt).toISOString();
      const campaign = (lastOverview?.campaigns?.recent || []).find((item) => item.id === campaignId) || {};
      const eligible = Math.max(0, Math.trunc(Number(campaign.snapshot?.eligible_count) || 0)).toLocaleString("pt-BR");
      confirmation = "Agendar " + (campaign.name || "esta campanha") + " para " + new Date(scheduledAt).toLocaleString("pt-BR") + " no canal " + (campaign.channel || "selecionado") + ". O snapshot tem " + eligible + " destinatários aptos. A execução poderá enviar mensagens reais pelo WhatsApp no horário escolhido. O snapshot só envia contatos com evidência individual verificável; confira a origem e o modelo Meta antes de confirmar.";
    } else if (action === "manual_batch") {
      requestAction = "whatsapp_campaign_manual_batch";
      payload.idempotency_key = button.dataset.campaignIdempotencyKey || campaignDraftIdempotencyKey();
      const campaign = (lastOverview?.campaigns?.recent || []).find((item) => item.id === campaignId) || {};
      const mode = String(campaign.execution_mode || "off");
      const modeWarning = mode === "canary"
        ? " O modo canário restringe os destinatários aos telefones de canário autorizados."
        : " O modo atual pode enviar mensagens a clientes elegíveis.";
      confirmation = "Este lote envia imediatamente até 10 mensagens reais pelo modelo Meta para destinatários aptos do snapshot congelado." + modeWarning + " Mensagens aceitas pela Meta não podem ser recolhidas. Cada destinatário será revalidado por evidência individual antes do envio. Confira a origem e confirme apenas se deseja iniciar agora.";
    } else if (action === "pause") {
      requestAction = "whatsapp_campaign_pause";
      confirmation = "Pausar a campanha? Isso interrompe os próximos despachos; mensagens já aceitas pela Meta não podem ser recolhidas.";
    } else if (action === "cancel") {
      requestAction = "whatsapp_campaign_cancel";
      confirmation = "Cancelar a campanha? Despachos ainda pendentes serão cancelados quando possível; mensagens já aceitas pela Meta não podem ser recolhidas.";
    } else {
      return;
    }
    if (!window.confirm(confirmation)) return;

    button.dataset.running = "true";
    row.querySelectorAll("[data-campaign-action], [data-campaign-schedule-time]").forEach((control) => { control.disabled = true; });
    if (status) status.textContent = "Atualizando campanha…";
    try {
      const result = await campaignAdminRequest(requestAction, payload);
      await loadOverview(true);
      if (action === "manual_batch") {
        const updatedRow = Array.from(document.querySelectorAll(".whatsapp-campaign-row"))
          .find((candidate) => candidate.querySelector('[data-campaign-id="' + campaignId + '"]'));
        const updatedStatus = updatedRow?.querySelector("[data-campaign-action-status]");
        if (updatedStatus) {
          if (result.already_processed) updatedStatus.textContent = "Este lote já foi processado; confira os status no histórico.";
          else if (result.status === "no_work") updatedStatus.textContent = "Não havia destinatários aptos pendentes no snapshot.";
          else updatedStatus.textContent = result.claimed_count + " reservados; " + result.accepted_count + " aceitos pela API da Meta; " + result.failed_count + " falhas; " + result.uncertain_count + " incertos.";
        }
      }
    } catch (error) {
      if (status) status.textContent = error instanceof Error ? error.message : "Não foi possível atualizar a campanha.";
    } finally {
      if (button.isConnected) button.dataset.running = "false";
      row.querySelectorAll("[data-campaign-action], [data-campaign-schedule-time]").forEach((control) => { control.disabled = false; });
    }
  }

  function campaignRecordRow(item) {
    const subtitle = (item.channel || "Canal não informado")
      + (item.scheduled_for ? " · Agendada para " + dateLabel(item.scheduled_for) : "");
    const when = item.scheduled_for || item.started_at || item.created_at;
    const requiresConsentReview = ["approved", "scheduled", "running", "paused"].includes(String(item.status || "").toLowerCase())
      && item.snapshot?.is_current_revision === true;
    return '<article class="whatsapp-record-row whatsapp-campaign-row"><div class="whatsapp-record-main">'
      + '<h3>' + esc(item.name || "Campanha") + "</h3><p>" + esc(subtitle) + "</p>"
      + campaignDeliveryMarkup(item)
      + '<small class="whatsapp-campaign-snapshot">' + esc(campaignSnapshotLabel(item)) + "</small>"
      + campaignExclusionMarkup(item)
      + (requiresConsentReview ? '<p class="whatsapp-campaign-consent-warning" role="note"><strong>O envio exige opt-in individual verificável.</strong> Declarações administrativas não comprovam adesão e ficam excluídas. Confira a origem e as contagens antes de aprovar.</p>' : "")
      + (item.id ? '<button class="button button-outline whatsapp-campaign-preview-button" type="button" data-campaign-preview="' + esc(item.id) + '" aria-expanded="false">Prévia do público</button><div class="whatsapp-campaign-preview" data-campaign-preview-result hidden role="status" aria-live="polite"></div>' : "")
      + (item.id ? '<button class="button button-outline whatsapp-campaign-preview-button" type="button" data-campaign-content-preview="' + esc(item.id) + '" aria-expanded="false">Ver conteúdo do modelo</button><div class="whatsapp-campaign-preview whatsapp-campaign-content-preview" data-campaign-content-result hidden role="status" aria-live="polite"></div>' : "")
      + (item.status === "draft" && item.draft_editable ? '<button class="button button-outline whatsapp-campaign-edit-button" type="button" data-campaign-edit="' + esc(item.id) + '">Editar rascunho</button>' : "")
      + campaignActionsMarkup(item)
      + '</div><div class="whatsapp-record-side"><span class="whatsapp-record-status ' + statusClass(item.status) + '">'
      + esc(human(item.status)) + "</span><time>" + esc(dateLabel(when)) + "</time></div></article>";
  }


  async function loadCampaignContentPreview(button) {
    const campaignId = String(button?.dataset?.campaignContentPreview || "");
    const row = button?.closest(".whatsapp-campaign-row");
    const panel = row?.querySelector("[data-campaign-content-result]");
    if (!campaignId || !panel || button.disabled) return;
    button.disabled = true;
    button.setAttribute("aria-expanded", "true");
    panel.hidden = false;
    panel.textContent = "Carregando conteúdo aprovado do modelo…";
    try {
      const data = await campaignAdminRequest("whatsapp_campaign_content_preview", { campaign_id: campaignId });
      const template = data.template || {};
      const parts = Array.isArray(template.parts) ? template.parts : [];
      const rendered = parts.map((part) =>
        '<section class="whatsapp-campaign-content-part"><strong>' + esc(part.label || "Conteúdo") + '</strong><pre>' + esc(part.text || "") + "</pre></section>"
      ).join("");
      panel.innerHTML = '<div class="whatsapp-campaign-preview-counts"><strong>' + esc(template.name || "Modelo")
        + '</strong><span>' + esc(template.language || "") + " · " + esc(human(template.category || "")) + "</span></div>"
        + (rendered || '<p class="admin-muted">O modelo não possui texto disponível nesta prévia.</p>')
        + '<p class="admin-muted whatsapp-campaign-content-note">Prévia do texto aprovado. ' + Math.max(0, Math.trunc(Number(template.variable_count) || 0))
        + ' variável(is) aparecem como placeholders; valores personalizados, exemplos e destinos de links não são exibidos. Nada é enviado.</p>';
    } catch (error) {
      panel.textContent = error instanceof Error ? error.message : "Não foi possível carregar o conteúdo do modelo.";
    } finally {
      button.disabled = false;
    }
  }

  async function loadCampaignPreview(button) {
    const campaignId = String(button?.dataset?.campaignPreview || "");
    const row = button?.closest(".whatsapp-campaign-row");
    const panel = row?.querySelector("[data-campaign-preview-result]");
    if (!campaignId || !panel || button.disabled) return;
    button.disabled = true;
    button.setAttribute("aria-expanded", "true");
    panel.hidden = false;
    panel.textContent = "Calculando prévia dos filtros atuais…";
    try {
      const response = await fetch(`${supabase}/functions/v1/site-admin-v1`, {
        method: "POST",
        headers: {
          apikey: publishableKey,
          "x-admin-code": window.DonaAdminAuth?.getCode?.() || "",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "whatsapp_campaign_preview", campaign_id: campaignId }),
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) throw new Error(data.message || data.error || "Não foi possível calcular a prévia.");
      const preview = data.preview || {};
      const exclusions = preview.exclusion_counts || {};
      const formatCount = (value) => Math.max(0, Math.trunc(Number(value) || 0)).toLocaleString("pt-BR");
      const reasons = [
        ["Opt-out", exclusions.opted_out_count],
        ["Sem evidência individual", exclusions.consent_evidence_unverified_count],
        ["Sem consentimento", exclusions.no_consent_count],
        ["Cadastro inativo", exclusions.inactive_customer_count],
        ["Telefone inválido", exclusions.invalid_phone_count],
        ["Telefone duplicado", exclusions.duplicate_phone_count],
      ].map(([label, value]) => '<span class="whatsapp-campaign-preview-chip">' + esc(label) + ': <strong>' + formatCount(value) + '</strong></span>').join("");
      const template = data.template || {};
      const templateText = template.sendable
        ? "Modelo aprovado: " + [template.name, template.language, human(template.category)].filter(Boolean).join(" · ")
        : "Modelo não liberado: " + (template.error === "template_not_sendable" ? "não aprovado ou indisponível" : template.error === "account_not_available" ? "canal indisponível" : "status não confirmado");
      panel.innerHTML = '<div class="whatsapp-campaign-preview-counts">'
        + '<strong>' + formatCount(preview.eligible_count) + ' aptos pelas regras atuais</strong>'
        + '<span>' + formatCount(preview.excluded_count) + ' excluídos de ' + formatCount(preview.found_count) + ' encontrados pelos filtros</span>'
        + '</div><div class="whatsapp-campaign-preview-reasons">' + reasons + '</div>'
        + '<small class="whatsapp-campaign-preview-template">' + esc(templateText) + '</small>'
        + '<p>Prévia somente de contagens: não congela a lista nem envia mensagens. Motivos podem se sobrepor. As flags atuais não substituem evidência individual; revise as origens antes de uma campanha ampla.</p>';
    } catch (error) {
      panel.textContent = error instanceof Error ? error.message : "Não foi possível calcular a prévia.";
    } finally {
      button.disabled = false;
    }
  }


  async function campaignAdminRequest(action, payload) {
    const response = await fetch(supabase + "/functions/v1/site-admin-v1", {
      method: "POST",
      headers: {
        apikey: publishableKey,
        "x-admin-code": window.DonaAdminAuth?.getCode?.() || "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(Object.assign({ action }, payload || {})),
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      const messages = {
        campaign_filter_required: "Informe ao menos um filtro de público.",
        no_eligible_recipients: "Envio bloqueado: nenhum destinatário do snapshot tem consentimento individual verificado.",
        consent_evidence_unverified: "O consentimento atual não tem evidência individual verificada.",
        campaign_filters_not_editable: "Este rascunho usa filtros avançados que ainda não podem ser editados nesta tela.",
        revision_conflict: "A campanha mudou em outra sessão. Atualize os dados antes de tentar novamente.",
        snapshot_stale: "O snapshot não corresponde à revisão atual da campanha.",
        campaign_schedule_too_soon: "Agende com pelo menos cinco minutos de antecedência.",
        campaigns_disabled: "O envio de campanhas está desativado para este canal.",
        campaign_invalid_transition: "O status atual não permite esta ação.",
        template_not_sendable: "Selecione um modelo de marketing aprovado.",
      };
      throw new Error(messages[data.error] || data.message || data.error || "Não foi possível salvar o rascunho.");
    }
    return data;
  }

  function campaignFilterFields() {
    return [
      { key: "city", label: "Cidade", type: "text" },
      { key: "neighborhood", label: "Bairro", type: "text" },
      { key: "brand", label: "Marca comprada", type: "text" },
      { key: "category", label: "Categoria comprada", type: "text" },
      { key: "inactive_days", label: "Sem compra há pelo menos (dias)", type: "number", step: "1" },
      { key: "min_order_count", label: "Pedidos mínimos", type: "number", step: "1" },
      { key: "max_order_count", label: "Pedidos máximos", type: "number", step: "1" },
      { key: "min_lifetime_value", label: "Valor acumulado mínimo (R$)", type: "number", step: "0.01" },
      { key: "max_lifetime_value", label: "Valor acumulado máximo (R$)", type: "number", step: "0.01" },
      { key: "last_purchase_after", label: "Última compra a partir de", type: "date" },
      { key: "last_purchase_before", label: "Última compra antes de", type: "date" },
    ];
  }

  function campaignFilterInputMarkup(field, filters) {
    const value = filters?.[field.key] == null ? "" : String(filters[field.key]).slice(0, 10);
    const step = field.step ? ' step="' + esc(field.step) + '"' : "";
    const min = field.type === "number" ? ' min="0"' : "";
    return '<label class="whatsapp-campaign-field"><span>' + esc(field.label) + '</span><input type="' + field.type + '" name="' + esc(field.key) + '" value="' + esc(value) + '"' + step + min + '></label>';
  }

  function campaignDraftIdempotencyKey() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
      const value = Math.random() * 16 | 0;
      return (ch === "x" ? value : value & 0x3 | 0x8).toString(16);
    });
  }

  async function openCampaignDraftEditor(campaignId) {
    const host = $("whatsapp-campaign-editor");
    const current = lastOverview || {};
    if (!host) return;
    let campaign = null;
    host.hidden = false;
    host.innerHTML = '<p class="admin-muted">Preparando rascunho…</p>';
    if (campaignId) {
      try {
        const result = await campaignAdminRequest("whatsapp_campaign_draft_load", { campaign_id: campaignId });
        campaign = result.campaign || null;
      } catch (error) {
        host.innerHTML = '<p class="form-message is-error" role="alert">' + esc(error instanceof Error ? error.message : "Não foi possível abrir o rascunho.") + '</p><button class="button button-outline" type="button" data-campaign-editor-close>Fechar</button>';
        return;
      }
    }
    const channels = (Array.isArray(current.channels) ? current.channels : []).filter((channel) => channel.id && channel.is_active !== false);
    const templates = (Array.isArray(current.templates?.items) ? current.templates.items : []).filter((item) =>
      item.id && item.whatsapp_account_id && String(item.status || "").toUpperCase() === "APPROVED"
      && String(item.category || "").toUpperCase() === "MARKETING"
    );
    if (!channels.length || !templates.length) {
      host.innerHTML = '<p class="form-message is-error" role="alert">Não há canal ativo e modelo de marketing aprovado disponível para criar o rascunho.</p><button class="button button-outline" type="button" data-campaign-editor-close>Fechar</button>';
      return;
    }
    const selectedAccount = campaign?.whatsapp_account_id || channels[0].id;
    const channelOptions = channels.map((channel) =>
      '<option value="' + esc(channel.id) + '"' + (channel.id === selectedAccount ? " selected" : "") + '>'
      + esc(channel.name || "WhatsApp") + (channel.phone_last4 ? " · final " + esc(channel.phone_last4) : "") + "</option>"
    ).join("");
    const templateOptions = templates.map((item) =>
      '<option value="' + esc(item.id) + '" data-account-id="' + esc(item.whatsapp_account_id) + '"'
      + (item.id === campaign?.template_id ? " selected" : "") + '>'
      + esc(item.name) + " · " + esc(item.language || "") + "</option>"
    ).join("");
    const filters = campaign?.filters || {};
    const filterInputs = campaignFilterFields().map((field) => campaignFilterInputMarkup(field, filters)).join("");
    const editing = Boolean(campaign?.id);
    host.innerHTML = '<section class="whatsapp-campaign-editor-card" aria-labelledby="whatsapp-campaign-editor-title">'
      + '<div class="whatsapp-campaign-editor-head"><div><h3 id="whatsapp-campaign-editor-title">' + (editing ? "Editar rascunho" : "Novo rascunho") + '</h3>'
      + '<p class="admin-muted">Salva a configuração como rascunho. Não congela a audiência, agenda nem envia mensagens.</p></div>'
      + '<button class="button button-outline" type="button" data-campaign-editor-close>Fechar</button></div>'
      + '<form data-campaign-draft-form data-mode="' + (editing ? "edit" : "create") + '" data-campaign-id="' + esc(campaign?.id || "") + '" data-revision="' + esc(campaign?.revision || 0) + '" data-idempotency-key="' + esc(campaignDraftIdempotencyKey()) + '">'
      + '<div class="whatsapp-campaign-form-grid">'
      + '<label class="whatsapp-campaign-field"><span>Nome da campanha</span><input type="text" name="name" maxlength="140" required value="' + esc(campaign?.name || "") + '"></label>'
      + '<label class="whatsapp-campaign-field"><span>Número de envio</span><select name="whatsapp_account_id" required>' + channelOptions + '</select></label>'
      + '<label class="whatsapp-campaign-field whatsapp-campaign-field-wide"><span>Modelo Meta aprovado · Marketing</span><select name="template_id" required><option value="">Selecione o modelo</option>' + templateOptions + '</select></label>'
      + '<section class="whatsapp-campaign-variable-editor whatsapp-campaign-field-wide" data-campaign-variable-editor data-state="loading"><h4>Personalização do modelo</h4><p data-campaign-variable-status class="admin-muted" role="status" aria-live="polite">Carregando variáveis do modelo aprovado…</p><div data-campaign-variable-fields></div><div data-campaign-template-example></div></section>'
      + '<div class="whatsapp-campaign-field-wide"><h4>Filtros da audiência</h4><p class="admin-muted">Use pelo menos um filtro. Opt-outs, sem consentimento, cadastros inativos e telefones inválidos continuam excluídos pelo motor existente.</p></div>'
      + filterInputs
      + '</div><p class="whatsapp-campaign-editor-note">Antes de qualquer campanha ampla, confira a evidência individual de consentimento. Este formulário só salva rascunhos.</p>'
      + '<div class="whatsapp-campaign-editor-actions"><p data-campaign-draft-status class="admin-muted" role="status" aria-live="polite"></p>'
      + '<button class="button button-primary" type="submit">' + (editing ? "Salvar rascunho" : "Criar rascunho") + '</button></div></form></section>';
    host.hidden = false;
    syncCampaignTemplateOptions(host);
    void refreshCampaignTemplateVariables(host, campaign?.variable_values || {});
    host.querySelector('[name="name"]')?.focus();
  }

  function syncCampaignTemplateOptions(root) {
    const account = root.querySelector('[name="whatsapp_account_id"]');
    const templates = root.querySelector('[name="template_id"]');
    if (!account || !templates) return;
    let firstAvailable = "";
    for (const option of templates.options) {
      const available = !option.value || option.dataset.accountId === account.value;
      option.hidden = !available;
      if (available && option.value && !firstAvailable) firstAvailable = option.value;
    }
    const selected = templates.selectedOptions[0];
    if (selected?.value && selected.dataset.accountId !== account.value) templates.value = firstAvailable;
    if (!templates.value && firstAvailable) templates.value = firstAvailable;
  }

  function campaignVariableValuesFromForm(form, requireComplete = true) {
    const values = {};
    const editor = form?.querySelector("[data-campaign-variable-editor]");
    for (const row of editor?.querySelectorAll("[data-campaign-variable-row]") || []) {
      const index = String(row.dataset.variableIndex || "");
      const mode = row.querySelector("[data-campaign-variable-mode]")?.value || "text";
      if (!/^\d{1,3}$/.test(index)) continue;
      if (mode === "customer_first_name") {
        const fallback = String(row.querySelector("[data-campaign-variable-fallback]")?.value || "").trim();
        if (requireComplete && !fallback) throw new Error("Informe o fallback para cada variável de primeiro nome.");
        values[index] = { source: "customer_first_name", fallback: fallback || "Cliente" };
      } else {
        const value = String(row.querySelector("[data-campaign-variable-value]")?.value || "").trim();
        if (requireComplete && !value) throw new Error("Preencha cada variável do modelo ou escolha primeiro nome do cliente.");
        if (value) values[index] = value;
      }
    }
    return values;
  }

  function renderCampaignTemplateExample(form) {
    const editor = form?.querySelector("[data-campaign-variable-editor]");
    const preview = editor?.querySelector("[data-campaign-template-example]");
    const template = editor?._campaignTemplate;
    if (!editor || !preview || !template) return;
    const values = campaignVariableValuesFromForm(form, false);
    const replaceVariables = (text) => String(text || "").replace(/{{\s*(\d{1,3})\s*}}/g, (token, rawIndex) => {
      const value = values[String(rawIndex)];
      if (typeof value === "string" && value) return value;
      if (value && typeof value === "object" && value.source === "customer_first_name") return "Maria";
      return token;
    });
    const parts = Array.isArray(template.parts) ? template.parts : [];
    preview.innerHTML = '<div class="whatsapp-campaign-template-example"><strong>Exemplo fictício</strong>'
      + parts.map((part) => '<section><small>' + esc(part.label || "Conteúdo") + '</small><pre>' + esc(replaceVariables(part.text)) + '</pre></section>').join("")
      + '<p class="admin-muted">Usa o nome fictício “Maria”; não consulta destinatários nem envia mensagens.</p></div>';
  }

  function updateCampaignVariableMode(row) {
    const mode = row?.querySelector("[data-campaign-variable-mode]")?.value;
    const fixed = row?.querySelector("[data-campaign-variable-fixed]");
    const firstName = row?.querySelector("[data-campaign-variable-first-name]");
    if (fixed) fixed.hidden = mode === "customer_first_name";
    if (firstName) firstName.hidden = mode !== "customer_first_name";
  }

  function renderCampaignTemplateVariables(editor, template, initialValues, form) {
    const indices = Array.from(new Set((Array.isArray(template.variable_indices) ? template.variable_indices : [])
      .map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0 && value <= 999))).sort((a, b) => a - b);
    const fields = editor.querySelector("[data-campaign-variable-fields]");
    const status = editor.querySelector("[data-campaign-variable-status]");
    const saved = initialValues && typeof initialValues === "object" && !Array.isArray(initialValues) ? initialValues : {};
    fields.innerHTML = indices.map((index) => {
      const value = saved[String(index)];
      const personalized = Boolean(value && typeof value === "object" && value.source === "customer_first_name");
      const fixedValue = typeof value === "string" ? value : "";
      const fallback = personalized ? String(value.fallback || "Cliente") : "Cliente";
      return '<div class="whatsapp-campaign-variable-row" data-campaign-variable-row data-variable-index="' + index + '"><strong>Variável {{' + index + '}}</strong>'
        + '<label class="whatsapp-campaign-field"><span>Preencher com</span><select data-campaign-variable-mode><option value="text"' + (!personalized ? " selected" : "") + '>Texto fixo</option><option value="customer_first_name"' + (personalized ? " selected" : "") + '>Primeiro nome do cliente</option></select></label>'
        + '<label class="whatsapp-campaign-field" data-campaign-variable-fixed' + (personalized ? " hidden" : "") + '><span>Texto fixo</span><input type="text" maxlength="500" data-campaign-variable-value value="' + esc(fixedValue) + '" placeholder="Digite o conteúdo da variável"></label>'
        + '<label class="whatsapp-campaign-field" data-campaign-variable-first-name' + (!personalized ? " hidden" : "") + '><span>Fallback se o primeiro nome não estiver disponível</span><input type="text" maxlength="100" data-campaign-variable-fallback value="' + esc(fallback) + '"></label></div>';
    }).join("");
    editor._campaignTemplate = template;
    if (status) status.textContent = indices.length
      ? "Configure cada variável do modelo. O primeiro nome usa fallback quando não houver nome disponível."
      : "Este modelo não possui variáveis para preencher.";
    for (const row of fields.querySelectorAll("[data-campaign-variable-row]")) updateCampaignVariableMode(row);
    renderCampaignTemplateExample(form);
  }

  async function refreshCampaignTemplateVariables(root, initialValues = {}) {
    const form = root?.querySelector("[data-campaign-draft-form]");
    const editor = form?.querySelector("[data-campaign-variable-editor]");
    const account = form?.elements.namedItem("whatsapp_account_id");
    const template = form?.elements.namedItem("template_id");
    if (!form || !editor || !account || !template) return;
    const accountId = String(account.value || "");
    const templateId = String(template.value || "");
    if (!accountId || !templateId) {
      editor.dataset.state = "ready";
      editor._campaignTemplate = { parts: [], variable_indices: [] };
      editor.querySelector("[data-campaign-variable-status]").textContent = "Selecione um modelo aprovado.";
      editor.querySelector("[data-campaign-variable-fields]").innerHTML = "";
      return;
    }
    const requestId = String(++campaignVariablePreviewRequest);
    editor.dataset.requestId = requestId;
    editor.dataset.state = "loading";
    editor.innerHTML = '<h4>Personalização do modelo</h4><p class="admin-muted" data-campaign-variable-status role="status">Carregando variáveis do modelo aprovado…</p><div data-campaign-variable-fields></div><div data-campaign-template-example></div>';
    try {
      const data = await campaignAdminRequest("whatsapp_campaign_content_preview", { whatsapp_account_id: accountId, template_id: templateId });
      if (editor.dataset.requestId !== requestId) return;
      if (String(account.value || "") !== accountId || String(template.value || "") !== templateId) return;
      renderCampaignTemplateVariables(editor, data.template || {}, initialValues, form);
      editor.dataset.state = "ready";
    } catch (error) {
      if (editor.dataset.requestId !== requestId) return;
      editor.dataset.state = "error";
      editor.innerHTML = '<h4>Personalização do modelo</h4><p class="form-message is-error" role="alert">' + esc(error instanceof Error ? error.message : "Não foi possível carregar as variáveis.") + '</p>';
    }
  }

  async function submitCampaignDraft(form) {
    if (!form || form.dataset.saving === "true") return;
    const status = form.querySelector("[data-campaign-draft-status]");
    const submit = form.querySelector('button[type="submit"]');
    const filters = {};
    for (const field of campaignFilterFields()) {
      const input = form.elements.namedItem(field.key);
      const value = String(input?.value || "").trim();
      if (value) filters[field.key] = value;
    }
    if (!Object.keys(filters).length) {
      if (status) status.textContent = "Informe ao menos um filtro de público.";
      return;
    }
    const account = form.elements.namedItem("whatsapp_account_id");
    const template = form.elements.namedItem("template_id");
    const name = form.elements.namedItem("name");
    const isEdit = form.dataset.mode === "edit";
    const variableEditor = form.querySelector("[data-campaign-variable-editor]");
    if (variableEditor && variableEditor.dataset.state !== "ready") {
      if (status) status.textContent = "Aguarde o carregamento das variáveis do modelo aprovado.";
      return;
    }
    let variableValues;
    try {
      variableValues = campaignVariableValuesFromForm(form, true);
    } catch (error) {
      if (status) status.textContent = error instanceof Error ? error.message : "Preencha as variáveis do modelo.";
      return;
    }
    const payload = {
      name: String(name?.value || "").trim(),
      whatsapp_account_id: String(account?.value || ""),
      template_id: String(template?.value || ""),
      filters,
      variable_values: variableValues,
    };
    if (isEdit) {
      payload.campaign_id = form.dataset.campaignId || "";
      payload.revision = Number(form.dataset.revision) || 0;
    } else {
      payload.idempotency_key = form.dataset.idempotencyKey || campaignDraftIdempotencyKey();
    }
    form.dataset.saving = "true";
    if (submit) submit.disabled = true;
    if (status) status.textContent = "Salvando rascunho…";
    try {
      await campaignAdminRequest(isEdit ? "whatsapp_campaign_draft_update" : "whatsapp_campaign_draft_create", payload);
      if (status) status.textContent = "Rascunho salvo.";
      const host = $("whatsapp-campaign-editor");
      if (host) { host.hidden = true; host.innerHTML = ""; }
      await loadOverview(true);
    } catch (error) {
      if (status) status.textContent = error instanceof Error ? error.message : "Não foi possível salvar o rascunho.";
    } finally {
      form.dataset.saving = "false";
      if (submit?.isConnected) submit.disabled = false;
    }
  }

  let currentAnaDraftConfiguration = null;

  function anaKnowledgeRowMarkup(item) {
    return '<article class="whatsapp-ana-knowledge-row" data-ana-knowledge-row data-knowledge-key="' + esc(item?.key || "") + '">'
      + '<label>Assunto<input type="text" maxlength="100" data-ana-knowledge-title value="' + esc(item?.title || "") + '" required></label>'
      + '<label>Informação para a ANA<textarea rows="3" maxlength="1600" data-ana-knowledge-content required>' + esc(item?.content || "") + '</textarea></label>'
      + '<button class="button button-outline" type="button" data-ana-knowledge-remove>Remover</button></article>';
  }

  function anaConfigurationEditorMarkup(draft) {
    const configuration = draft?.configuration;
    if (!configuration || typeof configuration !== "object") {
      return '<section class="whatsapp-overview-card"><h3>Configuração básica da ANA</h3><p class="admin-muted">O rascunho de configuração não está disponível.</p></section>';
    }
    const behavior = configuration.behavior || {};
    const knowledge = Array.isArray(configuration.knowledge) ? configuration.knowledge.filter((item) => item?.status !== "archived") : [];
    const tone = String(behavior.tone || "cordial");
    const conciseness = String(behavior.conciseness || "short");
    const emoji = String(behavior.emoji || "sparingly");
    const firstGreetingEnabled = behavior.first_greeting_enabled !== false;
    const firstGreetingLinkMode = String(behavior.first_greeting_link_mode || "personalized");
    const firstGreetingMessage = String(behavior.first_greeting_message || "Olá{nome}! 😊 Que bom falar com você. Para ver o catálogo e fazer seu pedido, acesse: {link}\nSe preferir, posso te ajudar por aqui.");
    const rows = knowledge.length ? knowledge.map(anaKnowledgeRowMarkup).join("") : '<p class="admin-muted" data-ana-knowledge-empty>Adicione informações confiáveis para a ANA consultar.</p>';
    return '<section class="whatsapp-overview-card whatsapp-ana-editor-card"><div class="whatsapp-ana-editor-heading"><div><h3>Configuração básica da ANA</h3><p class="admin-muted">Edite o tom e as informações da loja. Isso salva apenas um rascunho.</p></div><span class="whatsapp-ana-draft-badge">Rascunho r' + esc(draft.revision || "—") + '</span></div>'
      + '<form data-ana-editor data-revision="' + esc(draft.revision || "") + '">'
      + '<div class="whatsapp-ana-basic-grid">'
      + '<label>Tom de atendimento<select data-ana-tone><option value="cordial"' + (tone === "cordial" ? " selected" : "") + '>Cordial</option><option value="warm"' + (tone === "warm" ? " selected" : "") + '>Acolhedor</option><option value="neutral"' + (tone === "neutral" ? " selected" : "") + '>Profissional</option></select></label>'
      + '<label>Tamanho das respostas<select data-ana-conciseness><option value="short"' + (conciseness === "short" ? " selected" : "") + '>Curtas</option><option value="balanced"' + (conciseness === "balanced" ? " selected" : "") + '>Com mais contexto</option></select></label>'
      + '<label>Emojis<select data-ana-emoji><option value="sparingly"' + (emoji === "sparingly" ? " selected" : "") + '>Com moderação</option><option value="never"' + (emoji === "never" ? " selected" : "") + '>Não usar</option></select></label>'
      + '<label class="whatsapp-ana-first-name"><input type="checkbox" data-ana-first-name' + (behavior.use_known_first_name_on_first_greeting === true ? " checked" : "") + '> Usar o primeiro nome no primeiro cumprimento</label></div>'
      + '<section class="whatsapp-ana-greeting-settings"><div><h4>Mensagem no início da conversa</h4><p class="admin-muted">Enviada no primeiro cumprimento do dia. O link personalizado associa o pedido ao cliente.</p></div><div class="whatsapp-ana-basic-grid">'
      + '<label class="whatsapp-ana-first-greeting-toggle"><input type="checkbox" data-ana-first-greeting-enabled' + (firstGreetingEnabled ? " checked" : "") + '> Enviar o catálogo automaticamente</label>'
      + '<label>Tipo de link<select data-ana-first-greeting-link-mode><option value="personalized"' + (firstGreetingLinkMode === "personalized" ? " selected" : "") + '>Personalizado, identifica o cliente</option><option value="normal"' + (firstGreetingLinkMode === "normal" ? " selected" : "") + '>Normal, abre o catálogo do site</option></select></label>'
      + '<label class="whatsapp-ana-greeting-message">Texto da mensagem<textarea data-ana-first-greeting-message maxlength="1200" rows="4">' + esc(firstGreetingMessage) + '</textarea><span class="admin-muted">Use {nome} e {link}. O link é inserido automaticamente.</span></label></div></section>'
      + '<div class="whatsapp-ana-knowledge-heading"><div><h4>Informações da loja</h4><p class="admin-muted">A ANA usa apenas os fatos publicados quando a configuração é ativada.</p></div><button class="button button-outline" type="button" data-ana-knowledge-add>Adicionar informação</button></div>'
      + '<div class="whatsapp-ana-knowledge-list" data-ana-knowledge-list>' + rows + '</div>'
      + '<div class="whatsapp-ana-editor-footer"><p class="admin-muted" data-ana-editor-status role="status" aria-live="polite">Salvar não altera a ANA ativa. Teste e ativação ficam abaixo.</p><button class="button button-primary" type="submit">Salvar rascunho</button></div>'
      + '</form></section>';
  }

  function addAnaKnowledgeRow() {
    const list = $("whatsapp-ana-content")?.querySelector("[data-ana-knowledge-list]");
    if (!list) return;
    list.querySelector("[data-ana-knowledge-empty]")?.remove();
    list.insertAdjacentHTML("beforeend", anaKnowledgeRowMarkup({ key: "", title: "", content: "" }));
    list.querySelector("[data-ana-knowledge-row]:last-child [data-ana-knowledge-title]")?.focus();
  }

  async function saveAnaDraft(form) {
    if (!currentAnaDraftConfiguration || form.dataset.saving === "true") return;
    const revision = Number(form.dataset.revision);
    const status = form.querySelector("[data-ana-editor-status]");
    const submit = form.querySelector('button[type="submit"]');
    if (!Number.isSafeInteger(revision) || revision < 1) {
      if (status) status.textContent = "Atualize o status da ANA antes de salvar.";
      return;
    }
    const rows = Array.from(form.querySelectorAll("[data-ana-knowledge-row]"));
    const rowByKey = new Map(rows.map((row) => [String(row.dataset.knowledgeKey || ""), row]).filter(([key]) => key));
    const configuration = JSON.parse(JSON.stringify(currentAnaDraftConfiguration));
    configuration.behavior = Object.assign({}, configuration.behavior || {}, {
      tone: form.querySelector("[data-ana-tone]")?.value || "cordial",
      conciseness: form.querySelector("[data-ana-conciseness]")?.value || "short",
      emoji: form.querySelector("[data-ana-emoji]")?.value || "sparingly",
      use_known_first_name_on_first_greeting: form.querySelector("[data-ana-first-name]")?.checked === true,
      first_greeting_enabled: form.querySelector("[data-ana-first-greeting-enabled]")?.checked === true,
      first_greeting_link_mode: form.querySelector("[data-ana-first-greeting-link-mode]")?.value || "personalized",
      first_greeting_message: form.querySelector("[data-ana-first-greeting-message]")?.value || "",
    });
    const knowledge = [];
    for (const item of Array.isArray(configuration.knowledge) ? configuration.knowledge : []) {
      if (item.status === "archived") { knowledge.push(item); continue; }
      const row = rowByKey.get(String(item.key || ""));
      if (!row) { knowledge.push(Object.assign({}, item, { status: "archived" })); continue; }
      knowledge.push(Object.assign({}, item, {
        title: row.querySelector("[data-ana-knowledge-title]")?.value.trim() || "",
        content: row.querySelector("[data-ana-knowledge-content]")?.value.trim() || "",
      }));
    }
    let newIndex = 0;
    for (const row of rows.filter((item) => !String(item.dataset.knowledgeKey || ""))) {
      const title = row.querySelector("[data-ana-knowledge-title]")?.value.trim() || "";
      const content = row.querySelector("[data-ana-knowledge-content]")?.value.trim() || "";
      if (!title && !content) continue;
      if (!title || !content) {
        if (status) status.textContent = "Preencha o assunto e a informação, ou remova a linha vazia.";
        return;
      }
      const key = "info_" + Date.now().toString(36) + "_" + (++newIndex);
      knowledge.push({ key, title, content, status: "published", keywords: [] });
    }
    if (knowledge.length > 30) {
      if (status) status.textContent = "A ANA aceita até 30 informações. Remova uma antes de adicionar outra.";
      return;
    }
    configuration.knowledge = knowledge;
    form.dataset.saving = "true";
    if (submit) submit.disabled = true;
    if (status) status.textContent = "Salvando rascunho…";
    try {
      const saved = await anaAdminRequest("whatsapp_ana_admin_save_draft", {
        expected_revision: revision,
        configuration,
        note: "Ajuste básico da ANA",
      });
      if (status) status.textContent = "Rascunho r" + String(saved.revision || revision + 1) + " salvo. Para aplicar, execute o teste e ative abaixo.";
      await loadAnaStatus(true);
    } catch (error) {
      if (status) status.textContent = error instanceof Error ? error.message : "Não foi possível salvar o rascunho.";
    } finally {
      form.dataset.saving = "false";
      if (submit?.isConnected) submit.disabled = false;
    }
  }

  let templateAdminFallbackItems = [];
  let templateAdminItems = [];
  let templateAdminAccountId = "";
  let templateAdminLoadedAccountId = "";
  let templateAdminBusy = false;
  let templateAdminStatus = "";

  function templateStatusTone(value) {
    const status = String(value || "").toUpperCase();
    if (status === "APPROVED") return "is-approved";
    if (status === "REJECTED" || status === "DELETED") return "is-rejected";
    if (["PENDING", "IN_APPEAL", "PAUSED"].includes(status)) return "is-pending";
    return "";
  }

  function renderTemplateAdminRows(items) {
    const host = $("whatsapp-templates-content")?.querySelector("[data-template-admin-list]");
    if (!host) return;
    const rows = Array.isArray(items) ? items : [];
    if (!rows.length) {
      host.innerHTML = emptyList("Nenhum modelo neste canal.");
      return;
    }
    host.innerHTML = rows.map((item) => {
      const status = String(item.status || "UNKNOWN").toUpperCase();
      const rejection = item.rejection_reason || item.metadata?.rejected_reason || "";
      const quality = item.quality_rating || item.metadata?.meta_quality_score?.score || "Sem avaliação";
      const category = item.category || "Aguardando classificação";
      const detail = [item.language || "", "Categoria Meta: " + human(category), "Qualidade: " + human(quality)].filter(Boolean).join(" · ");
      return '<article class="whatsapp-template-admin-row"><div class="whatsapp-template-admin-copy"><div class="whatsapp-template-admin-title"><h4>' + esc(item.name || "Modelo") + '</h4><span class="whatsapp-template-status ' + templateStatusTone(status) + '">' + esc(human(status)) + '</span></div>'
        + '<p class="admin-muted">' + esc(detail) + '</p>'
        + (rejection ? '<p class="whatsapp-template-rejection">Motivo informado pela Meta: ' + esc(rejection) + '</p>' : "")
        + '<small class="admin-muted">Atualizado: ' + esc(dateLabel(item.last_synced_at || item.updated_at)) + '</small></div>'
        + '<button class="button button-outline" type="button" data-template-edit="' + esc(item.id || "") + '"' + (!item.id ? " disabled" : "") + '>Editar</button></article>';
    }).join("");
  }

  function renderTemplateAdmin(data, fallbackItems) {
    const root = $("whatsapp-templates-content");
    if (!root) return;
    const channels = Array.isArray(data.channels) ? data.channels.filter((item) => item.id) : [];
    templateAdminFallbackItems = Array.isArray(fallbackItems) ? fallbackItems : [];
    let selected = channels.find((item) => item.id === templateAdminAccountId);
    if (!selected) selected = channels.find((item) => ["0975", "1018"].includes(String(item.phone_last4 || ""))) || channels[0];
    templateAdminAccountId = selected?.id || "";
    if (templateAdminLoadedAccountId !== templateAdminAccountId) {
      templateAdminLoadedAccountId = "";
      templateAdminItems = [];
    }
    const selectedItems = templateAdminLoadedAccountId === templateAdminAccountId
      ? templateAdminItems
      : templateAdminFallbackItems.filter((item) => !item.whatsapp_account_id || item.whatsapp_account_id === templateAdminAccountId);
    const channelsMarkup = channels.map((item) => {
      const number = item.phone_last4 ? " · final " + item.phone_last4 : "";
      return '<option value="' + esc(item.id) + '"' + (item.id === templateAdminAccountId ? " selected" : "") + '>' + esc(item.name || "WhatsApp") + esc(number) + '</option>';
    }).join("");
    root.innerHTML = '<div class="whatsapp-record-summary">'
      + '<article class="whatsapp-overview-card"><h3>Aprovados pela Meta</h3><strong class="whatsapp-metric">' + esc(data.templates?.approved || 0) + '</strong><p class="admin-muted">disponíveis</p></article>'
      + '<article class="whatsapp-overview-card"><h3>Total cadastrado</h3><strong class="whatsapp-metric">' + esc(data.templates?.total || 0) + '</strong><p class="admin-muted">modelos</p></article>'
      + '<article class="whatsapp-overview-card"><h3>No canal</h3><strong class="whatsapp-metric">' + esc(selectedItems.length) + '</strong><p class="admin-muted">na lista carregada</p></article></div>'
      + '<section class="whatsapp-overview-card"><div class="whatsapp-template-admin-toolbar"><label>Canal<select data-template-account' + (channels.length && !templateAdminBusy ? "" : " disabled") + '>' + (channelsMarkup || '<option value="">Nenhum canal</option>') + '</select></label>'
      + '<div class="whatsapp-template-admin-actions"><button class="button button-outline" type="button" data-template-load' + (!templateAdminAccountId || templateAdminBusy ? " disabled" : "") + '>Carregar modelos</button><button class="button button-outline" type="button" data-template-sync' + (!templateAdminAccountId || templateAdminBusy ? " disabled" : "") + '>Sincronizar com Meta</button><button class="button button-primary" type="button" data-template-new' + (!templateAdminAccountId || templateAdminBusy ? " disabled" : "") + '>Novo modelo</button></div></div>'
      + '<p class="admin-muted" data-template-admin-status role="status" aria-live="polite">' + esc(templateAdminStatus || "Resumo carregado. Carregue o catálogo completo para editar ou sincronize com a Meta.") + '</p>'
      + '<div class="whatsapp-template-editor-host" data-template-editor-host></div><div class="whatsapp-template-admin-list" data-template-admin-list></div></section>';
    renderTemplateAdminRows(selectedItems);
  }

  async function templateAdminRequest(action, options) {
    const accountId = String(options?.accountId || templateAdminAccountId || "");
    if (!supabase || !publishableKey || !accountId) throw new Error("Selecione um canal WhatsApp.");
    const url = new URL(supabase + "/functions/v1/admin-whatsapp-templates-v1");
    url.searchParams.set("action", action);
    url.searchParams.set("account_id", accountId);
    const method = options?.method || "GET";
    const response = await fetch(url.toString(), {
      method,
      headers: {
        apikey: publishableKey,
        "x-admin-code": window.DonaAdminAuth?.getCode?.() || "",
        ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
      },
      ...(method === "POST" ? { body: JSON.stringify(options?.payload || {}) } : {}),
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      const messages = {
        admin_auth_required: "A sessão do Admin expirou. Entre novamente.",
        admin_code_invalid: "Acesso do Admin inválido. Entre novamente.",
        meta_transport_not_configured: "A integração com a Meta ainda não está configurada.",
        meta_template_mutation_uncertain: "A Meta pode ter recebido a alteração. Sincronize o catálogo antes de tentar de novo.",
        meta_template_name_invalid: "Use o nome em minúsculas, sem espaços ou acentos.",
        meta_template_examples_required: "Preencha um exemplo para cada variável {{n}}.",
        meta_template_body_required: "Informe o texto principal do modelo.",
      };
      throw new Error(messages[data.error] || data.message || data.error || "Não foi possível carregar os modelos.");
    }
    return data;
  }

  async function loadTemplateAdminCatalog(sync) {
    if (templateAdminBusy) return;
    const root = $("whatsapp-templates-content");
    const status = root?.querySelector("[data-template-admin-status]");
    const requestedAccountId = templateAdminAccountId;
    if (!root || !requestedAccountId) return;
    templateAdminBusy = true;
    const accountSelect = root.querySelector("[data-template-account]");
    if (accountSelect) accountSelect.disabled = true;
    const loadButton = root.querySelector("[data-template-load]");
    const syncButton = root.querySelector("[data-template-sync]");
    if (loadButton) loadButton.disabled = true;
    if (syncButton) syncButton.disabled = true;
    if (status) status.textContent = sync ? "Consultando os status atuais na Meta…" : "Carregando o catálogo do canal…";
    try {
      const data = await templateAdminRequest(sync ? "sync" : "list", { accountId: requestedAccountId });
      if (requestedAccountId !== templateAdminAccountId) return;
      templateAdminItems = Array.isArray(data.items) ? data.items : [];
      templateAdminLoadedAccountId = requestedAccountId;
      templateAdminStatus = sync
        ? "Catálogo sincronizado com a Meta."
        : "Modelos carregados do catálogo deste canal.";
      renderTemplateAdminRows(templateAdminItems);
      if (status?.isConnected) status.textContent = templateAdminStatus;
    } catch (error) {
      if (requestedAccountId === templateAdminAccountId) {
        templateAdminStatus = error instanceof Error ? error.message : "Não foi possível carregar os modelos.";
        if (status?.isConnected) status.textContent = templateAdminStatus;
      }
    } finally {
      templateAdminBusy = false;
      const currentRoot = $("whatsapp-templates-content");
      const currentAccountSelect = currentRoot?.querySelector("[data-template-account]");
      const currentLoadButton = currentRoot?.querySelector("[data-template-load]");
      const currentSyncButton = currentRoot?.querySelector("[data-template-sync]");
      if (currentAccountSelect?.isConnected) currentAccountSelect.disabled = !templateAdminAccountId;
      if (currentLoadButton?.isConnected) currentLoadButton.disabled = !templateAdminAccountId;
      if (currentSyncButton?.isConnected) currentSyncButton.disabled = !templateAdminAccountId;
    }
  }

  function templateComponent(components, type) {
    return (Array.isArray(components) ? components : []).find((item) => String(item?.type || "").toUpperCase() === type) || null;
  }

  function templateComponentsEditable(components) {
    const items = Array.isArray(components) ? components : [];
    return items.some((item) => String(item?.type || "").toUpperCase() === "BODY")
      && items.every((item) => {
        const type = String(item?.type || "").toUpperCase();
        if (type === "BODY" || type === "FOOTER") return true;
        if (type === "HEADER") return String(item?.format || "").toUpperCase() === "TEXT";
        if (type === "BUTTONS") return Array.isArray(item.buttons) && item.buttons.every((button) => ["URL", "QUICK_REPLY", "CATALOG"].includes(String(button?.type || "").toUpperCase()));
        return false;
      });
  }

  function templateEditorMarkup(item) {
    const editing = Boolean(item?.id);
    const components = Array.isArray(item?.components) ? item.components : [];
    const header = templateComponent(components, "HEADER");
    const body = templateComponent(components, "BODY");
    const footer = templateComponent(components, "FOOTER");
    const headerText = header && String(header.format || "").toUpperCase() === "TEXT" ? header.text || "" : "";
    const headerExample = Array.isArray(header?.example?.header_text) ? header.example.header_text.join(" | ") : "";
    const bodyExampleRows = Array.isArray(body?.example?.body_text) ? body.example.body_text : [];
    const bodyExample = Array.isArray(bodyExampleRows[0]) ? bodyExampleRows[0].join(" | ") : "";
    const category = String(item?.category || "").toUpperCase();
    const editable = !editing || (["UTILITY", "MARKETING"].includes(category) && templateComponentsEditable(components));
    const editWarning = !editable
      ? '<p class="whatsapp-template-editor-warning">A edição simples não suporta esta categoria, mídia ou botões. O conteúdo permanece no catálogo.</p>'
      : editing && bodyExampleRows.length > 1
        ? '<p class="whatsapp-template-editor-warning">Este modelo tem vários exemplos de variáveis. A edição simples enviará somente o primeiro conjunto à Meta.</p>'
        : "";
    return '<section class="whatsapp-template-editor"><div class="whatsapp-template-editor-heading"><div><h4>' + (editing ? "Editar conteúdo do modelo" : "Novo modelo") + '</h4><p class="admin-muted">' + (editing ? "O nome, idioma e tipo Meta ficam vinculados ao cadastro." : "Ao enviar, a Meta revisará e poderá ajustar a categoria.") + '</p></div><button class="button button-outline" type="button" data-template-editor-close>Fechar</button></div>'
      + '<form data-template-editor-form data-template-id="' + esc(item?.id || "") + '"><div class="whatsapp-template-editor-grid">'
      + '<label>Nome do modelo<input name="name" maxlength="512" pattern="[a-z0-9_]+" value="' + esc(item?.name || "") + '"' + (editing ? " readonly" : " required") + ' placeholder="exemplo_pedido"></label>'
      + '<label>Idioma<input name="language" maxlength="20" value="' + esc(item?.language || "pt_BR") + '"' + (editing ? " readonly" : " required") + '></label>'
      + (editing
        ? '<div class="whatsapp-template-readonly"><span>Tipo classificado pela Meta</span><strong>' + esc(human(item?.category || "Aguardando classificação")) + '</strong></div>'
        : '<label>Tipo solicitado<select name="category"><option value="UTILITY">Utilidade</option><option value="MARKETING">Marketing</option></select></label>')
      + '<label class="whatsapp-template-editor-wide">Cabeçalho opcional<input name="header" data-template-header maxlength="60" value="' + esc(headerText) + '"' + (header && !headerText ? " readonly" : "") + '></label>'
      + '<label class="whatsapp-template-editor-wide">Exemplo do cabeçalho<textarea name="header_examples" rows="2" placeholder="Maria | amanhã">' + esc(headerExample) + '</textarea><small>Use somente se o cabeçalho tiver variáveis.</small></label>'
      + '<label class="whatsapp-template-editor-wide">Texto principal<textarea name="body" data-template-body rows="5" maxlength="1024" required>' + esc(body?.text || "") + '</textarea></label>'
      + '<label class="whatsapp-template-editor-wide">Exemplos das variáveis<textarea name="body_examples" rows="2" placeholder="Maria | amanhã">' + esc(bodyExample) + '</textarea><small>Use um exemplo para cada variável {{1}}, {{2}} e assim por diante, separados por |.</small></label>'
      + '<label class="whatsapp-template-editor-wide">Rodapé opcional<input name="footer" maxlength="60" value="' + esc(footer?.text || "") + '"></label></div>'
      + editWarning
      + '<p class="admin-muted" data-template-editor-status role="status" aria-live="polite"></p><div class="whatsapp-template-editor-actions"><button class="button button-primary" type="submit"' + (!editable ? " disabled" : "") + '>' + (editing ? "Enviar alteração à Meta" : "Enviar para análise da Meta") + '</button></div></form></section>';
  }

  async function openTemplateEditor(templateId) {
    const root = $("whatsapp-templates-content");
    const host = root?.querySelector("[data-template-editor-host]");
    if (!root || !host || !templateAdminAccountId) return;
    if (!templateId) {
      host.innerHTML = templateEditorMarkup(null);
      root.querySelector('[data-template-editor-form] [name="category"]')?.focus();
      return;
    }
    const existing = templateAdminLoadedAccountId === templateAdminAccountId
      ? templateAdminItems.find((item) => item.id === templateId)
      : null;
    if (!existing || !Array.isArray(existing.components)) await loadTemplateAdminCatalog(false);
    const item = templateAdminItems.find((entry) => entry.id === templateId);
    if (!item || !Array.isArray(item.components)) {
      const status = root.querySelector("[data-template-admin-status]");
      if (status) status.textContent = "Não foi possível carregar o conteúdo completo desse modelo.";
      return;
    }
    host.innerHTML = templateEditorMarkup(item);
    host.querySelector('[data-template-editor-form] [data-template-body]')?.focus();
  }

  function templateDraftFromForm(form, existing) {
    const components = existing ? JSON.parse(JSON.stringify(existing.components || [])) : [];
    const headerField = form.querySelector("[data-template-header]");
    const headerValue = headerField && !headerField.readOnly ? headerField.value.trim() : "";
    const bodyValue = form.querySelector("[data-template-body]")?.value.trim() || "";
    const footerValue = form.querySelector('[name="footer"]')?.value.trim() || "";
    const examplesRaw = form.querySelector('[name="body_examples"]')?.value || "";
    const buildExample = (text, raw, type) => {
      const matches = Array.from(String(text || "").matchAll(/\{\{(\d+)\}\}/g));
      if (!matches.length) return null;
      const indexes = Array.from(new Set(matches.map((match) => Number(match[1])))).sort((a, b) => a - b);
      if (indexes.some((value, index) => value !== index + 1)) throw new Error("As variáveis devem seguir a ordem {{1}}, {{2}} e assim por diante.");
      const values = String(raw || "").split("|").map((value) => value.trim());
      if (values.length < indexes.length || values.slice(0, indexes.length).some((value) => !value)) {
        throw new Error("Preencha um exemplo para cada variável " + (type || "") + ".");
      }
      return type === "header" ? { header_text: values.slice(0, indexes.length) } : { body_text: [values.slice(0, indexes.length)] };
    };
    if (!bodyValue) throw new Error("Informe o texto principal do modelo.");
    const bodyExample = buildExample(bodyValue, examplesRaw, "do texto");
    if (existing) {
      const bodyIndex = components.findIndex((item) => String(item?.type || "").toUpperCase() === "BODY");
      if (bodyIndex < 0) throw new Error("Esse modelo não possui um corpo de texto editável.");
      components[bodyIndex] = Object.assign({}, components[bodyIndex], { text: bodyValue });
      if (bodyExample) components[bodyIndex].example = bodyExample;
      else delete components[bodyIndex].example;
      let headerIndex = components.findIndex((item) => String(item?.type || "").toUpperCase() === "HEADER");
      if (headerField && !headerField.readOnly) {
        const headerExampleRaw = form.querySelector('[name="header_examples"]')?.value || "";
        if (headerValue) {
          const headerExample = buildExample(headerValue, headerExampleRaw, "do cabeçalho");
          const headerComponent = { type: "HEADER", format: "TEXT", text: headerValue };
          if (headerExample) headerComponent.example = headerExample;
          if (headerIndex >= 0) components[headerIndex] = Object.assign({}, components[headerIndex], headerComponent);
          else components.unshift(headerComponent);
        } else if (headerIndex >= 0) components.splice(headerIndex, 1);
      }
      let footerIndex = components.findIndex((item) => String(item?.type || "").toUpperCase() === "FOOTER");
      if (footerValue) {
        if (footerIndex >= 0) components[footerIndex] = Object.assign({}, components[footerIndex], { text: footerValue });
        else components.push({ type: "FOOTER", text: footerValue });
      } else if (footerIndex >= 0) components.splice(footerIndex, 1);
    } else {
      const headerExampleRaw = form.querySelector('[name="header_examples"]')?.value || "";
      if (headerValue) {
        const headerExample = buildExample(headerValue, headerExampleRaw, "do cabeçalho");
        const headerComponent = { type: "HEADER", format: "TEXT", text: headerValue };
        if (headerExample) headerComponent.example = headerExample;
        components.push(headerComponent);
      }
      const bodyComponent = { type: "BODY", text: bodyValue };
      if (bodyExample) bodyComponent.example = bodyExample;
      components.push(bodyComponent);
      if (footerValue) components.push({ type: "FOOTER", text: footerValue });
    }
    const category = existing ? existing.category : form.querySelector('[name="category"]')?.value;
    return {
      name: existing ? existing.name : form.querySelector('[name="name"]')?.value.trim(),
      language: existing ? existing.language : form.querySelector('[name="language"]')?.value.trim(),
      category: String(category || "UTILITY").toUpperCase(),
      components,
    };
  }

  async function submitTemplateEditor(form) {
    if (form.dataset.saving === "true") return;
    const templateId = String(form.dataset.templateId || "");
    const existing = templateId ? templateAdminItems.find((item) => item.id === templateId) : null;
    if (templateId && !existing) {
      const status = form.querySelector("[data-template-editor-status]");
      if (status) status.textContent = "Carregue novamente o catálogo antes de editar.";
      return;
    }
    let draft;
    try { draft = templateDraftFromForm(form, existing); }
    catch (error) {
      const status = form.querySelector("[data-template-editor-status]");
      if (status) status.textContent = error instanceof Error ? error.message : "Revise o conteúdo do modelo.";
      return;
    }
    const action = existing ? "edit" : "create";
    const existingBody = existing ? templateComponent(existing.components, "BODY") : null;
    const additionalExamples = Array.isArray(existingBody?.example?.body_text) && existingBody.example.body_text.length > 1;
    const confirmation = existing
      ? "Enviar esta alteração do modelo para a Meta? A Meta poderá reclassificar ou reprovar o conteúdo."
      : "Enviar este modelo para análise da Meta? Ela definirá a categoria final e o status.";
    const confirmationDetails = additionalExamples ? "\n\nA edição simples manterá somente o primeiro conjunto de exemplos de variáveis." : "";
    if (!window.confirm(confirmation + confirmationDetails)) return;
    const submit = form.querySelector('button[type="submit"]');
    const status = form.querySelector("[data-template-editor-status]");
    form.dataset.saving = "true";
    if (submit) submit.disabled = true;
    if (status) status.textContent = "Enviando para a Meta…";
    try {
      const payload = { draft, confirmed: true };
      if (existing) payload.template_id = existing.id;
      else payload.account_id = templateAdminAccountId;
      const data = await templateAdminRequest(action, { method: "POST", payload });
      templateAdminItems = Array.isArray(data.items) ? data.items : [];
      templateAdminLoadedAccountId = templateAdminAccountId;
      templateAdminFallbackItems = templateAdminItems;
      renderTemplateAdminRows(templateAdminItems);
      if (data.sync_pending === true) {
        templateAdminStatus = "A Meta recebeu a solicitação, mas o catálogo ainda não sincronizou. Use Sincronizar com Meta antes de tentar novamente.";
      } else {
        templateAdminStatus = "Solicitação enviada. Categoria e status abaixo refletem o retorno sincronizado da Meta.";
      }
      const panelStatus = $("whatsapp-templates-content")?.querySelector("[data-template-admin-status]");
      if (panelStatus) panelStatus.textContent = templateAdminStatus;
      const editorHost = $("whatsapp-templates-content")?.querySelector("[data-template-editor-host]");
      if (editorHost) editorHost.innerHTML = "";
    } catch (error) {
      if (status) status.textContent = error instanceof Error ? error.message : "Não foi possível enviar o modelo.";
    } finally {
      form.dataset.saving = "false";
      if (submit?.isConnected) submit.disabled = false;
    }
  }

  function render(data) {
    lastOverview = data;
    const createCampaignButton = $("whatsapp-campaign-new");
    if (createCampaignButton) {
      const hasChannel = (data.channels || []).some((channel) => channel.id && channel.is_active !== false);
      const hasMarketingTemplate = (data.templates?.items || []).some((item) => item.id && item.whatsapp_account_id && String(item.status || "").toUpperCase() === "APPROVED" && String(item.category || "").toUpperCase() === "MARKETING");
      createCampaignButton.disabled = !hasChannel || !hasMarketingTemplate;
    }
    const channels = Array.isArray(data.channels) ? data.channels : [];
    const templateItems = Array.isArray(data.templates?.items) ? data.templates.items : [];
    const campaigns = Array.isArray(data.campaigns?.recent) ? data.campaigns.recent : [];
    const ana = Array.isArray(data.ana?.recent) ? data.ana.recent : [];
    const consentSummary = data.consent_summary || {};
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
    const campaignsMarkup = campaigns.length ? campaigns.map(campaignRecordRow).join("") : emptyList("Nenhuma campanha cadastrada.");
    const consentAuditMarkup = consentSummary.available ? `
      <section class="whatsapp-overview-card whatsapp-consent-audit">
        <div class="whatsapp-consent-heading"><div><h3>Consentimento registrado</h3><p class="admin-muted">Estado atual do cadastro · ${esc(consentSummary.total_count || 0)} clientes</p></div><span class="whatsapp-consent-readonly">Consulta agregada</span></div>
        <div class="whatsapp-consent-stat-grid">
          <div class="whatsapp-consent-stat"><span>Opt-in registrado</span><strong>${esc(consentSummary.opt_in_count || 0)}</strong></div>
          <div class="whatsapp-consent-stat is-suppressed"><span>Opt-out · excluído</span><strong>${esc(consentSummary.opt_out_count || 0)}</strong></div>
          <div class="whatsapp-consent-stat"><span>Sem consentimento</span><strong>${esc(consentSummary.no_consent_count || 0)}</strong></div>
        </div>
        <div class="whatsapp-consent-origins">
          <span>Declaração administrativa: <strong>${esc(consentSummary.merchant_owner_attestation_count || 0)}</strong></span>
          <span>Declaração histórica: <strong>${esc(consentSummary.historical_merchant_attestation_count || 0)}</strong></span>
          <span>Outra origem ou sem origem: <strong>${esc(consentSummary.other_opt_in_source_count || 0)}</strong></span>
          <span class="is-unverified">Evidência individual: <strong>Não verificada</strong></span>
        </div>
        <p class="whatsapp-consent-notice"><strong>Evidência individual recuperada: não verificada neste resumo.</strong> As origens administrativas são declarações registradas, e “outra origem” também precisa ser auditada. Confira a fonte original antes de campanhas amplas. Estes totais não são a prévia da campanha; a audiência também aplica cadastro ativo, telefone válido e filtros.</p>
      </section>` : `
      <section class="whatsapp-overview-card whatsapp-consent-audit">
        <h3>Consentimento registrado</h3>
        <p class="whatsapp-consent-notice">Resumo agregado indisponível. A tela não estima a elegibilidade das campanhas.</p>
      </section>`;
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
      <section class="whatsapp-overview-card"><h3>ANA por canal</h3><div class="whatsapp-channel-list">${channels.length ? channels.map((channel) => '<article class="whatsapp-channel"><div class="whatsapp-channel-head"><div><h3>' + esc(channel.name) + '</h3><p class="admin-muted">' + (channel.phone_last4 ? "Número terminado em •••• " + esc(channel.phone_last4) + " · " : "") + 'Entrada: ' + esc(human(channel.inbound_provider)) + ' · Saída: ' + esc(human(channel.outbound_provider)) + '</p></div></div><div class="whatsapp-channel-flags">' + flag("Atendimento ANA", channel.ana_enabled) + flag("Captura", channel.capture_enabled) + '</div></article>').join("") : emptyList("Nenhum canal cadastrado.")}</div></section>
      <section class="whatsapp-overview-card"><h3>Decisões recentes</h3><div class="whatsapp-record-list">${anaMarkup || emptyList("Sem decisões recentes da ANA.")}</div></section>`;

    renderTemplateAdmin(data, templateItems);

    $("whatsapp-campaigns-content").innerHTML = `
      <div class="whatsapp-record-summary">
        <article class="whatsapp-overview-card"><h3>Campanhas cadastradas</h3><strong class="whatsapp-metric">${esc(data.campaigns?.total || 0)}</strong><p class="admin-muted">registros no Supabase</p></article>
        <article class="whatsapp-overview-card"><h3>Lista carregada</h3><strong class="whatsapp-metric">${esc(campaigns.length)}</strong><p class="admin-muted">mais recentes</p></article>
        <article class="whatsapp-overview-card"><h3>Agendadas</h3><strong class="whatsapp-metric">${esc(campaigns.filter((item) => item.scheduled_for && !["completed", "failed", "cancelled"].includes(String(item.status || "").toLowerCase())).length)}</strong><p class="admin-muted">na lista recente</p></article>
      </div>
      ${consentAuditMarkup}<section class="whatsapp-overview-card"><h3>Campanhas recentes</h3><div class="whatsapp-record-list">${campaignsMarkup}</div></section>`;

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
    currentAnaDraftConfiguration = data.draft?.configuration && typeof data.draft.configuration === "object"
      ? data.draft.configuration
      : null;
    const channels = Array.isArray(data.channels) ? data.channels : [];
    const active = data.active || null;
    const draft = data.draft || null;
    const versions = Array.isArray(data.versions) ? data.versions : [];
    const tests = Array.isArray(data.test_runs) ? data.test_runs : [];
    const events = Array.isArray(data.events) ? data.events : [];
    const differences = Array.isArray(data.configuration_diff) ? data.configuration_diff : [];
    const decisions = Array.isArray(data.decisions) ? data.decisions : [];
    const latestTest = tests[0] || null;
    const draftAlreadyActive = Boolean(data.diff_available && differences.length && differences.every((item) => item.changed !== true));
    const publishableTest = Boolean(latestTest?.id && Number(latestTest.draft_revision) === Number(draft?.revision)
      && Number(latestTest.failed_count) === 0 && Number(latestTest.passed_count) > 0 && !draftAlreadyActive);
    const versionRows = versions.length ? versions.map((item) => recordRow(
      "Versão " + (item.version || "—"),
      [
        item.is_active ? "Versão ativa" : "Versão anterior",
        item.published_by ? "Por " + item.published_by : "",
        item.change_note || "",
      ].filter(Boolean).join(" · "),
      item.is_active ? "active" : "history",
      item.created_at,
    )).join("") : emptyList("Nenhuma versão ativa ou anterior.");
    const rollbackButtons = versions.filter((item) => !item.is_active && Number(item.id) > 0).map((item) =>
      '<button class="button button-outline whatsapp-ana-rollback-button" type="button" data-ana-rollback="' + esc(item.id) + '" data-version-label="' + esc(item.version || "") + '">Restaurar v' + esc(item.version || "—") + '</button>'
    ).join("");
    const eventRows = events.length ? events.map((item) => recordRow(
      human(item.action),
      [
        item.channel_key ? "Canal " + item.channel_key : "",
        item.draft_revision ? "Rascunho " + item.draft_revision : "",
        item.actor ? "Por " + item.actor : "",
        item.version_id ? "Versão registrada" : "",
      ].filter(Boolean).join(" · "),
      item.action,
      item.created_at,
    )).join("") : emptyList("Nenhuma alteração registrada.");
    const diffMarkup = data.diff_available && differences.length
      ? '<div class="whatsapp-ana-diff-list">' + differences.map((item) =>
        '<div class="whatsapp-ana-diff-row ' + (item.changed ? "changed" : "same") + '"><span>'
        + esc(item.label || human(item.key)) + '</span><strong>' + (item.changed ? "Alterado" : "Sem alteração") + "</strong></div>"
      ).join("") + "</div>"
      : emptyList("Comparação indisponível para esta versão.");
    const decisionMarkup = data.decisions_available !== true
      ? emptyList("Histórico de decisões indisponível.")
      : decisions.length ? decisions.map((item) => recordRow(
        human(item.decision || item.status),
        [item.channel || "Canal não informado", human(item.status)].join(" · "),
        item.status,
        item.created_at,
        anaReasonLabel(item.reason),
      )).join("")
      : emptyList("Sem decisões recentes da ANA.");
    $("whatsapp-ana-version-content").innerHTML = `
      <div class="whatsapp-record-summary">
        <article class="whatsapp-overview-card"><h3>Versão ativa</h3><strong class="whatsapp-metric">${active?.version ? "v" + esc(active.version) : "—"}</strong><p class="admin-muted">${active ? "Publicada em " + esc(dateLabel(active.created_at)) + (active.published_by ? " · por " + esc(active.published_by) : "") : "Nenhuma versão ativa"}</p></article>
        <article class="whatsapp-overview-card"><h3>Rascunho</h3><strong class="whatsapp-metric">${draft?.revision ? "r" + esc(draft.revision) : "—"}</strong><p class="admin-muted">${draft ? "Atualizado em " + esc(dateLabel(draft.updated_at)) + (draft.updated_by ? " · por " + esc(draft.updated_by) : "") : "Nenhum rascunho encontrado"}</p></article>
        <article class="whatsapp-overview-card"><h3>Último teste</h3><strong class="whatsapp-metric">${latestTest ? esc(latestTest.passed_count) + " / " + esc((latestTest.passed_count || 0) + (latestTest.failed_count || 0)) : "—"}</strong><p class="admin-muted">${latestTest ? esc(latestTest.failed_count || 0) + " falha(s) · " + esc(dateLabel(latestTest.created_at)) : "Nenhum teste registrado"}</p></article>
      </div>
      <section class="whatsapp-overview-card"><h3>Rascunho e versão ativa</h3><p class="admin-muted">Diferenças por seção da configuração da ANA.</p>${diffMarkup}</section>
      <div class="whatsapp-overview-grid">
        <section class="whatsapp-overview-card"><h3>Histórico de versões</h3><div class="whatsapp-record-list">${versionRows}</div>${rollbackButtons ? '<div class="whatsapp-ana-rollback-list"><span class="admin-muted">Restaurar configuração</span>' + rollbackButtons + '</div>' : ""}</section>
        <section class="whatsapp-overview-card"><h3>Atividade recente</h3><div class="whatsapp-record-list">${eventRows}</div></section>
      </div>`;
    $("whatsapp-ana-decisions").innerHTML =
      '<section class="whatsapp-overview-card"><h3>Decisões recentes da ANA</h3>'
      + '<p class="admin-muted">Últimas decisões registradas; o motivo é exibido sem carregar o texto original da conversa.</p>'
      + '<div class="whatsapp-record-list">' + decisionMarkup + '</div></section>';
    const channelMarkup = channels.length ? channels.map((channel) => `
      <article class="whatsapp-ana-channel">
        <div><h4>${esc(channel.name || "WhatsApp")}</h4><p class="admin-muted">${channel.phone_last4 ? "Número terminado em •••• " + esc(channel.phone_last4) : "Número não informado"}</p></div>
        <span class="whatsapp-ana-channel-state ${channel.ana_enabled ? "is-active" : "is-paused"}">${channel.ana_enabled ? "ANA ativa" : "ANA pausada"}</span>
        ${channel.ana_enabled && channel.id ? '<button class="button button-outline" type="button" data-ana-pause="' + esc(channel.id) + '" data-channel-name="' + esc(channel.name || "WhatsApp") + '" data-channel-last4="' + esc(channel.phone_last4 || "") + '">Pausar ANA</button>' : '<small class="admin-muted">Para reativar, revise a configuração ativa antes.</small>'}
      </article>`).join("") : emptyList("Nenhum canal WhatsApp cadastrado.");
    const delivery = data.delivery && typeof data.delivery === "object" ? data.delivery : {};
    const deliveryChannels = Array.isArray(delivery.channels) ? delivery.channels : [];
    const deliveryMarkup = delivery.available !== true
      ? emptyList("Não foi possível consultar os status atuais da Meta.")
      : deliveryChannels.length
        ? deliveryChannels.map((channel) => {
          const total = Math.max(0, Math.trunc(Number(channel.message_count) || 0));
          const counts = channel.status_counts && typeof channel.status_counts === "object" ? channel.status_counts : {};
          const statusMarkup = Object.entries(counts)
            .filter(([, count]) => Number(count) > 0)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([status, count]) => {
              const normalized = String(status).toLowerCase();
              const tone = ["delivered", "read"].includes(normalized)
                ? "is-confirmed"
                : ["failed", "rejected"].includes(normalized) ? "is-error" : "is-pending";
              return '<span class="whatsapp-ana-delivery-chip ' + tone + '">' + esc(anaDeliveryStatusLabel(status)) + ': ' + esc(Math.max(0, Math.trunc(Number(count) || 0))) + '</span>';
            }).join("");
          const latest = total
            ? total + " mensagem(ns) · mais recente em " + dateLabel(channel.last_message_at)
            : "Sem envios recentes da ANA";
          return '<article class="whatsapp-ana-delivery-row"><div><strong>' + esc(channel.name || "WhatsApp")
            + '</strong><small>' + (channel.phone_last4 ? "•••• " + esc(channel.phone_last4) + " · " : "")
            + esc(latest) + '</small></div><div class="whatsapp-ana-status-counts">'
            + (statusMarkup || '<span class="admin-muted">Sem status registrado</span>') + '</div></article>';
        }).join("")
        : emptyList("Nenhum canal WhatsApp cadastrado.");
    const testDetails = Array.isArray(latestAnaDryRunDetails?.results) ? latestAnaDryRunDetails.results : [];
    const testDetailsMarkup = testDetails.length
      ? '<div class="whatsapp-ana-test-results"><h4>Resultado do teste seco · ' + esc(latestAnaDryRunDetails.test_run?.passed_count || 0) + ' aprovados, ' + esc(latestAnaDryRunDetails.test_run?.failed_count || 0) + ' falhas</h4>'
        + testDetails.map((item) => '<div class="whatsapp-ana-test-row ' + (item.passed ? "is-pass" : "is-fail") + '"><span>' + esc(item.key || "Cenário") + '</span><strong>' + (item.passed ? "Aprovado" : "Falhou") + '</strong><small>Esperado: ' + esc(human(item.expected)) + ' · Obtido: ' + esc(human(item.actual)) + '</small></div>').join("")
        + '</div>'
      : "";
    const publishButton = publishableTest
      ? '<button class="button button-primary" type="button" data-ana-publish="' + esc(latestTest.id) + '">Ativar rascunho testado</button>'
      : '<button class="button button-outline" type="button" disabled title="O rascunho precisa passar no teste seco atual.">' + (draftAlreadyActive ? "Rascunho já está ativo" : "Teste seco aprovado obrigatório") + '</button>';
    $("whatsapp-ana-content").innerHTML = `
      ${anaConfigurationEditorMarkup(draft)}
      <section class="whatsapp-overview-card"><h3>Estado por número</h3>
        <p class="admin-muted">A pausa impede novas respostas automáticas nesse número; captura e atendimento humano permanecem ativos.</p>
        <div class="whatsapp-ana-channels">${channelMarkup}</div>
      </section>
      <section class="whatsapp-overview-card"><h3>Status dos envios da ANA via Meta</h3>
        <p class="admin-muted">Status atual das mensagens nos até ${esc(delivery.sample_limit || 200)} envios mais recentes. Aceitação da API não conta como entrega.</p>
        <div class="whatsapp-ana-delivery-list">${deliveryMarkup}</div>
      </section>
      <section class="whatsapp-overview-card"><h3>Teste seco e ativação interna</h3>
        <p class="admin-muted">O teste avalia os cenários do rascunho e registra o resultado. Ativar altera a configuração usada pela ANA; isso não publica modelos Meta nem envia mensagens.</p>
        <div class="whatsapp-ana-admin-actions">
          <button class="button button-outline" type="button" data-ana-test data-draft-revision="${esc(draft?.revision || "")}" ${draft?.revision ? "" : "disabled"}>Executar teste seco</button>
          ${publishButton}
        </div>
        ${testDetailsMarkup}
      </section>`;
    $("whatsapp-ana-status").textContent = "Versões, comparação e histórico consultados. " + (delivery.available === true ? "Status Meta atual consultado." : "Status Meta indisponível.") + " Testes, ativação interna e pausa exigem confirmação.";

  }

  async function anaAdminRequest(action, payload) {
    const response = await fetch(supabase + "/functions/v1/site-admin-v1", {
      method: "POST",
      headers: {
        apikey: publishableKey,
        "x-admin-code": window.DonaAdminAuth?.getCode?.() || "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(Object.assign({ action }, payload || {})),
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      const messages = {
        revision_conflict: "O rascunho mudou. Atualize a tela antes de tentar novamente.",
        draft_already_active: "A configuração ativa já corresponde a este rascunho.",
        admin_identity_unavailable: "Não foi possível resolver o usuário owner ativo do Admin.",
        required_test_cases_missing: "O rascunho não tem cenários de teste configurados.",
        test_run_missing_or_stale_or_failed: "O teste não passou para a revisão atual do rascunho.",
        configuration_invalid: "Corrija as validações da configuração antes de ativar.",
        trigger_label_not_active: "Um gatilho usa uma etiqueta que não está ativa.",
        version_already_active: "Essa versão já está ativa.",
      };
      throw new Error(messages[data.error] || data.message || data.error || "Não foi possível concluir a ação da ANA.");
    }
    return data;
  }

  async function runAnaDryTest(button) {
    const revision = Number(button?.dataset?.draftRevision);
    if (!Number.isSafeInteger(revision) || revision < 1 || button.disabled) return;
    if (!window.confirm("Executar o teste seco do rascunho? Ele pode chamar a IA e gerar custo. O resultado fica registrado; nenhuma mensagem é enviada.")) return;
    const status = $("whatsapp-ana-status");
    latestAnaDryRunDetails = null;
    button.disabled = true;
    if (status) status.textContent = "Executando cenários do teste seco…";
    try {
      const data = await anaAdminRequest("whatsapp_ana_admin_test", { expected_revision: revision });
      latestAnaDryRunDetails = { test_run: data.test_run || {}, results: Array.isArray(data.results) ? data.results : [] };
      if (status) status.textContent = "Teste seco concluído. Nenhuma mensagem foi enviada.";
      await loadAnaStatus(true);
    } catch (error) {
      if (status) status.textContent = error instanceof Error ? error.message : "Não foi possível executar o teste seco.";
    } finally {
      if (button.isConnected) button.disabled = false;
    }
  }

  async function publishAnaDraft(button) {
    const testRunId = String(button?.dataset?.anaPublish || "");
    if (!testRunId || button.disabled) return;
    if (!window.confirm("Ativar a configuração interna da ANA após o teste aprovado? Isso altera as respostas automáticas a partir da configuração atual, mas não publica modelos Meta nem envia mensagem.")) return;
    const status = $("whatsapp-ana-status");
    button.disabled = true;
    if (status) status.textContent = "Ativando configuração da ANA…";
    try {
      const data = await anaAdminRequest("whatsapp_ana_admin_publish", { test_run_id: testRunId, note: "Ativação confirmada no Admin" });
      if (status) status.textContent = "Configuração ANA v" + String(data.version || "—") + " ativada.";
      await loadAnaStatus(true);
    } catch (error) {
      if (status) status.textContent = error instanceof Error ? error.message : "Não foi possível ativar o rascunho.";
    } finally {
      if (button.isConnected) button.disabled = false;
    }
  }

  async function rollbackAnaVersion(button) {
    const versionId = Number(button?.dataset?.anaRollback);
    const versionLabel = String(button?.dataset?.versionLabel || "");
    if (!Number.isSafeInteger(versionId) || versionId < 1 || button.disabled) return;
    if (!window.confirm("Restaurar a versão " + (versionLabel || versionId) + " da configuração interna da ANA? Isso não publica modelos Meta nem envia mensagens.")) return;
    const status = $("whatsapp-ana-status");
    button.disabled = true;
    if (status) status.textContent = "Restaurando configuração ANA v" + (versionLabel || versionId) + "…";
    try {
      const data = await anaAdminRequest("whatsapp_ana_admin_rollback", { version_id: versionId, note: "Restauração confirmada no Admin" });
      if (status) status.textContent = "Configuração ANA v" + String(data.version || versionLabel || versionId) + " restaurada.";
      await loadAnaStatus(true);
    } catch (error) {
      if (status) status.textContent = error instanceof Error ? error.message : "Não foi possível restaurar a versão.";
    } finally {
      if (button.isConnected) button.disabled = false;
    }
  }

  async function pauseAnaChannel(button) {
    const accountId = String(button?.dataset?.anaPause || "");
    if (!accountId || button.disabled) return;
    const channelName = String(button.dataset.channelName || "este canal");
    const last4 = String(button.dataset.channelLast4 || "");
    const channelLabel = channelName + (last4 ? " · final " + last4 : "");
    if (!window.confirm("Pausar a ANA em " + channelLabel + "? A captura e o atendimento humano permanecem ativos.")) return;

    button.disabled = true;
    const status = $("whatsapp-ana-status");
    if (status) status.textContent = "Pausando ANA em " + channelLabel + "…";
    try {
      const response = await fetch(`${supabase}/functions/v1/site-admin-v1`, {
        method: "POST",
        headers: {
          apikey: publishableKey,
          "x-admin-code": window.DonaAdminAuth?.getCode?.() || "",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "whatsapp_ana_pause_channel", whatsapp_account_id: accountId }),
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) throw new Error(data.message || data.error || "Não foi possível pausar a ANA.");
      if (status) status.textContent = "ANA pausada em " + channelLabel + ".";
      await loadAnaStatus(true);
    } catch (error) {
      if (status) status.textContent = error instanceof Error ? error.message : "Não foi possível pausar a ANA.";
    } finally {
      if (button.isConnected) button.disabled = false;
    }
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

  $("whatsapp-campaigns-content")?.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const actionButton = target?.closest("[data-campaign-action]");
    const contentPreviewButton = target?.closest("[data-campaign-content-preview]");
    const editButton = target?.closest("[data-campaign-edit]");
    const previewButton = target?.closest("[data-campaign-preview]");
    if (actionButton) runCampaignAction(actionButton);
    else if (contentPreviewButton) loadCampaignContentPreview(contentPreviewButton);
    else if (editButton) openCampaignDraftEditor(editButton.dataset.campaignEdit);
    else if (previewButton) loadCampaignPreview(previewButton);
  });
  $("whatsapp-campaign-new")?.addEventListener("click", () => openCampaignDraftEditor("")); 
  $("whatsapp-campaign-editor")?.addEventListener("click", (event) => {
    const closeButton = event.target instanceof Element ? event.target.closest("[data-campaign-editor-close]") : null;
    if (closeButton) { const host = $("whatsapp-campaign-editor"); if (host) { host.hidden = true; host.innerHTML = ""; } }
  });
  $("whatsapp-campaign-editor")?.addEventListener("change", (event) => {
    const root = $("whatsapp-campaign-editor");
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!root || !target) return;
    if (target instanceof HTMLSelectElement && target.name === "whatsapp_account_id") {
      syncCampaignTemplateOptions(root);
      void refreshCampaignTemplateVariables(root, {});
    } else if (target instanceof HTMLSelectElement && target.name === "template_id") {
      void refreshCampaignTemplateVariables(root, {});
    } else if (target.matches("[data-campaign-variable-mode]")) {
      updateCampaignVariableMode(target.closest("[data-campaign-variable-row]"));
      renderCampaignTemplateExample(root.querySelector("[data-campaign-draft-form]"));
    }
  });
  $("whatsapp-campaign-editor")?.addEventListener("input", (event) => {
    if (!(event.target instanceof HTMLElement) || !event.target.matches("[data-campaign-variable-value], [data-campaign-variable-fallback]")) return;
    renderCampaignTemplateExample($("whatsapp-campaign-editor")?.querySelector("[data-campaign-draft-form]"));
  });
  $("whatsapp-campaign-editor")?.addEventListener("submit", (event) => {
    const form = event.target instanceof HTMLFormElement ? event.target.closest("[data-campaign-draft-form]") : null;
    if (!form) return;
    event.preventDefault();
    submitCampaignDraft(form);
  });
  document.querySelectorAll("[data-whatsapp-overview-refresh]").forEach((button) => button.addEventListener("click", () => loadOverview(true)));
  $("whatsapp-ana-content")?.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const testButton = target?.closest("[data-ana-test]");
    const publishButton = target?.closest("[data-ana-publish]");
    const pauseButton = target?.closest("[data-ana-pause]");
    const addKnowledgeButton = target?.closest("[data-ana-knowledge-add]");
    const removeKnowledgeButton = target?.closest("[data-ana-knowledge-remove]");
    if (testButton) runAnaDryTest(testButton);
    else if (publishButton) publishAnaDraft(publishButton);
    else if (pauseButton) pauseAnaChannel(pauseButton);
    else if (addKnowledgeButton) addAnaKnowledgeRow();
    else if (removeKnowledgeButton) {
      const row = removeKnowledgeButton.closest("[data-ana-knowledge-row]");
      row?.remove();
      const list = $("whatsapp-ana-content")?.querySelector("[data-ana-knowledge-list]");
      if (list && !list.querySelector("[data-ana-knowledge-row]")) list.innerHTML = '<p class="admin-muted" data-ana-knowledge-empty>Adicione informações confiáveis para a ANA consultar.</p>';
    }
  });
  $("whatsapp-ana-content")?.addEventListener("submit", (event) => {
    const form = event.target instanceof HTMLFormElement ? event.target.closest("[data-ana-editor]") : null;
    if (!form) return;
    event.preventDefault();
    saveAnaDraft(form);
  });
  const templateRoot = $("whatsapp-templates-content");
  templateRoot?.addEventListener("change", (event) => {
    const select = event.target instanceof HTMLSelectElement ? event.target.closest("[data-template-account]") : null;
    if (!select) return;
    templateAdminAccountId = select.value;
    templateAdminLoadedAccountId = "";
    templateAdminItems = [];
    templateAdminStatus = "";
    const editor = templateRoot.querySelector("[data-template-editor-host]");
    if (editor) editor.innerHTML = "";
    renderTemplateAdminRows(templateAdminFallbackItems.filter((item) => !item.whatsapp_account_id || item.whatsapp_account_id === templateAdminAccountId));
  });
  templateRoot?.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest("[data-template-load]")) loadTemplateAdminCatalog(false);
    else if (target?.closest("[data-template-sync]")) loadTemplateAdminCatalog(true);
    else if (target?.closest("[data-template-new]")) openTemplateEditor("");
    else if (target?.closest("[data-template-editor-close]")) {
      const editor = templateRoot.querySelector("[data-template-editor-host]");
      if (editor) editor.innerHTML = "";
    } else {
      const edit = target?.closest("[data-template-edit]");
      if (edit?.dataset.templateEdit) openTemplateEditor(edit.dataset.templateEdit);
    }
  });
  templateRoot?.addEventListener("submit", (event) => {
    const form = event.target instanceof HTMLFormElement ? event.target.closest("[data-template-editor-form]") : null;
    if (!form) return;
    event.preventDefault();
    submitTemplateEditor(form);
  });
  $("whatsapp-ana-version-content")?.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest("[data-ana-rollback]") : null;
    if (button) rollbackAnaVersion(button);
  });
  $("whatsapp-ana-refresh")?.addEventListener("click", () => loadAnaStatus(true));
  window.DonaWhatsAppAdmin = { loadOverview, loadAnaStatus };
})();
