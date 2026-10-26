import type { Sql } from "npm:postgres@3.4.7";

export type WhatsAppChannel = "0975" | "1018";
export type ProviderStatus = "accepted" | "sent" | "delivered" | "read" | "failed";
export type ProviderDeliveryStatus = Exclude<ProviderStatus, "accepted">;

export interface ProviderStatusEvent {
  eventKey: string;
  channel: WhatsAppChannel;
  providerMessageId: string;
  providerStatus: ProviderDeliveryStatus;
  providerStatusAt: string;
  providerErrorCode: string | null;
}

interface PendingStatusEvent {
  id: string;
  provider_status: ProviderDeliveryStatus;
  provider_status_at: string;
  provider_error_code: string | null;
}

interface OutboxStatusProjection {
  id: string;
  status: string;
  provider_status: ProviderStatus | null;
  provider_status_at: string | null;
  provider_error_code: string | null;
  last_error_code: string | null;
}

export function validProviderMessageId(value: unknown): value is string {
  return typeof value === "string" && value.length <= 256 && /^wamid\.[A-Za-z0-9._=-]{1,250}$/.test(value);
}

export async function lockOutboxProviderMessage(tx: Sql, channel: WhatsAppChannel, providerMessageId: string): Promise<void> {
  await tx`select pg_advisory_xact_lock(hashtextextended(${"whatsapp-outbox:" + channel + ":" + providerMessageId}, 0))`;
}

function shouldApplyProviderStatus(
  current: ProviderStatus | null,
  currentAt: string | null,
  incoming: ProviderStatus,
  incomingAt: string,
): boolean {
  if (!current || !currentAt) return true;
  const currentTime = new Date(currentAt).getTime();
  const incomingTime = new Date(incomingAt).getTime();
  if (incomingTime !== currentTime) return incomingTime > currentTime;
  // Webhook arrival order is not reliable; use a deterministic tie-break for second-level timestamps.
  const priority: Record<ProviderStatus, number> = { accepted: 0, sent: 1, delivered: 2, read: 3, failed: 4 };
  return priority[incoming] >= priority[current];
}

async function applyProviderStatus(tx: Sql, event: ProviderStatusEvent): Promise<void> {
  const rows = await tx<OutboxStatusProjection>`
    select id, status, provider_status, provider_status_at, provider_error_code, last_error_code
    from whatsapp_atendimento.message_outbox
    where channel = ${event.channel} and provider_message_id = ${event.providerMessageId}
    for update
  `;
  const current = rows[0];
  if (!current) return;

  const applyIncoming = shouldApplyProviderStatus(
    current.provider_status,
    current.provider_status_at,
    event.providerStatus,
    event.providerStatusAt,
  );
  const mergedStatus = applyIncoming ? event.providerStatus : current.provider_status ?? event.providerStatus;
  const mergedTime = applyIncoming ? event.providerStatusAt : current.provider_status_at;
  const mergedErrorCode = mergedStatus === "failed"
    ? (applyIncoming && event.providerStatus === "failed" ? event.providerErrorCode ?? current.provider_error_code : current.provider_error_code)
    : null;
  const overallStatus = current.status === "cancelled"
    ? "cancelled"
    : mergedStatus === "failed" ? "failed" : mergedStatus === "accepted" ? current.status : "sent";
  const lastErrorCode = mergedStatus === "failed"
    ? `meta_status_failed_${mergedErrorCode ?? "unknown"}`
    : current.last_error_code?.startsWith("meta_status_failed_") ? null : current.last_error_code;

  await tx`
    update whatsapp_atendimento.message_outbox
    set status = ${overallStatus}, provider_status = ${mergedStatus}, provider_status_at = ${mergedTime},
      provider_error_code = ${mergedErrorCode}, last_error_code = ${lastErrorCode}
    where id = ${current.id}
  `;
}

export async function replayPendingProviderStatuses(tx: Sql, channel: WhatsAppChannel, providerMessageId: string): Promise<void> {
  const events = await tx<PendingStatusEvent>`
    select id, provider_status, provider_status_at, provider_error_code
    from whatsapp_atendimento.outbox_pending_status_events
    where channel = ${channel} and provider_message_id = ${providerMessageId} and expires_at > now()
    order by provider_status_at, id
    for update
  `;
  for (const event of events) {
    await applyProviderStatus(tx, {
      eventKey: "",
      channel,
      providerMessageId,
      providerStatus: event.provider_status,
      providerStatusAt: event.provider_status_at,
      providerErrorCode: event.provider_error_code,
    });
  }
  await tx`delete from whatsapp_atendimento.outbox_pending_status_events
    where channel = ${channel} and provider_message_id = ${providerMessageId}`;
}

export async function recordProviderStatus(db: Sql, event: ProviderStatusEvent): Promise<void> {
  await db.begin(async (tx) => {
    await lockOutboxProviderMessage(tx, event.channel, event.providerMessageId);
    await tx`with expired as (
      select id from whatsapp_atendimento.outbox_pending_status_events
      where expires_at <= now() order by expires_at limit 100 for update skip locked
    ) delete from whatsapp_atendimento.outbox_pending_status_events as pending using expired where pending.id = expired.id`;
    const rows = await tx<{ id: string }>`
      select id from whatsapp_atendimento.message_outbox
      where channel = ${event.channel} and provider_message_id = ${event.providerMessageId}
      for update
    `;
    if (rows[0]) {
      await applyProviderStatus(tx, event);
      return;
    }
    await tx`insert into whatsapp_atendimento.outbox_pending_status_events
      (event_key, channel, provider_message_id, provider_status, provider_status_at, provider_error_code)
      values (${event.eventKey}, ${event.channel}, ${event.providerMessageId}, ${event.providerStatus}, ${event.providerStatusAt}, ${event.providerErrorCode})
      on conflict (event_key) do nothing`;
  });
}
