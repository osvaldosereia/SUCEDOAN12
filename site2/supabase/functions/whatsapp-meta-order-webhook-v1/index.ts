import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "npm:@supabase/server@1.9.2";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";
import { verifyMetaFlowSignature } from "../_shared/flow-encryption.ts";
import {
	extractMetaInboundMessageIdentities,
	extractMetaOrderIngressEvents,
	extractMetaUnaddressableStatuses,
	type MetaInboundMessageIdentity,
	type MetaOrderIngressEvent,
	type MetaWebhookPath,
	type MetaWebhookStatusIdentity,
} from "../_shared/meta-order-events.ts";
import { routeMetaOrderIngressEvent } from "../_shared/meta-order-router.ts";

const BODY_LIMIT_BYTES = 2_000_000;
const RPC_TIMEOUT_MS = 8_000;
const LEGACY_FORWARD_TIMEOUT_MS = 12_000;
const CONFIRMATION_REPLY_PREFIX = "order-confirm-v1:";
const APP_SECRET_ENV_BY_CHANNEL: Record<string, string> = {
	"dona-antonia-0975": "META_WHATSAPP_APP_SECRET_0975",
	"dona-antonia-1018": "META_WHATSAPP_APP_SECRET_1018",
};
const LEGACY_FORWARD_SECRET_ENV = "META_WHATSAPP_APP_SECRET";
const VERIFY_TOKEN_ENV = "META_WHATSAPP_VERIFY_TOKEN";
const SUPABASE_URL_ENV = "SUPABASE_URL";
const LEGACY_WEBHOOK_SLUG = "whatsapp-meta-webhook-v1";
const MAX_WEBHOOK_ENTRIES = 1_000;
const MAX_WEBHOOK_ACCOUNTS = 20;

type JsonRecord = Record<string, unknown>;

type DurableEventContext = {
	eventId: string;
	conversationId: string | null;
	customerId: string | null;
};

type PersistResult =
	| { ok: true; context: DurableEventContext }
	| { ok: false; retryable: true; reason: string };

function isRecord(value: unknown): value is JsonRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readMetaId(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const normalized = value.trim();
	return /^\d{1,128}$/.test(normalized) ? normalized : null;
}

type WebhookAccountIdentity = {
	wabaId: string;
	phoneNumberIds: Set<string>;
};

type WebhookAccountRow = {
	slug: string;
	waba_id: string;
	phone_number_id: string;
};

function configuredMetaAppSecrets(): string[] | null {
	const secrets = Object.values(APP_SECRET_ENV_BY_CHANNEL).map(
		(secretEnv) => Deno.env.get(secretEnv)?.trim() ?? "",
	);
	if (secrets.some((secret) => !secret)) return null;
	return [...new Set(secrets)];
}

async function verifyWebhookSignature(
	rawBody: Uint8Array,
	signatureHeader: string | null,
): Promise<{ secret: string } | { error: "invalid" | "unavailable" }> {
	const secrets = configuredMetaAppSecrets();
	if (!secrets) return { error: "unavailable" };
	const matches = await Promise.all(
		secrets.map(async (secret) =>
			(await verifyMetaFlowSignature(rawBody, signatureHeader, secret))
				? secret
				: null,
		),
	);
	const matchedSecret = matches.find((secret) => secret !== null);
	return matchedSecret ? { secret: matchedSecret } : { error: "invalid" };
}

