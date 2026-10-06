import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";
import { redactWebhookPayload } from "../_shared/whatsapp-core-v1.mjs";
import { classifyCustomerConfirmation } from "../_shared/ana-customer-confirmation-v1.mjs";
import {
  extractMetaPhoneNumberIds,
  hasMetaMessageOrStatusEvents,
  normalizeMetaWebhook,
  templateEventsFromMeta,
  verifyMetaChallenge,
  verifyMetaSignature,
} from "../_shared/whatsapp-meta-webhook-v1.mjs";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = (() => {
  try {
    return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  } catch {
    return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  }
})();
const APP_SECRET = Deno.env.get("META_WHATSAPP_APP_SECRET") || "";
const VERIFY_TOKEN = Deno.env.get("META_WHATSAPP_VERIFY_TOKEN") || "";
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
});

async function readBodyLimited(req: Request, maxBytes = MAX_BODY_BYTES) {
  const declared = Number(req.headers.get("content-length") || 0);
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error("payload_too_large");
  const reader = req.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value?.byteLength || 0;
      if (total > maxBytes) throw new Error("payload_too_large");
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } finally {
    try { reader.releaseLock(); } catch { /* no-op */ }
  }
}

async function accountMap(phoneNumberIds: string[]) {
  if (!phoneNumberIds.length) return new Map<string, string>();
  const q = await db.from("whatsapp_accounts")
    .select("id,phone_number_id,is_active")
    .in("phone_number_id", phoneNumberIds)
    .eq("is_active", true);
  if (q.error) throw q.error;
  return new Map((q.data || []).map((row: any) => [String(row.phone_number_id), String(row.id)]));
}

async function persistInbound(message: any, payloadHash: string, safePayload: unknown) {
  const result = await db.rpc("whatsapp_ingest_event_v1", {
    p_whatsapp_account_id: message.whatsapp_account_id,
    p_provider: "meta",
    p_provider_event_id: message.provider_event_id,
    p_event_type: message.event_type,
    p_provider_message_id: message.provider_message_id,
    p_phone_e164: message.phone_e164,
    p_received_at: message.received_at,
    p_payload_hash: payloadHash,
    p_payload: safePayload,
    p_message: message.message,
  });
  if (result.error) throw result.error;
  if (result.data?.ok !== true) throw new Error(String(result.data?.error || "meta_ingest_failed"));
  return result.data;
}

async function enqueueAnaForInbound(message: any, ingestResult: any) {
  if (message?.event_type !== "message.received" || message?.message?.direction !== "inbound" || !ingestResult?.message_id) return false;
  const queued = await db.rpc("ops2_ana_enqueue_live_job_v1", { p_inbound_message_id: ingestResult.message_id });
  if (queued.error) {
    console.error("whatsapp-meta-webhook-v1 ana enqueue failed", errorText(queued.error).slice(0, 300));
    return false;
  }
  if (queued.data?.ok !== true || !queued.data?.job_id) return false;

  // Queue execution after acknowledging Meta's webhook; duplicate callbacks are
  // collapsed by the canonical message and job idempotency constraints.
  EdgeRuntime.waitUntil((async () => {
    try {
      const response = await fetch(`${SUPABASE_URL.replace(/\/+$/, "")}/functions/v1/whatsapp-ana-worker-v1`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
        body: JSON.stringify({ mode: "live", limit: 1 }),
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) console.error("whatsapp-meta-webhook-v1 ana worker status", response.status);
    } catch (error) {
      console.error("whatsapp-meta-webhook-v1 ana worker invoke failed", errorText(error).slice(0, 300));
    }
  })());
  return true;
}

