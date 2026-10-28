import type {
	OrderBoardResult,
	OrderLane,
	OrderListItem,
} from "@/lib/supabase/admin-orders";
import { createClient } from "@/lib/supabase/client";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";

type JsonRecord = Record<string, unknown>;
type WhatsAppOrigin = "flow" | "catalog";

const UUID =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function record(value: unknown): JsonRecord | null {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as JsonRecord)
		: null;
}

function safeString(value: unknown, limit = 300): string | null {
	if (typeof value !== "string") return null;
	const clean = Array.from(value, (character) => {
		const code = character.codePointAt(0) ?? 0;
		return code >= 32 && code !== 127 ? character : " ";
	})
		.join("")
		.trim();
	return clean ? clean.slice(0, limit) : null;
}

function safeInteger(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value)
		? Math.round(value)
		: null;
}

function laneForStatus(status: string): OrderLane | null {
	if (status === "created" || status === "storefront_received") return "new";
	if (status === "confirmed" || status === "processing") return "separate";
	if (status === "ready" || status === "out_for_delivery") return "ready";
	if (status === "delivered") return "delivered";
	return null;
}

function checkoutOrigin(value: unknown): WhatsAppOrigin | null {
	const snapshot = record(value);
	if (
		snapshot?.schema_version !== "sucedoan.whatsapp_checkout.v1" ||
		snapshot.source !== "whatsapp_order_intent"
	) {
		return null;
	}
	return snapshot.origin === "flow" || snapshot.origin === "catalog"
		? snapshot.origin
		: null;
}

function sourceLabel(
	value: unknown,
	origin: WhatsAppOrigin | undefined,
): string {
	const source = safeString(value, 40)?.toLowerCase();
	if (source === "manual_whatsapp") {
		if (origin === "flow") return "WhatsApp · Flow";
		if (origin === "catalog") return "WhatsApp · catálogo";
	}
	const labels: Record<string, string> = {
		manual_whatsapp: "WhatsApp · atendimento",
		papoai: "WhatsApp · assistente",
		vitrine: "Loja",
		reorder: "Recompra",
	};
	return source
		? (labels[source] ?? "Origem não identificada")
		: "Origem não identificada";
}

function mapOrder(
	value: unknown,
	origin?: WhatsAppOrigin,
): OrderListItem | null {
	const row = record(value);
	if (!row || typeof row.id !== "string" || !UUID.test(row.id)) return null;
	const status = safeString(row.status, 40) ?? "unknown";
	return {
		id: row.id,
		orderNumber: safeString(row.order_number, 80),
		publicCode: safeString(row.public_code, 40),
		status,
		lane: laneForStatus(status),
		customerName: safeString(row.customer_name, 160) ?? "Cliente",
		phone: safeString(row.whatsapp_phone_e164, 40),
		totalCents: Math.max(0, safeInteger(row.total_cents) ?? 0),
		createdAt: safeString(row.created_at, 60),
		registrationComplete: row.registration_complete === true,
		sourceLabel: sourceLabel(
			row.source,
			origin ?? checkoutOrigin(row.checkout_snapshot) ?? undefined,
		),
	};
}

async function orderOrigins(
	orderIds: string[],
): Promise<Map<string, WhatsAppOrigin>> {
	const result = new Map<string, WhatsAppOrigin>();
	const ids = [
		...new Set(
			orderIds.filter((id) => UUID.test(id)).map((id) => id.toLowerCase()),
		),
	].slice(0, 50);
	if (!ids.length) return result;

	try {
		const supabase = createClient();
		const { data: claims, error: claimsError } =
			await supabase.auth.getClaims();
		if (claimsError || !claims?.claims?.sub) return result;
		const { data, error } = await supabase.rpc(
			"whatsapp_order_intent_origins_admin_v1",
			{
				p_order_ids: ids,
			},
		);
		const payload = record(data);
		if (
			error ||
			payload?.ok !== true ||
			!Array.isArray(payload.origins) ||
			payload.origins.length > ids.length
		) {
			return result;
		}
		for (const value of payload.origins) {
			const row = record(value);
			const id = safeString(row?.order_id, 36);
			if (
				id &&
				UUID.test(id) &&
				(row?.origin === "flow" || row?.origin === "catalog")
			) {
				result.set(id.toLowerCase(), row.origin);
			}
		}
	} catch {
		return result;
	}
	return result;
}

export async function getBrowserAdminOrderBoard(input: {
	lane: OrderLane;
	query: string;
	offset: number;
}): Promise<OrderBoardResult> {
	if (!supabaseUrl || !supabasePublishableKey) {
		return {
			orders: [],
			total: 0,
			hasMore: false,
			counts: null,
			error: "not_configured",
		};
	}

	const supabase = createClient();
	const { data: sessionData, error: sessionError } =
		await supabase.auth.getSession();
	const accessToken = sessionData.session?.access_token;
	if (sessionError || !accessToken) {
		return {
			orders: [],
			total: 0,
			hasMore: false,
			counts: null,
			error: "not_authenticated",
		};
	}

	const endpoint = new URL("/functions/v1/admin-products-live-v1", supabaseUrl);
	endpoint.searchParams.set("action", "orders");
	endpoint.searchParams.set("limit", "5");
	endpoint.searchParams.set(
		"offset",
		String(Math.max(0, Math.min(50_000, input.offset))),
	);
	if (input.query) endpoint.searchParams.set("q", input.query.slice(0, 80));
	else endpoint.searchParams.set("tab", input.lane);

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
		return {
			orders: [],
			total: 0,
			hasMore: false,
			counts: null,
			error: "unavailable",
		};
	}
	if (response.status === 401) {
		return {
			orders: [],
			total: 0,
			hasMore: false,
			counts: null,
			error: "not_authenticated",
		};
	}
	if (response.status === 403) {
		return {
			orders: [],
			total: 0,
			hasMore: false,
			counts: null,
			error: "not_authorized",
		};
	}
	if (response.status === 404) {
		return {
			orders: [],
			total: 0,
			hasMore: false,
			counts: null,
			error: "not_found",
		};
	}
	if (!response.ok) {
		return {
			orders: [],
			total: 0,
			hasMore: false,
			counts: null,
			error: "unavailable",
		};
	}

	let payload: JsonRecord | null;
	try {
		payload = record(await response.json());
	} catch {
		payload = null;
	}
	if (payload?.ok !== true) {
		return {
			orders: [],
			total: 0,
			hasMore: false,
			counts: null,
			error: "unavailable",
		};
	}

	const rows = Array.isArray(payload.orders) ? payload.orders : [];
	const ids = rows
		.map((row) => safeString(record(row)?.id, 36))
		.filter((id): id is string => Boolean(id));
	const origins = await orderOrigins(ids);
	const counts = record(payload.counts);
	return {
		orders: rows
			.map((row) => {
				const id = safeString(record(row)?.id, 36);
				return mapOrder(row, id ? origins.get(id.toLowerCase()) : undefined);
			})
			.filter((row): row is OrderListItem => row !== null),
		total: Math.max(0, safeInteger(payload.total) ?? 0),
		hasMore: payload.has_more === true,
		counts: counts
			? {
					new: Math.max(0, safeInteger(counts.new) ?? 0),
					separate: Math.max(0, safeInteger(counts.separate) ?? 0),
					ready: Math.max(0, safeInteger(counts.ready) ?? 0),
					delivered: Math.max(0, safeInteger(counts.delivered) ?? 0),
				}
			: null,
		error: null,
	};
}
