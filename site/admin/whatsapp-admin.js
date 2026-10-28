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
    if (!snapshot) return item.snapshot_lookup_limited
      ? "Não localizado entre os 2.000 snapshots recentes"
      : "Sem snapshot congelado";
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
      const suppressed = label === "Opt-out" && Number(value) > 0;
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
    return '<button class="button ' + style + '" type="button" data-campaign-action="' + esc(action) + '" data-campaign-id="' + esc(item.id) + '" data-campaign-revision="' + esc(Math.max(0, Math.trunc(Number(item.revision) || 0))) + '">' + esc(label) + "</button>";
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
    if (status === "approved" && currentSnapshot) {
      const min = campaignLocalDateTimeValue(Date.now() + 5 * 60 * 1000);
      actions.push(
        '<label class="whatsapp-campaign-schedule"><span>Agendar a partir de</span><input type="datetime-local" data-campaign-schedule-time data-campaign-id="' + esc(item.id) + '" data-campaign-revision="' + esc(revision) + '" min="' + esc(min) + '"></label>'
        + campaignActionButton(item, "schedule", "Agendar campanha", "button-primary")
      );
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
      confirmation = "Aprovar esta audiência congelada para que possa ser agendada depois? Esta aprovação não agenda nem envia mensagens.";
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
      confirmation = "Agendar " + (campaign.name || "esta campanha") + " para " + new Date(scheduledAt).toLocaleString("pt-BR") + " no canal " + (campaign.channel || "selecionado") + ". O snapshot tem " + eligible + " destinatários aptos. A execução poderá enviar mensagens reais pelo WhatsApp no horário escolhido. Revise o consentimento, o modelo Meta e o lote antes de confirmar.";
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
      await campaignAdminRequest(requestAction, payload);
      await loadOverview(true);
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
    return '<article class="whatsapp-record-row whatsapp-campaign-row"><div class="whatsapp-record-main">'
      + '<h3>' + esc(item.name || "Campanha") + "</h3><p>" + esc(subtitle) + "</p>"
      + campaignDeliveryMarkup(item)
      + '<small class="whatsapp-campaign-snapshot">' + esc(campaignSnapshotLabel(item)) + "</small>"
      + campaignExclusionMarkup(item)
      + (item.id ? '<button class="button button-outline whatsapp-campaign-preview-button" type="button" data-campaign-preview="' + esc(item.id) + '" aria-expanded="false">Prévia do público</button><div class="whatsapp-campaign-preview" data-campaign-preview-result hidden role="status" aria-live="polite"></div>' : "")
      + (item.status === "draft" && item.draft_editable ? '<button class="button button-outline whatsapp-campaign-edit-button" type="button" data-campaign-edit="' + esc(item.id) + '">Editar rascunho</button>' : "")
      + campaignActionsMarkup(item)
      + '</div><div class="whatsapp-record-side"><span class="whatsapp-record-status ' + statusClass(item.status) + '">'
      + esc(human(item.status)) + "</span><time>" + esc(dateLabel(when)) + "</time></div></article>";
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
      + '<div class="whatsapp-campaign-field-wide"><h4>Filtros da audiência</h4><p class="admin-muted">Use pelo menos um filtro. Opt-outs, sem consentimento, cadastros inativos e telefones inválidos continuam excluídos pelo motor existente.</p></div>'
      + filterInputs
      + '</div><p class="whatsapp-campaign-editor-note">Antes de qualquer campanha ampla, confira a evidência individual de consentimento. Este formulário só salva rascunhos.</p>'
      + '<div class="whatsapp-campaign-editor-actions"><p data-campaign-draft-status class="admin-muted" role="status" aria-live="polite"></p>'
      + '<button class="button button-primary" type="submit">' + (editing ? "Salvar rascunho" : "Criar rascunho") + '</button></div></form></section>';
    host.hidden = false;
    syncCampaignTemplateOptions(host);
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
    const payload = {
      name: String(name?.value || "").trim(),
      whatsapp_account_id: String(account?.value || ""),
      template_id: String(template?.value || ""),
      filters,
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
        </div>
        <p class="whatsapp-consent-notice">As origens administrativas registradas não recuperam evidência individual. Audite a fonte original antes de campanhas amplas. Estes totais não são a prévia de uma campanha; a audiência também aplica cadastro ativo, telefone válido e filtros.</p>
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
    const channels = Array.isArray(data.channels) ? data.channels : [];
    const active = data.active || null;
    const draft = data.draft || null;
    const versions = Array.isArray(data.versions) ? data.versions : [];
    const tests = Array.isArray(data.test_runs) ? data.test_runs : [];
    const events = Array.isArray(data.events) ? data.events : [];
    const differences = Array.isArray(data.configuration_diff) ? data.configuration_diff : [];
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
    const channelMarkup = channels.length ? channels.map((channel) => `
      <article class="whatsapp-ana-channel">
        <div><h4>${esc(channel.name || "WhatsApp")}</h4><p class="admin-muted">${channel.phone_last4 ? "Número terminado em •••• " + esc(channel.phone_last4) : "Número não informado"}</p></div>
        <span class="whatsapp-ana-channel-state ${channel.ana_enabled ? "is-active" : "is-paused"}">${channel.ana_enabled ? "ANA ativa" : "ANA pausada"}</span>
        ${channel.ana_enabled && channel.id ? '<button class="button button-outline" type="button" data-ana-pause="' + esc(channel.id) + '" data-channel-name="' + esc(channel.name || "WhatsApp") + '" data-channel-last4="' + esc(channel.phone_last4 || "") + '">Pausar ANA</button>' : '<small class="admin-muted">Para reativar, revise a configuração ativa antes.</small>'}
      </article>`).join("") : emptyList("Nenhum canal WhatsApp cadastrado.");
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
      <section class="whatsapp-overview-card"><h3>Estado por número</h3>
        <p class="admin-muted">A pausa impede novas respostas automáticas nesse número; captura e atendimento humano permanecem ativos.</p>
        <div class="whatsapp-ana-channels">${channelMarkup}</div>
      </section>
      <section class="whatsapp-overview-card"><h3>Teste seco e ativação interna</h3>
        <p class="admin-muted">O teste avalia os cenários do rascunho e registra o resultado. Ativar altera a configuração usada pela ANA; isso não publica modelos Meta nem envia mensagens.</p>
        <div class="whatsapp-ana-admin-actions">
          <button class="button button-outline" type="button" data-ana-test data-draft-revision="${esc(draft?.revision || "")}" ${draft?.revision ? "" : "disabled"}>Executar teste seco</button>
          ${publishButton}
        </div>
        ${testDetailsMarkup}
      </section>`;
    $("whatsapp-ana-status").textContent = "Versões, comparação e histórico consultados. Testes, ativação interna e pausa exigem confirmação.";

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
    const editButton = target?.closest("[data-campaign-edit]");
    const previewButton = target?.closest("[data-campaign-preview]");
    if (actionButton) runCampaignAction(actionButton);
    else if (editButton) openCampaignDraftEditor(editButton.dataset.campaignEdit);
    else if (previewButton) loadCampaignPreview(previewButton);
  });
  $("whatsapp-campaign-new")?.addEventListener("click", () => openCampaignDraftEditor("")); 
  $("whatsapp-campaign-editor")?.addEventListener("click", (event) => {
    const closeButton = event.target instanceof Element ? event.target.closest("[data-campaign-editor-close]") : null;
    if (closeButton) { const host = $("whatsapp-campaign-editor"); if (host) { host.hidden = true; host.innerHTML = ""; } }
  });
  $("whatsapp-campaign-editor")?.addEventListener("change", (event) => {
    if (event.target instanceof HTMLSelectElement && event.target.name === "whatsapp_account_id") syncCampaignTemplateOptions($("whatsapp-campaign-editor"));
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
    if (testButton) runAnaDryTest(testButton);
    else if (publishButton) publishAnaDraft(publishButton);
    else if (pauseButton) pauseAnaChannel(pauseButton);
  });
  $("whatsapp-ana-version-content")?.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest("[data-ana-rollback]") : null;
    if (button) rollbackAnaVersion(button);
  });
  $("whatsapp-ana-refresh")?.addEventListener("click", () => loadAnaStatus(true));
  window.DonaWhatsAppAdmin = { loadOverview, loadAnaStatus };
})();
