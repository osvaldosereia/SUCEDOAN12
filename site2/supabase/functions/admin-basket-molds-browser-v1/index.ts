import { createHash } from "node:crypto";

declare const Deno: {
	env: { get(name: string): string | undefined };
	serve(handler: (request: Request) => Response | Promise<Response>): void;
};

const UUID =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_POSITIONS = 80;
const MAX_OPTIONS_PER_POSITION = 40;
const MAX_FLOW_OPTIONS_PER_POSITION = 8;
const MAX_HIDDEN_ADJUSTMENT_CENTS = 999_999_999;
const allowedOrigins = new Set([
	"https://donaantonia.com.br",
	"https://www.donaantonia.com.br",
	"http://localhost:3000",
	"http://localhost:3001",
]);

type JsonRecord = Record<string, unknown>;
type ErrorCode =
	| "not_configured"
	| "not_authenticated"
	| "not_authorized"
	| "not_found"
	| "invalid_input"
	| "conflict"
	| "product_not_ready"
	| "empty_flow_options"
	| "too_many_flow_options"
	| "unavailable";
function record(value: unknown): JsonRecord | null {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as JsonRecord)
		: null;
}

function safeText(value: unknown, maximum = 180): string | null {
	if (typeof value !== "string") return null;
	const result = Array.from(value.slice(0, maximum * 2), (character) => {
		const code = character.codePointAt(0) ?? 0;
		return code < 32 || code === 127 ? " " : character;
	})
		.join("")
		.replace(/\s+/g, " ")
		.trim();
	return result ? result.slice(0, maximum) : null;
}

function safeUrl(value: unknown): string | null {
	if (typeof value !== "string" || value.length > 2048) return null;
	try {
		const url = new URL(value);
		return url.protocol === "https:" && !url.username && !url.password
			? url.toString()
			: null;
	} catch {
		return null;
	}
}

function cents(value: unknown, maximumReais = 1_000_000): number {
	const amount = typeof value === "number" ? value : Number(value);
	return Number.isFinite(amount) && Math.abs(amount) <= maximumReais
		? Math.round(amount * 100)
		: 0;
}

function stableValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(stableValue);
	const row = record(value);
	if (!row) return value;
	return Object.fromEntries(
		Object.keys(row)
			.sort()
			.map((key) => [key, stableValue(row[key])]),
	);
}

function revisionFor(value: unknown): string {
	return createHash("sha256")
		.update(JSON.stringify(stableValue(value)))
		.digest("hex");
}

function gatewayError(status: number, body: JsonRecord | null): ErrorCode {
	if (status === 401) return "not_authenticated";
	if (status === 403) return "not_authorized";
	if (status === 404) return "not_found";
	if (status === 409) return "conflict";
	if (body?.error === "basket_mold_basket_not_found") return "not_found";
	if (body?.error === "basket_mold_duplicate_option") return "invalid_input";
	if (status === 400) return "invalid_input";
	return "unavailable";
}

function corsHeaders(origin: string | null): HeadersInit {
	const headers: Record<string, string> = {
		"Access-Control-Allow-Headers": "authorization, apikey, content-type",
		"Access-Control-Allow-Methods": "POST, OPTIONS",
		Vary: "Origin",
	};
	if (origin && allowedOrigins.has(origin))
		headers["Access-Control-Allow-Origin"] = origin;
	return headers;
}

function jsonResponse(
	status: number,
	body: JsonRecord,
	origin: string | null,
): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
	});
}

