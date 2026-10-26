import {
  attendanceChannelFromPhone,
  type AnaAdminSnapshot,
  type AttendanceAccount,
  type AttendanceChannel,
  type AttendanceConversationSnapshot,
  type AttendanceMediaPreview,
  type AttendanceQueueItem,
} from "../domain/attendance";

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] ?? character);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function dateLabel(value: unknown): string {
  const time = Date.parse(String(value ?? ""));
  return Number.isFinite(time) ? new Date(time).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "";
}

function phoneHint(value: unknown): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length >= 4 ? `•••• ${digits.slice(-4)}` : "WhatsApp";
}

function channelAccount(accounts: AttendanceAccount[], channel: AttendanceChannel): AttendanceAccount | undefined {
  return accounts.find((account) => attendanceChannelFromPhone(account.phone_e164) === channel);
}

function modeLabel(mode: unknown): string {
  return ({ ai: "ANA", human: "Humano", human_copilot: "Humano + ANA", paused: "Pausado" } as Record<string, string>)[String(mode ?? "")] ?? "Aguardando";
}

function latestText(item: AttendanceQueueItem): string {
  return text(item.last_message_text ?? item.last_text ?? item.preview, "Sem mensagem recente");
}

function queueName(item: AttendanceQueueItem): string {
  return text(item.display_name ?? item.customer_name ?? item.name, phoneHint(item.phone_e164));
}

function conversationName(conversation: Record<string, unknown>, fallback: AttendanceQueueItem | null): string {
  return text(conversation.display_name ?? conversation.customer_name ?? conversation.name, fallback ? queueName(fallback) : "Conversa");
}

function messageText(message: Record<string, unknown>): string {
  return text(message.text_body ?? message.text ?? message.caption, message.message_type === "text" ? "Mensagem sem texto" : "Mensagem de mídia");
}

function messageAttachment(message: Record<string, unknown>, input: AttendancePanelInput): string {
  const messageType = text(message.message_type).toLowerCase();
  if (!["image", "audio", "video", "document", "sticker"].includes(messageType)) return "";
  const messageId = text(message.id);
  if (!messageId) return `<small class="attendance-media-note">Anexo sem identificador disponível.</small>`;
  const preview = input.mediaPreviews[messageId];
  if (preview && Date.parse(preview.expires_at) > Date.now()) {
    const url = escapeHtml(preview.url);
    const filename = escapeHtml(preview.filename || "Anexo do WhatsApp");
    if (preview.mime_type.startsWith("image/")) return `<div class="attendance-media-preview"><img src="${url}" alt="${filename}" loading="lazy" referrerpolicy="no-referrer"></div>`;
    if (preview.mime_type.startsWith("audio/")) return `<div class="attendance-media-preview"><audio controls preload="metadata" src="${url}" aria-label="${filename}"></audio></div>`;
    if (preview.mime_type.startsWith("video/")) return `<div class="attendance-media-preview"><video controls preload="metadata" src="${url}" aria-label="${filename}" referrerpolicy="no-referrer"></video></div>`;
    return `<div class="attendance-media-preview"><a href="${url}" download="${filename}" rel="noopener noreferrer">Baixar ${filename}</a></div>`;
  }
  const loading = input.mediaLoadingMessageId === messageId;
  return `<button class="button button-soft attendance-media-button" type="button" data-action="attendance-load-media" data-id="${escapeHtml(messageId)}" ${input.mediaLoadingMessageId ? "disabled" : ""}>${loading ? "Carregando anexo…" : "Ver anexo"}</button>`;
}

export interface AttendancePanelInput {
  authorized: boolean;
  busy: boolean;
  loaded: boolean;
  channel: AttendanceChannel;
  accounts: AttendanceAccount[];
  queue: AttendanceQueueItem[];
  selectedConversationId: string;
  conversation: AttendanceConversationSnapshot | null;
  mediaPreviews: Record<string, AttendanceMediaPreview>;
  mediaLoadingMessageId: string;
  search: string;
  ana: AnaAdminSnapshot | null;
  notice: string;
}

