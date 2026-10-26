import postgres, { type Sql } from "npm:postgres@3.4.7";
import { CHECKOUT_ACTION_PREFIX, CHECKOUT_BASKET_REPLY_PREFIX, isCheckoutStartText } from "../_shared/checkout-routing.ts";
import { WHATSAPP_CHANNEL_PATTERN } from "../../../src/domain/channels.ts";
import { metaAppSecret } from "../_shared/meta-config.ts";
import { supabasePublishableKey } from "../_shared/supabase-api-keys.ts";

const BODY_LIMIT = 1024 * 1024;
const WEBHOOK_FUNCTIONS = {
  ana: "whatsapp-meta-webhook-v1",
  checkout: "whatsapp-checkout-webhook",
} as const;
type Destination = keyof typeof WEBHOOK_FUNCTIONS;

type JsonRecord = Record<string, unknown>;
type MetaValue = JsonRecord & {
  metadata?: { phone_number_id?: unknown };
  messages?: unknown[];
  statuses?: unknown[];
};

class RouterError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

let database: Sql | null = null;

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function constantTimeEqual(left: string, right: string): boolean {
  let mismatch = left.length ^ right.length;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return mismatch === 0;
}

function hex(value: Uint8Array): string {
  return [...value].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function digestHex(value: string): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
}

function getDatabase(): Sql {
  if (database) return database;
  const url = Deno.env.get("SUPABASE_DB_URL");
  if (!url) throw new RouterError(503, "A conexão privada do banco não está configurada.");
  database = postgres(url, { max: 1, idle_timeout: 10, connect_timeout: 5, prepare: false, ssl: "require" });
  return database;
}

async function signBody(body: string): Promise<string> {
  const secret = metaAppSecret();
  if (!secret) throw new RouterError(503, "O segredo do aplicativo Meta não está configurado.");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  return `sha256=${hex(signature)}`;
}

async function verifyBody(body: string, supplied: string | null): Promise<boolean> {
  if (!supplied || !/^sha256=[a-f0-9]{64}$/i.test(supplied)) return false;
  return constantTimeEqual(await signBody(body), supplied.toLowerCase());
}

async function readBody(request: Request): Promise<string | null> {
  const declared = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(declared) && declared > BODY_LIMIT) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > BODY_LIMIT) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function senderE164(value: unknown): string | null {
  if (typeof value !== "string" || !/^\+?[1-9]\d{6,14}$/.test(value)) return null;
  return value.startsWith("+") ? value : `+${value}`;
}

async function isProjectFlowReply(message: JsonRecord, phoneNumberId: unknown): Promise<boolean> {
  const interactive = isRecord(message.interactive) ? message.interactive : null;
  const flowReply = interactive && isRecord(interactive.nfm_reply) ? interactive.nfm_reply : null;
  if (typeof flowReply?.response_json !== "string" || flowReply.response_json.length > 64 * 1024) return false;
  let response: unknown;
  try { response = JSON.parse(flowReply.response_json); } catch { return false; }
  if (!isRecord(response) || response.contract_version !== 1 || typeof response.flow_token !== "string"
    || !/^[A-Za-z0-9_-]{32,128}$/.test(response.flow_token)) return false;
  const phone = senderE164(message.from);
  if (!phone || typeof phoneNumberId !== "string" || !phoneNumberId) return false;
  const tokenHash = await digestHex(response.flow_token);
  const rows = await getDatabase()<{ found: boolean }>`
    select exists (
      select 1
      from public.whatsapp_accounts account
      join public.whatsapp_flow_sessions session
        on session.channel = substring(account.slug from 14)
      where account.phone_number_id = ${phoneNumberId}
        and account.is_active = true
        and account.slug ~ ${`^dona-antonia-(${WHATSAPP_CHANNEL_PATTERN})$`}
        and session.token_hash = ${tokenHash}
        and session.phone_e164 = ${phone}
    ) as found
  `;
  return rows[0]?.found === true;
}

