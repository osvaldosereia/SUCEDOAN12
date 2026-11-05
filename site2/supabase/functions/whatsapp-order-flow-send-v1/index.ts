import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "npm:@supabase/server@1.9.2";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";

const BODY_LIMIT_BYTES = 2_000;
const RPC_TIMEOUT_MS = 8_000;
const META_TIMEOUT_MS = 15_000;
const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WAMID_PATTERN = /^wamid\.[A-Za-z0-9_=-]{10,240}$/;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
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

function readText(value: unknown, limit: number): string | null {
	if (typeof value !== "string") return null;
	const normalized = value.trim();
	return normalized && normalized.length <= limit ? normalized : null;
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

function publicStatus(value: unknown): string | null {
	return typeof value === "string" &&
		["preparing", "sending", "sent", "failed", "needs_review"].includes(value)
		? value
		: null;
}

function safeError(value: unknown): string | null {
	return typeof value === "string" && /^[a-z0-9_]{1,80}$/.test(value)
		? value
		: null;
}

function tokenFromEnvironment(accountSlug: string): string | null {
	if (accountSlug !== "0975" && accountSlug !== "1018") return null;
	return Deno.env.get(`META_ACCESS_TOKEN_${accountSlug}`)?.trim() || null;
}

function graphVersionFromEnvironment(): string | null {
	const value =
		Deno.env.get("META_GRAPH_API_VERSION")?.trim() ||
		Deno.env.get("META_WHATSAPP_GRAPH_VERSION")?.trim() ||
		null;
	return value && /^v[0-9]{1,3}\.[0-9]{1,2}$/.test(value) ? value : null;
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

async function finishAttempt(
	supabaseAdmin: SupabaseClient,
	attemptId: string,
	status: "failed" | "needs_review" | "sent",
	errorCode: string | null,
	providerMessageId: string | null = null,
): Promise<JsonRecord | null> {
	const { data, error } = await supabaseAdmin
		.rpc("whatsapp_order_flow_send_finish_v1", {
			p_attempt_id: attemptId,
			p_status: status,
			p_provider_message_id: providerMessageId,
			p_error_code: errorCode,
		})
		.abortSignal(AbortSignal.timeout(RPC_TIMEOUT_MS));
	return !error && isRecord(data) && data.ok === true ? data : null;
}

async function failPreparation(
	supabaseAdmin: SupabaseClient,
	attemptId: string,
	errorCode: string,
): Promise<Response> {
	const receipt = await finishAttempt(
		supabaseAdmin,
		attemptId,
		"failed",
		errorCode,
	);
	return receipt
		? jsonResponse({
				ok: true,
				attempt_id: attemptId,
				status: "failed",
				issue_code: errorCode,
			})
		: jsonResponse({ ok: false, error: "flow_send_receipt_pending" }, 503);
}

async function listAttempts(
	supabase: SupabaseClient,
	conversationId: string,
): Promise<Response> {
	const { data, error } = await supabase
		.rpc("whatsapp_order_flow_send_admin_list_v1", {
			p_conversation_id: conversationId,
		})
		.abortSignal(AbortSignal.timeout(RPC_TIMEOUT_MS));
	if (
		error ||
		!isRecord(data) ||
		data.ok !== true ||
		!Array.isArray(data.items)
	) {
		return jsonResponse(
			{ ok: false, error: "flow_send_status_unavailable" },
			503,
		);
	}
	return jsonResponse({
		ok: true,
		items: data.items,
		ready_for_send: data.ready_for_send === true,
		block_reason: safeError(data.block_reason),
	});
}

async function sendFlow(
	request: Request,
	supabase: SupabaseClient,
	supabaseAdmin: SupabaseClient,
): Promise<Response> {
	const rawBody = await readBodyLimited(request);
	if (rawBody === null)
		return jsonResponse({ ok: false, error: "body_too_large" }, 413);
	let parsed: unknown;
	try {
		parsed = JSON.parse(rawBody) as unknown;
	} catch {
		return jsonResponse({ ok: false, error: "invalid_request" }, 400);
	}
	if (
		!isRecord(parsed) ||
		Object.keys(parsed).length !== 3 ||
		!UUID_PATTERN.test(String(parsed.idempotencyKey ?? "")) ||
		!UUID_PATTERN.test(String(parsed.conversationId ?? "")) ||
		!UUID_PATTERN.test(String(parsed.basketTemplateId ?? ""))
	) {
		return jsonResponse({ ok: false, error: "flow_send_request_invalid" }, 422);
	}
	const idempotencyKey = String(parsed.idempotencyKey).toLowerCase();
	const conversationId = String(parsed.conversationId).toLowerCase();
	const basketTemplateId = String(parsed.basketTemplateId).toLowerCase();
	const { data: prepared, error: prepareError } = await supabase
		.rpc("whatsapp_order_flow_send_prepare_admin_v1", {
			p_idempotency_key: idempotencyKey,
			p_conversation_id: conversationId,
			p_basket_template_id: basketTemplateId,
		})
		.abortSignal(AbortSignal.timeout(RPC_TIMEOUT_MS));
	if (prepareError || !isRecord(prepared) || prepared.ok !== true) {
		return jsonResponse(
			{
				ok: false,
				error:
					safeError(isRecord(prepared) ? prepared.error : null) ??
					"flow_send_prepare_failed",
			},
			prepareError ? 503 : 200,
		);
	}
	const attemptId = readText(prepared.attempt_id, 64);
	const status = publicStatus(prepared.status);
	if (!attemptId || !UUID_PATTERN.test(attemptId) || !status) {
		return jsonResponse(
			{ ok: false, error: "flow_send_prepare_response_invalid" },
			503,
		);
	}
	if (prepared.duplicate === true) {
		return jsonResponse({
			ok: true,
			attempt_id: attemptId,
			status,
			issue_code: safeError(prepared.error_code),
			duplicate: true,
		});
	}

	const { data: session, error: sessionError } =
		await supabaseAdmin.functions.invoke("whatsapp-flow-session-open-v1", {
			body: {
				whatsappAccountId: prepared.whatsapp_account_id,
				metaWabaId: prepared.meta_waba_id,
				metaPhoneNumberId: prepared.meta_phone_number_id,
				metaFlowId: prepared.meta_flow_id,
				flowSchemaVersion: prepared.flow_json_version,
				basketTemplateId,
				basketMoldId: prepared.basket_mold_id,
				senderPhoneE164: prepared.sender_phone_e164,
				conversationId,
				customerId: prepared.customer_id,
			},
		});
	if (
		sessionError ||
		!isRecord(session) ||
		session.ok !== true ||
		!UUID_PATTERN.test(String(session.sessionId ?? ""))
	) {
		return failPreparation(
			supabaseAdmin,
			attemptId,
			"flow_session_open_failed",
		);
	}
	const flowToken = readText(session.flowToken, 128);
	if (!flowToken || !/^[A-Za-z0-9_-]{32,128}$/.test(flowToken)) {
		return failPreparation(
			supabaseAdmin,
			attemptId,
			"flow_session_response_invalid",
		);
	}

	const tokenHash = await sha256Hex(flowToken);
	const { data: sending, error: markError } = await supabaseAdmin
		.rpc("whatsapp_order_flow_send_mark_sending_v1", {
			p_attempt_id: attemptId,
			p_session_id: String(session.sessionId).toLowerCase(),
			p_token_hash: tokenHash,
		})
		.abortSignal(AbortSignal.timeout(RPC_TIMEOUT_MS));
	if (
		markError ||
		!isRecord(sending) ||
		sending.ok !== true ||
		sending.status !== "sending"
	) {
		const issueCode =
			safeError(isRecord(sending) ? sending.error : null) ??
			"flow_send_claim_failed";
		return failPreparation(supabaseAdmin, attemptId, issueCode);
	}

	const accountSlug = readText(sending.account_slug, 8);
	const phoneNumberId = readText(sending.meta_phone_number_id, 32);
	const recipient = readText(sending.to_phone_e164, 16);
	const flowId = readText(sending.meta_flow_id, 32);
	const messageVersion = readText(sending.flow_message_version, 8);
	const cta = readText(sending.flow_cta, 20);
	const bodyText = readText(sending.body_text, 1024);
	const accessToken = accountSlug ? tokenFromEnvironment(accountSlug) : null;
	const graphVersion = graphVersionFromEnvironment();
	if (
		!accountSlug ||
		!phoneNumberId ||
		!/^[0-9]{6,32}$/.test(phoneNumberId) ||
		!recipient ||
		!/^\+[1-9][0-9]{7,14}$/.test(recipient) ||
		!flowId ||
		!/^[0-9]{6,32}$/.test(flowId) ||
		!messageVersion ||
		!cta ||
		!bodyText ||
		!accessToken ||
		!graphVersion
	) {
		return failPreparation(
			supabaseAdmin,
			attemptId,
			"flow_sender_config_invalid",
		);
	}

	const message = {
		messaging_product: "whatsapp",
		recipient_type: "individual",
		to: recipient.replace(/\D/g, ""),
		type: "interactive",
		interactive: {
			type: "flow",
			body: { text: bodyText },
			action: {
				name: "flow",
				parameters: {
					flow_message_version: messageVersion,
					flow_token: flowToken,
					flow_id: flowId,
					flow_cta: cta,
					flow_action: "data_exchange",
				},
			},
		},
	};

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
				body: JSON.stringify(message),
				signal: AbortSignal.timeout(META_TIMEOUT_MS),
			},
		);
	} catch {
		const receipt = await finishAttempt(
			supabaseAdmin,
			attemptId,
			"needs_review",
			"delivery_unknown",
		);
		return receipt
			? jsonResponse({
					ok: true,
					attempt_id: attemptId,
					status: "needs_review",
					issue_code: "delivery_unknown",
				})
			: jsonResponse({ ok: false, error: "flow_send_receipt_pending" }, 503);
	}

	if (!response.ok) {
		const ambiguous = response.status === 408 || response.status >= 500;
		const issueCode = `meta_http_${response.status}`;
		const receipt = await finishAttempt(
			supabaseAdmin,
			attemptId,
			ambiguous ? "needs_review" : "failed",
			ambiguous ? "delivery_unknown" : issueCode,
		);
		return receipt
			? jsonResponse({
					ok: true,
					attempt_id: attemptId,
					status: ambiguous ? "needs_review" : "failed",
					issue_code: ambiguous ? "delivery_unknown" : issueCode,
				})
			: jsonResponse({ ok: false, error: "flow_send_receipt_pending" }, 503);
	}

	let providerMessageId: string | null = null;
	try {
		const payload: unknown = await response.json();
		if (
			isRecord(payload) &&
			Array.isArray(payload.messages) &&
			isRecord(payload.messages[0])
		) {
			providerMessageId = readText(payload.messages[0].id, 256);
		}
	} catch {
		providerMessageId = null;
	}
	if (!providerMessageId || !WAMID_PATTERN.test(providerMessageId)) {
		const receipt = await finishAttempt(
			supabaseAdmin,
			attemptId,
			"needs_review",
			"delivery_unknown",
		);
		return receipt
			? jsonResponse({
					ok: true,
					attempt_id: attemptId,
					status: "needs_review",
					issue_code: "delivery_unknown",
				})
			: jsonResponse({ ok: false, error: "flow_send_receipt_pending" }, 503);
	}

	const receipt = await finishAttempt(
		supabaseAdmin,
		attemptId,
		"sent",
		null,
		providerMessageId,
	);
	if (!receipt)
		return jsonResponse({ ok: false, error: "flow_send_receipt_pending" }, 503);
	return jsonResponse({ ok: true, attempt_id: attemptId, status: "sent" });
}

export default {
	fetch: withSupabase(
		{ auth: "user" },
		async (request, { supabase, supabaseAdmin }) => {
			if (request.method === "GET") {
				const conversationId =
					new URL(request.url).searchParams.get("conversation_id") ?? "";
				if (!UUID_PATTERN.test(conversationId)) {
					return jsonResponse(
						{ ok: false, error: "conversation_id_invalid" },
						422,
					);
				}
				return listAttempts(supabase, conversationId.toLowerCase());
			}
			if (request.method !== "POST") {
				return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
			}
			return sendFlow(request, supabase, supabaseAdmin);
		},
	),
};