function safeEditor(
	raw: JsonRecord,
	summary: JsonRecord | null,
): JsonRecord | null {
	if (
		typeof raw.basket_id !== "string" ||
		!UUID.test(raw.basket_id) ||
		!Array.isArray(raw.positions)
	)
		return null;
	const positions = raw.positions
		.map((value) => {
			const position = record(value);
			if (
				!position ||
				typeof position.position_id !== "string" ||
				!UUID.test(position.position_id)
			)
				return null;
			const options = Array.isArray(position.options)
				? position.options
						.map((optionValue) => {
							const option = record(optionValue);
							if (
								!option ||
								typeof option.product_id !== "string" ||
								!UUID.test(option.product_id)
							)
								return null;
							return {
								productId: option.product_id.toLowerCase(),
								name: safeText(option.name) ?? "Produto sem nome",
								sku: safeText(option.sku, 80),
								imageUrl: safeUrl(option.image_url),
								active: option.is_active === true,
								whatsappActive:
									typeof option.is_whatsapp_active === "boolean"
										? option.is_whatsapp_active
										: null,
								sortOrder: Number.isFinite(Number(option.sort_order))
									? Number(option.sort_order)
									: 0,
							};
						})
						.filter((option) => option !== null)
				: [];
			return {
				id: position.position_id.toLowerCase(),
				label: safeText(position.label, 100) ?? "Etapa sem nome",
				quantity: Math.max(1, Math.min(999, Number(position.quantity) || 1)),
				sortOrder: Number.isFinite(Number(position.sort_order))
					? Number(position.sort_order)
					: 0,
				options,
			};
		})
		.filter((position) => position !== null);
	const conditionalProduct = record(raw.conditional_hidden_product);
	return {
		basketId: raw.basket_id.toLowerCase(),
		name: safeText(raw.basket_name) ?? "Cesta sem nome",
		imageUrl: safeUrl(raw.basket_image_url),
		active: summary?.is_active === true,
		moldConfigured: typeof raw.mold_id === "string" && UUID.test(raw.mold_id),
		categoryName: safeText(summary?.category_name, 100),
		subcategoryName: safeText(summary?.subcategory_name, 100),
		publicCompositionCount: Math.max(
			1,
			Math.min(6, Number(raw.public_composition_count) || 1),
		),
		hiddenAdjustmentCents: cents(
			raw.hidden_adjustment,
			MAX_HIDDEN_ADJUSTMENT_CENTS / 100,
		),
		conditionalHiddenEnabled: raw.conditional_hidden_enabled === true,
		conditionalHiddenProductName: safeText(conditionalProduct?.name, 180),
		conditionalHiddenAdjustmentCents: cents(raw.conditional_hidden_adjustment),
		positions,
	};
}

async function invokeExisting(
	url: string,
	apiKey: string,
	authorization: string,
	functionName: string,
	method: "GET" | "POST",
	input: JsonRecord,
): Promise<{ status: number; body: JsonRecord | null }> {
	const endpoint = new URL(`/functions/v1/${functionName}`, url);
	if (method === "GET") {
		for (const [key, value] of Object.entries(input))
			endpoint.searchParams.set(key, String(value));
	}
	try {
		const response = await fetch(endpoint, {
			method,
			headers: {
				apikey: apiKey,
				Authorization: authorization,
				Accept: "application/json",
				...(method === "POST" ? { "Content-Type": "application/json" } : {}),
			},
			...(method === "POST" ? { body: JSON.stringify(input) } : {}),
		});
		return {
			status: response.status,
			body: record(await response.json().catch(() => null)),
		};
	} catch {
		return { status: 502, body: null };
	}
}

async function currentEditor(
	url: string,
	apiKey: string,
	authorization: string,
	basketId: string,
): Promise<
	| { ok: true; raw: JsonRecord; summary: JsonRecord | null }
	| { ok: false; status: number; error: ErrorCode }
> {
	const [editorResult, listResult] = await Promise.all([
		invokeExisting(
			url,
			apiKey,
			authorization,
			"admin-basket-molds-v1",
			"POST",
			{
				action: "editor",
				basket_id: basketId,
			},
		),
		invokeExisting(
			url,
			apiKey,
			authorization,
			"admin-basket-molds-v1",
			"POST",
			{ action: "list" },
		),
	]);
	const raw = record(editorResult.body?.editor);
	if (editorResult.status !== 200 || editorResult.body?.ok !== true || !raw) {
		return {
			ok: false,
			status: editorResult.status || 502,
			error: gatewayError(editorResult.status, editorResult.body),
		};
	}
	if (listResult.status !== 200 || listResult.body?.ok !== true) {
		return {
			ok: false,
			status: listResult.status || 502,
			error: gatewayError(listResult.status, listResult.body),
		};
	}
	const list = Array.isArray(listResult.body?.baskets)
		? listResult.body.baskets
		: [];
	const summary = list.map(record).find((row) => row?.id === basketId) ?? null;
	if (!summary) return { ok: false, status: 404, error: "not_found" };
	return { ok: true, raw, summary };
}

type SavePosition = { positionId: string; label: string; productIds: string[] };
type SaveInput = {
	basketId: string;
	revision: string;
	name: string;
	hiddenAdjustmentCents: number;
	positions: SavePosition[];
};

