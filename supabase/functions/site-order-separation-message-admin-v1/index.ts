import { createClient } from "npm:@supabase/supabase-js@2.58.0";
import {
  buildTemplateCacheRows,
  createTemplateViaMeta,
  listTemplatesViaMeta,
  MetaTemplatesError,
} from "../_shared/whatsapp-meta-templates-v1.mjs";
import { verifyAdminCode } from "../_shared/admin-code-v1.ts";

type Channel = "0975" | "1018";
type MessageKind = "prepared_ok" | "prepared_adjusted";
type JsonRecord = Record<string, unknown>;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = (() => {
  try {
    return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default ||
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  } catch {
    return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  }
})();
const META_TOKEN = (Deno.env.get("META_WHATSAPP_ACCESS_TOKEN") || "").trim();
const GRAPH_VERSION = (Deno.env.get("META_WHATSAPP_GRAPH_VERSION") || "").trim();
const TABLE = "order_separation_whatsapp_settings_v1";
const LANGUAGE = "pt_BR";
const CHANNELS: Channel[] = ["0975", "1018"];
const ORIGINS = new Set(["https://donaantonia.com.br", "https://www.donaantonia.com.br"]);
const DEFAULT_BODIES: Record<MessageKind, string> = {
  prepared_ok: [
    "✅ Pedido {{1}} preparado",
    "",
    "Encontramos todos os produtos do seu pedido.",
    "",
    "💰 Total confirmado: {{2}}",
    "",
    "🚚 Seu pedido está pronto e seguirá para a rota de entrega.",
    "",
    "Confira os detalhes:",
    "{{3}}",
    "",
    "Dona Antônia agradece a preferência.",
  ].join("\n"),
  prepared_adjusted: [
    "⚠️ Pedido {{1}} preparado com ajuste",
    "",
    "Durante a separação, alguns produtos não estavam disponíveis:",
    "",
    "{{2}}",
    "",
    "💰 RESUMO DO PEDIDO",
    "Valor original: {{3}}",
    "Abatimento: - {{4}}",
    "Novo total: {{5}}",
    "",
    "Os demais produtos foram separados normalmente e seu pedido está pronto para seguir para a rota de entrega.",
    "",
    "Confira os detalhes:",
    "{{6}}",
    "",
    "Dona Antônia agradece a compreensão.",
  ].join("\n"),
};
const KIND_PREFIX: Record<MessageKind, string> = {
  prepared_ok: "pedidopreparadook",
  prepared_adjusted: "pedidopreparadoajuste",
};
const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const cors = (req: Request) => {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": ORIGINS.has(origin) ? origin : "https://donaantonia.com.br",
    "Access-Control-Allow-Headers": "apikey,content-type,x-admin-code",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Cache-Control": "no-store",
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
  };
};
const json = (req: Request, value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { ...cors(req), "Content-Type": "application/json; charset=utf-8" },
  });
class RequestFailure extends Error {
  status: number;
  constructor(code: string, status = 400) {
    super(code);
    this.status = status;
  }
}
const text = (value: unknown, max = 500) =>
  String(value ?? "").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ").trim().slice(0, max);
const onlyKeys = (value: JsonRecord, allowed: string[]) =>
  Object.keys(value).every((key) => allowed.includes(key));
const channelFrom = (value: unknown): Channel | null =>
  value === "0975" || value === "1018" ? value : null;
const kindFrom = (value: unknown): MessageKind | null =>
  value === "prepared_ok" || value === "prepared_adjusted" ? value : null;
const defaultTemplateName = (kind: MessageKind, channel: Channel) =>
  KIND_PREFIX[kind] + channel + "v1";
const namePrefix = (kind: MessageKind, channel: Channel) =>
  KIND_PREFIX[kind] + channel + "v";
const expectedVariableCount = (kind: MessageKind) => kind === "prepared_ok" ? 3 : 6;

