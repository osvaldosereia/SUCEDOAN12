import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "npm:@supabase/server@1.9.2";

const BODY_LIMIT_BYTES = 2_000;
const RPC_TIMEOUT_MS = 8_000;
const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PUBLIC_STATUSES = new Set([
	"awaiting_confirmation",
	"sent",
	"sending",
	"failed",
	"delivery_unknown",
	"needs_review",
	"reprice_required",
]);

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

function safeIssueCode(value: unknown): string | null {
	return typeof value === "string" && /^[a-z0-9_]{1,80}$/.test(value)
		? value
		: null;
}

function publicStatus(value: unknown): string | null {
	if (typeof value !== "string") return null;
	if (value === "claimed") return "sending";
	if (value === "sent_needs_review") return "needs_review";
	return PUBLIC_STATUSES.has(value) ? value : null;
}

export default {
	fetch: withSupabase(
		{ auth: "user" },
		async (request, { supabase, supabaseAdmin }) => {
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
			if (
				!isRecord(parsed) ||
				Object.keys(parsed).length !== 1 ||
				typeof parsed.intentId !== "string" ||
				!UUID_PATTERN.test(parsed.intentId)
			) {
				return jsonResponse({ ok: false, error: "intent_id_invalid" }, 422);
			}
			const intentId = parsed.intentId.toLowerCase();
			const { data, error } = await supabase
				.rpc("whatsapp_order_intent_catalog_confirmation_prepare_admin_v1", {
					p_intent_id: intentId,
				})
				.abortSignal(AbortSignal.timeout(RPC_TIMEOUT_MS));
			if (error || !isRecord(data) || data.ok !== true) {
				return jsonResponse(
					{
						ok: false,
						error:
							isRecord(data) && data.error === "admin_not_authorized"
								? "not_authorized"
								: (safeIssueCode(isRecord(data) ? data.error : null) ??
									"preparation_unavailable"),
					},
					error ? 503 : 200,
				);
			}

			const outboxId =
				typeof data.outbox_id === "string" && UUID_PATTERN.test(data.outbox_id)
					? data.outbox_id.toLowerCase()
					: null;
			const status = publicStatus(data.status);
			if (data.intent_id !== intentId || !status) {
				return jsonResponse(
					{ ok: false, error: "preparation_response_invalid" },
					503,
				);
			}
			if (status === "awaiting_confirmation" && !outboxId) {
				return jsonResponse(
					{ ok: false, error: "catalog_confirmation_outbox_missing" },
					503,
				);
			}
			if (status !== "awaiting_confirmation") {
				return jsonResponse({
					ok: true,
					intent_id: intentId,
					status,
					issue_code: safeIssueCode(data.issue_code),
				});
			}

			const { data: delivery, error: deliveryError } =
				await supabaseAdmin.functions.invoke(
					"whatsapp-order-confirmation-sender-v1",
					{ body: { outboxId } },
				);
			if (deliveryError || !isRecord(delivery) || delivery.ok !== true) {
				return jsonResponse(
					{ ok: false, error: "catalog_confirmation_dispatch_unavailable" },
					503,
				);
			}
			const deliveryStatus = publicStatus(delivery.status);
			if (!deliveryStatus) {
				return jsonResponse(
					{
						ok: false,
						error: "catalog_confirmation_dispatch_response_invalid",
					},
					503,
				);
			}
			return jsonResponse({
				ok: true,
				intent_id: intentId,
				outbox_id: outboxId,
				status: deliveryStatus,
				issue_code: safeIssueCode(delivery.issue_code),
			});
		},
	),
};