function parseSave(value: unknown): value is SaveInput {
	const input = record(value);
	if (
		!input ||
		typeof input.basketId !== "string" ||
		!UUID.test(input.basketId) ||
		typeof input.revision !== "string" ||
		!/^[0-9a-f]{64}$/i.test(input.revision) ||
		typeof input.name !== "string" ||
		!safeText(input.name, 180) ||
		Array.from(input.name).length > 180 ||
		typeof input.hiddenAdjustmentCents !== "number" ||
		!Number.isSafeInteger(input.hiddenAdjustmentCents) ||
		input.hiddenAdjustmentCents < 0 ||
		input.hiddenAdjustmentCents > MAX_HIDDEN_ADJUSTMENT_CENTS ||
		!Array.isArray(input.positions) ||
		input.positions.length < 1 ||
		input.positions.length > MAX_POSITIONS
	)
		return false;
	const positions = input.positions as unknown[];
	const seenPositions = new Set<string>();
	for (const value of positions) {
		const position = record(value);
		if (
			!position ||
			typeof position.positionId !== "string" ||
			!UUID.test(position.positionId) ||
			seenPositions.has(position.positionId.toLowerCase()) ||
			typeof position.label !== "string" ||
			!safeText(position.label, 100) ||
			Array.from(position.label).length > 100 ||
			!Array.isArray(position.productIds) ||
			position.productIds.length < 1 ||
			position.productIds.length > MAX_OPTIONS_PER_POSITION
		)
			return false;
		seenPositions.add(position.positionId.toLowerCase());
		const seenProducts = new Set<string>();
		for (const productId of position.productIds) {
			if (
				typeof productId !== "string" ||
				!UUID.test(productId) ||
				seenProducts.has(productId.toLowerCase())
			)
				return false;
			seenProducts.add(productId.toLowerCase());
		}
	}
	return true;
}

type Product = {
	id: string;
	name: string;
	sku: string | null;
	active: boolean;
	whatsappActive: boolean;
	imageUrl: string | null;
	priceCents: number | null;
};

async function productDetail(
	url: string,
	apiKey: string,
	authorization: string,
	id: string,
): Promise<Product | null> {
	const result = await invokeExisting(
		url,
		apiKey,
		authorization,
		"admin-products-live-v1",
		"GET",
		{ action: "product_detail", id },
	);
	const row = record(result.body?.product);
	if (
		result.status !== 200 ||
		!row ||
		typeof row.id !== "string" ||
		typeof row.name !== "string"
	)
		return null;
	return {
		id: row.id.toLowerCase(),
		name: safeText(row.name) ?? "",
		sku: safeText(row.sku, 80),
		active: row.active === true,
		whatsappActive: row.is_whatsapp_active === true,
		imageUrl: safeUrl(row.image_url),
		priceCents: Number.isSafeInteger(row.sale_price_cents)
			? Number(row.sale_price_cents)
			: null,
	};
}

function ready(product: Product): boolean {
	const name = Array.from(product.name, (character) => {
		const code = character.codePointAt(0) ?? 0;
		return code < 32 || code === 127 ? " " : character;
	})
		.join("")
		.replace(/\s+/g, " ")
		.trim();
	return (
		product.active &&
		product.whatsappActive &&
		name.length > 0 &&
		name.length <= 180 &&
		product.imageUrl !== null &&
		product.priceCents !== null &&
		Number.isSafeInteger(product.priceCents) &&
		product.priceCents >= 0 &&
		product.priceCents <= MAX_HIDDEN_ADJUSTMENT_CENTS
	);
}

