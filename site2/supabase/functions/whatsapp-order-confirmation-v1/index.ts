import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "npm:@supabase/server@1.9.2";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";

const BODY_LIMIT_BYTES = 24_000;
const RPC_TIMEOUT_MS = 8_000;
const SUMMARY_LIMIT_CHARS = 900;
const BUTTON_TOKEN_PATTERN =
	/^order-confirm-v1:([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}):([A-Za-z0-9_-]{43})$/i;

type JsonRecord = Record<string, unknown>;

type ConfirmationRequest = {
	sourceEventId: string;
	whatsappAccountId: string;
	metaWabaId: string;
	metaPhoneNumberId: string;
	conversationId: string;
	messageId: string;
	replyToMessageId: string;
	senderPhoneE164: string;
	senderProviderId: string | null;
	replyId: string;
};

function isRecord(value: unknown): value is JsonRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
	return (
		typeof value === "string" &&
		/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
			value,
		)
	);
}

function readText(value: unknown, maxLength: number): string | null {
	if (typeof value !== "string") return null;
	const normalized = value.trim();
	return normalized.length > 0 && normalized.length <= maxLength
		? normalized
		: null;
}

async function readBodyLimited(request: Request): Promise<string | null> {
	const declaredLength = Number(request.headers.get("Content-Length"));
	if (Number.isFinite(declaredLength) && declaredLength > BODY_LIMIT_BYTES) {
		return null;
	}
	if (!request.body) return "";

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

	const bytes = new Uint8Array(total);
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

function parseRequest(value: unknown): ConfirmationRequest | null {
	if (!isRecord(value) || value.kind !== "confirmation_reply") return null;
	if (!Array.isArray(value.issues) || value.issues.length > 0) return null;
	const senderPhoneE164 = readText(value.senderPhoneE164, 20);
	const senderProviderId = readText(value.senderProviderId, 256);
	if (
		value.senderProviderId !== null &&
		value.senderProviderId !== undefined &&
		senderProviderId === null
	) {
		return null;
	}
	if (!senderPhoneE164 || !/^\+[1-9][0-9]{7,14}$/.test(senderPhoneE164)) {
		return null;
	}
	const request = {
		sourceEventId: isUuid(value.sourceEventId)
			? value.sourceEventId.toLowerCase()
			: "",
		whatsappAccountId: isUuid(value.whatsappAccountId)
			? value.whatsappAccountId.toLowerCase()
			: "",
		metaWabaId: readText(value.metaWabaId, 128) ?? "",
		metaPhoneNumberId: readText(value.metaPhoneNumberId, 128) ?? "",
		conversationId: isUuid(value.conversationId)
			? value.conversationId.toLowerCase()
			: "",
		messageId: readText(value.messageId, 256) ?? "",
		replyToMessageId: readText(value.replyToMessageId, 256) ?? "",
		senderPhoneE164,
		senderProviderId,
		replyId: readText(value.replyId, 256) ?? "",
	};
	if (
		!request.sourceEventId ||
		!request.whatsappAccountId ||
		!request.metaWabaId ||
		!request.metaPhoneNumberId ||
		!request.conversationId ||
		!request.messageId ||
		!request.replyToMessageId ||
		!request.replyId ||
		value.replyTitle !== "Confirmar pedido"
	) {
		return null;
	}
	return request;
}

async function sha256Hex(value: string): Promise<string> {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(value),
	);
	return Array.from(new Uint8Array(digest), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
}

function randomConfirmationToken(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/g, "");
}

function confirmationPayload(
	intentId: string,
	token: string,
	summary: string,
): JsonRecord {
	return {
		messaging_product: "whatsapp",
		recipient_type: "individual",
		type: "interactive",
		interactive: {
			type: "button",
			body: { text: summary },
			action: {
				buttons: [
					{
						type: "reply",
						reply: {
							id: `order-confirm-v1:${intentId}:${token}`,
							title: "Confirmar pedido",
						},
					},
				],
			},
		},
	};
}

