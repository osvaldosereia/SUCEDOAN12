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
		"Access-Control-Allow-Methods": "GET, OPTIONS",
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

Deno.serve(async (request) => {
	const origin = request.headers.get("origin");
	if (request.method === "OPTIONS")
		return new Response(null, { status: 204, headers: corsHeaders(origin) });
	if (request.method !== "GET")
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

	const input = new URL(request.url).searchParams;
	const query = (input.get("q") ?? "").trim().slice(0, 100);
	const active = input.get("active") ?? "";
	const rawOffset = Number.parseInt(input.get("offset") ?? "0", 10);
	if (
		(active !== "" && active !== "true" && active !== "false") ||
		!Number.isFinite(rawOffset)
	)
		return jsonResponse(400, { error: "invalid_input" }, origin);
	const offset = Math.max(
		0,
		Math.min(100_000, Math.floor(rawOffset / 50) * 50),
	);
	const endpoint = new URL("/functions/v1/admin-products-live-v1", url);
	endpoint.searchParams.set("action", "products");
	endpoint.searchParams.set("limit", "50");
	endpoint.searchParams.set("offset", String(offset));
	if (query) endpoint.searchParams.set("q", query);
	if (active) endpoint.searchParams.set("active", active);

	try {
		const upstream = await fetch(endpoint, {
			method: "GET",
			headers: {
				apikey: apiKey,
				Authorization: authorization,
				Accept: "application/json",
			},
		});
		const payload = record(await upstream.json().catch(() => null));
		if (!upstream.ok || !Array.isArray(payload?.products))
			return jsonResponse(
				upstream.status || 502,
				{
					error:
						upstream.status === 401
							? "not_authenticated"
							: upstream.status === 403
								? "not_authorized"
								: "unavailable",
				},
				origin,
			);
		const products = payload.products
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
		const nextOffset = Number.isSafeInteger(payload.next_offset)
			? payload.next_offset
			: null;
		return jsonResponse(200, { products, next_offset: nextOffset }, origin);
	} catch {
		return jsonResponse(502, { error: "unavailable" }, origin);
	}
});