async function applyCustomerConfirmationSignal(message: any, ingestResult: any) {
  if (message?.event_type !== "message.received" || message?.message?.direction !== "inbound" || !ingestResult?.message_id) return null;

  // Read the canonical row written by whatsapp_ingest_event_v1; do not make
  // confirmation decisions from raw provider JSON or an unpersisted payload.
  const canonicalResult = await db.from("whatsapp_messages_v1")
    .select("id,conversation_id,direction,message_type,text_body,received_at,created_at")
    .eq("id", ingestResult.message_id)
    .maybeSingle();
  if (canonicalResult.error) throw canonicalResult.error;
  const canonicalMessage = canonicalResult.data;
  if (!canonicalMessage || canonicalMessage.direction !== "inbound" || !["text","button","interactive"].includes(String(canonicalMessage.message_type || ""))) return null;

  const requestResult = await db.from("customer_profile_confirmation_requests_v1")
    .select("id,conversation_id,status,suggestion_ids,expires_at,outbound_message_id,confirmation_summary")
    .eq("conversation_id", canonicalMessage.conversation_id)
    .eq("status", "pending")
    .gt("expires_at", canonicalMessage.received_at || canonicalMessage.created_at)
    .maybeSingle();
  if (requestResult.error) throw requestResult.error;
  const request = requestResult.data;
  if (!request || !request.outbound_message_id) return null;

  const outboundResult = await db.from("whatsapp_messages_v1")
    .select("id,conversation_id,direction,sent_at,created_at")
    .eq("id", request.outbound_message_id)
    .maybeSingle();
  if (outboundResult.error) throw outboundResult.error;
  const outbound = outboundResult.data;
  if (!outbound || outbound.direction !== "outbound" || outbound.conversation_id !== canonicalMessage.conversation_id) return null;

  const ids = Array.isArray(request.suggestion_ids) ? request.suggestion_ids : [];
  const suggestionsResult = ids.length
    ? await db.from("customer_profile_suggestions_v1").select("field_name,normalized_value").in("id", ids)
    : { data: [], error: null };
  if (suggestionsResult.error) throw suggestionsResult.error;

  const classified = classifyCustomerConfirmation({
    message: canonicalMessage,
    pendingRequest: {
      ...request,
      outbound_sent_at: outbound.sent_at || outbound.created_at,
      suggestions: suggestionsResult.data || [],
    },
  });
  if (classified.decision === "none" || !classified.request_id) return null;

  const applied = await db.rpc("ops2_ana_customer_confirmation_apply_signal_v1", {
    p_request_id: classified.request_id,
    p_message_id: canonicalMessage.id,
    p_decision: classified.decision,
  });
  if (applied.error) throw applied.error;
  if (applied.data?.ok !== true && !["confirmation_request_expired","confirmation_message_before_request","confirmation_request_not_pending"].includes(String(applied.data?.error || ""))) {
    throw new Error(String(applied.data?.error || "ana_confirmation_signal_failed"));
  }
  return applied.data?.ok === true ? applied.data : null;
}

async function persistStatus(status: any, payloadHash: string) {
  const eventKey = `status:${status.provider_message_id}:${status.status}:${status.occurred_at || "unknown"}`;
  const capture = await db.rpc("whatsapp_ingest_event_v1", {
    p_whatsapp_account_id: status.whatsapp_account_id,
    p_provider: "meta",
    p_provider_event_id: eventKey,
    p_event_type: `message.status.${status.status}`,
    p_provider_message_id: status.provider_message_id,
    p_phone_e164: status.recipient_phone_e164,
    p_received_at: status.occurred_at,
    p_payload_hash: payloadHash,
    p_payload: status.payload || {},
    p_message: null,
  });
  if (capture.error) throw capture.error;
  if (capture.data?.ok !== true) throw new Error(String(capture.data?.error || "meta_status_capture_failed"));

  const recorded = await db.rpc("whatsapp_record_status_v1", {
    p_whatsapp_account_id: status.whatsapp_account_id,
    p_provider: "meta",
    p_provider_message_id: status.provider_message_id,
    p_status: status.status,
    p_occurred_at: status.occurred_at,
    p_received_at: new Date().toISOString(),
    p_error_code: status.error_code,
    p_error_title: status.error_title,
    p_error_detail: status.error_detail,
    p_payload: status.payload || {},
  });
  if (recorded.error) throw recorded.error;

  const eventId = capture.data?.event_id || null;
  if (recorded.data?.ok === true && eventId) {
    const normalized = await db.from("whatsapp_webhook_events_v1")
      .update({ status: "normalized", processed_at: new Date().toISOString(), last_error: null })
      .eq("id", eventId);
    if (normalized.error) throw normalized.error;
  }

  return {
    captured: true,
    duplicate: capture.data?.duplicate === true,
    recorded: recorded.data?.ok === true,
    pendingReason: recorded.data?.ok === true ? null : String(recorded.data?.error || "status_not_reconciled"),
  };
}