function validateBody(value: unknown, kind: MessageKind) {
  const body = String(value ?? "").replace(/\r\n?/g, "\n").trim();
  if (!body || body.length > 1024 || /[\u0000-\u0008\u000b-\u001f\u007f]/.test(body)) {
    throw new RequestFailure("invalid_message_body");
  }
  const matches = [...body.matchAll(/\{\{(\d+)\}\}/g)].map((match) => Number(match[1]));
  const expected = expectedVariableCount(kind);
  if (matches.length !== expected || new Set(matches).size !== expected ||
      !Array.from({ length: expected }, (_, index) => index + 1).every((number) => matches.includes(number))) {
    throw new RequestFailure("message_placeholders_must_be_1_to_" + expected);
  }
  return body;
}

async function settingsRows(kind: MessageKind) {
  const result = await db.from(TABLE)
    .select("notification_kind,channel,is_enabled,draft_body,active_template_name,pending_template_name,updated_at")
    .eq("notification_kind", kind)
    .in("channel", CHANNELS);
  if (result.error) throw new Error("separation_message_settings_read_failed");
  const existing = new Map((result.data || []).map((row: any) => [row.channel, row]));
  return CHANNELS.map((channel) => {
    const row: any = existing.get(channel);
    return row || {
      notification_kind: kind,
      channel,
      is_enabled: true,
      draft_body: DEFAULT_BODIES[kind],
      active_template_name: defaultTemplateName(kind, channel),
      pending_template_name: null,
      updated_at: null,
    };
  });
}

async function accountFor(channel: Channel) {
  const result = await db.from("whatsapp_accounts")
    .select("id,slug,display_name,phone_e164,phone_number_id,waba_id,is_active")
    .eq("slug", "dona-antonia-" + channel)
    .eq("is_active", true)
    .maybeSingle();
  if (result.error) throw new Error("whatsapp_account_read_failed");
  return result.data || null;
}

async function cachedTemplates(accountId: string, names: string[]) {
  const unique = [...new Set(names.filter(Boolean))];
  if (!unique.length) return [];
  const result = await db.from("whatsapp_templates_v1")
    .select("name,status,category,components,metadata,last_synced_at")
    .eq("whatsapp_account_id", accountId)
    .eq("language", LANGUAGE)
    .in("name", unique);
  if (result.error) throw new Error("whatsapp_template_cache_read_failed");
  return result.data || [];
}

async function syncTemplates(account: any) {
  if (!META_TOKEN || !/^v\d+\.\d+$/.test(GRAPH_VERSION)) {
    throw new RequestFailure("meta_connection_not_configured", 503);
  }
  if (!account || !/^\d{5,30}$/.test(String(account.waba_id || ""))) {
    throw new RequestFailure("whatsapp_account_not_configured", 503);
  }
  const remote = await listTemplatesViaMeta({
    accessToken: META_TOKEN,
    wabaId: account.waba_id,
    graphVersion: GRAPH_VERSION,
    timeoutMs: 15000,
    maxPages: 20,
  });
  if (remote.truncated) throw new RequestFailure("meta_templates_pagination_truncated", 502);
  const existingResult = await db.from("whatsapp_templates_v1")
    .select("name,language,metadata")
    .eq("whatsapp_account_id", account.id);
  if (existingResult.error) throw new Error("whatsapp_template_cache_read_failed");
  const existingByKey = new Map(
    (existingResult.data || []).map((row: any) => [row.name + "\u0000" + row.language, row]),
  );
  const syncedAt = new Date().toISOString();
  const rows = buildTemplateCacheRows({
    items: remote.items,
    account,
    existingByKey,
    syncedAt,
  });
  if (rows.length) {
    const saved = await db.from("whatsapp_templates_v1")
      .upsert(rows, { onConflict: "waba_id,name,language" });
    if (saved.error) throw new Error("whatsapp_template_cache_write_failed");
  }
  return remote.items;
}

function approvedTemplateShape(row: any, kind: MessageKind) {
  const components = Array.isArray(row?.components) ? row.components : [];
  const body = components.find((item: any) => String(item.type || "").toUpperCase() === "BODY");
  const variables = [...String(body?.text || "").matchAll(/\{\{(\d+)\}\}/g)]
    .map((match) => Number(match[1]));
  const expected = expectedVariableCount(kind);
  return row?.status === "APPROVED" && String(row?.category || "").toUpperCase() === "UTILITY" &&
    components.length === 1 && Boolean(body) && variables.length === expected &&
    new Set(variables).size === expected &&
    Array.from({ length: expected }, (_, index) => index + 1).every((number) => variables.includes(number));
}

