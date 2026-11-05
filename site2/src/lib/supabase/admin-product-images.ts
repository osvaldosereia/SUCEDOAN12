import "server-only";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

const BUCKET = "product-images";
const MAX_FILE_BYTES = 500_000;
const UUID =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);

export type AdminProductImageError =
	| "not_configured"
	| "not_authenticated"
	| "not_authorized"
	| "invalid_file"
	| "conflict"
	| "unavailable";

export type AdminProductImageResult =
	| { ok: true }
	| { ok: false; error: AdminProductImageError };

type GatewayPayload = Record<string, unknown>;

function asPayload(value: unknown): GatewayPayload | null {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as GatewayPayload)
		: null;
}

function gatewayError(
	status: number,
	payload: GatewayPayload | null,
): AdminProductImageError {
	if (status === 401) return "not_authenticated";
	if (status === 403) return "not_authorized";
	if (status === 409 || payload?.error === "product_image_changed") {
		return "conflict";
	}
	if (status === 400) return "invalid_file";
	return "unavailable";
}

async function callImageGateway(
	accessToken: string,
	action: "prepare" | "finalize",
	body: GatewayPayload,
): Promise<{ status: number; payload: GatewayPayload | null } | null> {
	if (!supabaseUrl || !supabasePublishableKey) return null;
	const endpoint = new URL("/functions/v1/admin-product-image-v1", supabaseUrl);
	endpoint.searchParams.set("action", action);
	try {
		const response = await fetch(endpoint, {
			method: "POST",
			headers: {
				apikey: supabasePublishableKey,
				Authorization: `Bearer ${accessToken}`,
				"Content-Type": "application/json",
				Accept: "application/json",
			},
			body: JSON.stringify(body),
			cache: "no-store",
		});
		let payload: GatewayPayload | null = null;
		try {
			payload = asPayload(await response.json());
		} catch {
			// The caller receives a stable error instead of gateway response details.
		}
		return { status: response.status, payload };
	} catch {
		return null;
	}
}

/**
 * Uploads one validated product image without granting browser write access to
 * Storage. The signed upload token stays on the server for the whole request.
 */
export async function saveAdminProductImage(input: {
	productId: string;
	file: File;
}): Promise<AdminProductImageResult> {
	if (!supabaseUrl || !supabasePublishableKey) {
		return { ok: false, error: "not_configured" };
	}
	if (
		!UUID.test(input.productId) ||
		input.file.size === 0 ||
		input.file.size > MAX_FILE_BYTES ||
		!IMAGE_MIMES.has(input.file.type)
	) {
		return { ok: false, error: "invalid_file" };
	}

	const supabase = await createClient();
	const { data, error } = await supabase.auth.getSession();
	const accessToken = data.session?.access_token;
	if (error || !accessToken) return { ok: false, error: "not_authenticated" };

	const prepared = await callImageGateway(accessToken, "prepare", {
		product_id: input.productId,
		mime_type: input.file.type,
	});
	if (!prepared) return { ok: false, error: "unavailable" };
	if (prepared.status !== 200 || prepared.payload?.ok !== true) {
		return {
			ok: false,
			error: gatewayError(prepared.status, prepared.payload),
		};
	}

	const path = prepared.payload.path;
	const token = prepared.payload.token;
	const expectedImageUrl = prepared.payload.expected_image_url;
	if (
		typeof path !== "string" ||
		!path.startsWith(`products/${input.productId}/`) ||
		typeof token !== "string" ||
		token.length < 16 ||
		!(
			expectedImageUrl === null ||
			(typeof expectedImageUrl === "string" && expectedImageUrl.length <= 2048)
		)
	) {
		return { ok: false, error: "unavailable" };
	}

	const upload = await supabase.storage
		.from(BUCKET)
		.uploadToSignedUrl(path, token, input.file, {
			cacheControl: "3600",
			contentType: input.file.type,
		});
	if (upload.error) return { ok: false, error: "unavailable" };

	const finalized = await callImageGateway(accessToken, "finalize", {
		product_id: input.productId,
		path,
		expected_image_url: expectedImageUrl,
	});
	if (!finalized) return { ok: false, error: "unavailable" };
	if (finalized.status !== 200 || finalized.payload?.ok !== true) {
		return {
			ok: false,
			error: gatewayError(finalized.status, finalized.payload),
		};
	}
	return { ok: true };
}