async function checkoutMessage(message: unknown, phoneNumberId: unknown): Promise<boolean> {
  if (!isRecord(message)) return false;
  const type = message.type;
  const interactive = isRecord(message.interactive) ? message.interactive : null;
  if (type === "interactive" && interactive) {
    if (isRecord(interactive.nfm_reply)) return await isProjectFlowReply(message, phoneNumberId);
    const listReply = isRecord(interactive.list_reply) ? interactive.list_reply.id : null;
    if (typeof listReply === "string" && listReply.startsWith(CHECKOUT_BASKET_REPLY_PREFIX)) return true;
    const buttonReply = isRecord(interactive.button_reply) ? interactive.button_reply.id : null;
    return typeof buttonReply === "string"
      && buttonReply.startsWith(CHECKOUT_ACTION_PREFIX)
      && /^(?:confirm|edit|cancel|accept-adjustment|cancel-adjustment):[0-9a-f-]{36}:\d+$/i.test(buttonReply.slice(CHECKOUT_ACTION_PREFIX.length));
  }
  if (type !== "text" || !isRecord(message.text) || typeof message.text.body !== "string") return false;
  return isCheckoutStartText(message.text.body);
}

async function isNewOutboxStatus(phoneNumberId: unknown, status: unknown): Promise<boolean> {
  if (typeof phoneNumberId !== "string" || !phoneNumberId || !isRecord(status)) return false;
  const providerId = status.id;
  if (typeof providerId !== "string" || !/^wamid\.[A-Za-z0-9._=-]{1,250}$/.test(providerId)) return false;
  const rows = await getDatabase()<{ found: boolean }>`
    select exists (
      select 1
      from public.whatsapp_accounts account
      join whatsapp_atendimento.message_outbox outbox
        on outbox.channel = substring(account.slug from 14)
      where account.phone_number_id = ${phoneNumberId}
        and account.is_active = true
        and account.slug ~ ${`^dona-antonia-(${WHATSAPP_CHANNEL_PATTERN})$`}
        and outbox.provider_message_id = ${providerId}
    ) as found
  `;
  return rows[0]?.found === true;
}

function copyEntry(entry: JsonRecord, changes: JsonRecord[]): JsonRecord {
  return { ...entry, changes };
}

function copyChange(change: JsonRecord, value: JsonRecord): JsonRecord {
  return { ...change, value };
}

async function splitPayload(root: JsonRecord): Promise<Record<Destination, JsonRecord | null>> {
  if (!Array.isArray(root.entry)) throw new RouterError(400, "O evento Meta não contém uma lista de entradas.");
  const payloads: Record<Destination, JsonRecord> = {
    ana: { ...root, entry: [] },
    checkout: { ...root, entry: [] },
  };

  for (const rawEntry of root.entry) {
    if (!isRecord(rawEntry) || !Array.isArray(rawEntry.changes)) continue;
    const changes: Record<Destination, JsonRecord[]> = { ana: [], checkout: [] };
    for (const rawChange of rawEntry.changes) {
      if (!isRecord(rawChange) || !isRecord(rawChange.value)) continue;
      const value = rawChange.value as MetaValue;
      const messages = Array.isArray(value.messages) ? value.messages : null;
      const statuses = Array.isArray(value.statuses) ? value.statuses : null;
      const phoneNumberId = value.metadata?.phone_number_id;
      const classifiedMessages = messages
        ? await Promise.all(messages.map(async (message) => [message, await checkoutMessage(message, phoneNumberId)] as const))
        : [];
      const checkoutMessages = classifiedMessages.filter(([, isCheckout]) => isCheckout).map(([message]) => message);
      const anaMessages = classifiedMessages.filter(([, isCheckout]) => !isCheckout).map(([message]) => message);

      const checkoutStatuses: unknown[] = [];
      const anaStatuses: unknown[] = [];
      if (statuses) {
        for (const status of statuses) {
          if (await isNewOutboxStatus(phoneNumberId, status)) checkoutStatuses.push(status);
          else anaStatuses.push(status);
        }
      }

      const hasAnaMessages = anaMessages.length > 0;
      const hasAnaStatuses = anaStatuses.length > 0;
      const hasUnclassifiedChange = !messages && !statuses;
      if (hasAnaMessages || hasAnaStatuses || hasUnclassifiedChange) {
        const anaValue: JsonRecord = { ...value };
        if (messages) {
          if (hasAnaMessages) anaValue.messages = anaMessages;
          else delete anaValue.messages;
        }
        if (statuses) {
          if (hasAnaStatuses) anaValue.statuses = anaStatuses;
          else delete anaValue.statuses;
        }
        changes.ana.push(copyChange(rawChange, anaValue));
      }

      if (checkoutMessages.length || checkoutStatuses.length) {
        const checkoutValue: JsonRecord = {};
        if (isRecord(value.metadata)) checkoutValue.metadata = value.metadata;
        if (checkoutMessages.length) checkoutValue.messages = checkoutMessages;
        if (checkoutStatuses.length) checkoutValue.statuses = checkoutStatuses;
        changes.checkout.push(copyChange(rawChange, checkoutValue));
      }
    }
    for (const destination of Object.keys(changes) as Destination[]) {
      if (changes[destination].length) {
        (payloads[destination].entry as JsonRecord[]).push(copyEntry(rawEntry, changes[destination]));
      }
    }
  }

  return {
    ana: (payloads.ana.entry as unknown[]).length ? payloads.ana : null,
    checkout: (payloads.checkout.entry as unknown[]).length ? payloads.checkout : null,
  };
}

