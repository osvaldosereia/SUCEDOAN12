import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.3";

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
const clean = (value: unknown, max = 500) =>
  String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "");
const isUuid = (value: unknown) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value ?? ""));

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return reply({ ok: false, error: "method_not_allowed" }, 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return reply({ ok: false, error: "invalid_json" }, 400); }

  const intentId = String(body.intent_id ?? "");
  const dryRun = body.dry_run !== false;
  if (!isUuid(intentId)) return reply({ ok: false, error: "invalid_intent_id" }, 400);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const metaToken = Deno.env.get("META_WHATSAPP_ACCESS_TOKEN") ?? "";
  const graphVersion = clean(Deno.env.get("META_GRAPH_VERSION") || "v26.0", 20);
  if (!supabaseUrl || !serviceRole) return reply({ ok: false, error: "supabase_server_config_missing" }, 500);

  const sb = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: readiness, error: readinessError } = await sb.rpc("ops2_meta_dispatch_readiness_v1", { p_intent_id: intentId });
  if (readinessError) return reply({ ok: false, error: "readiness_failed", detail: clean(readinessError.message, 300) }, 500);

  if (dryRun) {
    return reply({
      ok: true,
      dry_run: true,
      intent_id: intentId,
      ready: readiness?.ready === true,
      readiness,
      meta_credentials_present: Boolean(metaToken),
      graph_version: graphVersion,
      sent: false,
    });
  }

  if (readiness?.ready !== true) {
    return reply({ ok: false, error: "dispatch_not_ready", intent_id: intentId, readiness, sent: false }, 409);
  }
  if (!metaToken) return reply({ ok: false, error: "meta_credentials_missing", sent: false }, 503);

  const { data: guard, error: guardError } = await sb.rpc("ops2_papoai_dispatch_guard_v1", { p_intent_id: intentId });
  if (guardError) return reply({ ok: false, error: "guard_failed", detail: clean(guardError.message, 300) }, 500);
  if (guard?.allowed !== true) return reply({ ok: false, error: "guard_blocked", sent: false }, 409);

  const accountId = String(guard.whatsapp_account_id ?? "");
  const targetPhone = digits(guard.target_phone_e164);
  if (!isUuid(accountId) || !targetPhone) return reply({ ok: false, error: "guard_material_incomplete", sent: false }, 409);

  const [intentResult, senderResult, flowResult] = await Promise.all([
    sb.from("ops2_papoai_outbound_intents_v1").select("id,purpose,status,transition_seq,payload").eq("id", intentId).maybeSingle(),
    sb.from("ops2_meta_whatsapp_senders_v1").select("meta_phone_number_id,is_verified,is_send_enabled").eq("whatsapp_account_id", accountId).maybeSingle(),
    sb.from("ops2_meta_whatsapp_flow_bindings_v1").select("meta_flow_id,flow_message_version,flow_cta,flow_action,flow_mode,body_text,is_verified,is_send_enabled").eq("whatsapp_account_id", accountId).eq("purpose", "registration_flow").maybeSingle(),
  ]);
  if (intentResult.error || senderResult.error || flowResult.error) return reply({ ok: false, error: "dispatch_material_lookup_failed", sent: false }, 500);

  const intent = intentResult.data;
  const sender = senderResult.data;
  const flow = flowResult.data;
  if (!intent || intent.purpose !== "registration_flow") return reply({ ok: false, error: "unsupported_or_missing_intent", sent: false }, 409);
  if (!sender?.is_verified || !sender?.is_send_enabled) return reply({ ok: false, error: "sender_not_enabled", sent: false }, 409);
  if (!flow?.is_verified || !flow?.is_send_enabled) return reply({ ok: false, error: "flow_not_enabled", sent: false }, 409);

  const flowToken = `registration:${intentId}:${intent.transition_seq}`;
  const metaPayload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: targetPhone,
    type: "interactive",
    interactive: {
      type: "flow",
      body: { text: clean(flow.body_text, 1024) },
      action: {
        name: "flow",
        parameters: {
          flow_message_version: clean(flow.flow_message_version, 20),
          flow_token: flowToken,
          flow_id: clean(flow.meta_flow_id, 64),
          flow_cta: clean(flow.flow_cta, 30),
          flow_action: clean(flow.flow_action, 30),
          mode: clean(flow.flow_mode, 20),
        },
      },
    },
  };

  const url = `https://graph.facebook.com/${encodeURIComponent(graphVersion)}/${encodeURIComponent(sender.meta_phone_number_id)}/messages`;
  let metaResponse: Response;
  let metaData: any = {};
  try {
    metaResponse = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${metaToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(metaPayload),
    });
    metaData = await metaResponse.json().catch(() => ({}));
  } catch (error) {
    await sb.from("ops2_papoai_outbound_intents_v1").update({
      status: "failed", reason: "meta_network_error", last_error: clean((error as Error)?.message, 500), updated_at: new Date().toISOString(),
    }).eq("id", intentId).not("status", "in", "(sent,cancelled)");
    return reply({ ok: false, error: "meta_network_error", sent: false }, 502);
  }

  if (!metaResponse.ok) {
    const safeError = clean(metaData?.error?.message || `http_${metaResponse.status}`, 500);
    await sb.from("ops2_papoai_outbound_intents_v1").update({
      status: "failed", reason: "meta_send_failed", last_error: safeError, updated_at: new Date().toISOString(),
    }).eq("id", intentId).not("status", "in", "(sent,cancelled)");
    return reply({ ok: false, error: "meta_send_failed", http_status: metaResponse.status, sent: false }, 502);
  }

  const metaMessageId = clean(metaData?.messages?.[0]?.id, 300) || null;
  const now = new Date().toISOString();
  const existingPayload = intent.payload && typeof intent.payload === "object" ? intent.payload : {};
  const { error: updateError } = await sb.from("ops2_papoai_outbound_intents_v1").update({
    status: "sent",
    reason: "meta_cloud_api",
    sent_at: now,
    last_error: null,
    updated_at: now,
    payload: {
      ...existingPayload,
      transport: "meta_cloud_api",
      meta_message_id: metaMessageId,
      meta_phone_number_id: sender.meta_phone_number_id,
      meta_flow_id: flow.meta_flow_id,
    },
  }).eq("id", intentId).not("status", "in", "(sent,cancelled)");

  if (updateError) return reply({ ok: false, error: "sent_but_audit_update_failed", sent: true }, 500);
  return reply({ ok: true, sent: true, intent_id: intentId, meta_message_id: metaMessageId });
});
