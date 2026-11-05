import "server-only";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

const PAGE_SIZE = 50;

export type AdminProduct = {
	id: string;
	name: string;
	sku: string | null;
	category: string | null;
	active: boolean;
	priceCents: number | null;
	stockQuantity: number | null;
	unit: string | null;
	imageUrl: string | null;
};

export type AdminProductPage = {
	products: AdminProduct[];
	nextOffset: number | null;
	error:
		| "not_configured"
		| "not_authenticated"
		| "not_authorized"
		| "unavailable"
		| null;
};

export type AdminProductDetail = AdminProduct & {
	description: string;
	gtin: string | null;
	whatsappActive: boolean;
	whatsappCategory: string | null;
	expirationDate: string | null;
};

export type AdminProductDetailResult = {
	product: AdminProductDetail | null;
	error: AdminProductPage["error"] | "not_found";
};

export type AdminProductQuickSaveResult = {
	ok: boolean;
	error:
		| "not_configured"
		| "not_authenticated"
		| "not_authorized"
		| "invalid_input"
		| "unavailable"
		| null;
};

function safeHttpsUrl(value: unknown): string | null {
	if (typeof value !== "string" || value.length > 2048) return null;
	try {
		const url = new URL(value);
		return url.protocol === "https:" ? url.toString() : null;
	} catch {
		return null;
	}
}

function toProduct(value: unknown): AdminProduct | null {
	if (!value || typeof value !== "object") return null;
	const row = value as Record<string, unknown>;
	if (typeof row.id !== "string" || typeof row.name !== "string") return null;

	return {
		id: row.id,
		name: row.name,
		sku: typeof row.sku === "string" ? row.sku : null,
		category: typeof row.category === "string" ? row.category : null,
		active: row.active === true,
		priceCents:
			typeof row.sale_price_cents === "number" ? row.sale_price_cents : null,
		stockQuantity:
			typeof row.stock_quantity === "number" ? row.stock_quantity : null,
		unit: typeof row.packaging === "string" ? row.packaging : null,
		imageUrl: safeHttpsUrl(row.image_url),
	};
}

function toProductDetail(value: unknown): AdminProductDetail | null {
	if (!value || typeof value !== "object") return null;
	const row = value as Record<string, unknown>;
	const product = toProduct({
		id: row.id,
		name: row.name,
		sku: row.sku,
		category: row.category,
		active: row.active,
		sale_price_cents: row.sale_price_cents,
		stock_quantity: row.stock_quantity,
		packaging: row.packaging,
		image_url: row.image_url,
	});
	if (!product) return null;
	return {
		...product,
		description:
			typeof row.description === "string" ? row.description.slice(0, 500) : "",
		gtin: typeof row.gtin === "string" ? row.gtin.slice(0, 30) : null,
		whatsappActive: row.is_whatsapp_active === true,
		whatsappCategory:
			typeof row.whatsapp_category === "string"
				? row.whatsapp_category.slice(0, 100)
				: null,
		expirationDate:
			typeof row.expiration_date === "string" ? row.expiration_date : null,
	};
}

/**
 * Reads through the existing Admin gateway. The gateway validates the Auth
 * token and active admin_users membership with its server-side credentials.
 * The broader product payload is narrowed here so private cost fields never
 * cross into the rendered page.
 */
