import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.118.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const GRAPH_ORIGIN = "https://graph.facebook.com";
const REQUEST_TIMEOUT_MS = 5_000;
const BODY_LIMIT_BYTES = 8_000;
const GRAPH_BODY_LIMIT_BYTES = 256_000;
const MAX_PAGES = 3;
const PAGE_SIZE = 100;
const ALLOWED_ROLES = new Set(["owner", "admin", "catalog_manager"]);
const CHANNEL_BY_ACCOUNT_SLUG = new Map([
	["dona-antonia-0975", "0975"],
	["dona-antonia-1018", "1018"],
]);
const ALLOWED_ORIGINS = new Set([
	"https://donaantonia.com.br",
	"https://www.donaantonia.com.br",
	"http://localhost:3000",
	"http://127.0.0.1:3000",
]);

type JsonRecord = Record<string, unknown>;
type ReadinessStatus =
	| "connected"
	| "not_configured"
	| "account_inactive"
	| "provider_rejected"
	| "provider_unavailable"
	| "provider_invalid_response"
	| "phone_not_in_waba"
	| "phone_mapping_mismatch"
	| "check_incomplete";
type Readiness = {
	status: ReadinessStatus;
	verified_name: string | null;
	quality_rating: "GREEN" | "YELLOW" | "RED" | "UNKNOWN" | null;
	checked_at: string | null;
};
type AuthResult =
	| { ok: true; client: ReturnType<typeof createServiceClient> }
	| { ok: false; status: number; error: string };

function isRecord(value: unknown): value is JsonRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readText(value: unknown, maximum: number): string | null {
	if (typeof value !== "string") return null;
	const normalized = value.trim();
	if (
		normalized.length === 0 ||
		normalized.length > maximum ||
		Array.from(normalized).some((character) => {
			const code = character.codePointAt(0) ?? 0;
			return code <= 31 || code === 127;
		})
	) {
		return null;
	}
	return normalized;
}

function isUuid(value: unknown): value is string {
	return (
		typeof value === "string" &&
		/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
			value,
		)
	);
}

function serviceKey(): string {
	const rawKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
	if (rawKeys) {
		try {
			const keys = JSON.parse(rawKeys) as JsonRecord;
			if (typeof keys.default === "string" && keys.default) return keys.default;
		} catch {
			// Use the legacy environment variable when the key set is not JSON.
		}
	}
	return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

function createServiceClient() {
	const key = serviceKey();
	if (!SUPABASE_URL || !key) throw new Error("service_not_configured");
	return createClient(SUPABASE_URL, key, {
		auth: { persistSession: false, autoRefreshToken: false },
	});
}

function corsHeaders(request: Request): HeadersInit {
	const origin = request.headers.get("origin") ?? "";
	const allowedOrigin = ALLOWED_ORIGINS.has(origin)
		? origin
		: "https://www.donaantonia.com.br";
	return {
		"Access-Control-Allow-Origin": allowedOrigin,
		"Access-Control-Allow-Headers": "authorization, apikey, content-type",
		"Access-Control-Allow-Methods": "POST, OPTIONS",
		"Cache-Control": "no-store",
		Vary: "Origin",
	};
}

function json(request: Request, value: JsonRecord, status = 200): Response {
	return new Response(JSON.stringify(value), {
		status,
		headers: {
			...corsHeaders(request),
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
	const decoder = new TextDecoder("utf-8", { fatal: true });
	let total = 0;
	let text = "";
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			total += value.byteLength;
			if (total > BODY_LIMIT_BYTES) {
				await reader.cancel();
				return null;
			}
			text += decoder.decode(value, { stream: true });
		}
		return text + decoder.decode();
	} catch {
		return null;
	} finally {
		reader.releaseLock();
	}
}

async function readJsonBody(response: Response): Promise<unknown | null> {
	const declaredLength = Number(response.headers.get("Content-Length"));
	if (
		Number.isFinite(declaredLength) &&
		declaredLength > GRAPH_BODY_LIMIT_BYTES
	) {
		return null;
	}
	if (!response.body) return null;

	const reader = response.body.getReader();
	const decoder = new TextDecoder("utf-8", { fatal: true });
	let total = 0;
	let text = "";
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			total += value.byteLength;
			if (total > GRAPH_BODY_LIMIT_BYTES) {
				await reader.cancel();
				return null;
			}
			text += decoder.decode(value, { stream: true });
		}
		text += decoder.decode();
		return JSON.parse(text) as unknown;
	} catch {
		return null;
	} finally {
		reader.releaseLock();
	}
}