async function readState(kind: MessageKind) {
  const settings = await settingsRows(kind);
  const channels = await Promise.all(settings.map(async (setting: any) => {
    const channel = setting.channel as Channel;
    const account = await accountFor(channel);
    const names = [setting.active_template_name, setting.pending_template_name]
      .filter((name: unknown): name is string => typeof name === "string" && name.length > 0);
    const templates = account ? await cachedTemplates(account.id, names) : [];
    const active = templates.find((item: any) => item.name === setting.active_template_name);
    const pending = templates.find((item: any) => item.name === setting.pending_template_name);
    const activeMetadata = active?.metadata && typeof active.metadata === "object" ? active.metadata : {};
    const pendingMetadata = pending?.metadata && typeof pending.metadata === "object" ? pending.metadata : {};
    const activeComponents = Array.isArray(active?.components) ? active.components : [];
    const pendingComponents = Array.isArray(pending?.components) ? pending.components : [];
    const activeBody = activeComponents.find((item: any) => String(item.type || "").toUpperCase() === "BODY")?.text || "";
    const pendingBody = pendingComponents.find((item: any) => String(item.type || "").toUpperCase() === "BODY")?.text || "";
    const draftBody = String(setting.draft_body || "");
    return {
      channel,
      label: "WhatsApp final " + channel,
      is_enabled: setting.is_enabled !== false,
      active_template_name: setting.active_template_name,
      active_status: active?.status || "UNKNOWN",
      pending_template_name: setting.pending_template_name || null,
      pending_status: pending?.status || null,
      pending_rejection_reason: pendingMetadata.rejected_reason || null,
      pending_can_activate: Boolean(pending && approvedTemplateShape(pending, kind)),
      draft_matches_active: Boolean(active) && activeBody === draftBody,
      draft_matches_pending: Boolean(pending) && pendingBody === draftBody,
      meta_checked_at: [active?.last_synced_at, pending?.last_synced_at].filter(Boolean).sort().pop() || null,
      updated_at: setting.updated_at,
      account_ready: Boolean(account && account.waba_id && account.phone_number_id),
    };
  }));
  return {
    ok: true,
    kind,
    meta_ready: Boolean(META_TOKEN && /^v\d+\.\d+$/.test(GRAPH_VERSION)),
    draft_body: settings[0]?.draft_body || DEFAULT_BODIES[kind],
    channels,
  };
}

async function updateSetting(kind: MessageKind, channel: Channel, changes: JsonRecord) {
  const result = await db.from(TABLE)
    .update({ ...changes, updated_at: new Date().toISOString() })
    .eq("notification_kind", kind)
    .eq("channel", channel)
    .select("channel")
    .maybeSingle();
  if (result.error) throw new Error("separation_message_settings_write_failed");
  if (!result.data) throw new Error("separation_message_settings_missing");
}

async function saveDraft(kind: MessageKind, bodyText: string) {
  const settings = await settingsRows(kind);
  const saved = await db.from(TABLE).upsert(settings.map((row: any) => ({
    notification_kind: kind,
    channel: row.channel,
    is_enabled: row.is_enabled !== false,
    draft_body: bodyText,
    active_template_name: row.active_template_name || defaultTemplateName(kind, row.channel),
    pending_template_name: row.pending_template_name || null,
    updated_at: new Date().toISOString(),
  })), { onConflict: "notification_kind,channel" });
  if (saved.error) throw new Error("separation_message_settings_write_failed");
}

async function applyRateLimit(req: Request, action: string) {
  const origin = req.headers.get("origin") || "direct";
  const limits: Record<string, number> = { submit: 4, sync: 8, save_draft: 30, set_enabled: 20, activate: 10 };
  const result = await db.rpc("consume_public_rate_limit", {
    p_rate_key: "order-separation-message-admin:" + origin,
    p_bucket: "order_separation_message_admin_" + action,
    p_limit: limits[action] || 30,
    p_window_seconds: 300,
  });
  if (result.error) throw new RequestFailure("rate_limit_unavailable", 503);
  if (result.data !== true) throw new RequestFailure("rate_limited", 429);
}

