import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "npm:@supabase/server@1.9.2";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";

const BODY_LIMIT_BYTES = 16_000;
const RPC_TIMEOUT_MS = 8_000;
const META_TIMEOUT_MS = 15_000;
const PAYLOAD_LIMIT_BYTES = 12_000;
const STAFF_ROLES = new Set(["owner", "admin", "operator"]);
const SAFE_ERRORS = new Set([
	"admin_not_authorized",
	"conversation_required",
	"conversation_channel_unavailable",
	"conversation_phone_invalid",
	"destination_mismatch",
	"service_window_closed",
	"human_send_not_homologated",
	"meta_canary_destination_blocked",
	"meta_send_uncertain",
	"rate_limited",
	"idempotency_conflict",
	"outbox_not_queued",
	"outbox_claim_race",
	"interactive_invalid",
	"interactive_too_large",
	"interactive_body_invalid",
	"interactive_buttons_invalid",
	"interactive_list_invalid",
	"interactive_header_invalid",
	"interactive_footer_invalid",
	"interactive_type_unsupported",
	"meta_transport_not_configured",
	"not_authenticated",
	"not_authorized",
	"invalid_request",
	"unavailable",
]);

type JsonRecord = Record<string, unknown>;
type InteractiveRequest = {
	conversationId: string;
	idempotencyKey: string;
	kind: "button" | "list";
	body: string;
	header?: string;
	footer?: string;
	buttonTitles?: string[];
	listButton?: string;
	options?: Array<{ title: string; description?: string }>;
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

function response(body: JsonRecord, status = 200): Response {
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

function text(value: unknown, maxLength: number): string | null {
	if (typeof value !== "string") return null;
	const normalized = value.trim();
	return normalized.length > 0 && normalized.length <= maxLength
		? normalized
		: null;
}

function keysAre(value: JsonRecord, allowed: string[]): boolean {
	return Object.keys(value).every((key) => allowed.includes(key));
}

function normalizeRequest(value: unknown): InteractiveRequest | null {
	if (
		!isRecord(value) ||
		!keysAre(value, [
			"conversationId",
			"idempotencyKey",
			"kind",
			"body",
			"header",
			"footer",
			"buttonTitles",
			"listButton",
			"options",
		]) ||
		!isUuid(value.conversationId) ||
		!isUuid(value.idempotencyKey) ||
		(value.kind !== "button" && value.kind !== "list")
	) {
		return null;
	}
	const body = text(value.body, 1024);
	const header =
		value.header === undefined ? undefined : text(value.header, 60);
	const footer =
		value.footer === undefined ? undefined : text(value.footer, 60);
	if (
		!body ||
		(value.header !== undefined && !header) ||
		(value.footer !== undefined && !footer)
	) {
		return null;
	}

	if (value.kind === "button") {
		if (
			!Array.isArray(value.buttonTitles) ||
			value.buttonTitles.length < 1 ||
			value.buttonTitles.length > 3 ||
			value.options !== undefined ||
			value.listButton !== undefined
		) {
			return null;
		}
		const buttonTitles = value.buttonTitles.map((item) => text(item, 20));
		if (buttonTitles.some((item) => item === null)) return null;
		if (new Set(buttonTitles).size !== buttonTitles.length) return null;
		return {
			conversationId: value.conversationId,
			idempotencyKey: value.idempotencyKey,
			kind: "button",
			body,
			...(header ? { header } : {}),
			...(footer ? { footer } : {}),
			buttonTitles: buttonTitles as string[],
		};
	}

	if (
		!Array.isArray(value.options) ||
		value.options.length < 1 ||
		value.options.length > 10 ||
		!text(value.listButton, 20) ||
		value.buttonTitles !== undefined
	) {
		return null;
	}
	const options = value.options.map((item) => {
		if (!isRecord(item) || !keysAre(item, ["title", "description"]))
			return null;
		const title = text(item.title, 24);
		const description =
			item.description === undefined ? undefined : text(item.description, 72);
		if (!title || (item.description !== undefined && !description)) return null;
		return { title, ...(description ? { description } : {}) };
	});
	if (options.some((item) => item === null)) return null;
	const titles = options.map((item) => item?.title.toLocaleLowerCase("pt-BR"));
	if (new Set(titles).size !== titles.length) return null;
	return {
		conversationId: value.conversationId,
		idempotencyKey: value.idempotencyKey,
		kind: "list",
		body,
		...(header ? { header } : {}),
		...(footer ? { footer } : {}),
		listButton: text(value.listButton, 20) ?? undefined,
		options: options as Array<{ title: string; description?: string }>,
	};
}

function toMetaPayload(input: InteractiveRequest): JsonRecord {
	const interactive: JsonRecord = {
		type: input.kind,
		body: { text: input.body },
	};
	if (input.header) interactive.header = { type: "text", text: input.header };
	if (input.footer) interactive.footer = { text: input.footer };
	if (input.kind === "button") {
		interactive.action = {
			buttons: input.buttonTitles?.map((title, index) => ({
				type: "reply",
				reply: {
					id: `attn:${input.idempotencyKey}:${index + 1}`,
					title,
				},
			})),
		};
	} else {
		interactive.action = {
			button: input.listButton,
			sections: [
				{
					title: "Opções",
					rows: input.options?.map((option, index) => ({
						id: `attn:${input.idempotencyKey}:${index + 1}`,
						title: option.title,
						...(option.description ? { description: option.description } : {}),
					})),
				},
			],
		};
	}
	return { type: "interactive", interactive };
}

function channelKey(slug: unknown): string | null {
	if (slug === "dona-antonia-0975") return "0975";
	if (slug === "dona-antonia-1018") return "1018";
	return null;
}

function channelToken(channel: string): string | null {
	const shared = Deno.env.get("META_WHATSAPP_ACCESS_TOKEN")?.trim();
	const scoped = Deno.env.get(`META_ACCESS_TOKEN_${channel}`)?.trim();
	return scoped || shared || null;
}

function graphVersion(): string | null {
	const version =
		Deno.env.get("META_GRAPH_API_VERSION")?.trim() ||
		Deno.env.get("META_WHATSAPP_GRAPH_VERSION")?.trim() ||
		null;
	return version && /^v[0-9]{1,3}\.[0-9]{1,2}$/.test(version) ? version : null;
}

function rpcError(value: unknown): string {
	return typeof value === "string" && SAFE_ERRORS.has(value)
		? value
		: "unavailable";
}

async function recordDispatchFailure(
	supabaseAdmin: SupabaseClient,
	outboxId: string,
	uncertain: boolean,
	errorCode: string,
): Promise<void> {
	await supabaseAdmin
		.from("whatsapp_outbox_v1")
		.update({
			...(uncertain ? {} : { status: "failed" }),
			last_error: uncertain ? `meta_send_uncertain:${errorCode}` : errorCode,
			updated_at: new Date().toISOString(),
		})
		.eq("id", outboxId)
		.eq("status", "claimed");
}

async function dispatch(
	supabaseAdmin: SupabaseClient,
	input: InteractiveRequest,
	adminUserId: string,
): Promise<Response> {
	const payload = toMetaPayload(input);
	if (
		new TextEncoder().encode(JSON.stringify(payload)).byteLength >
		PAYLOAD_LIMIT_BYTES
	) {
		return response({ ok: false, error: "interactive_too_large" }, 422);
	}

	const enqueue = await supabaseAdmin
		.rpc("ops2_admin_attendance_enqueue_interactive_v1", {
			p_conversation_id: input.conversationId,
			p_interactive: payload.interactive,
			p_idempotency_key: input.idempotencyKey,
			p_admin_user_id: adminUserId,
		})
		.abortSignal(AbortSignal.timeout(RPC_TIMEOUT_MS));
	if (enqueue.error || !isRecord(enqueue.data) || enqueue.data.ok !== true) {
		const error = rpcError(isRecord(enqueue.data) ? enqueue.data.error : null);
		return response(
			{ ok: false, error },
			error === "service_window_closed" ? 409 : 422,
		);
	}
	const outboxId = isUuid(enqueue.data.outbox_id)
		? enqueue.data.outbox_id
		: null;
	if (!outboxId) return response({ ok: false, error: "unavailable" }, 503);
	if (enqueue.data.status === "sent") {
		return response({
			ok: true,
			outbox_id: outboxId,
			status: "sent",
			duplicate: true,
		});
	}

	const claim = await supabaseAdmin
		.rpc("ops2_admin_attendance_claim_interactive_outbox_v1", {
			p_outbox_id: outboxId,
		})
		.abortSignal(AbortSignal.timeout(RPC_TIMEOUT_MS));
	if (claim.error || !isRecord(claim.data) || claim.data.ok !== true) {
		const error = rpcError(isRecord(claim.data) ? claim.data.error : null);
		return response({ ok: false, error, outbox_id: outboxId }, 409);
	}
	if (claim.data.already_sent === true) {
		return response({
			ok: true,
			outbox_id: outboxId,
			status: "sent",
			duplicate: true,
		});
	}

	const phoneNumberId = text(claim.data.phone_number_id, 32);
	const toPhone = text(claim.data.to_phone_e164, 16);
	const channel = channelKey(claim.data.account_slug);
	const accessToken = channel ? channelToken(channel) : null;
	const version = graphVersion();
	if (
		!phoneNumberId ||
		!/^[0-9]{5,30}$/.test(phoneNumberId) ||
		!toPhone ||
		!/^[+]?[1-9][0-9]{7,14}$/.test(toPhone) ||
		!accessToken ||
		!version
	) {
		await recordDispatchFailure(
			supabaseAdmin,
			outboxId,
			false,
			"meta_transport_not_configured",
		);
		return response(
			{
				ok: false,
				error: "meta_transport_not_configured",
				outbox_id: outboxId,
			},
			503,
		);
	}

	let graphResponse: Response;
	try {
		graphResponse = await fetch(
			`https://graph.facebook.com/${version}/${phoneNumberId}/messages`,
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${accessToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					messaging_product: "whatsapp",
					recipient_type: "individual",
					to: toPhone.replace(/\D/g, ""),
					...payload,
				}),
				signal: AbortSignal.timeout(META_TIMEOUT_MS),
			},
		);
	} catch {
		await recordDispatchFailure(
			supabaseAdmin,
			outboxId,
			true,
			"delivery_unknown",
		);
		return response(
			{ ok: false, error: "meta_send_uncertain", outbox_id: outboxId },
			202,
		);
	}

	if (!graphResponse.ok) {
		const uncertain =
			graphResponse.status === 408 || graphResponse.status >= 500;
		const errorCode = `meta_http_${graphResponse.status}`;
		await recordDispatchFailure(supabaseAdmin, outboxId, uncertain, errorCode);
		return response(
			{
				ok: false,
				error: uncertain ? "meta_send_uncertain" : "unavailable",
				outbox_id: outboxId,
			},
			uncertain ? 202 : 502,
		);
	}

	let providerMessageId: string | null = null;
	try {
		const result: unknown = await graphResponse.json();
		if (
			isRecord(result) &&
			Array.isArray(result.messages) &&
			isRecord(result.messages[0])
		) {
			providerMessageId = text(result.messages[0].id, 256);
		}
	} catch {
		providerMessageId = null;
	}
	if (
		!providerMessageId ||
		!/^wamid\.[A-Za-z0-9_=-]{10,240}$/.test(providerMessageId)
	) {
		await recordDispatchFailure(
			supabaseAdmin,
			outboxId,
			true,
			"delivery_unknown",
		);
		return response(
			{ ok: false, error: "meta_send_uncertain", outbox_id: outboxId },
			202,
		);
	}

	const acceptedAt = new Date().toISOString();
	const accepted = await supabaseAdmin
		.rpc("ops2_admin_attendance_accept_meta_interactive_v1", {
			p_outbox_id: outboxId,
			p_provider_message_id: providerMessageId,
			p_accepted_at: acceptedAt,
		})
		.abortSignal(AbortSignal.timeout(RPC_TIMEOUT_MS));
	if (accepted.error || !isRecord(accepted.data) || accepted.data.ok !== true) {
		await recordDispatchFailure(
			supabaseAdmin,
			outboxId,
			true,
			"acceptance_receipt_pending",
		);
		return response(
			{ ok: false, error: "meta_send_uncertain", outbox_id: outboxId },
			202,
		);
	}

	return response({ ok: true, outbox_id: outboxId, status: "sent" });
}