function json(status: number, value: JsonRecord): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function text(status: number, value: string): Response {
  return new Response(value, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

async function relayMetaChallenge(request: Request): Promise<Response | null> {
  if (request.method !== "GET") return null;
  const base = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "");
  if (!base) return text(503, "Webhook verification is not configured.");
  const url = new URL(request.url);
  const relay = new URL(`${base}/functions/v1/${WEBHOOK_FUNCTIONS.ana}`);
  for (const key of ["hub.mode", "hub.verify_token", "hub.challenge"]) {
    const value = url.searchParams.get(key);
    if (value === null || value.length > 4096) return text(400, "Invalid webhook verification request.");
    relay.searchParams.set(key, value);
  }
  const headers = new Headers();
  const publishableKey = supabasePublishableKey();
  if (publishableKey) headers.set("apikey", publishableKey);
  try {
    const response = await fetch(relay, { method: "GET", headers, signal: AbortSignal.timeout(10_000) });
    const body = await response.text();
    if (body.length > 4096) return text(502, "Webhook verification response is too large.");
    return new Response(body, {
      status: response.status,
      headers: { "Content-Type": response.headers.get("Content-Type") ?? "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch {
    return text(502, "Webhook verification is temporarily unavailable.");
  }
}

async function forward(destination: Destination, payload: JsonRecord): Promise<boolean> {
  const base = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "");
  if (!base) throw new RouterError(503, "O Supabase não está configurado no servidor.");
  const body = JSON.stringify(payload);
  const headers = new Headers({
    "Content-Type": "application/json",
    "X-Hub-Signature-256": await signBody(body),
  });
  const publishableKey = supabasePublishableKey();
  if (publishableKey) headers.set("apikey", publishableKey);
  const response = await fetch(`${base}/functions/v1/${WEBHOOK_FUNCTIONS[destination]}`, {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    console.error("WhatsApp webhook downstream failed", destination, response.status);
    return false;
  }
  return true;
}

async function handle(request: Request): Promise<Response> {
  const verification = await relayMetaChallenge(request);
  if (verification) return verification;
  if (request.method !== "POST") return text(405, "Method not allowed.");

  const body = await readBody(request);
  if (body === null) return text(413, "Request body is too large or invalid.");
  let root: unknown;
  try {
    root = JSON.parse(body);
  } catch {
    return text(400, "Invalid JSON.");
  }
  if (!isRecord(root)) return text(400, "Invalid webhook payload.");
  if (!await verifyBody(body, request.headers.get("X-Hub-Signature-256"))) return text(401, "Invalid signature.");

  const split = await splitPayload(root);
  const destinations = (Object.keys(split) as Destination[]).filter((destination) => split[destination] !== null);
  if (!destinations.length) return json(200, { ok: true, ignored: true });

  const results = await Promise.all(destinations.map(async (destination) => {
    try {
      return [destination, await forward(destination, split[destination] as JsonRecord)] as const;
    } catch (error) {
      console.error("WhatsApp webhook forwarding failed", destination, error instanceof Error ? error.name : "unknown");
      return [destination, false] as const;
    }
  }));
  if (results.some(([, ok]) => !ok)) return json(502, { ok: false, retryable: true });
  return json(200, { ok: true, routed: destinations });
}

Deno.serve(async (request) => {
  try {
    return await handle(request);
  } catch (error) {
    if (error instanceof RouterError) return json(error.status, { ok: false, error: error.message });
    console.error("WhatsApp webhook router failed", error instanceof Error ? error.name : "unknown");
    return json(500, { ok: false });
  }
});