export async function getAdminProducts(input: {
	query: string;
	active: "" | "true" | "false";
	offset: number;
}): Promise<AdminProductPage> {
	if (!supabaseUrl || !supabasePublishableKey) {
		return { products: [], nextOffset: null, error: "not_configured" };
	}

	const supabase = await createClient();
	const { data, error } = await supabase.auth.getSession();
	const accessToken = data.session?.access_token;
	if (error || !accessToken) {
		return { products: [], nextOffset: null, error: "not_authenticated" };
	}

	const endpoint = new URL("/functions/v1/admin-products-live-v1", supabaseUrl);
	endpoint.searchParams.set("action", "products");
	endpoint.searchParams.set("limit", String(PAGE_SIZE));
	endpoint.searchParams.set("offset", String(Math.max(0, input.offset)));
	if (input.query) endpoint.searchParams.set("q", input.query.slice(0, 100));
	if (input.active) endpoint.searchParams.set("active", input.active);

	let response: Response;
	try {
		response = await fetch(endpoint, {
			method: "GET",
			headers: {
				apikey: supabasePublishableKey,
				Authorization: `Bearer ${accessToken}`,
				Accept: "application/json",
			},
			cache: "no-store",
		});
	} catch {
		return { products: [], nextOffset: null, error: "unavailable" };
	}

	if (response.status === 401 || response.status === 403) {
		return { products: [], nextOffset: null, error: "not_authorized" };
	}
	if (!response.ok)
		return { products: [], nextOffset: null, error: "unavailable" };

	try {
		const payload = (await response.json()) as {
			products?: unknown;
			next_offset?: unknown;
		};
		if (!Array.isArray(payload.products)) {
			return { products: [], nextOffset: null, error: "unavailable" };
		}

		const nextOffset =
			typeof payload.next_offset === "number" &&
			Number.isFinite(payload.next_offset)
				? payload.next_offset
				: null;
		return {
			products: payload.products
				.map(toProduct)
				.filter((product): product is AdminProduct => product !== null),
			nextOffset,
			error: null,
		};
	} catch {
		return { products: [], nextOffset: null, error: "unavailable" };
	}
}

/**
 * Reads one product through the canonical gateway and explicitly drops cost,
 * fiscal profile, identifiers and operational metadata before rendering.
 */
export async function getAdminProductDetail(
	productId: string,
): Promise<AdminProductDetailResult> {
	if (!supabaseUrl || !supabasePublishableKey) {
		return { product: null, error: "not_configured" };
	}

	const supabase = await createClient();
	const { data, error } = await supabase.auth.getSession();
	const accessToken = data.session?.access_token;
	if (error || !accessToken) {
		return { product: null, error: "not_authenticated" };
	}

	const endpoint = new URL("/functions/v1/admin-products-live-v1", supabaseUrl);
	endpoint.searchParams.set("action", "product_detail");
	endpoint.searchParams.set("id", productId);
	let response: Response;
	try {
		response = await fetch(endpoint, {
			method: "GET",
			headers: {
				apikey: supabasePublishableKey,
				Authorization: `Bearer ${accessToken}`,
				Accept: "application/json",
			},
			cache: "no-store",
		});
	} catch {
		return { product: null, error: "unavailable" };
	}

	if (response.status === 401 || response.status === 403) {
		return { product: null, error: "not_authorized" };
	}
	if (response.status === 404) return { product: null, error: "not_found" };
	if (!response.ok) return { product: null, error: "unavailable" };

	try {
		const payload = (await response.json()) as { product?: unknown };
		const product = toProductDetail(payload.product);
		return product
			? { product, error: null }
			: { product: null, error: "unavailable" };
	} catch {
		return { product: null, error: "unavailable" };
	}
}

/**
 * Updates only the current sale price and active flag through the existing
 * authenticated product gateway. Cost, stock, fiscal fields and Meta media
 * are deliberately outside this small editor.
 */
export async function quickSaveAdminProduct(input: {
	productId: string;
	priceCents: number;
	active: boolean;
}): Promise<AdminProductQuickSaveResult> {
	if (!supabaseUrl || !supabasePublishableKey) {
		return { ok: false, error: "not_configured" };
	}
	if (
		!/^[0-9a-f-]{36}$/i.test(input.productId) ||
		!Number.isSafeInteger(input.priceCents) ||
		input.priceCents < 0
	) {
		return { ok: false, error: "invalid_input" };
	}

	const supabase = await createClient();
	const { data, error } = await supabase.auth.getSession();
	const accessToken = data.session?.access_token;
	if (error || !accessToken) return { ok: false, error: "not_authenticated" };

	const endpoint = new URL("/functions/v1/admin-products-live-v1", supabaseUrl);
	endpoint.searchParams.set("action", "product_quick_save");
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
				sale_price_cents: input.priceCents,
				active: input.active,
			}),
			cache: "no-store",
		});
	} catch {
		return { ok: false, error: "unavailable" };
	}

	if (response.status === 401 || response.status === 403) {
		return { ok: false, error: "not_authorized" };
	}
	if (response.status === 400 || response.status === 409) {
		return { ok: false, error: "invalid_input" };
	}
	if (!response.ok) return { ok: false, error: "unavailable" };

	return { ok: true, error: null };
}