async function authorize(request: Request): Promise<AuthResult> {
	const authorization = request.headers.get("Authorization") ?? "";
	const match = /^Bearer\s+([^\s]+)$/iu.exec(authorization);
	if (!match) return { ok: false, status: 401, error: "admin_auth_required" };

	const client = createServiceClient();
	const { data, error } = await client.auth.getUser(match[1]);
	const userId = data.user?.id;
	if (error || !userId) {
		return { ok: false, status: 401, error: "admin_session_invalid" };
	}

	const membership = await client
		.from("admin_users")
		.select("role,is_active")
		.eq("user_id", userId)
		.abortSignal(AbortSignal.timeout(REQUEST_TIMEOUT_MS))
		.maybeSingle();
	if (membership.error) {
		return { ok: false, status: 503, error: "admin_lookup_failed" };
	}
	const role =
		typeof membership.data?.role === "string" ? membership.data.role : "";
	if (membership.data?.is_active !== true || !ALLOWED_ROLES.has(role)) {
		return { ok: false, status: 403, error: "admin_not_authorized" };
	}
	return { ok: true, client };
}

function normalizePhone(value: string): string {
	return value.replace(/\D/gu, "");
}

function qualityRating(value: unknown): Readiness["quality_rating"] {
	return value === "GREEN" || value === "YELLOW" || value === "RED"
		? value
		: value === "UNKNOWN"
			? "UNKNOWN"
			: null;
}

function graphUrl(
	version: string,
	wabaId: string,
	appSecretProof: string,
	after: string | null,
): URL {
	const url = new URL(`/${version}/${wabaId}/phone_numbers`, GRAPH_ORIGIN);
	url.searchParams.set("fields", "id,display_phone_number");
	url.searchParams.set("limit", String(PAGE_SIZE));
	url.searchParams.set("appsecret_proof", appSecretProof);
	if (after) url.searchParams.set("after", after);
	return url;
}

async function graphGet(
	url: URL,
	accessToken: string,
): Promise<
	| { ok: true; payload: JsonRecord }
	| {
			ok: false;
			status:
				| "provider_rejected"
				| "provider_unavailable"
				| "provider_invalid_response";
	  }
> {
	let response: Response;
	try {
		response = await fetch(url, {
			method: "GET",
			headers: {
				Authorization: `Bearer ${accessToken}`,
				Accept: "application/json",
			},
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		});
	} catch {
		return { ok: false, status: "provider_unavailable" };
	}

	const payloadValue = await readJsonBody(response);
	if (!isRecord(payloadValue)) {
		return { ok: false, status: "provider_invalid_response" };
	}
	if (!response.ok) {
		return {
			ok: false,
			status:
				response.status === 429 || response.status >= 500
					? "provider_unavailable"
					: "provider_rejected",
		};
	}
	return { ok: true, payload: payloadValue };
}

function readiness(
	status: ReadinessStatus,
	checkedAt: string | null,
	verifiedName: string | null = null,
	quality: Readiness["quality_rating"] = null,
): Readiness {
	return {
		status,
		checked_at: checkedAt,
		verified_name: verifiedName,
		quality_rating: quality,
	};
}

function readinessResponse(request: Request, result: Readiness): Response {
	return json(request, { ok: true, readiness: result });
}