export function renderAttendancePanel(input: AttendancePanelInput): string {
  const account = channelAccount(input.accounts, input.channel);
  const current = input.queue.find((item) => String(item.conversation_id ?? item.id ?? "") === input.selectedConversationId) ?? null;
  const channelConfig = input.ana?.channels?.find((item) => item.id === account?.id);
  const messages = Array.isArray(input.conversation?.messages) ? input.conversation!.messages! : [];
  const detail = record(input.conversation?.conversation);
  const mode = text(detail.mode ?? current?.mode, "ai");
  const capability = record(input.conversation?.send_capability);
  const operatorAssignment = text(detail.operator_assignment, "unassigned");
  const isAssignedToCurrentOperator = operatorAssignment === "current";
  const isAssignedToOtherOperator = operatorAssignment === "other";
  const canSend = capability.enabled === true && ["human", "human_copilot"].includes(mode) && isAssignedToCurrentOperator;
  const serviceWindow = record(input.conversation?.service_window);
  const anaEnabled = channelConfig?.ana_enabled === true;
  const owner = input.ana?.role === "owner";
  const humanMode = ["human", "human_copilot"].includes(mode);
  const cannotTakeOverOwnedConversation = mode === "human" && isAssignedToOtherOperator;

  const channelButtons = (["0975", "1018"] as const).map((channel) => {
    const selected = input.channel === channel;
    const channelAccountValue = channelAccount(input.accounts, channel);
    const channelStatus = input.ana?.channels?.find((item) => item.id === channelAccountValue?.id);
    return `<button class="attendance-channel ${selected ? "is-selected" : ""}" data-action="attendance-channel" data-channel="${channel}" ${input.busy ? "disabled" : ""}>
      <span>Número final ${channel}</span><strong>${channelStatus ? (channelStatus.ana_enabled ? "ANA ativa" : "ANA desligada") : "Estado não consultado"}</strong>
    </button>`;
  }).join("");

  if (!input.authorized) {
    return `<section class="workspace-heading"><div><span class="eyebrow">Operação · WhatsApp</span><h1>Atendimento</h1><p>Entre com a conta GitHub autorizada para abrir as conversas.</p></div></section><div class="empty-state"><strong>Autenticação necessária</strong><span>A fila e as mensagens só ficam disponíveis para uma conta autorizada no novo Admin e no Vitrine.</span></div>`;
  }

  const conversationHeader = current
    ? `<div class="attendance-conversation-heading"><div><span class="eyebrow">Canal ${input.channel} · ${phoneHint(detail.phone_e164 ?? current.phone_e164)}</span><h2>${escapeHtml(conversationName(detail, current))}</h2><span class="attendance-mode-pill">${escapeHtml(modeLabel(mode))}</span></div><div class="attendance-actions">
        ${humanMode && isAssignedToCurrentOperator ? `<button class="button button-soft" data-action="attendance-resume" data-id="${escapeHtml(input.selectedConversationId)}">Liberar para ANA</button>` : cannotTakeOverOwnedConversation ? `<span class="attendance-owner-note">Atendimento atribuído a outra pessoa</span>` : `<button class="button button-soft" data-action="attendance-takeover" data-id="${escapeHtml(input.selectedConversationId)}" data-assignment="${escapeHtml(operatorAssignment)}">Assumir atendimento</button>`}
      </div></div>`
    : `<div class="attendance-empty"><strong>Selecione uma conversa</strong><span>As mensagens e os controles de atendimento aparecerão aqui.</span></div>`;

  const messageList = current
    ? `<div class="attendance-messages" aria-live="polite">${messages.length ? messages.map((raw) => {
      const message = record(raw);
      const direction = text(message.direction ?? message.flow, "inbound");
      const isOutbound = ["outbound", "out", "sent"].includes(direction);
      return `<article class="attendance-message ${isOutbound ? "is-outbound" : "is-inbound"}"><p>${escapeHtml(messageText(message))}</p>${messageAttachment(message, input)}<small>${isOutbound ? "Atendimento" : "Cliente"}${dateLabel(message.message_at ?? message.created_at) ? ` · ${escapeHtml(dateLabel(message.message_at ?? message.created_at))}` : ""}</small></article>`;
    }).join("") : `<div class="attendance-empty"><strong>Sem mensagens carregadas</strong><span>Atualize a conversa para tentar novamente.</span></div>`}</div>
      <form id="attendance-send-form" class="attendance-composer">
        <label class="sr-only" for="attendance-message-text">Mensagem</label>
        <textarea id="attendance-message-text" name="text" maxlength="4000" rows="3" placeholder="Escreva uma resposta…" ${canSend ? "" : "disabled"} required></textarea>
        <div><span>${canSend ? (serviceWindow.open === true ? "Janela de atendimento aberta" : "Envio humano autorizado pelo canal") : isAssignedToOtherOperator ? "A conversa está atribuída a outro operador." : !isAssignedToCurrentOperator ? "Assuma a conversa antes de responder." : "Confira a janela e a homologação para responder."}</span><button class="button button-primary" type="submit" ${canSend && !input.busy ? "" : "disabled"}>Enviar</button></div>
      </form>`
    : `<div class="attendance-messages attendance-empty-space"></div>`;

  return `<section class="workspace-heading attendance-heading"><div><span class="eyebrow">Operação · Central simples</span><h1>Atendimento WhatsApp</h1><p>Fila, histórico e troca explícita entre a ANA existente e o atendimento humano.</p></div><button class="button button-primary" data-action="attendance-refresh" ${input.busy ? "disabled" : ""}>Atualizar fila</button></section>
    <div class="attendance-channel-grid">${channelButtons}</div>
    ${account ? `<section class="attendance-ana-card"><div><span class="eyebrow">Inteligência artificial</span><strong>ANA · canal ${input.channel}</strong><span>${channelConfig ? (anaEnabled ? "A ANA pode atender neste número." : "A ANA está desligada para este número.") : "Carregue o estado dos canais para consultar a ANA."}</span></div>${owner && channelConfig ? `<button class="button ${anaEnabled ? "button-soft" : "button-primary"}" data-action="attendance-toggle-ana" data-enabled="${anaEnabled ? "false" : "true"}" data-account="${escapeHtml(account.id)}" ${input.busy ? "disabled" : ""}>${anaEnabled ? "Desligar ANA neste número" : "Ativar ANA neste número"}</button>` : `<small>${input.ana ? "Apenas o responsável pode alterar a IA do canal." : "Estado protegido pelo servidor."}</small>`}</section>` : `<div class="flow-safety-note"><strong>Canal não encontrado</strong><span>O servidor não retornou uma conta WhatsApp com final ${input.channel}. A fila não será consultada até o vínculo ser confirmado.</span></div>`}
    ${input.notice ? `<div class="attendance-inline-notice" role="status">${escapeHtml(input.notice)}</div>` : ""}
    <div class="attendance-layout"><aside class="attendance-queue-card"><div class="attendance-queue-heading"><div><h2>Conversas</h2><span>${input.loaded ? `${input.queue.length} na fila` : "Ainda não carregada"}</span></div></div><form id="attendance-search-form" class="attendance-search"><input name="query" type="search" value="${escapeHtml(input.search)}" placeholder="Buscar nome ou conversa" aria-label="Buscar conversas"><button class="button button-soft" type="submit" ${input.busy ? "disabled" : ""}>Buscar</button></form>
      ${!input.loaded ? `<div class="attendance-empty"><span>Carregue as conversas do número ${input.channel}.</span><button class="button button-soft" data-action="attendance-refresh" ${input.busy ? "disabled" : ""}>Carregar conversas</button></div>` : input.queue.length ? `<div class="attendance-queue-list">${input.queue.map((item) => {
        const id = String(item.conversation_id ?? item.id ?? "");
        const unread = Number(item.unread_count ?? 0);
        const direction = String(item.last_message_direction ?? item.direction ?? "");
        return `<button class="attendance-queue-row ${id === input.selectedConversationId ? "is-selected" : ""}" data-action="attendance-open" data-id="${escapeHtml(id)}" ${input.busy ? "disabled" : ""}><span class="attendance-queue-row-heading"><strong>${escapeHtml(queueName(item))}</strong><small>${escapeHtml(phoneHint(item.phone_e164))}</small></span><span class="attendance-queue-preview">${direction === "outbound" ? "Você: " : ""}${escapeHtml(latestText(item))}</span><span class="attendance-queue-row-meta"><small>${escapeHtml(dateLabel(item.last_message_at ?? item.updated_at))}</small><span class="attendance-mode-pill">${escapeHtml(modeLabel(item.mode))}</span>${unread > 0 ? `<b>${Math.min(unread, 99)}</b>` : ""}</span></button>`;
      }).join("")}</div>` : `<div class="attendance-empty"><strong>Nenhuma conversa</strong><span>Não há conversas para este canal ou busca.</span></div>`}
    </aside><section class="attendance-conversation-card">${conversationHeader}${messageList}</section></div>`;
}