function templateDraft(kind: MessageKind, channel: Channel, version: number, body: string) {
  const examples = kind === "prepared_ok"
    ? ["DA066", "R$ 120,00", "https://donaantonia.com.br/p/?k=exemplo1234567890"]
    : ["DA066", "• 1x Feijão Carioca 1 kg", "R$ 120,00", "R$ 18,50", "R$ 101,50", "https://donaantonia.com.br/p/?k=exemplo1234567890"];
  return {
    name: namePrefix(kind, channel) + version,
    language: LANGUAGE,
    category: "UTILITY",
    components: [{ type: "BODY", text: body, example: { body_text: [examples] } }],
  };
}
function isPending(status: unknown) {
  return String(status || "").toUpperCase().startsWith("PENDING");
}
function versionOf(name: string) {
  const match = /v(\d+)$/.exec(name);
  return match ? Number(match[1]) || 0 : 0;
}

async function submitDraft(kind: MessageKind) {
  if (!META_TOKEN || !/^v\d+\.\d+$/.test(GRAPH_VERSION)) {
    throw new RequestFailure("meta_connection_not_configured", 503);
  }
  const settings = await settingsRows(kind);
  const body = validateBody(settings[0]?.draft_body || DEFAULT_BODIES[kind], kind);
  const results: JsonRecord[] = [];
  for (const channel of CHANNELS) {
    try {
      const setting: any = settings.find((row: any) => row.channel === channel);
      const account = await accountFor(channel);
      if (!account) throw new RequestFailure("whatsapp_account_not_configured", 503);
      const remoteItems = await syncTemplates(account);
      const prefix = namePrefix(kind, channel);
      const matches = remoteItems.filter((item: any) => String(item.name || "").startsWith(prefix));
      const priorPending = setting?.pending_template_name
        ? matches.find((item: any) => item.name === setting.pending_template_name)
        : null;
      if (priorPending && (isPending(priorPending.status) || String(priorPending.status).toUpperCase() === "APPROVED")) {
        results.push({ channel, name: priorPending.name, status: priorPending.status, already_exists: true });
        continue;
      }
      const anyPending = matches
        .filter((item: any) => isPending(item.status))
        .sort((a: any, b: any) => versionOf(String(b.name)) - versionOf(String(a.name)))[0];
      if (anyPending) {
        await updateSetting(kind, channel, { pending_template_name: anyPending.name });
        results.push({ channel, name: anyPending.name, status: anyPending.status, already_exists: true });
        continue;
      }
      const maxVersion = matches.reduce((max: number, item: any) => Math.max(max, versionOf(String(item.name || ""))), 1);
      const draft = templateDraft(kind, channel, maxVersion + 1, body);
      await createTemplateViaMeta({
        accessToken: META_TOKEN,
        wabaId: account.waba_id,
        graphVersion: GRAPH_VERSION,
        template: draft,
        timeoutMs: 20000,
      });
      const name = String(draft.name);
      await updateSetting(kind, channel, { pending_template_name: name });
      let status = "UNKNOWN";
      let syncPending = false;
      try {
        const synced = await syncTemplates(account);
        const cached = await cachedTemplates(account.id, [name]);
        status = cached[0]?.status || "UNKNOWN";
        syncPending = !synced.some((item: any) => item.name === name);
      } catch {
        syncPending = true;
        status = "UNKNOWN";
      }
      if (syncPending) status = "UNKNOWN";
      results.push({ channel, name, status, sync_pending: syncPending });
    } catch (error) {
      const code = error instanceof MetaTemplatesError
        ? error.code
        : error instanceof RequestFailure
        ? error.message
        : "meta_template_submit_failed";
      results.push({ channel, error: code });
    }
  }
  return { ok: true, results };
}

