import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "npm:@supabase/server@1.9.2";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";

const BODY_LIMIT_BYTES = 2_000;
const RPC_TIMEOUT_MS = 8_000;
const META_TIMEOUT_MS = 15_000;
const PAYLOAD_LIMIT_BYTES = 16_000;

type JsonRecord = Record<string, unknown>;
type Outcome = "sent" | "failed" | "delivery_unknown";

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

function jsonResponse(body: JsonRecord, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			"Cache-Control": "no-store",
			"Content-Type": "application/json; charset=utf-8",
		},
	});
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

function readText(value: unknown, maxLength: number): string | null {
	if (typeof value !== "string") return null;
	const normalized = value.trim();
	return normalized.length > 0 && normalized.length <= maxLength
		? normalized
		: null;
}

function validPayload(value: unknown): value is JsonRecord {
	if (!isRecord(value) || value.type !== "interactive") return false;
	const interactive = value.interactive;
	if (!isRecord(interactive) || interactive.type !== "button") return false;
	const body = interactive.body;
	const action = interactive.action;
	if (!isRecord(body) || !readText(body.text, 900) || !isRecord(action)) {
		return false;
	}
	if (!Array.isArray(action.buttons) || action.buttons.length !== 1)
		return false;
	const button = action.buttons[0];
	if (!isRecord(button) || button.type !== "reply" || !isRecord(button.reply)) {
		return false;
	}
	const id = readText(button.reply.id, 256);
	return (
		readText(button.reply.title, 20) === "Confirmar pedido" &&
		id !== null &&
		/^order-confirm-v1:[0-9a-f-]{36}:[A-Za-z0-9_-]{43}$/i.test(id)
	);
}

function metaChannelToken(channel: string): string | null {
	if (channel !== "0975" && channel !== "1018") return null;
	return (
		Deno.env.get(`META_ACCESS_TOKEN_${channel}`)?.trim() ||
		Deno.env.get("META_WHATSAPP_ACCESS_TOKEN")?.trim() ||
		null
	);
}

function metaGraphVersion(): string | null {
	const value =
		Deno.env.get("META_GRAPH_API_VERSION")?.trim() ||
		Deno.env.get("META_WHATSAPP_GRAPH_VERSION")?.trim() ||
		null;
	return value && /^v[0-9]{1,3}\.[0-9]{1,2}$/.test(value) ? value : null;
}

async function finish(
	supabaseAdmin: SupabaseClient,
	outboxId: string,
	outcome: Outcome,
	providerMessageId: string | null,
	errorCode: string | null,
): Promise<JsonRecord | null> {
	const { data, error } = await supabaseAdmin
		.rpc("whatsapp_order_confirmation_finish_v1", {
			p_outbox_id: outboxId,
			p_outcome: outcome,
			p_provider_message_id: providerMessageId,
			p_error_code: errorCode,
		})
		.abortSignal(AbortSignal.timeout(RPC_TIMEOUT_MS));
	return !error && isRecord(data) && data.ok === true ? data : null;
}

async function recordFailure(
	supabaseAdmin: SupabaseClient,
	outboxId: string,
	outcome: Outcome,
	errorCode: string,
): Promise<Response> {
	const result = await finish(
		supabaseAdmin,
		outboxId,
		outcome,
		null,
		errorCode,
	);
	if (!result)
		return jsonResponse({ ok: false, error: "delivery_receipt_pending" }, 503);
	return jsonResponse({
		ok: true,
		outbox_id: outboxId,
		status: readText(result.status, 40) ?? outcome,
		issue_code: errorCode,
	});
}