async function persistTemplateEvent(event: any) {
  const applied = await db.rpc("whatsapp_apply_template_event_v1", {
    p_waba_id: event.waba_id,
    p_meta_template_id: event.meta_template_id,
    p_template_name: event.template_name,
    p_language: event.language,
    p_event_type: event.event_type,
    p_status: event.status,
    p_quality_rating: event.quality_rating,
    p_reason: event.reason,
    p_provider_event_key: event.provider_event_key,
    p_payload: event.payload,
    p_occurred_at: event.occurred_at,
  });
  if (applied.error) throw applied.error;
  if (applied.data?.ok !== true) throw new Error(String(applied.data?.error || "meta_template_event_apply_failed"));
  return applied.data;
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method === "GET") {
      if (!VERIFY_TOKEN) return json({ ok: false, error: "verify_token_not_configured" }, 503);
      const challenge = verifyMetaChallenge(new URL(req.url), VERIFY_TOKEN);
      if (!challenge.ok) return json({ ok: false, error: challenge.error }, 403);
      return new Response(challenge.challenge, { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
    }

    if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
    if (!APP_SECRET || !VERIFY_TOKEN || !SUPABASE_URL || !SERVICE_KEY) return json({ ok: false, error: "webhook_not_configured" }, 503);

    let rawBody = "";
    try { rawBody = await readBodyLimited(req); } catch (error) {
      if (errorText(error) === "payload_too_large") return json({ ok: false, error: "payload_too_large" }, 413);
      throw error;
    }

    const signature = req.headers.get("x-hub-signature-256");
    if (!await verifyMetaSignature(rawBody, signature, APP_SECRET)) return json({ ok: false, error: "invalid_signature" }, 401);

    let payload: any;
    try { payload = JSON.parse(rawBody); } catch { return json({ ok: false, error: "invalid_json" }, 400); }
    if (payload?.object !== "whatsapp_business_account") return json({ ok: false, error: "unsupported_object" }, 400);

    const templateEvents = templateEventsFromMeta(payload);
    let templateEventsCaptured = 0;
    let templateEventsUnmatched = 0;
    let templateEventsDuplicates = 0;
    for (const event of templateEvents) {
      const result = await persistTemplateEvent(event);
      templateEventsCaptured += 1;
      if (result?.unmatched === true) templateEventsUnmatched += 1;
      if (result?.duplicate === true) templateEventsDuplicates += 1;
    }

    const messageOrStatusEvents = hasMetaMessageOrStatusEvents(payload);
    const phoneNumberIds = extractMetaPhoneNumberIds(payload);
    if (!phoneNumberIds.length) {
      if (messageOrStatusEvents) return json({ ok: false, error: "meta_account_unresolved", unknown_phone_number_ids: [] }, 422);
      if (templateEventsCaptured > 0) return json({
        ok: true,
        inbound_normalized: 0,
        inbound_duplicates: 0,
        statuses_captured: 0,
        statuses_recorded: 0,
        statuses_pending: 0,
        template_events_captured: templateEventsCaptured,
        template_events_unmatched: templateEventsUnmatched,
        template_events_duplicates: templateEventsDuplicates,
      });
      return json({ ok: true, ignored: true, reason: "no_message_phone_number_id", template_events_captured: 0, template_events_unmatched: 0 });
    }

    const accounts = await accountMap(phoneNumberIds);
    const normalized = await normalizeMetaWebhook({ payload, rawBody, accountByPhoneNumberId: accounts });
    if (normalized.unknownPhoneNumberIds.length || normalized.messages.some((m: any) => !m.associable) || normalized.statuses.some((s: any) => !s.associable)) {
      console.warn("whatsapp-meta-webhook-v1 unmapped account", normalized.unknownPhoneNumberIds.join(",").slice(0, 300));
      return json({ ok: true, ignored: true, reason: "meta_account_unresolved", unknown_phone_number_ids: normalized.unknownPhoneNumberIds }, 200);
    }

    const safePayload = redactWebhookPayload(payload);
    let inboundNormalized = 0;
    let inboundDuplicates = 0;
    let anaConfirmationsApplied = 0;
    let anaJobsQueued = 0;
    for (const message of normalized.messages) {
      const result = await persistInbound(message, normalized.payloadHash, safePayload);
      if (result?.duplicate === true) inboundDuplicates += 1;
      else inboundNormalized += 1;
      const confirmation = await applyCustomerConfirmationSignal(message, result);
      if (confirmation?.ok === true) anaConfirmationsApplied += 1;
      if (await enqueueAnaForInbound(message, result)) anaJobsQueued += 1;
    }

    let statusesCaptured = 0;
    let statusesRecorded = 0;
    let statusesPending = 0;
    for (const status of normalized.statuses) {
      const result = await persistStatus(status, normalized.payloadHash);
      statusesCaptured += 1;
      if (result.recorded) statusesRecorded += 1;
      else statusesPending += 1;
    }

    return json({
      ok: true,
      inbound_normalized: inboundNormalized,
      inbound_duplicates: inboundDuplicates,
      ana_confirmations_applied: anaConfirmationsApplied,
      ana_jobs_queued: anaJobsQueued,
      statuses_captured: statusesCaptured,
      statuses_recorded: statusesRecorded,
      statuses_pending: statusesPending,
      template_events_captured: templateEventsCaptured,
      template_events_unmatched: templateEventsUnmatched,
      template_events_duplicates: templateEventsDuplicates,
    });
  } catch (error) {
    console.error("whatsapp-meta-webhook-v1", errorText(error).slice(0, 500));
    return json({ ok: false, error: "webhook_internal_error" }, 500);
  }
});

