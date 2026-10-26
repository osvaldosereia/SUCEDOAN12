import postgres, { type Sql } from "npm:postgres@3.4.7";
import { WHATSAPP_CHANNELS, type WhatsAppChannel } from "../../../src/domain/channels.ts";
import { wakeOutboxWorker } from "../_shared/outbox-dispatch.ts";
import { lockOutboxProviderMessage, replayPendingProviderStatuses, validProviderMessageId } from "../_shared/outbox-status.ts";
import { metaAccessToken, metaGraphVersion, type MetaChannel } from "../_shared/meta-config.ts";

const CHANNELS = WHATSAPP_CHANNELS;
type Channel = WhatsAppChannel;
const BATCH_SIZE = 5;
const MAX_DISPATCH_DEPTH = 19;
const MAX_ENCRYPTED_BYTES = 64 * 1024;
const MAX_PAYLOAD_BYTES = 32 * 1024;
const MESSAGE_TYPES = new Set([
  "basket_menu",
  "flow_launch",
  "order_summary",
  "order_adjustment",
  "order_cancelled",
]);

interface OutboxMessage {
  id: string;
  channel: Channel;
  message_type: string;
  payload_iv: string;
  payload_ciphertext: string;
}

class WorkerError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

let database: Sql | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function constantTimeEqual(left: string, right: string): boolean {
  let mismatch = left.length ^ right.length;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return mismatch === 0;
}

function decodeBase64(value: string): Uint8Array {
  let binary: string;
  try {
    binary = atob(value.replace(/\s/g, ""));
  } catch {
    throw new WorkerError("encryption_key_invalid");
  }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function asArrayBuffer(value: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(value.byteLength);
  new Uint8Array(buffer).set(value);
  return buffer;
}

function getEncryptionKey(): Promise<CryptoKey> {
  const configured = Deno.env.get("META_OUTBOX_ENCRYPTION_KEY");
  if (!configured) throw new WorkerError("encryption_key_missing");
  const raw = decodeBase64(configured);
  if (raw.byteLength !== 32) throw new WorkerError("encryption_key_invalid");
  return crypto.subtle.importKey("raw", asArrayBuffer(raw), "AES-GCM", false, ["decrypt"]);
}

async function decryptPayload(message: OutboxMessage, key: CryptoKey): Promise<Record<string, unknown>> {
  const iv = decodeBase64(message.payload_iv);
  const ciphertext = decodeBase64(message.payload_ciphertext);
  if (iv.byteLength !== 12 || ciphertext.byteLength > MAX_ENCRYPTED_BYTES) throw new WorkerError("encrypted_payload_invalid");
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: asArrayBuffer(iv) }, key, asArrayBuffer(ciphertext));
  } catch {
    throw new WorkerError("payload_decryption_failed");
  }
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(plaintext));
  } catch {
    throw new WorkerError("payload_json_invalid");
  }
  if (!isRecord(value) || new TextEncoder().encode(JSON.stringify(value)).byteLength > MAX_PAYLOAD_BYTES) {
    throw new WorkerError("payload_shape_invalid");
  }
  return value;
}

interface ChannelFlowBinding {
  meta_flow_id: string;
  flow_message_version: string;
  flow_cta: string;
  flow_action: string;
  first_screen: string;
}

async function readChannelFlowBinding(db: Sql, channel: OutboxMessage["channel"]): Promise<ChannelFlowBinding | null> {
  try {
    const rows = await db<ChannelFlowBinding>`
      select binding.meta_flow_id, binding.flow_message_version, binding.flow_cta, binding.flow_action, binding.first_screen
      from whatsapp_atendimento.channel_flow_bindings as binding
      join public.whatsapp_accounts as account on account.id = binding.whatsapp_account_id
      where binding.channel = ${channel} and account.slug = ${`dona-antonia-${channel}`} and account.is_active = true
      limit 1
    `;
    return rows[0] ?? null;
  } catch {
    throw new WorkerError("flow_binding_unavailable");
  }
}

async function readChannelPhoneNumberId(db: Sql, channel: MetaChannel): Promise<string | null> {
  const configured = Deno.env.get(`META_PHONE_NUMBER_ID_${channel}`)?.trim();
  if (configured && /^[0-9]+$/.test(configured)) return configured;
  try {
    const rows = await db<{ phone_number_id: string }>`
      select phone_number_id from public.whatsapp_accounts
      where slug = ${`dona-antonia-${channel}`} and is_active = true
      limit 1
    `;
    const value = rows[0]?.phone_number_id?.trim();
    return value && /^[0-9]+$/.test(value) ? value : null;
  } catch {
    throw new WorkerError("channel_account_unavailable");
  }
}