async function dispatch(
	supabaseAdmin: SupabaseClient,
	outboxId: string,
): Promise<Response> {
	const { data, error } = await supabaseAdmin
		.rpc("whatsapp_order_confirmation_claim_v1", { p_outbox_id: outboxId })
		.abortSignal(AbortSignal.timeout(RPC_TIMEOUT_MS));
	if (error || !isRecord(data) || data.ok !== true) {
		return jsonResponse({ ok: false, error: "confirmation_claim_failed" }, 503);
	}
	const claimStatus = readText(data.status, 40);
	if (claimStatus === "sent") {
		return jsonResponse({
			ok: true,
			outbox_id: outboxId,
			status: "sent",
			duplicate: true,
		});
	}
	if (claimStatus === "needs_review" || claimStatus === "delivery_unknown") {
		return jsonResponse({
			ok: true,
			outbox_id: outboxId,
			status: claimStatus,
			issue_code: readText(data.issue_code, 80),
		});
	}
	if (claimStatus !== "claimed" || !Object.hasOwn(data, "payload")) {
		return jsonResponse(
			{
				ok: true,
				outbox_id: outboxId,
				status: claimStatus ?? "not_claimed",
				duplicate: true,
			},
			claimStatus === "claimed" ? 202 : 200,
		);
	}

	const channel = readText(data.channel, 4);
	const phoneNumberId = readText(data.phone_number_id, 32);
	const toPhoneE164 = readText(data.to_phone_e164, 16);
	const payload = data.payload;
	if (
		!channel ||
		!phoneNumberId ||
		!/^[0-9]{6,32}$/.test(phoneNumberId) ||
		!toPhoneE164 ||
		!/^\+[1-9][0-9]{7,14}$/.test(toPhoneE164) ||
		!validPayload(payload) ||
		new TextEncoder().encode(JSON.stringify(payload)).byteLength >
			PAYLOAD_LIMIT_BYTES
	) {
		return recordFailure(
			supabaseAdmin,
			outboxId,
			"failed",
			"sender_payload_invalid",
		);
	}
	const accessToken = metaChannelToken(channel);
	const graphVersion = metaGraphVersion();
	if (!accessToken || !graphVersion) {
		return recordFailure(
			supabaseAdmin,
			outboxId,
			"failed",
			"sender_config_missing",
		);
	}

	let response: Response;
	try {
		response = await fetch(
			`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`,
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${accessToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					messaging_product: "whatsapp",
					recipient_type: "individual",
					to: toPhoneE164.replace(/\D/g, ""),
					...payload,
				}),
				signal: AbortSignal.timeout(META_TIMEOUT_MS),
			},
		);
	} catch {
		return recordFailure(
			supabaseAdmin,
			outboxId,
			"delivery_unknown",
			"delivery_unknown",
		);
	}

	let providerMessageId: string | null = null;
	if (response.ok) {
		try {
			const result: unknown = await response.json();
			if (
				isRecord(result) &&
				Array.isArray(result.messages) &&
				isRecord(result.messages[0])
			) {
				providerMessageId = readText(result.messages[0].id, 256);
			}
		} catch {
			providerMessageId = null;
		}
		if (
			!providerMessageId ||
			!/^wamid\.[A-Za-z0-9_=-]{10,240}$/.test(providerMessageId)
		) {
			return recordFailure(
				supabaseAdmin,
				outboxId,
				"delivery_unknown",
				"delivery_unknown",
			);
		}
	} else {
		const outcome =
			response.status === 408 || response.status >= 500
				? "delivery_unknown"
				: "failed";
		return recordFailure(
			supabaseAdmin,
			outboxId,
			outcome,
			`meta_http_${response.status}`,
		);
	}

	const receipt = await finish(
		supabaseAdmin,
		outboxId,
		"sent",
		providerMessageId,
		null,
	);
	if (!receipt)
		return jsonResponse({ ok: false, error: "delivery_receipt_pending" }, 503);
	return jsonResponse({
		ok: true,
		outbox_id: outboxId,
		status: readText(receipt.status, 40) ?? "sent",
		provider_message_id: providerMessageId,
	});
}

export default {
	fetch: withSupabase(
		{ auth: "secret" },
		async (request, { supabaseAdmin }) => {
			if (request.method !== "POST") {
				return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
			}
			const rawBody = await readBodyLimited(request);
			if (rawBody === null) {
				return jsonResponse({ ok: false, error: "body_too_large" }, 413);
			}
			let parsed: unknown;
			try {
				parsed = JSON.parse(rawBody) as unknown;
			} catch {
				return jsonResponse({ ok: false, error: "invalid_request" }, 400);
			}
			const outboxId =
				isRecord(parsed) && isUuid(parsed.outboxId)
					? parsed.outboxId.toLowerCase()
					: null;
			if (!outboxId) {
				return jsonResponse({ ok: false, error: "outbox_id_invalid" }, 422);
			}
			return dispatch(supabaseAdmin, outboxId);
		},
	),
};
