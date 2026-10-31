declare const Deno: {
	env: { get(name: string): string | undefined };
	serve(handler: (request: Request) => Response | Promise<Response>): void;
};

type JsonRecord = Record<string, unknown>;

const UUID =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowedOrigins = new Set([
	"https://donaantonia.com.br",
	"https://www.donaantonia.com.br",
	"http://localhost:3000",
	"http://localhost:3001",
]);

function record(value: unknown): JsonRecord | null {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as JsonRecord)
		: null;
}

function safeText(value: unknown, maximum = 180): string | null {
	if (typeof value !== "string") return null;
	const clean = value
		.replace(/[\p{Cc}\p{Cf}]/gu, " ")
		.replace(/\s+/g, " ")
		.trim();
	return clean ? clean.slice(0, maximum) : null;
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

function corsHeaders(origin: string | null): HeadersInit {
	const headers: Record<string, string> = {
		"Access-Control-Allow-Headers": "authorization, apikey, content-type",
		"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

async function forward(
	url: string,
	apiKey: string,
	authorization: string,
	action: string,
	method: "GET" | "POST",
	input: JsonRecord,
): Promise<{ status: number; body: JsonRecord | null }> {
	const endpoint = new URL("/functions/v1/admin-products-live-v1", url);
	endpoint.searchParams.set("action", action);
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

function safeDetail(row: JsonRecord): JsonRecord | null {
	if (typeof row.id !== "string" || !UUID.test(row.id)) return null;
	return {
		id: row.id.toLowerCase(),
		name: safeText(row.name) ?? "Produto sem nome",
		sku: safeText(row.sku, 80),
		category: safeText(row.category, 100),
		active: row.active === true,
		sale_price_cents: Number.isSafeInteger(row.sale_price_cents)
			? row.sale_price_cents
			: null,
		stock_quantity:
			typeof row.stock_quantity === "number" &&
			Number.isFinite(row.stock_quantity)
				? row.stock_quantity
				: null,
		packaging: safeText(row.packaging, 30),
		image_url: safeUrl(row.image_url),
		description: safeText(row.description, 500) ?? "",
		gtin: safeText(row.gtin, 30),
		is_whatsapp_active: row.is_whatsapp_active === true,
		whatsapp_category: safeText(row.whatsapp_category, 100),
		expiration_date:
			typeof row.expiration_date === "string" &&
			/^\d{4}-\d{2}-\d{2}$/.test(row.expiration_date)
				? row.expiration_date
				: null,
	};
}

Deno.serve(async (request) => {
	const origin = request.headers.get("origin");
	if (request.method === "OPTIONS")
		return new Response(null, { status: 204, headers: corsHeaders(origin) });
	if (request.method !== "GET" && request.method !== "POST")
		return jsonResponse(405, { error: "method_not_allowed" }, origin);
	if (origin && !allowedOrigins.has(origin))
		return jsonResponse(403, { error: "not_authorized" }, origin);
	const url = Deno.env.get("SUPABASE_URL");
	const apiKey = request.headers.get("apikey");
	const authorization = request.headers.get("authorization");
	if (!url || !apiKey)
		return jsonResponse(503, { error: "not_configured" }, origin);
	if (!authorization?.startsWith("Bearer "))
		return jsonResponse(401, { error: "not_authenticated" }, origin);

	let action: string;
	let input: JsonRecord;
	if (request.method === "GET") {
		const params = new URL(request.url).searchParams;
		action = params.get("action") ?? "products";
		if (action === "detail") {
			const id = params.get("id") ?? "";
			if (!UUID.test(id))
				return jsonResponse(400, { error: "invalid_input" }, origin);
			input = { id };
		} else if (action === "products") {
			const query = (params.get("q") ?? "").trim().slice(0, 100);
			const active = params.get("active") ?? "";
			const rawOffset = Number.parseInt(params.get("offset") ?? "0", 10);
			if (
				(active !== "" && active !== "true" && active !== "false") ||
				!Number.isFinite(rawOffset)
			)
				return jsonResponse(400, { error: "invalid_input" }, origin);
			const offset = Math.max(
				0,
				Math.min(100_000, Math.floor(rawOffset / 50) * 50),
			);
			input = {
				limit: 50,
				offset,
				...(query ? { q: query } : {}),
				...(active ? { active } : {}),
			};
		} else {
			return jsonResponse(400, { error: "invalid_input" }, origin);
		}
	} else {
		let body: unknown;
		try {
			body = await request.json();
		} catch {
			return jsonResponse(400, { error: "invalid_input" }, origin);
		}
		const row = record(body);
		if (!row || JSON.stringify(body).length > 4096)
			return jsonResponse(400, { error: "invalid_input" }, origin);
		action = typeof row.action === "string" ? row.action : "";
		if (
			action !== "quick_save" ||
			typeof row.product_id !== "string" ||
			!UUID.test(row.product_id) ||
			!Number.isSafeInteger(row.sale_price_cents) ||
			Number(row.sale_price_cents) < 0 ||
			typeof row.active !== "boolean" ||
			!(
				row.expected_price_cents === null ||
				Number.isSafeInteger(row.expected_price_cents)
			) ||
			typeof row.expected_active !== "boolean"
		)
			return jsonResponse(400, { error: "invalid_input" }, origin);
		input = row;
	}

	if (action === "detail") {
		const detail = await forward(
			url,
			apiKey,
			authorization,
			"product_detail",
			"GET",
			input,
		);
		const product = safeDetail(record(detail.body?.product) ?? {});
		return detail.status === 200 && product
			? jsonResponse(200, { product }, origin)
			: jsonResponse(
					detail.status || 502,
					{
						error:
							detail.status === 401
								? "not_authenticated"
								: detail.status === 403
									? "not_authorized"
									: "unavailable",
					},
					origin,
				);
	}
	if (action === "quick_save") {
		const current = await forward(
			url,
			apiKey,
			authorization,
			"product_detail",
			"GET",
			{ id: input.product_id as string },
		);
		const product = safeDetail(record(current.body?.product) ?? {});
		if (current.status !== 200 || !product)
			return jsonResponse(
				current.status || 502,
				{
					error:
						current.status === 401
							? "not_authenticated"
							: current.status === 403
								? "not_authorized"
								: "unavailable",
				},
				origin,
			);
		if (
			product.sale_price_cents !== input.expected_price_cents ||
			product.active !== input.expected_active
		)
			return jsonResponse(409, { error: "conflict" }, origin);
		const saved = await forward(
			url,
			apiKey,
			authorization,
			"product_quick_save",
			"POST",
			{
				product_id: input.product_id as string,
				sale_price_cents: Number(input.sale_price_cents),
				active: input.active as boolean,
			},
		);
		return saved.status === 200 && saved.body?.ok === true
			? jsonResponse(200, { ok: true }, origin)
			: jsonResponse(
					saved.status || 502,
					{
						error:
							saved.status === 401
								? "not_authenticated"
								: saved.status === 403
									? "not_authorized"
									: saved.status === 409
										? "conflict"
										: saved.status === 400
											? "invalid_input"
											: "unavailable",
					},
					origin,
				);
	}

	const result = await forward(
		url,
		apiKey,
		authorization,
		"products",
		"GET",
		input,
	);
	if (result.status !== 200 || !Array.isArray(result.body?.products))
		return jsonResponse(
			result.status || 502,
			{
				error:
					result.status === 401
						? "not_authenticated"
						: result.status === 403
							? "not_authorized"
							: "unavailable",
			},
			origin,
		);
	const products = result.body.products
		.map(record)
		.filter((row): row is JsonRecord => row !== null)
		.filter((row) => typeof row.id === "string" && UUID.test(row.id))
		.map((row) => ({
			id: row.id,
			name: safeText(row.name) ?? "Produto sem nome",
			sku: safeText(row.sku, 80),
			category: safeText(row.category, 100),
			active: row.active === true,
			sale_price_cents: Number.isSafeInteger(row.sale_price_cents)
				? row.sale_price_cents
				: null,
			stock_quantity:
				typeof row.stock_quantity === "number" &&
				Number.isFinite(row.stock_quantity)
					? row.stock_quantity
					: null,
			packaging: safeText(row.packaging, 30),
			image_url: safeUrl(row.image_url),
		}));
	const nextOffset = Number.isSafeInteger(result.body.next_offset)
		? result.body.next_offset
		: null;
	return jsonResponse(200, { products, next_offset: nextOffset }, origin);
});