function extractWebhookAccountIdentities(
	payload: unknown,
): WebhookAccountIdentity[] | null {
	if (!isRecord(payload) || !Array.isArray(payload.entry)) return null;
	if (payload.entry.length === 0 || payload.entry.length > MAX_WEBHOOK_ENTRIES)
		return null;

	const accounts = new Map<string, WebhookAccountIdentity>();
	for (const entry of payload.entry) {
		if (!isRecord(entry) || !Array.isArray(entry.changes)) return null;
		const wabaId = readMetaId(entry.id);
		if (!wabaId) return null;
		let account = accounts.get(wabaId);
		if (!account) {
			account = { wabaId, phoneNumberIds: new Set() };
			accounts.set(wabaId, account);
		}
		for (const change of entry.changes) {
			if (!isRecord(change) || !isRecord(change.value)) continue;
			const metadata = isRecord(change.value.metadata)
				? change.value.metadata
				: null;
			const phoneNumberId = readMetaId(metadata?.phone_number_id);
			if (phoneNumberId) account.phoneNumberIds.add(phoneNumberId);
		}
	}
	if (accounts.size === 0 || accounts.size > MAX_WEBHOOK_ACCOUNTS) return null;
	return [...accounts.values()];
}

async function resolveWebhookAppSecret(
	supabaseAdmin: SupabaseClient,
	payload: unknown,
	verifiedSecret: string,
): Promise<{ ok: true } | { error: "invalid" | "unavailable" | "unmapped" }> {
	const identities = extractWebhookAccountIdentities(payload);
	if (!identities) return { error: "invalid" };
	const wabaIds = identities.map((identity) => identity.wabaId);
	const { data, error } = await supabaseAdmin
		.from("whatsapp_accounts")
		.select("slug,waba_id,phone_number_id")
		.eq("is_active", true)
		.in("waba_id", wabaIds)
		.abortSignal(AbortSignal.timeout(RPC_TIMEOUT_MS));
	if (error || !Array.isArray(data)) return { error: "unavailable" };

	const rows = data.filter(
		(row): row is WebhookAccountRow =>
			isRecord(row) &&
			typeof row.slug === "string" &&
			typeof row.waba_id === "string" &&
			typeof row.phone_number_id === "string",
	);
	const selected = new Map<string, WebhookAccountRow>();
	for (const identity of identities) {
		const wabaRows = rows.filter((row) => row.waba_id === identity.wabaId);
		if (wabaRows.length === 0) return { error: "unmapped" };
		if (identity.phoneNumberIds.size === 0) {
			for (const row of wabaRows) selected.set(row.slug, row);
			continue;
		}
		for (const phoneNumberId of identity.phoneNumberIds) {
			const matches = wabaRows.filter(
				(row) => row.phone_number_id === phoneNumberId,
			);
			if (matches.length !== 1) return { error: "unmapped" };
			selected.set(matches[0].slug, matches[0]);
		}
	}

	for (const account of selected.values()) {
		const secretEnv = APP_SECRET_ENV_BY_CHANNEL[account.slug];
		if (!secretEnv) return { error: "unmapped" };
		const secret = Deno.env.get(secretEnv)?.trim() ?? "";
		if (!secret) return { error: "unavailable" };
		if (secret !== verifiedSecret) return { error: "unmapped" };
	}
	return { ok: true };
}

function isUuid(value: unknown): value is string {
	return (
		typeof value === "string" &&
		/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
			value,
		)
	);
}

function jsonResponse(
	body: JsonRecord,
	status = 200,
	contentType = "application/json; charset=utf-8",
): Response {
	return new Response(
		contentType.startsWith("text/")
			? String(body.challenge ?? "")
			: JSON.stringify(body),
		{
			status,
			headers: {
				"Cache-Control": "no-store",
				"Content-Type": contentType,
			},
		},
	);
}

async function readBodyLimited(request: Request): Promise<Uint8Array | null> {
	const contentLength = request.headers.get("Content-Length");
	if (contentLength) {
		const declaredLength = Number(contentLength);
		if (Number.isFinite(declaredLength) && declaredLength > BODY_LIMIT_BYTES)
			return null;
	}
	if (!request.body) return new Uint8Array();

	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > BODY_LIMIT_BYTES) {
			await reader.cancel();
			return null;
		}
		chunks.push(value);
	}
	const body = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		body.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return body;
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
	return bytes.buffer.slice(
		bytes.byteOffset,
		bytes.byteOffset + bytes.byteLength,
	) as ArrayBuffer;
}

