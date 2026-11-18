import "server-only";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

const UUID =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ProductWhatsappAvailabilityError =
	| "not_configured"
	| "not_authenticated"
	| "not_authorized"
	| "invalid_input"
	| "not_found"
	| "conflict"
	| "product_inactive"
	| "flow_name_invalid"
	| "flow_image_invalid"
	| "flow_price_invalid"
	| "unavailable";

export type ProductWhatsappAvailabilityResult =
	| {
			ok: true;
			whatsappActive: boolean;
			updatedAt: string;
			error: null;
	  }
	| { ok: false; error: ProductWhatsappAvailabilityError };

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorForResponse(
	status: number,
	value: unknown,
): ProductWhatsappAvailabilityError {
	const code =
		isRecord(value) && typeof value.error === "string" ? value.error : "";
	if (status === 401) return "not_authenticated";
	if (status === 403) return "not_authorized";
	if (status === 404) return "not_found";
	if (status === 400) return "invalid_input";
	if (
		status === 409 &&
		[
			"conflict",
			"product_inactive",
			"flow_name_invalid",
			"flow_image_invalid",
			"flow_price_invalid",
		].includes(code)
	) {
		return code as ProductWhatsappAvailabilityError;
	}
	return "unavailable";
}

export async function setAdminProductWhatsappAvailability(input: {
	productId: string;
	expectedWhatsappActive: boolean;
	whatsappActive: boolean;
}): Promise<ProductWhatsappAvailabilityResult> {
	if (!supabaseUrl || !supabasePublishableKey) {
		return { ok: false, error: "not_configured" };
	}
	if (
		!UUID.test(input.productId) ||
		typeof input.expectedWhatsappActive !== "boolean" ||
		typeof input.whatsappActive !== "boolean"
	) {
		return { ok: false, error: "invalid_input" };
	}

	const supabase = await createClient();
	const session = await supabase.auth.getSession();
	const accessToken = session.data.session?.access_token;
	if (session.error || !accessToken) {
		return { ok: false, error: "not_authenticated" };
	}

	const endpoint = new URL(
		"/functions/v1/admin-product-whatsapp-availability-v1",
		supabaseUrl,
	);
	let response: Response;
	try {
		response = await fetch(endpoint, {
			method: "POST",
			headers: {
				apikey: supabasePublishableKey,
				Authorization: `Bearer ${accessToken}`,
				"Content-Type": "application/json",
				Accept: "application/json",
			},
			body: JSON.stringify({
				product_id: input.productId,
				expected_whatsapp_active: input.expectedWhatsappActive,
				whatsapp_active: input.whatsappActive,
			}),
			cache: "no-store",
		});
	} catch {
		return { ok: false, error: "unavailable" };
	}

	let payload: unknown = null;
	try {
		payload = await response.json();
	} catch {
		return { ok: false, error: "unavailable" };
	}
	if (!response.ok) {
		return { ok: false, error: errorForResponse(response.status, payload) };
	}
	if (!isRecord(payload) || payload.ok !== true) {
		return { ok: false, error: "unavailable" };
	}
	const updatedAt = payload.updated_at;
	if (
		typeof payload.whatsapp_active !== "boolean" ||
		payload.whatsapp_active !== input.whatsappActive ||
		typeof updatedAt !== "string" ||
		!Number.isFinite(Date.parse(updatedAt))
	) {
		return { ok: false, error: "unavailable" };
	}
	return {
		ok: true,
		whatsappActive: payload.whatsapp_active,
		updatedAt: new Date(updatedAt).toISOString(),
		error: null,
	};
}