export default {
	fetch: withSupabase(
		{ auth: "user" },
		async (request, { supabaseAdmin, userClaims }) => {
			if (request.method !== "POST") {
				return response({ ok: false, error: "invalid_request" }, 405);
			}
			const adminUserId = isUuid(userClaims?.id) ? userClaims.id : null;
			if (!adminUserId)
				return response({ ok: false, error: "not_authenticated" }, 401);

			const admin = await supabaseAdmin
				.from("admin_users")
				.select("user_id,role,is_active")
				.eq("user_id", adminUserId)
				.eq("is_active", true)
				.maybeSingle();
			if (admin.error)
				return response({ ok: false, error: "unavailable" }, 503);
			if (!admin.data || !STAFF_ROLES.has(String(admin.data.role))) {
				return response({ ok: false, error: "not_authorized" }, 403);
			}

			const rawBody = await readBodyLimited(request);
			if (rawBody === null)
				return response({ ok: false, error: "interactive_too_large" }, 413);
			let parsed: unknown;
			try {
				parsed = JSON.parse(rawBody) as unknown;
			} catch {
				return response({ ok: false, error: "invalid_request" }, 400);
			}
			const input = normalizeRequest(parsed);
			if (!input)
				return response({ ok: false, error: "interactive_invalid" }, 422);
			return dispatch(supabaseAdmin, input, adminUserId);
		},
	),
};