function bytesToHex(bytes: Uint8Array): string {
	return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value: string): Promise<string> {
	const bytes = new TextEncoder().encode(value);
	const digest = await crypto.subtle.digest("SHA-256", asArrayBuffer(bytes));
	return bytesToHex(new Uint8Array(digest));
}

async function signMetaBody(body: string, appSecret: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(appSecret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign(
		"HMAC",
		key,
		new TextEncoder().encode(body),
	);
	return `sha256=${bytesToHex(new Uint8Array(signature))}`;
}

function constantTimeStringEqual(left: string, right: string): boolean {
	const leftBytes = new TextEncoder().encode(left);
	const rightBytes = new TextEncoder().encode(right);
	let difference = leftBytes.length ^ rightBytes.length;
	const length = Math.max(leftBytes.length, rightBytes.length);
	for (let index = 0; index < length; index += 1) {
		difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
	}
	return difference === 0;
}

function isConfirmationReply(event: MetaOrderIngressEvent): boolean {
	return (
		event.kind === "confirmation_reply" &&
		event.replyId?.startsWith(CONFIRMATION_REPLY_PREFIX) === true &&
		event.replyTitle === "Confirmar pedido"
	);
}

function isOrderIngressEvent(event: MetaOrderIngressEvent): boolean {
	return (
		event.kind === "catalog_order" ||
		event.kind === "flow_submission" ||
		isConfirmationReply(event)
	);
}

function pathKey(path: MetaWebhookPath): string {
	return `${path.entryIndex}:${path.changeIndex}:${path.itemIndex}`;
}

function readAtPath(
	payload: unknown,
	path: MetaWebhookPath,
	collection: "messages" | "statuses",
): JsonRecord | null {
	if (!isRecord(payload) || !Array.isArray(payload.entry)) return null;
	const entry = payload.entry[path.entryIndex];
	if (!isRecord(entry) || !Array.isArray(entry.changes)) return null;
	const change = entry.changes[path.changeIndex];
	if (!isRecord(change) || !isRecord(change.value)) return null;
	const items = change.value[collection];
	if (!Array.isArray(items)) return null;
	const item = items[path.itemIndex];
	return isRecord(item) ? item : null;
}

function receivedAt(timestamp: string | null): string {
	if (timestamp && /^\d{1,13}$/.test(timestamp)) {
		const numeric = Number(timestamp);
		const milliseconds = timestamp.length > 10 ? numeric : numeric * 1_000;
		const parsed = new Date(milliseconds);
		if (Number.isFinite(parsed.getTime())) return parsed.toISOString();
	}
	return new Date().toISOString();
}

function decodeStatusTimestamp(timestamp: string | null): string | null {
	if (!timestamp || !/^\d{1,13}$/.test(timestamp)) return null;
	const numeric = Number(timestamp);
	const milliseconds = timestamp.length > 10 ? numeric : numeric * 1_000;
	const parsed = new Date(milliseconds);
	return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function messageTextForEvent(
	event: MetaOrderIngressEvent | undefined,
	identity: MetaInboundMessageIdentity,
): string | null {
	if (event?.kind === "catalog_order")
		return "Pedido recebido pelo catálogo do WhatsApp";
	if (event?.kind === "flow_submission")
		return "Resposta recebida pelo Flow de cesta";
	if (event?.kind === "confirmation_reply")
		return event.replyTitle ?? "Confirmação de pedido recebida";
	return identity.textBody;
}

function safeMessagePayload(
	identity: MetaInboundMessageIdentity,
	event?: MetaOrderIngressEvent,
): JsonRecord {
	const rawType =
		event?.kind === "catalog_order"
			? "order"
			: event?.kind === "flow_submission"
				? "interactive"
				: identity.messageType;
	const safeText = event
		? messageTextForEvent(event, identity)
		: identity.textBody;
	return {
		object: "whatsapp_business_account",
		entry_id: identity.metaWabaId,
		phone_number_id: identity.metaPhoneNumberId,
		message_id: identity.messageId,
		review_kind: identity.senderPhoneE164 ? null : "opaque_sender",
		intake_kind: event?.kind ?? null,
		sender_provider_id: identity.senderProviderId,
		message_type: identity.messageType,
		raw_type: rawType,
		text_body: safeText,
		media_id: identity.mediaId,
		reply_to_message_id: identity.replyToMessageId,
	};
}

async function resolveAccountId(
	supabaseAdmin: SupabaseClient,
	phoneNumberId: string | null,
	wabaId: string | null,
	cache: Map<string, string | null>,
): Promise<{ id: string | null; retryable: boolean }> {
	if (!phoneNumberId || !wabaId) return { id: null, retryable: false };
	const key = `${phoneNumberId}:${wabaId}`;
	if (cache.has(key)) return { id: cache.get(key) ?? null, retryable: false };
	const { data, error } = await supabaseAdmin
		.from("whatsapp_accounts")
		.select("id")
		.eq("phone_number_id", phoneNumberId)
		.eq("waba_id", wabaId)
		.eq("is_active", true)
		.abortSignal(AbortSignal.timeout(RPC_TIMEOUT_MS))
		.maybeSingle();
	if (error) return { id: null, retryable: true };
	const id = isUuid(data?.id) ? data.id.toLowerCase() : null;
	cache.set(key, id);
	return { id, retryable: false };
}

async function loadExistingMessageContext(
	supabaseAdmin: SupabaseClient,
	whatsappAccountId: string,
	providerMessageId: string,
): Promise<{
	conversationId: string | null;
	customerId: string | null;
	retryable: boolean;
}> {
	const { data, error } = await supabaseAdmin
		.from("whatsapp_messages_v1")
		.select("conversation_id,customer_id")
		.eq("whatsapp_account_id", whatsappAccountId)
		.eq("provider", "meta")
		.eq("provider_message_id", providerMessageId)
		.abortSignal(AbortSignal.timeout(RPC_TIMEOUT_MS))
		.maybeSingle();
	if (error) return { conversationId: null, customerId: null, retryable: true };
	return {
		conversationId: isUuid(data?.conversation_id)
			? data.conversation_id.toLowerCase()
			: null,
		customerId: isUuid(data?.customer_id)
			? data.customer_id.toLowerCase()
			: null,
		retryable: false,
	};
}

async function persistInboundMessage(
	supabaseAdmin: SupabaseClient,
	whatsappAccountId: string,
	identity: MetaInboundMessageIdentity,
	rawMessage: JsonRecord,
	event?: MetaOrderIngressEvent,
): Promise<PersistResult> {
	const rawFingerprint = await sha256Hex(JSON.stringify(rawMessage));
	const messageType =
		event?.kind === "catalog_order"
			? "unknown"
			: event?.kind === "flow_submission" ||
					event?.kind === "confirmation_reply"
				? "interactive"
				: identity.messageType;
	const safeText = messageTextForEvent(event, identity);
	const { data, error } = await supabaseAdmin
		.rpc("whatsapp_ingest_event_v1", {
			p_whatsapp_account_id: whatsappAccountId,
			p_provider: "meta",
			p_provider_event_id: identity.messageId
				? `message:${identity.messageId}`
				: null,
			p_event_type: "message.received",
			p_provider_message_id: identity.messageId,
			p_phone_e164: identity.senderPhoneE164,
			p_received_at: receivedAt(identity.timestamp),
			p_payload_hash: rawFingerprint,
			p_payload: safeMessagePayload(identity, event),
			p_message: {
				direction: "inbound",
				message_type: messageType,
				provider: "meta",
				provider_message_id: identity.messageId,
				source: "meta",
				status_current: "received",
				sender_kind: "customer",
				sender_ref: identity.senderProviderId,
				text_body: safeText,
				received_at: receivedAt(identity.timestamp),
				metadata: {
					source: "meta",
					raw_type:
						event?.kind === "catalog_order"
							? "order"
							: event?.kind === "flow_submission"
								? "interactive"
								: identity.messageType,
					media_id: identity.mediaId,
					reply_to_provider_message_id: identity.replyToMessageId,
					meta_waba_id: identity.metaWabaId,
					meta_phone_number_id: identity.metaPhoneNumberId,
				},
			},
		})
		.abortSignal(AbortSignal.timeout(RPC_TIMEOUT_MS));
	if (error || !isRecord(data))
		return { ok: false, retryable: true, reason: "message_ingest_unavailable" };
	const eventId = isUuid(data.event_id) ? data.event_id.toLowerCase() : null;
	const resolutionFailure = data.error === "conversation_resolution_failed";
	if (!eventId || (data.ok !== true && !resolutionFailure)) {
		return { ok: false, retryable: true, reason: "message_ingest_unavailable" };
	}

	let conversationId = isUuid(data.conversation_id)
		? data.conversation_id.toLowerCase()
		: null;
	let customerId = isUuid(data.customer_id)
		? data.customer_id.toLowerCase()
		: null;
	if (data.duplicate === true && identity.messageId) {
		const existing = await loadExistingMessageContext(
			supabaseAdmin,
			whatsappAccountId,
			identity.messageId,
		);
		if (existing.retryable)
			return {
				ok: false,
				retryable: true,
				reason: "message_context_unavailable",
			};
		conversationId ??= existing.conversationId;
		customerId ??= existing.customerId;
	}
	return { ok: true, context: { eventId, conversationId, customerId } };
}

async function markEventStatus(
	supabaseAdmin: SupabaseClient,
	eventId: string,
	status: "normalized" | "review_required",
	reason: string | null,
): Promise<boolean> {
	const { error } = await supabaseAdmin
		.from("whatsapp_webhook_events_v1")
		.update({
			status,
			processed_at: new Date().toISOString(),
			last_error: reason,
		})
		.eq("id", eventId)
		.abortSignal(AbortSignal.timeout(RPC_TIMEOUT_MS));
	return !error;
}

async function captureUnaddressableStatus(
	supabaseAdmin: SupabaseClient,
	whatsappAccountId: string,
	status: MetaWebhookStatusIdentity,
	rawStatus: JsonRecord,
): Promise<{ ok: boolean; retryable: boolean }> {
	const rawFingerprint = await sha256Hex(JSON.stringify(rawStatus));
	const statusIdentity = status.timestamp ?? rawFingerprint.slice(0, 16);
	const providerEventId = status.providerMessageId
		? `status:${status.providerMessageId}:${status.status ?? "unknown"}:${statusIdentity}`
		: null;
	const { data: ingestData, error: ingestError } = await supabaseAdmin
		.rpc("whatsapp_ingest_event_v1", {
			p_whatsapp_account_id: whatsappAccountId,
			p_provider: "meta",
			p_provider_event_id: providerEventId,
			p_event_type: "message.status",
			p_provider_message_id: status.providerMessageId,
			p_phone_e164: null,
			p_received_at: new Date().toISOString(),
			p_payload_hash: rawFingerprint,
			p_payload: {
				object: "whatsapp_business_account",
				entry_id: status.metaWabaId,
				phone_number_id: status.metaPhoneNumberId,
				review_kind: status.recipientPhoneE164 ? null : "opaque_recipient",
				provider_message_id: status.providerMessageId,
				recipient_provider_id: status.recipientProviderId,
				status: status.status,
				timestamp: status.timestamp,
				error_code: status.errorCode,
				error_title: status.errorTitle,
				error_detail: status.errorDetail,
			},
			p_message: null,
		})
		.abortSignal(AbortSignal.timeout(RPC_TIMEOUT_MS));
	if (ingestError || !isRecord(ingestData))
		return { ok: false, retryable: true };
	const eventId = isUuid(ingestData.event_id)
		? ingestData.event_id.toLowerCase()
		: null;
	if (!eventId) return { ok: false, retryable: true };

	const recognizedStatus = new Set(["sent", "delivered", "read", "failed"]);
	if (
		!status.providerMessageId ||
		!status.status ||
		!recognizedStatus.has(status.status)
	) {
		const marked = await markEventStatus(
			supabaseAdmin,
			eventId,
			"review_required",
			"status_identity_unresolved",
		);
		return {
			ok: marked,
			retryable: !marked,
		};
	}

	const { data: statusData, error: statusError } = await supabaseAdmin
		.rpc("whatsapp_record_status_v1", {
			p_whatsapp_account_id: whatsappAccountId,
			p_provider: "meta",
			p_provider_message_id: status.providerMessageId,
			p_status: status.status,
			p_occurred_at:
				decodeStatusTimestamp(status.timestamp) ?? new Date().toISOString(),
			p_received_at: new Date().toISOString(),
			p_error_code: status.errorCode,
			p_error_title: status.errorTitle,
			p_error_detail: status.errorDetail,
			p_payload: {
				provider_message_id: status.providerMessageId,
				recipient_provider_id: status.recipientProviderId,
				status: status.status,
				timestamp: status.timestamp,
			},
		})
		.abortSignal(AbortSignal.timeout(RPC_TIMEOUT_MS));
	if (statusError || !isRecord(statusData))
		return { ok: false, retryable: true };
	if (statusData.ok !== true) {
		const reason =
			statusData.error === "message_not_found"
				? "status_message_not_found"
				: "status_unrecognized";
		const marked = await markEventStatus(
			supabaseAdmin,
			eventId,
			"review_required",
			reason,
		);
		return {
			ok: marked,
			retryable:
				!marked ||
				(statusData.error !== "message_not_found" &&
					statusData.error !== "status_unrecognized"),
		};
	}
	const marked = await markEventStatus(
		supabaseAdmin,
		eventId,
		"normalized",
		null,
	);
	return { ok: marked, retryable: !marked };
}

function filterCapturedPaths(
	payload: unknown,
	messagePaths: Set<string>,
	statusPaths: Set<string>,
): JsonRecord | null {
	if (!isRecord(payload) || !Array.isArray(payload.entry)) return null;
	const filtered = structuredClone(payload) as JsonRecord;
	const entries = Array.isArray(filtered.entry) ? filtered.entry : [];
	for (const [entryIndex, entry] of entries.entries()) {
		if (!isRecord(entry) || !Array.isArray(entry.changes)) continue;
		const changes = entry.changes;
		for (const [changeIndex, change] of changes.entries()) {
			if (!isRecord(change) || !isRecord(change.value)) continue;
			const value = change.value;
			if (Array.isArray(value.messages)) {
				value.messages = value.messages.filter(
					(_item, itemIndex) =>
						!messagePaths.has(`${entryIndex}:${changeIndex}:${itemIndex}`),
				);
			}
			if (Array.isArray(value.statuses)) {
				value.statuses = value.statuses.filter(
					(_item, itemIndex) =>
						!statusPaths.has(`${entryIndex}:${changeIndex}:${itemIndex}`),
				);
			}
		}
		const remainingChanges = changes.filter((change) => {
			if (!isRecord(change) || !isRecord(change.value)) return true;
			const value = change.value;
			const isMessageChange =
				change.field === "messages" ||
				Array.isArray(value.messages) ||
				Array.isArray(value.statuses);
			if (!isMessageChange) return true;
			return (
				(Array.isArray(value.messages) && value.messages.length > 0) ||
				(Array.isArray(value.statuses) && value.statuses.length > 0)
			);
		});
		entry.changes = remainingChanges;
		if (remainingChanges.length === 0) entries[entryIndex] = null;
	}
	filtered.entry = entries.filter((entry) => entry !== null);
	return filtered;
}

function hasForwardableChange(payload: JsonRecord): boolean {
	if (!Array.isArray(payload.entry)) return false;
	return payload.entry.some(
		(entry) =>
			isRecord(entry) &&
			Array.isArray(entry.changes) &&
			entry.changes.length > 0,
	);
}

async function forwardLegacyWebhook(payload: JsonRecord): Promise<boolean> {
	const supabaseUrl = Deno.env.get(SUPABASE_URL_ENV)?.trim();
	const legacyForwardSecret =
		Deno.env.get(LEGACY_FORWARD_SECRET_ENV)?.trim() ?? "";
	if (!supabaseUrl || !legacyForwardSecret) return false;
	let target: URL;
	try {
		target = new URL(`/functions/v1/${LEGACY_WEBHOOK_SLUG}`, supabaseUrl);
	} catch {
		return false;
	}
	if (
		target.protocol !== "https:" &&
		target.hostname !== "127.0.0.1" &&
		target.hostname !== "localhost"
	)
		return false;
	const body = JSON.stringify(payload);
	const signature = await signMetaBody(body, legacyForwardSecret);
	try {
		const response = await fetch(target, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-Hub-Signature-256": signature,
			},
			body,
			signal: AbortSignal.timeout(LEGACY_FORWARD_TIMEOUT_MS),
		});
		return response.ok;
	} catch {
		return false;
	}
}