function buildProviderPayload(
  message: OutboxMessage,
  payload: Record<string, unknown>,
  flowBinding: ChannelFlowBinding | null,
): Record<string, unknown> {
  if (!MESSAGE_TYPES.has(message.message_type)) throw new WorkerError("message_type_unsupported");
  if (payload.messaging_product !== "whatsapp" || payload.recipient_type !== "individual"
    || typeof payload.to !== "string" || !/^\+?[1-9][0-9]{1,14}$/.test(payload.to)) {
    throw new WorkerError("recipient_invalid");
  }

  const providerPayload = structuredClone(payload);
  providerPayload.to = payload.to.replace(/^\+/, "");
  const type = payload.type;

  if (message.message_type === "order_cancelled") {
    if (type !== "text" || !isRecord(payload.text) || typeof payload.text.body !== "string" || !payload.text.body.length) {
      throw new WorkerError("message_payload_invalid");
    }
    return providerPayload;
  }

  if (type !== "interactive" || !isRecord(payload.interactive) || typeof payload.interactive.type !== "string") {
    throw new WorkerError("message_payload_invalid");
  }

  const interactiveType = payload.interactive.type;
  const expectedType = message.message_type === "basket_menu"
    ? "list"
    : message.message_type === "flow_launch"
    ? "flow"
    : "button";
  if (interactiveType !== expectedType) throw new WorkerError("message_payload_invalid");

  if (interactiveType === "flow") {
    const action = payload.interactive.action;
    const parameters = isRecord(action) && isRecord(action.parameters) ? action.parameters : null;
    const actionPayload = parameters && isRecord(parameters.flow_action_payload) ? parameters.flow_action_payload : null;
    if (!flowBinding || !parameters
      || parameters.flow_id !== flowBinding.meta_flow_id
      || parameters.flow_message_version !== flowBinding.flow_message_version
      || parameters.flow_cta !== flowBinding.flow_cta
      || parameters.flow_action !== flowBinding.flow_action
      || actionPayload?.screen !== flowBinding.first_screen) {
      throw new WorkerError("flow_configuration_mismatch");
    }
  }

  return providerPayload;
}

function getDatabase(): Sql {
  if (database) return database;
  const url = Deno.env.get("SUPABASE_DB_URL");
  if (!url) throw new WorkerError("database_configuration_missing");
  database = postgres(url, { max: 1, idle_timeout: 10, connect_timeout: 5, prepare: false, ssl: "require" });
  return database;
}

async function claimOne(db: Sql): Promise<OutboxMessage | null> {
  const claimed = await db.begin(async (tx) => await tx<OutboxMessage>`
    with candidate as (
      select id
      from whatsapp_atendimento.message_outbox
      where status = 'pending' and available_at <= now()
      order by available_at, created_at
      limit 1
      for update skip locked
    )
    update whatsapp_atendimento.message_outbox as outbox
    set status = 'failed', last_error_code = 'delivery_unknown'
    from candidate
    where outbox.id = candidate.id and outbox.status = 'pending'
    returning outbox.id, outbox.channel, outbox.message_type, outbox.payload_iv, outbox.payload_ciphertext
  `);
  return claimed[0] ?? null;
}

async function updateFailure(db: Sql, messageId: string, code: string): Promise<void> {
  await db`
    update whatsapp_atendimento.message_outbox
    set status = 'failed', last_error_code = ${code.slice(0, 80)}
    where id = ${messageId} and status = 'failed' and last_error_code = 'delivery_unknown'
  `;
}

async function markSent(db: Sql, messageId: string, providerMessageId: string): Promise<void> {
  await db.begin(async (tx) => {
    const channels = await tx<{ channel: Channel }>`select channel from whatsapp_atendimento.message_outbox where id = ${messageId}`;
    if (!channels[0]) throw new WorkerError("outbox_state_changed");
    const channel = channels[0].channel;
    await lockOutboxProviderMessage(tx, channel, providerMessageId);
    const updated = await tx<{ id: string; channel: Channel }>`
      update whatsapp_atendimento.message_outbox
      set status = 'sent', sent_at = now(), last_error_code = null, provider_message_id = ${providerMessageId},
        provider_status = 'accepted', provider_status_at = null, provider_error_code = null
      where id = ${messageId} and status = 'failed' and last_error_code = 'delivery_unknown'
      returning id, channel
    `;
    if (updated.length !== 1) throw new WorkerError("outbox_state_changed");
    await replayPendingProviderStatuses(tx, updated[0].channel, providerMessageId);
  });
}

async function metaErrorCode(response: Response): Promise<string> {
  let body: unknown;
  try {
    const text = await response.text();
    body = text.length <= 4096 ? JSON.parse(text) as unknown : null;
  } catch {
    body = null;
  }
  const error = isRecord(body) && isRecord(body.error) ? body.error : null;
  const code = error?.code;
  return typeof code === "number" && Number.isSafeInteger(code) && code >= 0 ? String(code) : "unknown";
}

