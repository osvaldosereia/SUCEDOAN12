import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { verifyMetaCatalogRetailerIds } from "../_shared/meta-catalog-verification.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const BODY_LIMIT_BYTES = 8_000;
const RPC_TIMEOUT_MS = 8_000;
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
type VerificationCandidate = {
	id: string;
	product_retailer_id: string;
	product_id: string;
	updated_at: string;
};

type AuthResult = { ok: true } | { ok: false; status: number; error: string };

function isRecord(value: unknown): value is JsonRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
	return (
		typeof value === "string" &&
		/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
			value,
		)
	);
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

function serviceKey(): string {
	const rawKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
	if (rawKeys) {
		try {
			const keys = JSON.parse(rawKeys) as JsonRecord;
			if (typeof keys.default === "string" && keys.default) return keys.default;
		} catch {
			// Continue to the legacy environment variable.
		}
	}
	return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

function serviceClient() {
	const key = serviceKey();
	if (!SUPABASE_URL || !key) throw new Error("service_not_configured");
	return createClient(SUPABASE_URL, key, {
		auth: { persistSession: false, autoRefreshToken: false },
	});
}

function corsHeaders(request: Request): HeadersInit {
	const origin = request.headers.get("origin") ?? "";
	if (!ALLOWED_ORIGINS.has(origin)) {
		return { "Cache-Control": "no-store", Vary: "Origin" };
	}
	return {
		"Access-Control-Allow-Origin": origin,
		"Access-Control-Allow-Headers":
			"authorization, x-client-info, apikey, content-type, x-retry-count, traceparent, tracestate, baggage",
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

async function authorize(request: Request): Promise<AuthResult> {
	const authorization = request.headers.get("Authorization") ?? "";
	const match = /^Bearer\s+([^\s]+)$/iu.exec(authorization);
	if (!match) return { ok: false, status: 401, error: "admin_auth_required" };

	const client = serviceClient();
	const { data, error } = await client.auth.getUser(match[1]);
	const userId = data.user?.id;
	if (error || !userId) {
		return { ok: false, status: 401, error: "admin_session_invalid" };
	}

	const membership = await client
		.from("admin_users")
		.select("role,is_active")
		.eq("user_id", userId)
		.abortSignal(AbortSignal.timeout(RPC_TIMEOUT_MS))
		.maybeSingle();
	if (membership.error) {
		return { ok: false, status: 503, error: "admin_lookup_failed" };
	}
	const role =
		typeof membership.data?.role === "string" ? membership.data.role : "";
	if (membership.data?.is_active !== true || !ALLOWED_ROLES.has(role)) {
		return { ok: false, status: 403, error: "admin_not_authorized" };
	}
	return { ok: true };
}

function parseCandidates(value: unknown): {
	account: { slug: string; wabaId: string };
	links: VerificationCandidate[];
	hasMore: boolean;
	nextCursor: { updatedAt: string; id: string } | null;
} | null {
	if (!isRecord(value) || value.ok !== true || !isRecord(value.account)) {
		return null;
	}
	const slug = readText(value.account.slug, 80);
	const wabaId = readText(value.account.waba_id, 256);
	if (!slug || !wabaId || !/^\d{1,256}$/u.test(wabaId)) return null;
	if (!Array.isArray(value.links) || value.links.length > 200) return null;
	if (typeof value.has_more !== "boolean") return null;
	let nextCursor: { updatedAt: string; id: string } | null = null;
	if (value.next_cursor !== null) {
		if (!isRecord(value.next_cursor)) return null;
		const cursorId = value.next_cursor.id;
		const cursorUpdatedAt = readText(value.next_cursor.updated_at, 64);
		if (
			!isUuid(cursorId) ||
			!cursorUpdatedAt ||
			!Number.isFinite(Date.parse(cursorUpdatedAt))
		) {
			return null;
		}
		nextCursor = { id: cursorId.toLowerCase(), updatedAt: cursorUpdatedAt };
	}
	if (value.has_more !== (nextCursor !== null)) return null;

	const links: VerificationCandidate[] = [];
	for (const item of value.links) {
		if (!isRecord(item)) return null;
		const retailerId = readText(item.product_retailer_id, 256);
		const updatedAt = readText(item.updated_at, 64);
		if (
			!isUuid(item.id) ||
			!isUuid(item.product_id) ||
			!retailerId ||
			!updatedAt ||
			!Number.isFinite(Date.parse(updatedAt))
		) {
			return null;
		}
		links.push({
			id: item.id.toLowerCase(),
			product_retailer_id: retailerId,
			product_id: item.product_id.toLowerCase(),
			updated_at: updatedAt,
		});
	}
	if (
		new Set(links.map((link) => link.product_retailer_id)).size !== links.length
	) {
		return null;
	}
	return {
		account: { slug, wabaId },
		links,
		hasMore: value.has_more,
		nextCursor,
	};
}

async function verify(request: Request): Promise<Response> {
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
	const catalogId = readText(body.catalog_id, 256);
	if (!catalogId || !/^\d{1,256}$/u.test(catalogId)) {
		return json(request, { ok: false, error: "invalid_input" }, 400);
	}
	const afterUpdatedAt = body.after_updated_at ?? null;
	const afterId = body.after_id ?? null;
	if (
		(afterUpdatedAt === null) !== (afterId === null) ||
		(afterUpdatedAt !== null &&
			(typeof afterUpdatedAt !== "string" ||
				!Number.isFinite(Date.parse(afterUpdatedAt)) ||
				!isUuid(afterId)))
	) {
		return json(request, { ok: false, error: "invalid_input" }, 400);
	}

	const client = serviceClient();
	const { data: candidateData, error: candidateError } = await client
		.rpc("meta_catalog_product_links_verification_candidates_v1", {
			p_whatsapp_account_id: body.whatsapp_account_id,
			p_catalog_id: catalogId,
			p_after_updated_at: afterUpdatedAt,
			p_after_id: afterId,
		})
		.abortSignal(AbortSignal.timeout(RPC_TIMEOUT_MS));
	if (candidateError) {
		return json(request, { ok: false, error: "verification_unavailable" }, 503);
	}
	if (
		isRecord(candidateData) &&
		candidateData.error === "whatsapp_account_unavailable"
	) {
		return json(
			request,
			{ ok: false, error: "whatsapp_account_unavailable" },
			404,
		);
	}
	const candidates = parseCandidates(candidateData);
	if (!candidates) {
		return json(request, { ok: false, error: "verification_unavailable" }, 503);
	}
	if (candidates.links.length === 0) {
		return json(request, {
			ok: true,
			checked: 0,
			activated: 0,
			missing: 0,
			duplicate: 0,
			has_more: candidates.hasMore,
			next_cursor: candidates.nextCursor,
		});
	}

	const channel = CHANNEL_BY_ACCOUNT_SLUG.get(candidates.account.slug);
	const graphApiVersion = readText(Deno.env.get("META_GRAPH_API_VERSION"), 32);
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
		!graphApiVersion ||
		!/^v\d+\.\d+$/u.test(graphApiVersion) ||
		!accessToken ||
		!appSecret
	) {
		return json(
			request,
			{ ok: false, error: "meta_account_not_configured" },
			503,
		);
	}

	const verification = await verifyMetaCatalogRetailerIds({
		wabaId: candidates.account.wabaId,
		catalogId,
		productRetailerIds: candidates.links.map(
			(link) => link.product_retailer_id,
		),
		graphApiVersion,
		accessToken,
		appSecret,
	});
	if (verification.status === "catalog_not_linked_to_waba") {
		return json(
			request,
			{
				ok: false,
				error: "catalog_not_linked_to_waba",
				checked: 0,
				activated: 0,
				has_more: candidates.hasMore,
				next_cursor: candidates.nextCursor,
			},
			409,
		);
	}
	if (verification.status === "catalog_link_ambiguous") {
		return json(
			request,
			{
				ok: false,
				error: "catalog_link_ambiguous",
				checked: 0,
				activated: 0,
				has_more: candidates.hasMore,
				next_cursor: candidates.nextCursor,
			},
			409,
		);
	}
	if (verification.status === "unavailable") {
		return json(
			request,
			{
				ok: false,
				error: "meta_catalog_verification_unavailable",
				checked: 0,
				activated: 0,
				has_more: candidates.hasMore,
				next_cursor: candidates.nextCursor,
			},
			503,
		);
	}

	const verifiedIds = new Set(
		verification.retailerIds
			.filter((item) => item.status === "verified")
			.map((item) => item.productRetailerId),
	);
	const verifiedLinks = candidates.links.filter((link) =>
		verifiedIds.has(link.product_retailer_id),
	);
	let activated = 0;
	if (verifiedLinks.length > 0) {
		const { data: activationData, error: activationError } = await client
			.rpc("meta_catalog_product_links_activate_batch_v1", {
				p_whatsapp_account_id: body.whatsapp_account_id,
				p_waba_id: candidates.account.wabaId,
				p_catalog_id: catalogId,
				p_verified_links: verifiedLinks,
			})
			.abortSignal(AbortSignal.timeout(RPC_TIMEOUT_MS));
		if (
			activationError ||
			!isRecord(activationData) ||
			activationData.ok !== true ||
			typeof activationData.activated_count !== "number" ||
			activationData.activated_count !== verifiedLinks.length
		) {
			return json(
				request,
				{
					ok: false,
					error: "verification_snapshot_changed",
					checked: candidates.links.length,
					activated: 0,
					has_more: candidates.hasMore,
					next_cursor: candidates.nextCursor,
				},
				409,
			);
		}
		activated = activationData.activated_count;
	}

	return json(request, {
		ok: true,
		checked: candidates.links.length,
		activated,
		missing: verification.retailerIds.filter(
			(item) => item.status === "not_found",
		).length,
		duplicate: verification.retailerIds.filter(
			(item) => item.status === "duplicate",
		).length,
		has_more: candidates.hasMore,
		next_cursor: candidates.nextCursor,
	});
}

Deno.serve(async (request: Request) => {
	const origin = request.headers.get("origin") ?? "";
	if (!ALLOWED_ORIGINS.has(origin)) {
		return json(request, { ok: false, error: "origin_not_allowed" }, 403);
	}
	if (request.method === "OPTIONS") {
		return new Response(null, {
			status: 204,
			headers: corsHeaders(request),
		});
	}
	if (request.method !== "POST") {
		return json(request, { ok: false, error: "method_not_allowed" }, 405);
	}

	try {
		const auth = await authorize(request);
		if (!auth.ok)
			return json(request, { ok: false, error: auth.error }, auth.status);
		return await verify(request);
	} catch {
		return json(request, { ok: false, error: "service_unavailable" }, 503);
	}
});