function jsonResponse(body: JsonRecord, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			"Cache-Control": "no-store",
			"Content-Type": "application/json; charset=utf-8",
		},
	});
}

async function prepareRepriceConfirmation(
	supabaseAdmin: SupabaseClient,
	intentId: string,
	summary: string,
): Promise<
	{ ok: true; status: string; outboxId: string | null } | { ok: false }
> {
	const token = randomConfirmationToken();
	const payload = confirmationPayload(intentId, token, summary);
	const [tokenHash, summaryHash] = await Promise.all([
		sha256Hex(token),
		sha256Hex(summary),
	]);
	const { data, error } = await supabaseAdmin
		.rpc("whatsapp_order_intent_prepare_confirmation_v1", {
			p_intent_id: intentId,
			p_confirmation_token_hash: tokenHash,
			p_summary_hash: summaryHash,
			p_confirmation_payload: payload,
		})
		.abortSignal(AbortSignal.timeout(RPC_TIMEOUT_MS));
	if (error || !isRecord(data) || data.ok !== true) return { ok: false };
	return {
		ok: true,
		status: readText(data.status, 40) ?? "unknown",
		outboxId: isUuid(data.outbox_id) ? data.outbox_id.toLowerCase() : null,
	};
}

export default {
	fetch: withSupabase(
		{ auth: "secret" },
		async (request, { supabaseAdmin }) => {
			if (request.method !== "POST") {
				return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
			}
			const rawBody = await readBodyLimited(request);
			if (rawBody === null)
				return jsonResponse({ ok: false, error: "body_too_large" }, 413);

			let parsed: unknown;
			try {
				parsed = JSON.parse(rawBody) as unknown;
			} catch {
				return jsonResponse({ ok: false, error: "invalid_request" }, 400);
			}
			const input = parseRequest(parsed);
			if (!input)
				return jsonResponse(
					{ ok: false, error: "confirmation_event_invalid" },
					422,
				);

			const buttonMatch = BUTTON_TOKEN_PATTERN.exec(input.replyId);
			if (!buttonMatch)
				return jsonResponse(
					{ ok: false, error: "confirmation_button_invalid" },
					422,
				);
			const intentId = buttonMatch[1].toLowerCase();
			const tokenHash = await sha256Hex(buttonMatch[2]);
			const { data, error } = await supabaseAdmin
				.rpc("whatsapp_order_intent_confirm_v1", {
					p_intent_id: intentId,
					p_confirmation_event_id: input.sourceEventId,
					p_whatsapp_account_id: input.whatsappAccountId,
					p_meta_waba_id: input.metaWabaId,
					p_meta_phone_number_id: input.metaPhoneNumberId,
					p_conversation_id: input.conversationId,
					p_inbound_message_id: input.messageId,
					p_reply_to_message_id: input.replyToMessageId,
					p_confirmation_token_hash: tokenHash,
					p_sender_phone_e164: input.senderPhoneE164,
					p_sender_provider_id: input.senderProviderId,
				})
				.abortSignal(AbortSignal.timeout(RPC_TIMEOUT_MS));
			if (error || !isRecord(data) || data.ok !== true) {
				return jsonResponse(
					{ ok: false, error: "order_confirmation_processing_failed" },
					503,
				);
			}
			if (data.retryable === true) {
				return jsonResponse(
					{
						ok: false,
						retryable: true,
						error: "confirmation_send_receipt_pending",
					},
					503,
				);
			}

			const status = readText(data.status, 40);
			if (status === "reprice_required") {
				if (data.source_kind === "catalog") {
					const { data: catalogPrepared, error: catalogPrepareError } =
						await supabaseAdmin
							.rpc(
								"whatsapp_order_intent_catalog_confirmation_prepare_admin_v1",
								{
									p_intent_id: intentId,
								},
							)
							.abortSignal(AbortSignal.timeout(RPC_TIMEOUT_MS));
					if (
						catalogPrepareError ||
						!isRecord(catalogPrepared) ||
						catalogPrepared.ok !== true ||
						catalogPrepared.status !== "awaiting_confirmation" ||
						!isUuid(catalogPrepared.outbox_id)
					) {
						return jsonResponse(
							{
								ok: false,
								error: "repriced_catalog_confirmation_prepare_failed",
							},
							503,
						);
					}
					const catalogOutboxId = catalogPrepared.outbox_id.toLowerCase();
					const { data: delivery, error: deliveryError } =
						await supabaseAdmin.functions.invoke(
							"whatsapp-order-confirmation-sender-v1",
							{ body: { outboxId: catalogOutboxId } },
						);
					if (deliveryError || !isRecord(delivery) || delivery.ok !== true) {
						return jsonResponse(
							{
								ok: false,
								error: "repriced_catalog_confirmation_dispatch_failed",
							},
							503,
						);
					}
					const deliveryStatus = readText(delivery.status, 40);
					return jsonResponse({
						ok: true,
						intent_id: intentId,
						source_kind: "catalog",
						status:
							deliveryStatus === "sent" ? "reprice_required" : "needs_review",
						issue_code: "quote_changed_after_customer_confirmation",
						delivery_status: deliveryStatus,
						outbox_id: catalogOutboxId,
					});
				}
				const summary = readText(data.summary_text, SUMMARY_LIMIT_CHARS);
				if (!summary || !isUuid(intentId)) {
					return jsonResponse(
						{ ok: false, error: "repriced_confirmation_unavailable" },
						503,
					);
				}
				const prepared = await prepareRepriceConfirmation(
					supabaseAdmin,
					intentId,
					summary,
				);
				if (!prepared.ok) {
					return jsonResponse(
						{ ok: false, error: "repriced_confirmation_prepare_failed" },
						503,
					);
				}
				if (prepared.status === "awaiting_confirmation") {
					if (!prepared.outboxId) {
						return jsonResponse(
							{ ok: false, error: "repriced_confirmation_outbox_missing" },
							503,
						);
					}
					const { data: delivery, error: deliveryError } =
						await supabaseAdmin.functions.invoke(
							"whatsapp-order-confirmation-sender-v1",
							{ body: { outboxId: prepared.outboxId } },
						);
					if (deliveryError || !isRecord(delivery) || delivery.ok !== true) {
						return jsonResponse(
							{ ok: false, error: "repriced_confirmation_dispatch_failed" },
							503,
						);
					}
					const deliveryStatus = readText(delivery.status, 40);
					return jsonResponse({
						ok: true,
						intent_id: intentId,
						status:
							deliveryStatus === "needs_review" ||
							deliveryStatus === "delivery_unknown" ||
							deliveryStatus === "failed" ||
							deliveryStatus === "sent_needs_review"
								? "needs_review"
								: "reprice_required",
						outbox_id: prepared.outboxId,
						quote_revision:
							typeof data.quote_revision === "number" &&
							Number.isSafeInteger(data.quote_revision)
								? data.quote_revision
								: null,
						delivery_status: deliveryStatus,
						duplicate: data.duplicate === true,
					});
				}
				return jsonResponse({
					ok: true,
					intent_id: intentId,
					status:
						prepared.status === "awaiting_confirmation"
							? "reprice_required"
							: prepared.status,
					outbox_id: prepared.outboxId,
					quote_revision:
						typeof data.quote_revision === "number" &&
						Number.isSafeInteger(data.quote_revision)
							? data.quote_revision
							: null,
					duplicate: data.duplicate === true,
				});
			}

			if (
				!status ||
				!["converted", "already_converted", "needs_review", "ignored"].includes(
					status,
				)
			) {
				return jsonResponse(
					{ ok: false, error: "order_confirmation_result_invalid" },
					503,
				);
			}
			return jsonResponse({
				ok: true,
				intent_id: intentId,
				status,
				order_id: isUuid(data.order_id) ? data.order_id.toLowerCase() : null,
				issue_code: readText(data.issue_code, 80),
				duplicate: data.duplicate === true,
			});
		},
	),
};