async function refreshStatus(kind: MessageKind) {
  const results: JsonRecord[] = [];
  for (const channel of CHANNELS) {
    try {
      const account = await accountFor(channel);
      if (!account) throw new RequestFailure("whatsapp_account_not_configured", 503);
      const items = await syncTemplates(account);
      results.push({
        channel,
        checked_at: new Date().toISOString(),
        synced: items.filter((item: any) => String(item.name || "").startsWith(namePrefix(kind, channel))).length,
        ok: true,
      });
    } catch (error) {
      results.push({
        channel,
        checked_at: new Date().toISOString(),
        ok: false,
        error: error instanceof MetaTemplatesError
          ? error.code
          : error instanceof RequestFailure
          ? error.message
          : "meta_template_sync_failed",
      });
    }
  }
  return { ok: true, checked_at: new Date().toISOString(), results };
}
async function activateApproved(kind: MessageKind, channel: Channel) {
  const settings = await settingsRows(kind);
  const setting: any = settings.find((row: any) => row.channel === channel);
  const name = String(setting?.pending_template_name || "");
  if (!name) throw new RequestFailure("pending_template_missing", 409);
  const account = await accountFor(channel);
  if (!account) throw new RequestFailure("whatsapp_account_not_configured", 503);
  await syncTemplates(account);
  const rows = await cachedTemplates(account.id, [name]);
  const template = rows[0];
  if (!template || !approvedTemplateShape(template, kind)) {
    throw new RequestFailure("template_not_approved_or_shape_unsupported", 409);
  }
  await updateSetting(kind, channel, {
    active_template_name: name,
    pending_template_name: null,
  });
  return readState(kind);
}

async function handle(req: Request) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== "GET" && req.method !== "POST") return json(req, { ok: false, error: "method_not_allowed" }, 405);
  const origin = req.headers.get("origin") || "";
  if (origin && !ORIGINS.has(origin)) return json(req, { ok: false, error: "origin_not_allowed" }, 403);
  const adminCodeStatus = verifyAdminCode(req.headers.get("x-admin-code"));
  if (adminCodeStatus === "not_configured") return json(req, { ok: false, error: "admin_auth_not_configured" }, 503);
  if (adminCodeStatus !== "valid") return json(req, { ok: false, error: "admin_code_invalid" }, 401);
  if (!SUPABASE_URL || !SERVICE_KEY) return json(req, { ok: false, error: "server_config" }, 503);
  const params = new URL(req.url).searchParams;
  const action = text(params.get("action"), 40).toLowerCase() || "read";
  const kind = kindFrom(params.get("kind") || "prepared_ok");
  if (!kind) return json(req, { ok: false, error: "invalid_message_kind" }, 400);
  try {
    if (req.method === "GET" && action === "read") return json(req, await readState(kind));
    if (req.method === "POST") {
      const body: JsonRecord = await req.json().catch(() => ({}));
      await applyRateLimit(req, action);
      if (action === "save_draft") {
        if (!onlyKeys(body, ["draft_body"])) throw new RequestFailure("unexpected_fields");
        await saveDraft(kind, validateBody(body.draft_body, kind));
        return json(req, await readState(kind));
      }
      if (action === "set_enabled") {
        if (!onlyKeys(body, ["channel", "is_enabled"])) throw new RequestFailure("unexpected_fields");
        const channel = channelFrom(body.channel);
        if (!channel || typeof body.is_enabled !== "boolean") throw new RequestFailure("invalid_settings");
        await updateSetting(kind, channel, { is_enabled: body.is_enabled });
        return json(req, await readState(kind));
      }
      if (action === "submit") {
        if (!onlyKeys(body, [])) throw new RequestFailure("unexpected_fields");
        const result = await submitDraft(kind);
        return json(req, { ...result, state: await readState(kind) });
      }
      if (action === "sync") {
        if (!onlyKeys(body, [])) throw new RequestFailure("unexpected_fields");
        const result = await refreshStatus(kind);
        return json(req, { ...result, state: await readState(kind) });
      }
      if (action === "activate") {
        if (!onlyKeys(body, ["channel"])) throw new RequestFailure("unexpected_fields");
        const channel = channelFrom(body.channel);
        if (!channel) throw new RequestFailure("invalid_channel");
        return json(req, await activateApproved(kind, channel));
      }
    }
    return json(req, { ok: false, error: "action_not_allowed" }, 404);
  } catch (error) {
    const status = error instanceof RequestFailure
      ? error.status
      : error instanceof MetaTemplatesError
      ? 502
      : 500;
    const code = error instanceof MetaTemplatesError
      ? error.code
      : error instanceof RequestFailure
      ? error.message
      : "separation_message_admin_error";
    console.error("site_order_separation_message_admin_v1", code);
    return json(req, { ok: false, error: code }, status);
  }
}

Deno.serve(handle);
