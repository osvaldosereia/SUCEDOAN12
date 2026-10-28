import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.118.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const BUCKET = "product-images";
const MAX_FILE_BYTES = 500_000;
const ALLOWED_ROLES = new Set(["owner", "admin", "catalog_manager"]);
const MIME_BY_EXTENSION = {
	jpg: "image/jpeg",
	png: "image/png",
	webp: "image/webp",
} as const;
const ALLOWED_ORIGINS = new Set([
	"https://donaantonia.com.br",
	"https://www.donaantonia.com.br",
	"http://localhost:3000",
	"http://127.0.0.1:3000",
]);

type Json = Record<string, unknown>;
type AuthorizedAdmin = {
	userId: string;
	role: string;
};
type AuthResult =
	| { ok: true; admin: AuthorizedAdmin }
	| { ok: false; status: number; error: string };

function serviceKey(): string {
	const rawKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
	if (rawKeys) {
		try {
			const keys = JSON.parse(rawKeys) as Record<string, unknown>;
			const defaultKey = keys.default;
			if (typeof defaultKey === "string" && defaultKey) return defaultKey;
		} catch {
			// Fall back to the legacy service-role environment variable below.
		}
	}
	return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

function getServiceClient() {
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

function json(request: Request, value: Json, status = 200): Response {
	return new Response(JSON.stringify(value), {
		status,
		headers: {
			...corsHeaders(request),
			"Content-Type": "application/json; charset=utf-8",
		},
	});
}

function isUuid(value: unknown): value is string {
	return (
		typeof value === "string" &&
		/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
			value,
		)
	);
}

function mimeFor(value: unknown): string | null {
	if (
		value === "image/jpeg" ||
		value === "image/png" ||
		value === "image/webp"
	) {
		return value;
	}
	return null;
}

function mimeFromPath(path: string): string | null {
	const extension = path.split(".").at(-1)?.toLowerCase() ?? "";
	return extension in MIME_BY_EXTENSION
		? MIME_BY_EXTENSION[extension as keyof typeof MIME_BY_EXTENSION]
		: null;
}

function validPath(path: string, productId: string): boolean {
	const parts = path.split("/");
	return (
		parts.length === 3 &&
		parts[0] === "products" &&
		parts[1] === productId &&
		/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/i.test(
			parts[2],
		)
	);
}

function hasExpectedSignature(bytes: Uint8Array, mimeType: string): boolean {
	if (mimeType === "image/jpeg") {
		return (
			bytes.length >= 3 &&
			bytes[0] === 0xff &&
			bytes[1] === 0xd8 &&
			bytes[2] === 0xff
		);
	}
	if (mimeType === "image/png") {
		return (
			bytes.length >= 8 &&
			bytes[0] === 0x89 &&
			bytes[1] === 0x50 &&
			bytes[2] === 0x4e &&
			bytes[3] === 0x47 &&
			bytes[4] === 0x0d &&
			bytes[5] === 0x0a &&
			bytes[6] === 0x1a &&
			bytes[7] === 0x0a
		);
	}
	return (
		mimeType === "image/webp" &&
		bytes.length >= 12 &&
		String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
		String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
	);
}

async function authorize(request: Request): Promise<AuthResult> {
	const accessToken = (request.headers.get("Authorization") ?? "")
		.replace(/^Bearer\s+/i, "")
		.trim();
	if (!accessToken) {
		return { ok: false, status: 401, error: "admin_auth_required" };
	}

	const client = getServiceClient();
	const { data, error } = await client.auth.getUser(accessToken);
	const userId = data.user?.id;
	if (error || !userId) {
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
	return { ok: true, admin: { userId, role } };
}

async function readProduct(productId: string) {
	const result = await getServiceClient()
		.from("products")
		.select("id,image_url,last_admin_edit_at,last_admin_edit_by")
		.eq("id", productId)
		.maybeSingle();
	if (result.error) throw new Error("product_lookup_failed");
	return result.data;
}

async function prepare(request: Request, body: Json, admin: AuthorizedAdmin) {
	const productId = body.product_id;
	const mimeType = mimeFor(body.mime_type);
	if (!isUuid(productId) || !mimeType) {
		return json(request, { ok: false, error: "invalid_input" }, 400);
	}

	const product = await readProduct(productId);
	if (!product)
		return json(request, { ok: false, error: "product_not_found" }, 404);

	const extension = Object.entries(MIME_BY_EXTENSION).find(
		([, candidateMime]) => candidateMime === mimeType,
	)?.[0];
	if (!extension)
		return json(request, { ok: false, error: "invalid_input" }, 400);

	const path = `products/${productId}/${crypto.randomUUID()}.${extension}`;
	const client = getServiceClient();
	const signed = await client.storage
		.from(BUCKET)
		.createSignedUploadUrl(path, { upsert: false });
	if (signed.error || !signed.data?.token) {
		console.error("product_image_signed_upload_failed", {
			productId,
			operatorId: admin.userId,
		});
		return json(request, { ok: false, error: "storage_unavailable" }, 503);
	}

	return json(request, {
		ok: true,
		path,
		token: signed.data.token,
		expected_image_url:
			typeof product.image_url === "string" ? product.image_url : null,
	});
}

async function finalize(request: Request, body: Json, admin: AuthorizedAdmin) {
	const productId = body.product_id;
	const path = body.path;
	const expectedImageUrl = body.expected_image_url;
	if (
		!isUuid(productId) ||
		typeof path !== "string" ||
		!validPath(path, productId) ||
		!(
			expectedImageUrl === null ||
			(typeof expectedImageUrl === "string" && expectedImageUrl.length <= 2048)
		)
	) {
		return json(request, { ok: false, error: "invalid_input" }, 400);
	}

	const mimeType = mimeFromPath(path);
	if (!mimeType)
		return json(request, { ok: false, error: "invalid_input" }, 400);
	const client = getServiceClient();
	const product = await readProduct(productId);
	if (!product)
		return json(request, { ok: false, error: "product_not_found" }, 404);
	const actualImageUrl =
		typeof product.image_url === "string" ? product.image_url : null;
	if (actualImageUrl !== expectedImageUrl) {
		return json(request, { ok: false, error: "product_image_changed" }, 409);
	}

	const downloaded = await client.storage.from(BUCKET).download(path);
	if (downloaded.error || !downloaded.data) {
		return json(
			request,
			{ ok: false, error: "uploaded_file_unavailable" },
			400,
		);
	}
	if (downloaded.data.size === 0 || downloaded.data.size > MAX_FILE_BYTES) {
		return json(request, { ok: false, error: "invalid_file_size" }, 400);
	}
	const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
	if (!hasExpectedSignature(bytes, mimeType)) {
		return json(request, { ok: false, error: "invalid_file_content" }, 400);
	}

	const publicUrl = client.storage.from(BUCKET).getPublicUrl(path)
		.data.publicUrl;
	if (!publicUrl || new URL(publicUrl).protocol !== "https:") {
		return json(request, { ok: false, error: "image_url_unavailable" }, 503);
	}
	const now = new Date().toISOString();
	const update = client
		.from("products")
		.update({
			image_url: publicUrl,
			last_admin_edit_at: now,
			last_admin_edit_by: admin.userId,
			updated_at: now,
		})
		.eq("id", productId);
	const guardedUpdate =
		expectedImageUrl === null
			? update.is("image_url", null)
			: update.eq("image_url", expectedImageUrl);
	const changed = await guardedUpdate.select("id").maybeSingle();
	if (changed.error) {
		console.error("product_image_update_failed", {
			productId,
			operatorId: admin.userId,
		});
		return json(request, { ok: false, error: "product_update_failed" }, 503);
	}
	if (!changed.data) {
		return json(request, { ok: false, error: "product_image_changed" }, 409);
	}

	const audit = await client.from("admin_audit_logs").insert({
		admin_user_id: admin.userId,
		action: "product_image_updated",
		entity_type: "product",
		entity_id: productId,
		details: {
			bucket: BUCKET,
			storage_path: path,
			previous_image_url: expectedImageUrl,
			new_image_url: publicUrl,
			mime_type: mimeType,
			size_bytes: downloaded.data.size,
		},
	});
	if (audit.error) {
		const rollback = await client
			.from("products")
			.update({ image_url: expectedImageUrl })
			.eq("id", productId)
			.eq("image_url", publicUrl)
			.eq("last_admin_edit_at", now)
			.eq("last_admin_edit_by", admin.userId)
			.select("id")
			.maybeSingle();
		console.error("product_image_audit_failed", {
			productId,
			operatorId: admin.userId,
			rolledBack: !rollback.error && Boolean(rollback.data),
		});
		return json(
			request,
			{ ok: false, error: "product_image_audit_failed" },
			503,
		);
	}

	return json(request, { ok: true, image_url: publicUrl });
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
		let body: Json;
		try {
			const parsed: unknown = await request.json();
			if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
				return json(request, { ok: false, error: "invalid_input" }, 400);
			}
			body = parsed as Json;
		} catch {
			return json(request, { ok: false, error: "invalid_input" }, 400);
		}

		const action = new URL(request.url).searchParams.get("action");
		if (action === "prepare") return await prepare(request, body, auth.admin);
		if (action === "finalize") return await finalize(request, body, auth.admin);
		return json(request, { ok: false, error: "not_found" }, 404);
	} catch (error) {
		console.error("admin_product_image_error", {
			error: error instanceof Error ? error.message : "unknown_error",
		});
		return json(request, { ok: false, error: "service_unavailable" }, 503);
	}
});