async function save(
	url: string,
	apiKey: string,
	authorization: string,
	input: SaveInput,
): Promise<{ status: number; body: JsonRecord }> {
	const current = await currentEditor(
		url,
		apiKey,
		authorization,
		input.basketId,
	);
	if (!current.ok)
		return {
			status: current.status,
			body: { ok: false, error: current.error },
		};
	if (revisionFor(current.raw) !== input.revision)
		return { status: 409, body: { ok: false, error: "conflict" } };
	const rawPositions = Array.isArray(current.raw.positions)
		? current.raw.positions
				.map(record)
				.filter((row): row is JsonRecord => row !== null)
		: [];
	const oldByPosition = new Map(
		rawPositions.map((position) => [
			String(position.position_id).toLowerCase(),
			position,
		]),
	);
	const changed = input.positions.filter((position) => {
		const old = oldByPosition.get(position.positionId.toLowerCase());
		const ids = Array.isArray(old?.options)
			? old.options
					.map((item) => record(item)?.product_id)
					.filter((id): id is string => typeof id === "string")
					.map((id) => id.toLowerCase())
			: [];
		return (
			ids.length !== position.productIds.length ||
			ids.some((id, index) => id !== position.productIds[index]?.toLowerCase())
		);
	});
	const productIds = [
		...new Set(
			changed.flatMap((position) =>
				position.productIds.map((id) => id.toLowerCase()),
			),
		),
	];
	const products = new Map<string, Product>();
	for (let offset = 0; offset < productIds.length; offset += 5) {
		const batch = await Promise.all(
			productIds
				.slice(offset, offset + 5)
				.map(
					async (id) =>
						[id, await productDetail(url, apiKey, authorization, id)] as const,
				),
		);
		for (const [id, product] of batch) if (product) products.set(id, product);
	}
	for (const position of changed) {
		const old = oldByPosition.get(position.positionId.toLowerCase());
		const oldIds = new Set(
			(Array.isArray(old?.options) ? old.options : [])
				.map((item) => record(item)?.product_id)
				.filter((id): id is string => typeof id === "string")
				.map((id) => id.toLowerCase()),
		);
		let eligibleCount = 0;
		for (const id of position.productIds) {
			const product = products.get(id.toLowerCase());
			if (!product) {
				if (!oldIds.has(id.toLowerCase()))
					return {
						status: 400,
						body: { ok: false, error: "product_not_ready" },
					};
				continue;
			}
			const isReady = ready(product);
			const requiredForFlow = product.active && product.whatsappActive;
			if ((!oldIds.has(id.toLowerCase()) || requiredForFlow) && !isReady)
				return { status: 400, body: { ok: false, error: "product_not_ready" } };
			if (isReady) eligibleCount += 1;
		}
		if (eligibleCount === 0)
			return { status: 400, body: { ok: false, error: "empty_flow_options" } };
		if (eligibleCount > MAX_FLOW_OPTIONS_PER_POSITION)
			return {
				status: 400,
				body: { ok: false, error: "too_many_flow_options" },
			};
	}
	const rawById = new Map(
		rawPositions.map((position) => [
			String(position.position_id).toLowerCase(),
			position,
		]),
	);
	const positions = input.positions.map((submitted) => {
		const old = rawById.get(submitted.positionId.toLowerCase());
		const oldOptions = Array.isArray(old?.options) ? old.options : [];
		const optionsByProduct = new Map(
			oldOptions
				.map((optionValue) => record(optionValue))
				.filter(
					(option): option is JsonRecord =>
						option !== null && typeof option.product_id === "string",
				)
				.map((option) => [String(option.product_id).toLowerCase(), option]),
		);
		return {
			label: safeText(submitted.label, 100),
			quantity: old?.quantity ?? 1,
			metadata: old?.metadata ?? {},
			options: submitted.productIds.map((productId) => ({
				product_id: productId.toLowerCase(),
				metadata: optionsByProduct.get(productId.toLowerCase())?.metadata ?? {},
			})),
		};
	});
	const adjustment = input.hiddenAdjustmentCents / 100;
	const conditionalAdjustment = Number(
		current.raw.conditional_hidden_adjustment ?? 0,
	);
	if (!Number.isFinite(adjustment) || !Number.isFinite(conditionalAdjustment))
		return { status: 502, body: { ok: false, error: "unavailable" } };
	const result = await invokeExisting(
		url,
		apiKey,
		authorization,
		"admin-basket-molds-v1",
		"POST",
		{
			action: "save",
			basket_id: input.basketId,
			name: safeText(input.name, 180),
			hidden_adjustment: adjustment,
			public_composition_count: Math.max(
				1,
				Math.min(6, Number(current.raw.public_composition_count) || 1),
			),
			positions,
			category_id: current.raw.category_id,
			subcategory_id: current.raw.subcategory_id,
			conditional_hidden_enabled:
				current.raw.conditional_hidden_enabled === true,
			conditional_hidden_product_id:
				current.raw.conditional_hidden_product_id ?? null,
			conditional_hidden_adjustment: conditionalAdjustment,
			operator: "Admin Cestas",
		},
	);
	if (result.status !== 200 || result.body?.ok !== true)
		return {
			status: result.status || 502,
			body: result.body ?? { ok: false, error: "unavailable" },
		};
	const saved = record(result.body.editor);
	const safe = saved ? safeEditor(saved, current.summary) : null;
	if (!saved || !safe)
		return { status: 502, body: { ok: false, error: "unavailable" } };
	return {
		status: 200,
		body: { ok: true, editor: safe, revision: revisionFor(saved) },
	};
}

