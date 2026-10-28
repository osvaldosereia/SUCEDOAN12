import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.118.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const BODY_LIMIT_BYTES = 4096;
const ALLOWED_ROLES = new Set(["owner", "admin", "catalog_manager"]);
const ALLOWED_ORIGINS = new Set([
	"https://donaantonia.com.br",
	"https://www.donaantonia.com.br",
	"http://localhost:3000",
	"http://127.0.0.1:3000",
]);

type JsonRecord = Record<string, unknown>;
type AuthorizedAdmin = { userId: string };
type AuthResult =
	| { ok: true; admin: AuthorizedAdmin }
	| { ok: false; status: number; error: string };

const ERROR_STATUS: Record<string, number> = {
	invalid_input: 400,
	not_authorized: 403,
	not_found: 404,
	conflict: 409,
	product_inactive: 409,
	flow_name_invalid: 409,
	flow_image_invalid: 409,
	flow_price_invalid: 409,
};

function serviceKey(): string {
	const rawKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
	if (rawKeys) {
		try {
			const keys = JSON.parse(rawKeys) as JsonRecord;
			if (typeof keys.default === "string" && keys.default) {
				return keys.default;
			}
		} catch {
			// Fall back to the legacy service-role environment variable.
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
	return {
		"Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin)
			? origin
			: "https://www.donaantonia.com.br",
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

async function authorize(request: Request): Promise<AuthResult> {
	const authorization = request.headers.get("Authorization") ?? "";
	const match = /^Bearer\s+([^\s]+)$/i.exec(authorization);
	const accessToken = match?.[1];
	if (!accessToken || accessToken.length > 8192) {
		return { ok: false, status: 401, error: "admin_auth_required" };
	}

	const client = serviceClient();
	const auth = await client.auth.getUser(accessToken);
	const userId = auth.data.user?.id;
	if (auth.error || !userId) {
		return { ok: false, status: 401, error: "admin_session_invalid" };
	}

	const membership = await client
		.from("admin_users")
		.select("role,is_active")
		.eq("user_id", userId)
		.maybeSingle();
	if (membership.error) {
		return { ok: false, status: 503, error: "admin_lookup_failed" };
	}
	const role =
		typeof membership.data?.role === "string" ? membership.data.role : "";
	if (membership.data?.is_active !== true || !ALLOWED_ROLES.has(role)) {
		return { ok: false, status: 403, error: "admin_not_authorized" };
	}
	return { ok: true, admin: { userId } };
}

function allowedRpcError(value: unknown): string | null {
	if (typeof value !== "string" || !Object.hasOwn(ERROR_STATUS, value))
		return null;
	return value;
}

async function updateAvailability(
	request: Request,
	body: JsonRecord,
	admin: AuthorizedAdmin,
): Promise<Response> {
	if (
		!isUuid(body.product_id) ||
		typeof body.expected_whatsapp_active !== "boolean" ||
		typeof body.whatsapp_active !== "boolean"
	) {
		return json(request, { ok: false, error: "invalid_input" }, 400);
	}

	const client = serviceClient();
	const result = await client.rpc("admin_product_whatsapp_availability_v1", {
		p_actor_id: admin.userId,
		p_product_id: body.product_id,
		p_expected_whatsapp_active: body.expected_whatsapp_active,
		p_whatsapp_active: body.whatsapp_active,
	});
	if (result.error || !isRecord(result.data)) {
		return json(request, { ok: false, error: "service_unavailable" }, 503);
	}

	if (result.data.ok === true) {
		const updatedAt = result.data.updated_at;
		if (
			typeof result.data.whatsapp_active !== "boolean" ||
			!(typeof updatedAt === "string" && Number.isFinite(Date.parse(updatedAt)))
		) {
			return json(request, { ok: false, error: "service_unavailable" }, 503);
		}
		return json(request, {
			ok: true,
			whatsapp_active: result.data.whatsapp_active,
			updated_at: new Date(updatedAt).toISOString(),
		});
	}

	const error = allowedRpcError(result.data.error);
	if (!error)
		return json(request, { ok: false, error: "service_unavailable" }, 503);
	return json(request, { ok: false, error }, ERROR_STATUS[error]);
}

Deno.serve(async (request: Request) => {
	if (request.method === "OPTIONS") {
		return new Response(null, { status: 204, headers: corsHeaders(request) });
	}
	if (request.method !== "POST") {
		return json(request, { ok: false, error: "method_not_allowed" }, 405);
	}

	try {
		const auth = await authorize(request);
		if (!auth.ok) {
			return json(request, { ok: false, error: auth.error }, auth.status);
		}

		const rawBody = await readBodyLimited(request);
		if (rawBody === null) {
			return json(request, { ok: false, error: "invalid_input" }, 400);
		}
		let body: unknown;
		try {
			body = JSON.parse(rawBody);
		} catch {
			return json(request, { ok: false, error: "invalid_input" }, 400);
		}
		if (!isRecord(body)) {
			return json(request, { ok: false, error: "invalid_input" }, 400);
		}
		return await updateAvailability(request, body, auth.admin);
	} catch {
		return json(request, { ok: false, error: "service_unavailable" }, 503);
	}
});