async function sendOne(db: Sql, message: OutboxMessage, key: CryptoKey, graphVersion: string): Promise<boolean> {
  try {
    const payload = await decryptPayload(message, key);
    const flowBinding = message.message_type === "flow_launch" ? await readChannelFlowBinding(db, message.channel) : null;
    const providerPayload = buildProviderPayload(message, payload, flowBinding);
    const phoneNumberId = await readChannelPhoneNumberId(db, message.channel);
    const accessToken = metaAccessToken(message.channel);
    if (!phoneNumberId || !/^[0-9]+$/.test(phoneNumberId) || !accessToken) {
      await updateFailure(db, message.id, "channel_credentials_missing");
      return false;
    }

    let response: Response;
    try {
      response = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(providerPayload),
        signal: AbortSignal.timeout(12_000),
      });
    } catch {
      await updateFailure(db, message.id, "delivery_unknown");
      return false;
    }

    if (!response.ok) {
      const providerCode = await metaErrorCode(response);
      await updateFailure(db, message.id, `meta_http_${response.status}_code_${providerCode}`);
      return false;
    }

    let body: unknown;
    try {
      body = await response.json() as unknown;
    } catch {
      await updateFailure(db, message.id, "delivery_unknown");
      return false;
    }
    const providerMessageId = isRecord(body) && Array.isArray(body.messages) && isRecord(body.messages[0])
      ? body.messages[0].id : null;
    if (!validProviderMessageId(providerMessageId)) {
      await updateFailure(db, message.id, "delivery_unknown");
      return false;
    }
    await markSent(db, message.id, providerMessageId);
    return true;
  } catch (error) {
    const code = error instanceof WorkerError ? error.code : "outbox_processing_failed";
    await updateFailure(db, message.id, code);
    return false;
  }
}

function plain(status: number, message: string): Response {
  return new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

async function handle(request: Request): Promise<Response> {
  if (request.method !== "POST") return plain(405, "Method not allowed");
  if (request.body) {
    await request.body.cancel();
    return plain(400, "Request body is not accepted");
  }

  const expected = Deno.env.get("META_OUTBOX_DISPATCH_SECRET");
  if (!expected || expected.length < 32) return plain(503, "Outbox dispatch is not configured");
  const authorization = request.headers.get("Authorization") ?? "";
  const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!supplied || !constantTimeEqual(supplied, expected)) return plain(401, "Unauthorized");
  if (Deno.env.get("META_OUTBOX_SENDER_ENABLED") !== "true") return plain(503, "Outbox sender is disabled");
  const dispatchDepthHeader = request.headers.get("X-WhatsApp-Outbox-Dispatch-Depth") ?? "0";
  if (!/^(0|[1-9][0-9]{0,1})$/.test(dispatchDepthHeader)) return plain(400, "Dispatch depth is invalid");
  const dispatchDepth = Number(dispatchDepthHeader);
  if (!Number.isSafeInteger(dispatchDepth) || dispatchDepth > MAX_DISPATCH_DEPTH) return plain(400, "Dispatch depth is invalid");

  const graphVersion = metaGraphVersion();
  if (!graphVersion || !/^v[0-9]{1,3}\.[0-9]{1,2}$/.test(graphVersion)) return plain(503, "Graph API version is not configured");

  try {
    const db = getDatabase();
    const channelsConfigured = await Promise.all(CHANNELS.map(async (channel) =>
      !!metaAccessToken(channel) && !!await readChannelPhoneNumberId(db, channel)
    ));
    if (!channelsConfigured.every(Boolean)) return plain(503, "WhatsApp channel credentials are not configured");
    const key = await getEncryptionKey();
    let claimed = 0;
    let sent = 0;
    while (claimed < BATCH_SIZE) {
      const message = await claimOne(db);
      if (!message) break;
      claimed += 1;
      if (await sendOne(db, message, key, graphVersion)) sent += 1;
    }
    const continuationScheduled = claimed === BATCH_SIZE && dispatchDepth < MAX_DISPATCH_DEPTH;
    if (continuationScheduled) wakeOutboxWorker(dispatchDepth + 1);
    return Response.json({
      claimed,
      sent,
      failed: claimed - sent,
      continuationScheduled,
      continuationLimitReached: claimed === BATCH_SIZE && !continuationScheduled,
    });
  } catch (error) {
    console.error("WhatsApp outbox worker failed", error instanceof WorkerError ? error.code : "internal_error");
    return plain(503, "Outbox dispatch failed");
  }
}

Deno.serve(handle);