Deno.serve(async (request) => {
	const origin = request.headers.get("origin");
	if (request.method === "OPTIONS")
		return new Response(null, { status: 204, headers: corsHeaders(origin) });
	if (request.method !== "POST")
		return jsonResponse(405, { ok: false, error: "unavailable" }, origin);
	if (origin && !allowedOrigins.has(origin))
		return jsonResponse(403, { ok: false, error: "not_authorized" }, origin);
	const url = Deno.env.get("SUPABASE_URL");
	const apiKey = request.headers.get("apikey");
	const authorization = request.headers.get("authorization");
	if (!url || !apiKey)
		return jsonResponse(503, { ok: false, error: "not_configured" }, origin);
	if (!authorization?.startsWith("Bearer "))
		return jsonResponse(401, { ok: false, error: "not_authenticated" }, origin);
	let input: JsonRecord;
	try {
		const body = await request.json();
		const parsed = record(body);
		if (!parsed || JSON.stringify(body).length > 100_000)
			return jsonResponse(400, { ok: false, error: "invalid_input" }, origin);
		input = parsed;
	} catch {
		return jsonResponse(400, { ok: false, error: "invalid_input" }, origin);
	}
	const action = input.action;
	if (action === "list") {
		const result = await invokeExisting(
			url,
			apiKey,
			authorization,
			"admin-basket-molds-v1",
			"POST",
			{ action: "list" },
		);
		const baskets = Array.isArray(result.body?.baskets)
			? result.body.baskets
					.map(record)
					.filter((row): row is JsonRecord => row !== null)
					.map((row) => ({
						id: row.id,
						name: safeText(row.name) ?? "Cesta sem nome",
						image_url: safeUrl(row.image_url),
						is_active: row.is_active === true,
						category_name: safeText(row.category_name, 100),
						subcategory_name: safeText(row.subcategory_name, 100),
						mold_configured: row.mold_configured === true,
						public_composition_count: Number(row.public_composition_count) || 1,
						hidden_adjustment: Number(row.hidden_adjustment) || 0,
					}))
			: null;
		return baskets
			? jsonResponse(200, { ok: true, baskets }, origin)
			: jsonResponse(
					result.status || 502,
					{ ok: false, error: "unavailable" },
					origin,
				);
	}
	if (action === "editor") {
		const basketId = typeof input.basketId === "string" ? input.basketId : "";
		if (!UUID.test(basketId))
			return jsonResponse(400, { ok: false, error: "invalid_input" }, origin);
		const current = await currentEditor(url, apiKey, authorization, basketId);
		if (!current.ok)
			return jsonResponse(
				current.status,
				{ ok: false, error: current.error },
				origin,
			);
		const editor = safeEditor(current.raw, current.summary);
		return editor
			? jsonResponse(
					200,
					{ ok: true, editor, revision: revisionFor(current.raw) },
					origin,
				)
			: jsonResponse(502, { ok: false, error: "unavailable" }, origin);
	}
	if (action === "products") {
		const query =
			typeof input.query === "string" ? input.query.trim().slice(0, 80) : "";
		if (query.length < 2)
			return jsonResponse(400, { ok: false, error: "invalid_input" }, origin);
		const result = await invokeExisting(
			url,
			apiKey,
			authorization,
			"admin-basket-molds-v1",
			"POST",
			{ action: "products", q: query, limit: 24 },
		);
		const items = Array.isArray(result.body?.products)
			? result.body.products
					.map(record)
					.filter((row): row is JsonRecord => row !== null)
					.map((row) => ({
						id: row.id,
						name: safeText(row.name) ?? "Produto sem nome",
						sku: safeText(row.sku, 80),
						imageUrl: safeUrl(row.image_url),
						active: row.is_active === true,
					}))
					.filter(
						(row) =>
							typeof row.id === "string" &&
							UUID.test(row.id) &&
							row.imageUrl !== null,
					)
			: null;
		return items
			? jsonResponse(200, { ok: true, products: items }, origin)
			: jsonResponse(
					result.status || 502,
					{ ok: false, error: "unavailable" },
					origin,
				);
	}
	if (action === "validate_product") {
		const productId =
			typeof input.productId === "string" ? input.productId : "";
		if (!UUID.test(productId))
			return jsonResponse(400, { ok: false, error: "invalid_input" }, origin);
		const product = await productDetail(url, apiKey, authorization, productId);
		return product && ready(product)
			? jsonResponse(
					200,
					{
						ok: true,
						product: {
							id: product.id,
							name: product.name,
							sku: product.sku,
							imageUrl: product.imageUrl,
							priceCents: product.priceCents,
							active: product.active,
						},
					},
					origin,
				)
			: jsonResponse(400, { ok: false, error: "product_not_ready" }, origin);
	}
	if (action === "save") {
		const saveInput = input.input;
		if (!parseSave(saveInput))
			return jsonResponse(400, { ok: false, error: "invalid_input" }, origin);
		const result = await save(url, apiKey, authorization, saveInput);
		return jsonResponse(result.status, result.body, origin);
	}
	return jsonResponse(400, { ok: false, error: "invalid_input" }, origin);
});