async function processOrderIngress(
	supabaseAdmin: SupabaseClient,
	payload: unknown,
): Promise<Response> {
	const sourceEvents =
		extractMetaOrderIngressEvents(payload).filter(isOrderIngressEvent);
	const identities = extractMetaInboundMessageIdentities(payload);
	const opaqueStatuses = extractMetaUnaddressableStatuses(payload);
	const identityByPath = new Map(
		identities.map((item) => [pathKey(item.path), item]),
	);
	const structuredPaths = new Set(
		sourceEvents.map((event) => pathKey(event.path)),
	);
	const messagePaths = new Set(structuredPaths);
	const statusPaths = new Set<string>();
	const accountCache = new Map<string, string | null>();
	let transientFailure = false;

	for (const event of sourceEvents) {
		const account = await resolveAccountId(
			supabaseAdmin,
			event.metaPhoneNumberId,
			event.metaWabaId,
			accountCache,
		);
		if (account.retryable || !account.id) {
			transientFailure = true;
			continue;
		}
		const identity = identityByPath.get(pathKey(event.path));
		const rawMessage = readAtPath(payload, event.path, "messages");
		if (!identity || !rawMessage) {
			transientFailure = true;
			continue;
		}
		const persisted = await persistInboundMessage(
			supabaseAdmin,
			account.id,
			identity,
			rawMessage,
			event,
		);
		if (!persisted.ok) {
			transientFailure ||= persisted.retryable;
			continue;
		}
		if (!event.messageId) {
			if (
				!(await markEventStatus(
					supabaseAdmin,
					persisted.context.eventId,
					"review_required",
					"message_id_missing",
				))
			) {
				transientFailure = true;
			}
			continue;
		}
		const routed = await routeMetaOrderIngressEvent(supabaseAdmin, event, {
			sourceEventId: persisted.context.eventId,
			whatsappAccountId: account.id,
			conversationId: persisted.context.conversationId,
			customerId: persisted.context.customerId,
		});
		if (routed.handled && routed.retryable) transientFailure = true;
	}

	for (const identity of identities) {
		const key = pathKey(identity.path);
		if (identity.senderPhoneE164 || structuredPaths.has(key)) continue;
		messagePaths.add(key);
		const rawMessage = readAtPath(payload, identity.path, "messages");
		if (!rawMessage) {
			transientFailure = true;
			continue;
		}
		const account = await resolveAccountId(
			supabaseAdmin,
			identity.metaPhoneNumberId,
			identity.metaWabaId,
			accountCache,
		);
		if (account.retryable || !account.id) {
			transientFailure = true;
			continue;
		}
		const persisted = await persistInboundMessage(
			supabaseAdmin,
			account.id,
			identity,
			rawMessage,
		);
		if (!persisted.ok) transientFailure ||= persisted.retryable;
	}

	for (const status of opaqueStatuses) {
		statusPaths.add(pathKey(status.path));
		const rawStatus = readAtPath(payload, status.path, "statuses");
		if (!rawStatus) {
			transientFailure = true;
			continue;
		}
		const account = await resolveAccountId(
			supabaseAdmin,
			status.metaPhoneNumberId,
			status.metaWabaId,
			accountCache,
		);
		if (account.retryable || !account.id) {
			transientFailure = true;
			continue;
		}
		const captured = await captureUnaddressableStatus(
			supabaseAdmin,
			account.id,
			status,
			rawStatus,
		);
		if (!captured.ok && captured.retryable) transientFailure = true;
	}

	const forwarded = filterCapturedPaths(payload, messagePaths, statusPaths);
	if (!forwarded)
		return jsonResponse({ ok: false, error: "invalid_webhook" }, 400);
	if (hasForwardableChange(forwarded)) {
		const forwardedOk = await forwardLegacyWebhook(forwarded);
		if (!forwardedOk) transientFailure = true;
	}
	if (transientFailure)
		return jsonResponse(
			{ ok: false, error: "event_processing_unavailable" },
			503,
		);
	return jsonResponse({ ok: true });
}