async function checkAccount(
	request: Request,
	client: ReturnType<typeof createServiceClient>,
	accountId: string,
): Promise<Response> {
	const accountResult = await client
		.from("whatsapp_accounts")
		.select("slug,phone_e164,phone_number_id,waba_id,is_active")
		.eq("id", accountId)
		.abortSignal(AbortSignal.timeout(REQUEST_TIMEOUT_MS))
		.maybeSingle();
	if (accountResult.error) {
		return json(request, { ok: false, error: "account_lookup_failed" }, 503);
	}
	const account = accountResult.data;
	if (!account)
		return json(request, { ok: false, error: "account_not_found" }, 404);

	if (account.is_active !== true) {
		return readinessResponse(request, readiness("account_inactive", null));
	}
	const channel = CHANNEL_BY_ACCOUNT_SLUG.get(account.slug);
	const phoneNumberId = readText(account.phone_number_id, 256);
	const wabaId = readText(account.waba_id, 256);
	const phoneE164 = readText(account.phone_e164, 40);
	const graphVersion = readText(Deno.env.get("META_GRAPH_API_VERSION"), 32);
	const accessToken = readText(
		channel ? Deno.env.get(`META_ACCESS_TOKEN_${channel}`) : null,
		8_192,
	);
	const appSecret = readText(
		channel ? Deno.env.get(`META_WHATSAPP_APP_SECRET_${channel}`) : null,
		4_096,
	);
	if (
		!channel ||
		!phoneNumberId ||
		!/^\d{1,256}$/u.test(phoneNumberId) ||
		!wabaId ||
		!/^\d{1,256}$/u.test(wabaId) ||
		!phoneE164 ||
		!/^\+[1-9]\d{7,14}$/u.test(phoneE164) ||
		!graphVersion ||
		!/^v\d+\.\d+$/u.test(graphVersion) ||
		!accessToken ||
		!appSecret
	) {
		return readinessResponse(request, readiness("not_configured", null));
	}

	const appSecretProof = await createAppSecretProof(accessToken, appSecret);
	const seenCursors = new Set<string>();
	let after: string | null = null;
	for (let page = 0; page < MAX_PAGES; page += 1) {
		const result = await graphGet(
			graphUrl(graphVersion, wabaId, appSecretProof, after),
			accessToken,
		);
		if (!result.ok) {
			return readinessResponse(
				request,
				readiness(result.status, new Date().toISOString()),
			);
		}
		if (
			!Array.isArray(result.payload.data) ||
			result.payload.data.length > PAGE_SIZE
		) {
			return readinessResponse(
				request,
				readiness("provider_invalid_response", new Date().toISOString()),
			);
		}

		for (const candidate of result.payload.data) {
			if (!isRecord(candidate)) {
				return readinessResponse(
					request,
					readiness("provider_invalid_response", new Date().toISOString()),
				);
			}
			const candidateId = readText(candidate.id, 256);
			if (!candidateId || !/^\d{1,256}$/u.test(candidateId)) {
				return readinessResponse(
					request,
					readiness("provider_invalid_response", new Date().toISOString()),
				);
			}
			if (candidateId !== phoneNumberId) continue;

			const providerPhone = readText(candidate.display_phone_number, 40);
			if (
				!providerPhone ||
				normalizePhone(providerPhone) !== normalizePhone(phoneE164)
			) {
				return readinessResponse(
					request,
					readiness("phone_mapping_mismatch", new Date().toISOString()),
				);
			}

			const detailsUrl = new URL(
				`/${graphVersion}/${phoneNumberId}`,
				GRAPH_ORIGIN,
			);
			detailsUrl.searchParams.set("fields", "id,verified_name,quality_rating");
			detailsUrl.searchParams.set("appsecret_proof", appSecretProof);
			const details = await graphGet(detailsUrl, accessToken);
			let verifiedName: string | null = null;
			let quality: Readiness["quality_rating"] = null;
			if (details.ok && details.payload.id === phoneNumberId) {
				verifiedName = readText(details.payload.verified_name, 120);
				quality = qualityRating(details.payload.quality_rating);
			}
			return readinessResponse(
				request,
				readiness("connected", new Date().toISOString(), verifiedName, quality),
			);
		}

		const paging = isRecord(result.payload.paging)
			? result.payload.paging
			: null;
		if (typeof paging?.next !== "string") {
			return readinessResponse(
				request,
				readiness("phone_not_in_waba", new Date().toISOString()),
			);
		}
		const cursors = isRecord(paging.cursors) ? paging.cursors : null;
		const next = readText(cursors?.after, 2_048);
		if (!next || seenCursors.has(next)) {
			return readinessResponse(
				request,
				readiness("check_incomplete", new Date().toISOString()),
			);
		}
		seenCursors.add(next);
		after = next;
	}
	return readinessResponse(
		request,
		readiness("check_incomplete", new Date().toISOString()),
	);
}

async function handlePost(request: Request): Promise<Response> {
	const bodyText = await readBodyLimited(request);
	if (!bodyText)
		return json(request, { ok: false, error: "invalid_input" }, 400);
	let body: unknown;
	try {
		body = JSON.parse(bodyText) as unknown;
	} catch {
		return json(request, { ok: false, error: "invalid_input" }, 400);
	}
	if (!isRecord(body) || !isUuid(body.whatsapp_account_id)) {
		return json(request, { ok: false, error: "invalid_input" }, 400);
	}
	const auth = await authorize(request);
	if (!auth.ok) {
		return json(request, { ok: false, error: auth.error }, auth.status);
	}
	return await checkAccount(request, auth.client, body.whatsapp_account_id);
}

async function createAppSecretProof(
	accessToken: string,
	appSecret: string,
): Promise<string> {
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
		new TextEncoder().encode(accessToken),
	);
	return Array.from(new Uint8Array(signature), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
}

Deno.serve(async (request: Request) => {
	const origin = request.headers.get("origin") ?? "";
	if (origin && !ALLOWED_ORIGINS.has(origin)) {
		return json(request, { ok: false, error: "origin_not_allowed" }, 403);
	}
	if (request.method === "OPTIONS") {
		return new Response(null, { status: 204, headers: corsHeaders(request) });
	}
	if (request.method !== "POST") {
		return json(request, { ok: false, error: "method_not_allowed" }, 405);
	}

	try {
		return await handlePost(request);
	} catch {
		return json(request, { ok: false, error: "service_unavailable" }, 503);
	}
});