export default {
	fetch: withSupabase({ auth: "none" }, async (request, { supabaseAdmin }) => {
		if (request.method === "GET") {
			const url = new URL(request.url);
			const mode = url.searchParams.get("hub.mode");
			const suppliedToken = url.searchParams.get("hub.verify_token") ?? "";
			const challenge = url.searchParams.get("hub.challenge");
			const expectedToken = Deno.env.get(VERIFY_TOKEN_ENV)?.trim() ?? "";
			if (!expectedToken) return jsonResponse({ ok: false }, 503);
			if (
				mode !== "subscribe" ||
				!constantTimeStringEqual(suppliedToken, expectedToken) ||
				challenge === null
			) {
				return jsonResponse({ ok: false }, 403);
			}
			return jsonResponse({ challenge }, 200, "text/plain; charset=utf-8");
		}
		if (request.method !== "POST") return jsonResponse({ ok: false }, 405);

		const rawBody = await readBodyLimited(request);
		if (rawBody === null) return jsonResponse({ ok: false }, 413);
		let payload: unknown;
		try {
			payload = JSON.parse(new TextDecoder().decode(rawBody)) as unknown;
		} catch {
			return jsonResponse({ ok: false }, 400);
		}
		if (
			!isRecord(payload) ||
			payload.object !== "whatsapp_business_account" ||
			!Array.isArray(payload.entry)
		) {
			return jsonResponse({ ok: false }, 400);
		}
		const verifiedSignature = await verifyWebhookSignature(
			rawBody,
			request.headers.get("X-Hub-Signature-256"),
		);
		if ("error" in verifiedSignature) {
			if (verifiedSignature.error === "invalid")
				return jsonResponse({ ok: false }, 401);
			return jsonResponse({ ok: false }, 503);
		}
		const accountBinding = await resolveWebhookAppSecret(
			supabaseAdmin,
			payload,
			verifiedSignature.secret,
		);
		if ("error" in accountBinding) {
			if (accountBinding.error === "invalid")
				return jsonResponse({ ok: false }, 400);
			if (accountBinding.error === "unavailable")
				return jsonResponse({ ok: false }, 503);
			return jsonResponse({ ok: false }, 401);
		}
		return await processOrderIngress(supabaseAdmin, payload);
	}),
};
